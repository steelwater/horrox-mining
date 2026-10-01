import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTerminalTools } from '../src/composables/useTerminalTools'
import { createInitialState } from '../src/game/engine'
import { exportSave, formatOperationalHistory, formatTranscript } from '../src/game/portableSave'

afterEach(() => vi.unstubAllGlobals())

describe.each(['transcript', 'history'] as const)('copy %s while preparing an import', (source) => {
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
    const report = source === 'history' ? formatOperationalHistory([]) : formatTranscript([])
    tools.openUtility('import')
    tools.saveText.value = save
    if (validated) tools.validateImport()
    const message = tools.utilityMessage.value
    const status = tools.utilityStatus.value

    await tools.copyText(report, source)

    expect(tools.utility.value).toBe('import')
    expect(tools.saveText.value).toBe(save)
    expect(tools.validatedText.value).toBe(validated ? save : null)
    expect(tools.utilityMessage.value).toBe(message)
    expect(tools.utilityStatus.value).toBe(status)
    expect(tools.copiedText.value).toBe(report)
    expect(tools.copySource.value).toBe(source)
    expect(tools.copyMessage.value).toContain('Select and copy')
    expect(tools.copying.value).toBe(false)
    expect(importSnapshot).not.toHaveBeenCalled()

    tools.closeCopy()
    expect(tools.copiedText.value).toBeNull()
    expect(tools.copyMessage.value).toBe('')
    expect(tools.utility.value).toBe('import')
    expect(tools.saveText.value).toBe(save)
    expect(tools.validatedText.value).toBe(validated ? save : null)
    if (!validated) tools.validateImport()
    await tools.confirmImport()
    expect(importSnapshot).toHaveBeenCalledExactlyOnceWith(save)
  })

  it('retries the report snapshot without copying or changing the pending import', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const tools = useTerminalTools(vi.fn(), vi.fn())
    tools.openUtility('import')
    tools.saveText.value = 'unfinished pasted JSON'
    await tools.copyText('report snapshot', source)
    await tools.copyText(tools.copiedText.value!, source)
    expect(writeText.mock.calls).toEqual([['report snapshot'], ['report snapshot']])
    expect(tools.copyMessage.value).toBe(`${source === 'history' ? 'Operational history' : 'Transcript'} copied to clipboard.`)
    expect(tools.saveText.value).toBe('unfinished pasted JSON')
    expect(tools.utility.value).toBe('import')
  })
})

it('copies history without exporting, importing or changing the operation, and replaces a stale fallback', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const snapshot = vi.fn()
  const importSnapshot = vi.fn()
  const tools = useTerminalTools(snapshot, importSnapshot)
  const state = createInitialState(Date.now())
  const before = JSON.stringify(state)
  await tools.copyText('old transcript', 'transcript')
  await tools.copyText(formatOperationalHistory(state.operations), 'history')
  expect(tools.copiedText.value).toBeNull()
  expect(tools.copySource.value).toBe('history')
  expect(tools.copyMessage.value).toBe('Operational history copied to clipboard.')
  expect(writeText).toHaveBeenLastCalledWith(formatOperationalHistory([]))
  expect(snapshot).not.toHaveBeenCalled()
  expect(importSnapshot).not.toHaveBeenCalled()
  expect(JSON.stringify(state)).toBe(before)
})
