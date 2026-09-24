import { activeFaults, activeJob, decideRepair, droneStatus, pendingFaults, repairMenu, repairOptions, vesselRepairStatus } from '../game/repairs'
import { operationAgeAt } from '../game/calendar'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { AudioDirector } from '../audio/audioDirector'
import { chatter, miners } from '../game/content'
import {
  advanceFacility,
  applyPendingDecision,
  beginRequest,
  operationalStatus,
  returnBriefing,
  createInitialState,
  commissionFacility,
  findEvent,
  nextAutopilotState,
  normalizeKeyboardKey,
  restoreState,
  routeKey,
} from '../game/engine'
import { advanceOnboarding, onboardingPrompt } from '../game/onboarding'
import { loadFacility, saveFacility } from '../game/persistence'
import type { AudioPriority, FacilityState, KeypadKey, TranscriptEntry } from '../game/types'

const audio = new AudioDirector()

export function useFacility() {
  const state = reactive<FacilityState>(createInitialState(Date.now()))
  const ready = ref(false)
  const storageError = ref('')
  let suspendedAt: number | null = null
  const displayMode = ref<'standard' | 'dim' | 'black'>('standard')
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
  ): void {
    const entry: TranscriptEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      speaker,
      text,
      timestamp: Date.now(),
      operationAgeMs: operationAgeAt(state, Date.now()),
      priority,
    }
    state.transcript = [...state.transcript, entry].slice(-80)
    lastMessage.value = text
  }

  function announce(text: string, speaker = 'Facility Control', profileId = 'terminal', priority: AudioPriority = 3): void {
    recordTranscript(text, speaker, priority)
    audio.speak(text, profileId, priority)
  }

  async function persist(): Promise<void> {
    if (!ready.value) return
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
      announce(returnBriefing(state, saved.lastActiveAt, now), 'Facility Control', 'terminal', 2)
    } else {
      Object.assign(state, createInitialState(now))
      state.onboardingStatus = 'active'
      announce(onboardingPrompt(state), 'Facility Control', 'terminal', 2)
    }
    if (state.onboardingStatus === 'pending') state.onboardingStatus = 'active'
    if (state.onboardingStatus === 'active' && saved) {
      announce(onboardingPrompt(state), 'Facility Control', 'terminal', 2)
    }
    state.lastActiveAt = now
    ready.value = true
    await persist()
    scheduleTimers()
  }

  async function pressKey(key: KeypadKey): Promise<void> {
    if (!ready.value) return
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
        if (lastMessage.value) announce(lastMessage.value, 'Facility Control', 'terminal', 2)
        if (!result.accepted) return
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
        announce(repairMenu(state, selected.vessel, selected.fault))
      } else if (key === '0') announce(repairMenu(state, selected.vessel, selected.fault))
      else {
        const option = repairOptions(state, selected.vessel, selected.fault)[key]
        announce(option ? decideRepair(state, selected.vessel, selected.fault, option.action, Date.now()) : 'That response is unavailable. Press 0 for current repair choices.', 'Facility Control', 'terminal', 2)
      }
      await persist()
      return
    }
    const channelFault = key === '1' ? faults.find(({ fault }) => fault.emergency)
      : key === '3' ? faults[0]
        : key === '4' ? faults.find(({ vessel, fault }) => ['docked', 'approaching', 'returning'].includes(vessel.dockingState) || activeJob(state, fault)?.method === 'dock') : undefined
    if (channelFault) {
      supportFaultId.value = channelFault.fault.id
      announce(repairMenu(state, channelFault.vessel, channelFault.fault), 'Facility Control', 'terminal', channelFault.fault.emergency ? 1 : 2)
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
        announce(`${event.spokenLines.join(' ')}${faults.length ? ` ${faults.map(({ vessel, fault }) => vesselRepairStatus(state, vessel, fault)).join(' ')}` : ''}`, speakerFor(event.participants[0]), profileFor(event.participants[0]), event.priority)
        return
      }
      const message = applyPendingDecision(state, key, Date.now())
      if (message) {
        announce(message, 'Facility Control', 'terminal', 2)
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
    announce(event.spokenLines.join(' '), speakerFor(event.participants[0]), profileFor(event.participants[0]), event.priority)
    if (event.immediateSafety) announce(state.operations.at(-1)!.summary, 'Facility Control', 'terminal', 1)
  }

  function tick(): void {
    if (!ready.value || suspendedAt !== null) return
    const before = state.nextOperationId
    advanceFacility(state, Date.now())
    state.lastActiveAt = Math.max(state.lastActiveAt, Date.now())
    if (state.nextOperationId !== before) {
      const fresh = state.operations.filter((entry) => Number(entry.id.replace('op-', '')) >= before)
      const latest = fresh.find((entry) => entry.repair && entry.resolution === 'pending') ?? fresh.find((entry) => entry.category === 'safety') ?? state.operations.at(-1)!
      if (state.onboardingStatus !== 'active') announce(latest.summary, 'Facility Control', 'terminal', 2)
      void persist()
    }
  }

  function onVisibilityChange(): void {
    if (!ready.value) return
    if (document.hidden) {
      tick()
      audio.cancelChatter()
      suspendedAt = Date.now()
      state.lastActiveAt = suspendedAt
      void persist()
    } else if (suspendedAt !== null) {
      const since = suspendedAt
      suspendedAt = null
      advanceFacility(state, Date.now())
      announce(returnBriefing(state, since, Date.now()), 'Facility Control', 'terminal', 2)
      state.lastActiveAt = Date.now()
      void persist()
    }
  }

  function emitChatter(): void {
    if (!ready.value || suspendedAt !== null || state.onboardingStatus === 'active' || state.pendingEvent || pendingFaults(state).length) return
    const exchange = chatter[Math.floor(Math.random() * chatter.length)]!
    audio.speakExchange(exchange.lines, (line) => {
      recordTranscript(line.text, line.speaker, 5)
      void persist()
    })
  }

  function scheduleTimers(): void {
    timers.push(window.setInterval(tick, 1_000))
    timers.push(window.setInterval(emitChatter, 24_000))
    timers.push(window.setInterval(() => { if (suspendedAt === null) { tick(); void persist() } }, 30_000))
  }

  function skipOnboarding(): void {
    commissionFacility(state, Date.now())
    state.onboardingStatus = 'skipped'
    announce('Commissioning checks delegated to Facility Control. Normal operations authorized. Press 0 for current status, or 9 for autopilot.', 'Facility Control', 'terminal', 2)
    void persist()
  }

  function replayOnboarding(): void {
    audio.cancelChatter()
    state.onboardingStatus = 'active'
    state.onboardingStep = 0
    announce(onboardingPrompt(state), 'Facility Control', 'terminal', 2)
    void persist()
  }

  function cycleDisplayMode(): void {
    displayMode.value = displayMode.value === 'standard' ? 'dim' : displayMode.value === 'dim' ? 'black' : 'standard'
  }

  function restoreDisplay(): void {
    displayMode.value = 'standard'
  }

  function onKeydown(event: KeyboardEvent): void {
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
