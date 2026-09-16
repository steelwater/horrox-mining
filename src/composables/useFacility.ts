import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { AudioDirector } from '../audio/audioDirector'
import { chatter, miners } from '../game/content'
import {
  canStartEvent,
  createInitialState,
  findEvent,
  nextAutopilotState,
  normalizeKeyboardKey,
  resolvePendingEvent,
  restoreState,
  routeKey,
} from '../game/engine'
import { advanceOnboarding, onboardingSteps } from '../game/onboarding'
import { loadFacility, saveFacility } from '../game/persistence'
import type { AudioPriority, FacilityState, KeypadKey, TranscriptEntry } from '../game/types'

const audio = new AudioDirector()

export function useFacility() {
  const state = reactive<FacilityState>(createInitialState(Date.now()))
  const ready = ref(false)
  const displayMode = ref<'standard' | 'dim' | 'black'>('standard')
  const lastMessage = ref('')
  const lastProfile = ref('terminal')
  const timers: number[] = []

  const pendingEvent = computed(() => state.pendingEvent ? findEvent(state.pendingEvent.eventId) : null)
  const onboardingActive = computed(() => state.onboardingStatus === 'active')
  const facilityAgeHours = computed(() => Math.floor(state.facilityAgeMs / 3_600_000))

  function announce(
    text: string,
    speaker = 'Facility Control',
    profileId = 'terminal',
    priority: AudioPriority = 3,
  ): void {
    const entry: TranscriptEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      speaker,
      text,
      timestamp: Date.now(),
      priority,
    }
    state.transcript = [...state.transcript, entry].slice(-80)
    lastMessage.value = text
    lastProfile.value = profileId
    audio.speak(text, profileId, priority)
  }

  async function persist(): Promise<void> {
    state.lastSavedAt = Date.now()
    await saveFacility({ ...state })
  }

  async function initialize(): Promise<void> {
    if (ready.value) return
    const now = Date.now()
    const saved = await loadFacility()
    if (saved) {
      const restored = restoreState(saved, now)
      Object.assign(state, restored.state)
      announce(
        `Captain terminal connected. Welcome back. Elapsed station time is ${Math.max(1, Math.round(restored.elapsedMs / 60_000))} minutes. Operations continued under automated control. ${restored.completedCycles} extraction cycles completed.`,
        'Facility Control',
        'terminal',
        2,
      )
    } else {
      state.onboardingStatus = 'active'
      announce(onboardingSteps[0]!.prompt, 'Onboarding Assistant', 'onboarding', 2)
    }
    ready.value = true
    scheduleTimers()
  }

  async function pressKey(key: KeypadKey): Promise<void> {
    await audio.startAmbience()
    audio.playKeyTone(key)

    if (state.onboardingStatus === 'active') {
      const result = advanceOnboarding(state.onboardingStatus, state.onboardingStep, key)
      state.onboardingStatus = result.status
      state.onboardingStep = result.step
      announce(result.message, 'Onboarding Assistant', 'onboarding', 2)
      await persist()
      return
    }

    if (state.pendingEvent) {
      const resolution = resolvePendingEvent(state.pendingEvent, key, Date.now())
      if (resolution.resolved) {
        finishEvent(resolution.message, resolution.autonomous)
      } else {
        announce('That response is not available for the current request. Press 1 or 2, or allow the crew to decide.', 'Facility Control')
      }
      await persist()
      return
    }

    const command = routeKey(key)
    if (command.type === 'repeat') {
      if (lastMessage.value) announce(lastMessage.value, 'Repeat', lastProfile.value)
      else announce('No previous message is available.', 'Facility Control')
    } else if (command.type === 'back') {
      announce('Main terminal.', 'Facility Control')
    } else if (command.type === 'confirm') {
      announce('No confirmation is pending.', 'Facility Control')
    } else if (command.type === 'autopilot') {
      state.autopilotEnabled = nextAutopilotState(state.autopilotEnabled)
      announce(`Autopilot ${state.autopilotEnabled ? 'enabled' : 'disabled'}. ${state.autopilotEnabled ? 'Normal operations will continue. You may listen or interrupt at any time.' : 'Captain input restored.'}`, 'Facility Control', 'terminal', 2)
    } else if (command.type === 'status') {
      announce(command.message, 'Facility Control')
    } else {
      startEvent(command.eventId)
    }
    await persist()
  }

  function startEvent(eventId: string): void {
    const event = findEvent(eventId)
    if (!event || !canStartEvent(state, event, Date.now())) {
      announce('That channel has no new report at this time.', 'Facility Control')
      return
    }
    state.eventCooldowns[event.id] = Date.now() + event.cooldownMs
    state.pendingEvent = { eventId, requestedAt: Date.now() }
    announce(event.spokenLines.join(' '), speakerFor(event.participants[0]), profileFor(event.participants[0]), event.priority)
    if (event.immediateSafety) {
      const resolution = resolvePendingEvent(state.pendingEvent, null, Date.now())
      finishEvent(resolution.message, true)
    }
  }

  function finishEvent(message: string, autonomous: boolean): void {
    const id = state.pendingEvent?.eventId
    state.pendingEvent = null
    if (id) state.history = [...state.history, `${id}: ${message}`].slice(-100)
    announce(message, autonomous ? 'Facility Control' : 'Terminal', 'terminal', autonomous ? 2 : 3)
  }

  function checkTimeout(): void {
    if (!state.pendingEvent) return
    const resolution = resolvePendingEvent(state.pendingEvent, null, Date.now())
    if (resolution.resolved) {
      finishEvent(resolution.message, true)
      void persist()
    }
  }

  function emitChatter(): void {
    if (!ready.value || state.onboardingStatus === 'active' || state.pendingEvent) return
    const line = chatter[Math.floor(Math.random() * chatter.length)]!
    announce(line.text, line.speaker, line.profile, 5)
  }

  function autopilotTick(): void {
    if (!state.autopilotEnabled || state.pendingEvent || state.onboardingStatus === 'active') return
    state.productionCycles += 1
    state.oreProcessed += 12
    announce(`Autopilot report. Extraction cycle ${state.productionCycles} complete. Twelve tonnes transferred to processing.`, 'Facility Control', 'terminal', 4)
    void persist()
  }

  function scheduleTimers(): void {
    timers.push(window.setInterval(checkTimeout, 1_000))
    timers.push(window.setInterval(emitChatter, 24_000))
    timers.push(window.setInterval(autopilotTick, 45_000))
    timers.push(window.setInterval(() => void persist(), 30_000))
  }

  function skipOnboarding(): void {
    state.onboardingStatus = 'skipped'
    announce('Onboarding skipped. Main terminal active. Press 0 to repeat the current message, or 9 for autopilot.', 'Onboarding Assistant', 'onboarding', 2)
    void persist()
  }

  function replayOnboarding(): void {
    state.onboardingStatus = 'active'
    state.onboardingStep = 0
    announce(onboardingSteps[0]!.prompt, 'Onboarding Assistant', 'onboarding', 2)
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
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    timers.forEach((timer) => window.clearInterval(timer))
    audio.stop()
    void persist()
  })

  return {
    state,
    ready,
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
