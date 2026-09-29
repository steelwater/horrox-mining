import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTerminalTools } from '../src/composables/useTerminalTools'
import { createInitialState } from '../src/game/engine'
import { exportSave, formatTranscript } from '../src/game/portableSave'

afterEach(() => vi.unstubAllGlobals())

describe('copy transcript while preparing an import', () => {
  it.each([
    { clipboard: 'denied', validated: false },
    { clipboard: 'unavailable', validated: false },
    { clipboard: 'denied', validated: true },
    { clipboard: 'unavailable', validated: true },
  ])('preserves the import and confirmation when clipboard is $clipboard (validated: $validated)', async ({ clipboard, validated }) => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'))
    vi.stubGlobal('navigator', clipboard === 'denied' ? { clipboard: { writeText } } : {})
    const importSnapshot = vi.fn().mockResolvedValue(undefined)
    const tools = useTerminalTools(vi.fn(), importSnapshot)
    const save = exportSave(createInitialState(Date.now()))
    const transcript = formatTranscript([])
    tools.openUtility('import')
    tools.saveText.value = save
    if (validated) tools.validateImport()
    const message = tools.utilityMessage.value
    const status = tools.utilityStatus.value

    await tools.copyText(transcript, 'transcript')

    expect(tools.utility.value).toBe('import')
    expect(tools.saveText.value).toBe(save)
    expect(tools.validatedText.value).toBe(validated ? save : null)
    expect(tools.utilityMessage.value).toBe(message)
    expect(tools.utilityStatus.value).toBe(status)
    expect(tools.transcriptText.value).toBe(transcript)
    expect(tools.transcriptMessage.value).toContain('Select and copy')
    expect(tools.copying.value).toBe(false)
    expect(importSnapshot).not.toHaveBeenCalled()

    tools.closeTranscript()
    expect(tools.transcriptText.value).toBeNull()
    expect(tools.transcriptMessage.value).toBe('')
    expect(tools.utility.value).toBe('import')
    expect(tools.saveText.value).toBe(save)
    expect(tools.validatedText.value).toBe(validated ? save : null)
    if (!validated) tools.validateImport()
    await tools.confirmImport()
    expect(importSnapshot).toHaveBeenCalledExactlyOnceWith(save)
  })

  it('retries the transcript snapshot without copying or changing the pending import', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const tools = useTerminalTools(vi.fn(), vi.fn())
    tools.openUtility('import')
    tools.saveText.value = 'unfinished pasted JSON'
    await tools.copyText('transcript snapshot', 'transcript')
    await tools.copyText(tools.transcriptText.value!, 'transcript')
    expect(writeText.mock.calls).toEqual([['transcript snapshot'], ['transcript snapshot']])
    expect(tools.transcriptMessage.value).toBe('Transcript copied to clipboard.')
    expect(tools.saveText.value).toBe('unfinished pasted JSON')
    expect(tools.utility.value).toBe('import')
  })
})
