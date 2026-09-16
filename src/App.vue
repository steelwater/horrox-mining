<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFacility } from './composables/useFacility'
import type { KeypadKey } from './game/types'

const booting = ref(true)
const {
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
} = useFacility()

const keys: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
const latestTranscript = computed(() => [...state.transcript].reverse())
const menuOpen = ref(false)
const textDisplayVisible = ref(true)

function toggleTextDisplay(): void {
  textDisplayVisible.value = !textDisplayVisible.value
  menuOpen.value = false
}

window.setTimeout(() => {
  booting.value = false
  void initialize()
}, 2200)
</script>

<template>
  <main
    class="app-shell"
    :class="[`mode-${displayMode}`, { booting }]"
    @click="menuOpen = false; displayMode === 'black' && restoreDisplay()"
  >
    <section v-if="booting" class="boot-screen" aria-live="polite">
      <div class="brand-mark" aria-label="1st Horrox Mining Limited">
        <span class="brand-index">1ST</span>
        <strong>HORROX</strong>
        <span>MINING LTD.</span>
      </div>
      <p>ORBITAL TERMINAL // CONNECTING</p>
      <small>Prototype wordmark — official logo asset pending</small>
    </section>

    <section v-else-if="ready" class="terminal" aria-label="Horrox Mining terminal">
      <header class="terminal-header">
        <div class="header-brand" aria-label="1st Horrox Mining Limited">
          <span class="header-brand-index">1ST</span>
          <span class="header-brand-name">
            <strong>HORROX</strong>
            <small>MINING LTD.</small>
          </span>
        </div>
        <div class="terminal-menu" @click.stop>
          <button
            class="menu-trigger"
            type="button"
            aria-label="Terminal display options"
            aria-controls="terminal-display-menu"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen"
          >
            <span></span><span></span><span></span>
          </button>
          <div v-if="menuOpen" id="terminal-display-menu" class="menu-panel">
            <button type="button" @click="toggleTextDisplay">
              {{ textDisplayVisible ? 'HIDE TEXT DISPLAY' : 'SHOW TEXT DISPLAY' }}
            </button>
          </div>
        </div>
      </header>

      <section v-if="textDisplayVisible" class="readout" aria-live="polite">
        <div class="readout-meta">
          <span>FACILITY AGE {{ facilityAgeHours }}H</span>
          <span>{{ state.autopilotEnabled ? 'AUTOPILOT' : 'CAPTAIN CONTROL' }}</span>
        </div>
        <article v-if="latestTranscript[0]" class="current-message">
          <p>{{ latestTranscript[0].speaker }}</p>
          <strong>{{ latestTranscript[0].text }}</strong>
        </article>
        <article v-else class="current-message">
          <p>FACILITY CONTROL</p>
          <strong>Terminal link established.</strong>
        </article>
        <div class="request-state">
          {{ pendingEvent ? `REQUEST OPEN // ${pendingEvent.type.toUpperCase()}` : 'NO CAPTAIN RESPONSE REQUIRED' }}
        </div>
      </section>
      <section v-else class="readout-collapsed" aria-label="Text display hidden">
        <span>TEXT DISPLAY HIDDEN</span>
        <button type="button" @click="textDisplayVisible = true">SHOW</button>
      </section>

      <section class="keypad" aria-label="Terminal keypad">
        <button
          v-for="key in keys"
          :key="key"
          class="key"
          :aria-label="key === '*' ? 'Back or cancel' : key === '#' ? 'Confirm or enter' : `Key ${key}`"
          @click="pressKey(key)"
        >
          <span>{{ key }}</span>
          <small v-if="key === '0'">REPEAT</small>
          <small v-else-if="key === '*'">BACK</small>
          <small v-else-if="key === '#'">ENTER</small>
        </button>
      </section>

      <section class="terminal-actions" aria-label="Terminal options">
        <button @click.stop="cycleDisplayMode">DISPLAY: {{ displayMode.toUpperCase() }}</button>
        <button v-if="onboardingActive" @click="skipOnboarding">SKIP ONBOARDING</button>
        <button v-else @click="replayOnboarding">REPLAY ONBOARDING</button>
      </section>

      <details class="transcript">
        <summary>TRANSCRIPT // {{ state.transcript.length }} MESSAGES</summary>
        <ol>
          <li v-for="entry in latestTranscript" :key="entry.id">
            <span>{{ entry.speaker }}</span>
            <p>{{ entry.text }}</p>
          </li>
        </ol>
      </details>

      <footer>
        <span>TOUCH // KEYBOARD // BLUETOOTH NUMPAD</span>
        <span>ORE {{ state.oreProcessed }}T</span>
      </footer>
    </section>

    <button v-if="!booting && displayMode === 'black'" class="restore-control" @click.stop="restoreDisplay">
      TAP TO RESTORE TERMINAL
    </button>
  </main>
</template>
