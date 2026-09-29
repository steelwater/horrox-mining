<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatOperationTime, operationDate } from './game/calendar'
import { useFacility } from './composables/useFacility'
import { buildLabel } from './game/build'
import { formatTranscript, parseSave } from './game/portableSave'
import type { KeypadKey } from './game/types'

const booting = ref(true)
const {
  importing,
  portableSnapshot,
  importSnapshot,
  startAudio,
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
} = useFacility()

const keys: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
const latestTranscript = computed(() => [...state.transcript].reverse())
const menuOpen = ref(false)
const textDisplayVisible = ref(true)

const utility = ref<'export' | 'import' | 'transcript' | null>(null)
const saveText = ref('')
const validatedText = ref<string | null>(null)
const utilityMessage = ref('')
const utilityStatus = ref<'success' | 'warning' | 'confirmation'>('success')
const copying = ref(false)
const contrastModes = ['high-contrast-white', 'high-contrast-dark'] as const
const displayLabel = computed(() => displayMode.value.replaceAll('-', ' ').toUpperCase())

function openUtility(mode: 'export' | 'import'): void {
  utility.value = mode
  saveText.value = mode === 'export' ? portableSnapshot() : ''
  validatedText.value = null
  utilityMessage.value = ''
  menuOpen.value = false
}
async function copyText(text: string, source: 'transcript' | 'save'): Promise<void> {
  if (copying.value) return
  copying.value = true
  try {
    await navigator.clipboard.writeText(text)
    utilityStatus.value = 'success'
    utilityMessage.value = `${source === 'transcript' ? 'Transcript' : 'Save'} copied to clipboard.`
  } catch {
    if (source === 'transcript') {
      utility.value = 'transcript'
      saveText.value = text
      validatedText.value = null
    }
    utilityStatus.value = 'warning'
    utilityMessage.value = 'Clipboard unavailable. Select and copy the text below manually. Your operation is unchanged.'
  } finally {
    copying.value = false
  }
}
function validateImport(): void {
  try {
    parseSave(saveText.value)
    validatedText.value = saveText.value
    utilityStatus.value = 'confirmation'
    utilityMessage.value = 'Valid save. Import will replace your current operation, including its progress and history. Continue?'
  } catch (error) {
    validatedText.value = null
    utilityStatus.value = 'warning'
    utilityMessage.value = error instanceof Error ? error.message : 'Save validation failed.'
  }
}
async function confirmImport(): Promise<void> {
  if (validatedText.value === null || validatedText.value !== saveText.value) return
  try {
    await importSnapshot(validatedText.value)
    utility.value = null
    validatedText.value = null
    saveText.value = ''
    utilityStatus.value = 'success'
    utilityMessage.value = 'Save imported. Operation restored.'
  } catch (error) {
    utilityStatus.value = 'warning'
    utilityMessage.value = error instanceof Error ? error.message : 'Import failed. Current session retained.'
  }
}

