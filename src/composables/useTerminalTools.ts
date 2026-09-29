import { ref } from 'vue'
import { parseSave } from '../game/portableSave'

export function useTerminalTools(portableSnapshot: () => string, importSnapshot: (text: string) => Promise<void>) {
  const utility = ref<'export' | 'import' | null>(null)
  const saveText = ref('')
  const validatedText = ref<string | null>(null)
  const utilityMessage = ref('')
  const utilityStatus = ref<'success' | 'warning' | 'confirmation'>('success')
  const copying = ref(false)
  const transcriptText = ref<string | null>(null)
  const transcriptMessage = ref('')
  const transcriptStatus = ref<'success' | 'warning'>('success')

  function openUtility(mode: 'export' | 'import'): void {
    utility.value = mode
    saveText.value = mode === 'export' ? portableSnapshot() : ''
    validatedText.value = null
    utilityMessage.value = ''
  }

  async function copyText(text: string, source: 'transcript' | 'save'): Promise<void> {
    if (copying.value) return
    copying.value = true
    const message = source === 'transcript' ? transcriptMessage : utilityMessage
    const status = source === 'transcript' ? transcriptStatus : utilityStatus
    try {
      await navigator.clipboard.writeText(text)
      status.value = 'success'
      message.value = `${source === 'transcript' ? 'Transcript' : 'Save'} copied to clipboard.`
    } catch {
      if (source === 'transcript') {
        transcriptText.value = text
      }
      status.value = 'warning'
      message.value = 'Clipboard unavailable. Select and copy the text below manually. Your operation is unchanged.'
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

  function closeTranscript(): void {
    transcriptText.value = null
    transcriptMessage.value = ''
  }

  return {
    utility, saveText, validatedText, utilityMessage, utilityStatus, copying,
    transcriptText, transcriptMessage, transcriptStatus,
    openUtility, copyText, validateImport, confirmImport, closeTranscript,
  }
}
