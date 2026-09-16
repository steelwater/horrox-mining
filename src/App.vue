<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFacility } from './composables/useFacility'
import type { KeypadKey } from './game/types'

const booting = ref(true)
const {
  state,
  ready,
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

window.setTimeout(() => {
  booting.value = false
}, 2200)
</script>

<template>
  <main
    class="app-shell"
    :class="[`mode-${displayMode}`, { booting }]"
    @click="displayMode === 'black' && restoreDisplay()"
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
        <div>
          <p class="eyebrow">1ST HORROX MINING LTD.</p>
          <h1>CAPTAIN TERMINAL</h1>
        </div>
        <div class="status-lights" aria-label="Facility status nominal">
          <span></span><span></span><span></span>
        </div>
      </header>

      <section class="readout" aria-live="polite">
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
