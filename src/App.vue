<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { exhibits, recentEvents } from './game/information'
import { formatOperationTime, operationDate } from './game/calendar'
import { useFacility } from './composables/useFacility'
import { useTerminalTools } from './composables/useTerminalTools'
import { COMMISSIONING_NOTICE } from './game/engine'
import { buildLabel } from './game/build'
import { formatOperationalHistory, formatTranscript } from './game/portableSave'
import type { KeypadKey } from './game/types'

const booting = ref(true)
const {
  beginKey, endKey, protectedKey, updateProtection, holdProgress, inputNotice, conversationStatus, playInformation, stopInformation,
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
  skipOnboarding,
  replayOnboarding,
  cycleDisplayMode,
  restoreDisplay,
} = useFacility()

const keys: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
const latestTranscript = computed(() => [...state.transcript].reverse())
const menuOpen = ref(false)
const showAllEvents = ref(false)
const information = ref<'about' | 'recent' | 'settings' | null>(null)
const selectedInformation = ref<{ title: string; text: string } | null>(null)
watch(importing, value => { if (value) { stopInformation(); information.value = null; selectedInformation.value = null } })
const recordedEvents = computed(() => recentEvents(state))
function showInformation(view: 'about' | 'recent' | 'settings'): void {
  stopInformation()
  showAllEvents.value = false
  information.value = view
  menuOpen.value = false
  selectedInformation.value = view === 'about' ? exhibits[0]! : null
  if (view === 'about') playInformation(exhibits[0]!.text)
}
function chooseInformation(item: { title: string; text: string }): void {
  stopInformation()
  selectedInformation.value = item
}
function keypadPointer(event: PointerEvent, key: KeypadKey): void {
  if (event.button !== 0) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  beginKey(key)
}

const textDisplayVisible = ref(true)