void startAudio()

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

    <section v-else-if="!ready && storageError" class="readout" role="alert">
      <p>{{ storageError }}</p>
      <button @click="initialize">RETRY CONNECTION</button>
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
            aria-label="Terminal options"
            aria-controls="terminal-display-menu"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen"
          >
            <span></span><span></span><span></span>
          </button>
          <div v-if="menuOpen" id="terminal-display-menu" class="menu-panel">
            <button v-for="mode in contrastModes" :key="mode" type="button" :aria-pressed="displayMode === mode"
              @click="displayMode = mode">
              {{ mode.replaceAll('-', ' ').toUpperCase() }}{{ displayMode === mode ? ' — SELECTED' : '' }}
            </button>
            <button type="button" @click="toggleTextDisplay">
              {{ textDisplayVisible ? 'HIDE TEXT DISPLAY' : 'SHOW TEXT DISPLAY' }}
            </button>
            <button type="button" :disabled="copying || importing" @click="copyText(formatTranscript(state.transcript), 'transcript'); menuOpen = false">{{ copying ? 'COPYING…' : 'COPY TRANSCRIPT' }}</button>
            <button type="button" :disabled="copying || importing" @click="openUtility('export')">EXPORT SAVE</button>
            <button type="button" :disabled="copying || importing" @click="openUtility('import')">IMPORT SAVE</button>
          </div>
        </div>
      </header>

      <p v-if="utilityMessage" class="utility-message" :class="`utility-${utilityStatus}`" role="status">
        <strong>{{ utilityStatus.toUpperCase() }}: </strong>{{ utilityMessage }}
      </p>
      <section v-if="utility" class="save-tools" :aria-label="utility === 'transcript' ? 'Copy transcript' : utility === 'export' ? 'Export save' : 'Import save'" @keydown.stop>
        <label for="save-json">{{ utility === 'transcript' ? 'COPYABLE TRANSCRIPT' : utility === 'export' ? 'COPYABLE SAVE JSON' : 'PASTE SAVE JSON' }}</label>
        <textarea id="save-json" v-model="saveText" :readonly="utility !== 'import'" :disabled="importing || copying"
          spellcheck="false" @input="validatedText = null; utilityMessage = ''"></textarea>
        <div class="terminal-actions">
          <button v-if="utility !== 'import'" :disabled="copying" @click="copyText(saveText, utility === 'transcript' ? 'transcript' : 'save')">{{ copying ? 'COPYING…' : 'COPY' }}</button>
          <button v-else-if="validatedText === null" @click="validateImport">VALIDATE IMPORT</button>
          <button v-else :disabled="importing" @click="confirmImport">{{ importing ? 'IMPORTING…' : 'CONFIRM REPLACE OPERATION' }}</button>
          <button :disabled="importing || copying" @click="utility = null; validatedText = null; saveText = ''; utilityMessage = ''">{{ utility === 'import' ? 'CANCEL' : 'CLOSE' }}</button>
        </div>
      </section>

      <p v-if="storageError" role="alert"><strong>WARNING: </strong>{{ storageError }}</p>

      <section v-if="textDisplayVisible" class="readout" aria-live="polite">
        <div class="readout-meta">
          <span>{{ formatOperationTime(state.facilityAgeMs) }} // {{ facilityAgeHours }}H</span>
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
          :disabled="importing"
          class="key"
          :aria-label="key === '*' ? 'Back or cancel' : key === '#' ? 'Confirm or enter' : `Key ${key}`"
          @click="pressKey(key)"
        >
          <span>{{ key }}</span>
          <small v-if="key === '0'">REPEAT / STATUS</small>
          <small v-else-if="key === '*'">BACK</small>
          <small v-else-if="key === '#'">ENTER</small>
        </button>
      </section>

      <section class="terminal-actions" aria-label="Terminal options">
        <button @click.stop="cycleDisplayMode">DISPLAY: {{ displayLabel }}</button>
        <button v-if="onboardingActive" @click="skipOnboarding">DELEGATE CHECKS</button>
        <button v-else @click="replayOnboarding">REVIEW READINESS</button>
      </section>

      <details class="transcript">
        <summary>TRANSCRIPT // {{ state.transcript.length }} MESSAGES</summary>
        <ol>
          <li v-for="entry in latestTranscript" :key="entry.id">
            <time :datetime="operationDate(entry.operationAgeMs).toISOString()">{{ formatOperationTime(entry.operationAgeMs) }}</time>
            <span>{{ entry.speaker }}</span>
            <p>{{ entry.text }}</p>
          </li>
        </ol>
      </details>

      <details class="transcript">
        <summary>OPERATIONAL HISTORY // {{ state.operations.length }} EVENTS</summary>
        <ol>
          <li v-for="entry in [...state.operations].reverse()" :key="entry.id">
            <time :datetime="operationDate(entry.operationAgeMs).toISOString()">{{ formatOperationTime(entry.operationAgeMs) }}</time>
            <span>{{ entry.source }} // {{ entry.resolution }}</span>
            <p>{{ entry.summary }}</p>
            <p v-if="entry.reason">Reason: {{ entry.reason }}</p>
          </li>
        </ol>
      </details>

      <footer>
        <span>TOUCH // KEYBOARD // BLUETOOTH NUMPAD</span>
        <span>ORE {{ state.oreProcessed }}T</span>
        <span class="build-label">{{ buildLabel }}</span>
      </footer>
    </section>

    <button v-if="!booting && displayMode === 'black'" class="restore-control" @click.stop="restoreDisplay">
      TAP TO RESTORE TERMINAL
    </button>
  </main>
</template>
