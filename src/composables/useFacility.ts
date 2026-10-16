import { eligibleChatter } from '../game/chatter'
import { exportSave, parseSave } from '../game/portableSave'
import { activeFaults, activeJob, decideRepair, droneStatus, pendingFaults, repairMenu, repairOptions, vesselRepairStatus } from '../game/repairs'
import { operationAgeAt } from '../game/calendar'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { AudioDirector, type SpeechContext } from '../audio/audioDirector'
import { miners } from '../game/content'
import {
  advanceFacility,
  recordAbsenceTranscript,
  applyPendingDecision,
  beginRequest,
  operationalStatus,
  returnBriefing,
  shouldBriefOnReturn,
  recordOperation,
  createInitialState,
  commissionFacility,
  findEvent,
  nextAutopilotState,
  normalizeKeyboardKey,
  restoreState,
  routeKey,
} from '../game/engine'
import { advanceOnboarding, onboardingPrompt } from '../game/onboarding'
import { loadFacility, saveFacility, replaceFacility } from '../game/persistence'
import type { AudioPriority, ChatterLine, FacilityState, KeypadKey, OperationalEvent, TranscriptEntry } from '../game/types'

const audio = new AudioDirector()

export function useFacility() {
  const state = reactive<FacilityState>(createInitialState(Date.now()))
  const ready = ref(false)
  const importing = ref(false)
  const storageError = ref('')
  let suspendedAt: number | null = null
  const displayMode = ref<'standard' | 'dim' | 'black' | 'high-contrast-white' | 'high-contrast-dark'>('standard')
  const lastMessage = ref('')
  const supportFaultId = ref<string | null>(null)
  const timers: number[] = []

  const pendingEvent = computed(() => state.pendingEvent ? findEvent(state.pendingEvent.eventId) : pendingFaults(state).length ? { type: 'vessel support' } : null)
  const onboardingActive = computed(() => state.onboardingStatus === 'active')
  const facilityAgeHours = computed(() => Math.floor(state.facilityAgeMs / 3_600_000))

  function recordTranscript(
    text: string,
    speaker = 'Facility Control',
    priority: AudioPriority = 3,
    event?: Pick<OperationalEvent, 'timestamp' | 'operationAgeMs'>,
  ): void {
    const entry: TranscriptEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      speaker,
      text,
      timestamp: event?.timestamp ?? Date.now(),
      operationAgeMs: event?.operationAgeMs ?? operationAgeAt(state, Date.now()),
      priority,
    }
    state.transcript = [...state.transcript, entry].slice(-80)
    lastMessage.value = text
  }

  function announce(text: string, speaker = 'Facility Control', profileId = 'terminal', priority: AudioPriority = 3, context?: SpeechContext, event?: OperationalEvent): void {
    recordTranscript(text, speaker, priority, event)
    audio.speak(text, profileId, priority, context)
  }

  function recordAbsence(previousOperationId: number): void {
    recordAbsenceTranscript(state, previousOperationId)
    lastMessage.value = state.transcript.at(-1)?.text ?? ''
  }

  async function persist(): Promise<void> {
    if (!ready.value || importing.value) return
    state.lastSavedAt = Date.now()
    try {
      await saveFacility({ ...state })
      storageError.value = ''
    } catch {
      storageError.value = 'Saving is unavailable. Keep this session open and retry when storage is available.'
    }
  }

  async function initialize(): Promise<void> {
    if (ready.value) return
    let saved: FacilityState | null
    try { saved = await loadFacility() } catch (error) {
      storageError.value = error instanceof Error ? error.message : 'Saved operation unavailable. Please retry.'
      return
    }
    const now = Date.now()
    if (saved) {
      const restored = restoreState(saved, now)
      Object.assign(state, restored.state)
      pauseReadiness()
      if (shouldBriefOnReturn(state, saved.lastActiveAt, now, saved.nextOperationId)) announce(returnBriefing(state, saved.lastActiveAt, now), 'Facility Control', 'terminal', 2)
    } else {
      Object.assign(state, createInitialState(now))
      announce(operationalStatus(state), 'Facility Control', 'terminal', 2)
    }
    state.lastActiveAt = now
    ready.value = true
    await persist()
    scheduleTimers()
  }

  async function pressKey(key: KeypadKey): Promise<void> {
    if (!ready.value || importing.value) return
    audio.cancelChatter()
    const repairAtInput = pendingFaults(state).map(({ fault }) => fault.id)
    const requestAtInput = state.pendingEvent
    tick()
    // An expired response must not become an unrelated top-level command.
    if (((requestAtInput && !state.pendingEvent) || (supportFaultId.value && repairAtInput.includes(supportFaultId.value) && !pendingFaults(state).some(({ fault }) => fault.id === supportFaultId.value))) && key !== '0') {
      await persist()
      return
    }
    // Audio permission/resume must not block operational commands or saving.
    void audio.startAmbience().catch(console.warn)
    audio.playKeyTone(key)

    if (state.onboardingStatus === 'active') {
      const result = advanceOnboarding(state.onboardingStatus, state.onboardingStep, key)
      if (key === '0') {
        announce(`Captain requested repeat. ${onboardingPrompt(state)}`, 'Facility Control', 'terminal', 2)
        if (!result.accepted) { await persist(); return }
      }
      if (result.accepted && key === '9') state.autopilotEnabled = true
      state.onboardingStatus = result.status
      state.onboardingStep = result.step
      if (result.status === 'complete') {
        commissionFacility(state, Date.now())
        announce('Readiness confirmed. Normal operations authorized. Facility Control will coordinate the mine. Silence is safe.', 'Facility Control', 'terminal', 2)
      } else {
        announce(`${result.accepted ? '' : 'For this readiness check, '}${onboardingPrompt(state)}`, 'Facility Control', 'terminal', 2)
      }
      await persist()
      return
    }

    if (!state.commissioned) {
      announce(operationalStatus(state), 'Facility Control', 'terminal', 2)
      await persist()
      return
    }

    const faults = state.vessels.flatMap((vessel) => activeFaults(vessel).map((fault) => ({ vessel, fault })))
    let selected = faults.find(({ fault }) => fault.id === supportFaultId.value)
    if (supportFaultId.value && !selected) {
      supportFaultId.value = null
      announce('Vessel service complete. Main terminal. Press 0 for status.')
      await persist()
      return
    }
    if (selected) {
      if (key === '*') {
        supportFaultId.value = null
        announce('Main terminal. Crew response deadlines remain active.')
      } else if (key === '#') {
        selected = faults[(faults.indexOf(selected) + 1) % faults.length]!
        supportFaultId.value = selected.fault.id
        announce(repairMenu(state, selected.vessel, selected.fault), 'Facility Control', 'terminal', 2, { kind: 'request', cause: selected.fault.id })
      } else if (key === '0') announce(repairMenu(state, selected.vessel, selected.fault), 'Facility Control', 'terminal', 2, { kind: 'request', cause: selected.fault.id })
      else {
        const option = repairOptions(state, selected.vessel, selected.fault)[key]
        announce(option ? decideRepair(state, selected.vessel, selected.fault, option.action, Date.now()) : 'That response is unavailable. Press 0 for current repair choices.', 'Facility Control', 'terminal', 2, { kind: 'response', cause: selected.fault.id })
      }
      await persist()
      return
    }
    const channelFault = key === '1' ? faults.find(({ fault }) => fault.emergency)
      : key === '3' ? faults[0]
        : key === '4' ? faults.find(({ vessel, fault }) => ['docked', 'approaching', 'returning'].includes(vessel.dockingState) || activeJob(state, fault)?.method === 'dock') : undefined
    if (channelFault) {
      supportFaultId.value = channelFault.fault.id
      announce(repairMenu(state, channelFault.vessel, channelFault.fault), 'Facility Control', 'terminal', 2, { kind: 'request', cause: channelFault.fault.id })
      await persist()
      return
    }
    if (key === '8' && faults.length) {
      announce(droneStatus(state))
      await persist()
      return
    }

    if (state.pendingEvent) {
      if (key === '0') {
        const event = findEvent(state.pendingEvent.eventId)!
        announce(`${event.spokenLines.join(' ')}${faults.length ? ` ${faults.map(({ vessel, fault }) => vesselRepairStatus(state, vessel, fault)).join(' ')}` : ''}`, speakerFor(event.participants[0]), profileFor(event.participants[0]), event.priority, { kind: 'request', cause: `${event.id}:${state.pendingEvent.requestedAt}` })
        return
      }
      const cause = `${state.pendingEvent.eventId}:${state.pendingEvent.requestedAt}`
      const message = applyPendingDecision(state, key, Date.now())
      if (message) {
        announce(message, 'Facility Control', 'terminal', 2, { kind: 'response', cause })
      } else {
        announce('That response is not available for the current request. Press 1 or 2, or allow the crew to decide.', 'Facility Control')
      }
      await persist()
      return
    }

    const command = routeKey(key)
    if (command.type === 'repeat') {
      announce(operationalStatus(state), 'Facility Control')
    } else if (command.type === 'back') {
      announce('Main terminal.', 'Facility Control')
    } else if (command.type === 'confirm') {
      announce('No confirmation is pending.', 'Facility Control')
    } else if (command.type === 'autopilot') {
      state.autopilotEnabled = nextAutopilotState(state.autopilotEnabled)
      announce(`Autopilot ${state.autopilotEnabled ? 'enabled' : 'disabled'}. ${state.autopilotEnabled ? 'Normal operations will continue. You may listen or interrupt at any time.' : 'Captain input restored.'}`, 'Facility Control', 'terminal', 2)
    } else if (command.type === 'status') {
      announce(operationalStatus(state), 'Facility Control')
    } else {
      startEvent(command.eventId)
    }
    await persist()
  }

  function startEvent(eventId: string): void {
    const event = findEvent(eventId)
    if (!event || !beginRequest(state, eventId, Date.now())) {
      announce('That channel has no new report at this time.', 'Facility Control')
      return
    }
    announce(event.spokenLines.join(' '), speakerFor(event.participants[0]), profileFor(event.participants[0]), event.priority, event.immediateSafety ? undefined : { kind: 'request', cause: `${event.id}:${state.pendingEvent!.requestedAt}` })
    if (event.immediateSafety) announce(state.operations.at(-1)!.summary, 'Facility Control', 'terminal', 1)
  }

  // Reusable crew → coordinator handoff. Both lines belong to the request,
  // so even an immediate captain response must wait for the confirmation.
  function announceRequest(crew: ChatterLine, confirmation: string, cause: string, priority: AudioPriority, event: OperationalEvent): void {
    announce(crew.text, crew.speaker, crew.profile, priority, { kind: 'request', cause }, event)
    announce(confirmation, 'Facility Control', 'terminal', priority, { kind: 'request', cause }, event)
  }

  function tick(): void {
    if (!ready.value || importing.value || suspendedAt !== null) return
    const before = state.nextOperationId
    const now = Date.now()
    advanceFacility(state, now)
    state.lastActiveAt = Math.max(state.lastActiveAt, now)
    if (state.nextOperationId !== before) {
      const fresh = state.operations.filter((entry) => Number(entry.id.replace('op-', '')) >= before)
      if (state.onboardingStatus !== 'active') {
        // Timer delays do not establish absence. Only restoration and visibility
        // resume use absence reports; connected events retain their original clocks.
        // Keep each repair transition in event order, including dispatch and completion.
        const reports = fresh.filter((entry) => entry.category !== 'chatter')
        for (let i = 0; i < reports.length; i++) {
          const entry = reports[i]!
          // Preserve individual transcript clocks, but combine related simultaneous
          // routine reports (for example cargo delivery followed by service assignment).
          const group = [entry]
          if (!entry.repair && entry.resolution !== 'pending' && entry.category !== 'safety') {
            while (reports[i + 1] && !reports[i + 1]!.repair && reports[i + 1]!.resolution !== 'pending'
              && reports[i + 1]!.category !== 'safety' && reports[i + 1]!.timestamp === entry.timestamp
              && reports[i + 1]!.relatedIds.some((id) => entry.relatedIds.includes(id))) group.push(reports[++i]!)
          }
          if (group.length > 1) {
            for (const report of group) recordTranscript(report.summary, 'Facility Control', 2, report)
            audio.speak(group.map((report) => report.summary).join(' '), 'terminal', 2)
            continue
          }
          const priority = entry.category === 'safety' && entry.operationCode !== 390 ? 1 : 2
          const requester = state.miners.find((miner) => miner.id === entry.source)
          const vessel = entry.repair ? state.vessels.find((v) => v.id === entry.repair!.vesselId) : undefined
          const fault = vessel?.activeFaults.find((f) => f.id === entry.repair!.faultId)
          if (vessel && fault && fault.decisionAt !== null && entry.repair && requester && entry.repair.detectedAt === entry.timestamp && entry.resolution === 'pending' && entry.repair.action === null) {
            announceRequest({ text: entry.summary, speaker: requester.callsign, profile: requester.voiceProfileId },
              `Service request received from ${requester.callsign}. Captain, press 3 for vessel support. In that channel: ${repairMenu(state, vessel, fault)}`,
              fault.id, priority, entry)
          } else {
            const timedOut = entry.resolution === 'autonomous' && entry.reason?.includes('response window elapsed')
            const summary = entry.resolution === 'pending'
              ? `Earlier request: ${entry.summary.replace(/ Press \d[\s\S]*$/, '')}`
              : timedOut ? `No captain decision was received within the response window. Facility Control applied the safe operational response. ${entry.summary}` : entry.summary
            announce(summary, 'Facility Control', 'terminal', priority,
              entry.repair ? { kind: 'response', cause: entry.repair.faultId } : undefined, entry)
          }
        }
      }
      void persist()
    }
  }

  function onVisibilityChange(): void {
    if (!ready.value || importing.value) return
    if (document.hidden) {
      tick()
      pauseReadiness()
      audio.cancelChatter()
      suspendedAt = Date.now()
      state.lastActiveAt = suspendedAt
      void persist()
    } else if (suspendedAt !== null) {
      const since = suspendedAt
      suspendedAt = null
      const before = state.nextOperationId
      advanceFacility(state, Date.now())
      recordAbsence(before)
      if (shouldBriefOnReturn(state, since, Date.now(), before)) announce(returnBriefing(state, since, Date.now()), 'Facility Control', 'terminal', 2)
      state.lastActiveAt = Date.now()
      void persist()
    }
  }

  function emitChatter(): void {
    if (!ready.value || importing.value || suspendedAt !== null) return
    tick()
    const eligible = eligibleChatter(state, Date.now())
    // An opportunity is not an obligation to speak.
    if (!eligible.length || Math.random() >= 0.65) return
    const exchange = eligible[Math.floor(Math.random() * eligible.length)]!
    let recorded = false
    audio.speakExchange(exchange.lines, (line) => {
      if (!recorded) {
        recordOperation(state, { timestamp: Date.now(), source: line.speaker, category: 'chatter',
          summary: line.text, relatedIds: [exchange.id], actionRequested: false, resolution: 'autonomous', reason: null })
        recorded = true
      }
      recordTranscript(line.text, line.speaker, 5)
      void persist()
    })
  }

  function scheduleTimers(): void {
    timers.push(window.setInterval(tick, 1_000))
    timers.push(window.setInterval(emitChatter, 90_000))
    timers.push(window.setInterval(() => { if (suspendedAt === null) { tick(); void persist() } }, 30_000))
  }

  function skipOnboarding(): void {
    if (!ready.value || importing.value) return
    commissionFacility(state, Date.now())
    state.onboardingStatus = 'skipped'
    announce('Commissioning checks delegated to Facility Control. Normal operations authorized. Press 0 for current status, or 9 for autopilot.', 'Facility Control', 'terminal', 2)
    void persist()
  }

  function pauseReadiness(): void {
    if (state.onboardingStatus === 'active') {
      state.onboardingStatus = 'pending'
      audio.stop()
    }
  }

  function replayOnboarding(): void {
    if (!ready.value || importing.value) return
    audio.cancelChatter()
    if (state.onboardingStatus !== 'pending' && state.onboardingStatus !== 'active') state.onboardingStep = 0
    state.onboardingStatus = 'active'
    supportFaultId.value = null
    announce(onboardingPrompt(state), 'Facility Control', 'terminal', 2)
    void persist()
  }

  function cycleDisplayMode(): void {
    const modes = ['standard', 'high-contrast-white', 'high-contrast-dark', 'dim', 'black'] as const
    displayMode.value = modes[(modes.indexOf(displayMode.value) + 1) % modes.length]!
  }

  function restoreDisplay(): void {
    displayMode.value = 'standard'
  }

  function portableSnapshot(): string {
    tick()
    return exportSave(state)
  }

  async function importSnapshot(text: string): Promise<void> {
    if (!ready.value || importing.value) throw new Error('Terminal is busy. Please retry.')
    const imported = parseSave(text)
    if (imported.onboardingStatus === 'active') imported.onboardingStatus = 'pending'
    importing.value = true
    try {
      const restored = await replaceFacility(imported, Date.now())
      audio.stop()
      Object.assign(state, restored)
      supportFaultId.value = null
      lastMessage.value = state.transcript.at(-1)?.text ?? ''
      storageError.value = ''
    } finally {
      importing.value = false
      if (typeof document !== 'undefined' && document.hidden) onVisibilityChange()
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLElement && (event.target.closest('input, textarea, select, [contenteditable=true]')
      || (event.key === 'Enter' && event.target.closest('button')))) return
    const key = normalizeKeyboardKey(event.key)
    if (!key) return
    event.preventDefault()
    void pressKey(key)
  }

  function speakerFor(minerId?: string): string {
    return miners.find((miner) => miner.id === minerId)?.callsign ?? 'Facility Control'
  }

  function profileFor(minerId?: string): string {
    return miners.find((miner) => miner.id === minerId)?.voiceProfileId ?? 'terminal'
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    timers.forEach((timer) => window.clearInterval(timer))
    audio.stop()
    void persist()
  })

  return {
    importing,
    portableSnapshot,
    importSnapshot,
    startAudio: () => audio.startAmbience().catch(console.warn),
    state,
    ready,
    storageError,
    initialize,
    displayMode,
    pendingEvent,
    onboardingActive,
    facilityAgeHours,
    pressKey,
    skipOnboarding,
    replayOnboarding,
    cycleDisplayMode,
    restoreDisplay,
  }
}