const {
  utility, saveText, validatedText, utilityMessage, utilityStatus, copying,
  copySource, copiedText, copyMessage, copyStatus,
  openUtility, copyText, validateImport, confirmImport, closeCopy,
} = useTerminalTools(portableSnapshot, importSnapshot)
const contrastModes = ['high-contrast-white', 'high-contrast-dark'] as const
const displayLabel = computed(() => displayMode.value.replaceAll('-', ' ').toUpperCase())

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
            <button type="button" :disabled="copying || importing" @click="copyText(formatOperationalHistory(state.operations), 'history'); menuOpen = false">COPY OPERATIONAL HISTORY</button>
            <button type="button" @click="showInformation('about')">ABOUT</button>
            <button type="button" @click="showInformation('recent')">RECENT EVENTS</button>
            <button type="button" @click="showInformation('settings')">SETTINGS</button>
            <button type="button" :disabled="copying || importing" @click="openUtility('export'); menuOpen = false">EXPORT SAVE</button>
            <button type="button" :disabled="copying || importing" @click="openUtility('import'); menuOpen = false">IMPORT SAVE</button>
          </div>
        </div>
      </header>

      <p v-if="copyMessage" class="utility-message" :class="`utility-${copyStatus}`" role="status">
        <strong>{{ copyStatus.toUpperCase() }}: </strong>{{ copyMessage }}
      </p>
      <section v-if="copiedText !== null" class="save-tools" :aria-label="`Copy ${copySource === 'history' ? 'operational history' : 'transcript'}`" @keydown.stop>
        <label for="report-copy">COPYABLE {{ copySource === 'history' ? 'OPERATIONAL HISTORY' : 'TRANSCRIPT' }}</label>
        <textarea id="report-copy" :value="copiedText" readonly :disabled="copying" spellcheck="false"></textarea>
        <div class="terminal-actions">
          <button :disabled="copying" @click="copyText(copiedText, copySource)">{{ copying ? 'COPYING…' : 'COPY' }}</button>
          <button :disabled="copying" @click="closeCopy">CLOSE {{ copySource === 'history' ? 'HISTORY' : 'TRANSCRIPT' }}</button>
        </div>
      </section>

      <p v-if="utilityMessage" class="utility-message" :class="`utility-${utilityStatus}`" role="status">
        <strong>{{ utilityStatus.toUpperCase() }}: </strong>{{ utilityMessage }}
      </p>
      <section v-if="utility" class="save-tools" :aria-label="utility === 'export' ? 'Export save' : 'Import save'" @keydown.stop>
        <label for="save-json">{{ utility === 'export' ? 'COPYABLE SAVE JSON' : 'PASTE SAVE JSON' }}</label>
        <textarea id="save-json" v-model="saveText" :readonly="utility !== 'import'" :disabled="importing || copying"
          spellcheck="false" @input="validatedText = null; utilityMessage = ''"></textarea>
        <div class="terminal-actions">
          <button v-if="utility !== 'import'" :disabled="copying" @click="copyText(saveText, 'save')">{{ copying ? 'COPYING…' : 'COPY' }}</button>
          <button v-else-if="validatedText === null" @click="validateImport">VALIDATE IMPORT</button>
          <button v-else :disabled="importing" @click="confirmImport">{{ importing ? 'IMPORTING…' : 'CONFIRM REPLACE OPERATION' }}</button>
          <button :disabled="importing || copying" @click="utility = null; validatedText = null; saveText = ''; utilityMessage = ''">{{ utility === 'import' ? 'CANCEL' : 'CLOSE' }}</button>
        </div>
      </section>

      <section v-if="information" class="information-panel" :aria-label="information === 'about' ? 'About facility audio guide' : information === 'recent' ? 'Recent Events' : 'Settings'">
        <h2>{{ information === 'about' ? 'ABOUT' : information === 'recent' ? 'RECENT EVENTS' : 'SETTINGS' }}</h2>
        <template v-if="information === 'settings'">
          <label for="keypad-protection">Keypad Protection</label>
          <select id="keypad-protection" v-model="state.keypadProtection.mode" @change="updateProtection">
            <option value="off">Off</option><option value="critical">Critical Actions Only (recommended)</option><option value="all">All Actions</option>
          </select>
          <label for="hold-seconds">Hold duration (seconds)</label>
          <select id="hold-seconds" v-model.number="state.keypadProtection.holdSeconds" @change="updateProtection">
            <option v-for="seconds in 5" :key="seconds" :value="seconds">{{ seconds }}</option>
          </select>
          <p>Touch: hold the key until confirmed. Keyboard, Bluetooth numpad and assistive activation: press and release, wait the selected duration, then press the same key again. Repeated keydown signals do not confirm. The confirmation expires 15 seconds after the wait. Repeat (0) is always immediate.</p>
          <p>Critical protection covers repair actions, active request choices, safety isolation and autopilot changes. Diagnostics, recommendations and navigation remain immediate.</p>
        </template>
        <template v-else>
          <p>Facility Control · Optional audio. Live operations continue and can interrupt the guide. Use Replay after an interruption.</p>
          <div class="information-list" v-if="information === 'about'">
            <button v-for="exhibit in exhibits" :key="exhibit.id" @click="chooseInformation(exhibit)">{{ exhibit.title }}</button>
          </div>
          <div class="information-list" v-else>
            <p v-if="!recordedEvents.length">No notable events have been recorded for this operation.</p>
            <button v-for="event in (showAllEvents ? recordedEvents : recordedEvents.slice(0, 10))" :key="event.id" @click="chooseInformation(event)">{{ event.date }} — {{ event.title }}</button>
            <button v-if="recordedEvents.length > 10 && !showAllEvents" @click="showAllEvents = true">SHOW OLDER EVENTS</button>
          </div>
          <article v-if="selectedInformation">
            <h3>{{ selectedInformation.title }}</h3><p>{{ selectedInformation.text }}</p>
            <div class="terminal-actions">
              <button @click="playInformation(selectedInformation.text)">PLAY / REPLAY</button>
              <button @click="stopInformation">STOP</button>
            </div>
          </article>
        </template>
        <button @click="stopInformation(); information = null; selectedInformation = null">BACK TO TERMINAL</button>
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
          {{ !state.commissioned ? (onboardingActive ? 'COMMISSIONING IN PROGRESS' : 'COMMISSIONING REQUIRED // READINESS CHECK') : pendingEvent ? `REQUEST OPEN // ${pendingEvent.type.toUpperCase()}` : 'NO CAPTAIN RESPONSE REQUIRED' }}
        </div>
      </section>

      <p v-if="conversationStatus" class="utility-message" role="status">{{ conversationStatus }}</p>
      <p v-if="inputNotice" class="utility-message" role="status">{{ inputNotice }}</p>
      <progress v-if="holdProgress" :value="holdProgress" max="100" aria-label="Keypad protection progress">{{ holdProgress }}%</progress>
      <p v-if="holdProgress">PROTECTION: {{ holdProgress }}%</p>
      <section class="keypad" aria-label="Terminal keypad">
        <button
          v-for="key in keys"
          :key="key"
          :disabled="importing"
          class="key"
          :aria-label="key === '*' ? 'Back or cancel' : key === '#' ? 'Confirm or enter' : `Key ${key}`"
          :aria-description="protectedKey(key) ? 'Protected action. Hold on touch, or press and release, wait, then press again on keyboard.' : undefined"
          @pointerdown="keypadPointer($event, key)"
          @pointerup="endKey(key)"
          @pointercancel="endKey(key)"
          @lostpointercapture="endKey(key)"
          @click="if ($event.detail === 0) { beginKey(key, true); endKey(key, true) }"
        >
          <span>{{ key }}</span>
          <small v-if="key === '0'">REPEAT / STATUS</small>
          <small v-else-if="key === '*'">BACK</small>
          <small v-else-if="key === '#'">ENTER</small>
        </button>
      </section>

      <p v-if="!state.commissioned" class="utility-message" role="status">
        {{ onboardingActive ? 'Facility not commissioned. Normal operations have not started. Complete the readiness check or select Delegate Checks to authorize operations.' : COMMISSIONING_NOTICE }}
      </p>
      <section class="terminal-actions" aria-label="Terminal options">
        <button @click.stop="cycleDisplayMode">DISPLAY: {{ displayLabel }}</button>
        <button v-if="onboardingActive" @click="skipOnboarding">DELEGATE CHECKS</button>
        <button v-else @click="replayOnboarding">READINESS CHECK</button>
      </section>

      <details class="transcript">
        <summary>TRANSCRIPT // {{ state.transcript.length }} {{ state.transcript.length === 1 ? 'MESSAGE' : 'MESSAGES' }}</summary>
        <ol>
          <li v-for="entry in latestTranscript" :key="entry.id">
            <time :datetime="operationDate(entry.operationAgeMs).toISOString()">{{ formatOperationTime(entry.operationAgeMs) }}</time>
            <span>{{ entry.speaker }}</span>
            <p>{{ entry.text }}</p>
          </li>
        </ol>
      </details>

      <details class="transcript">
        <summary>OPERATIONAL HISTORY // {{ state.operations.length }} {{ state.operations.length === 1 ? 'EVENT' : 'EVENTS' }}</summary>
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
