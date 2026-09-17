import { describe, expect, it } from 'vitest'
import { voiceProfiles } from '../src/game/content'

describe('voice identities', () => {
  it('keeps the onboarding assistant distinct from facility control', () => {
    const onboarding = voiceProfiles.find((profile) => profile.id === 'onboarding')
    const terminal = voiceProfiles.find((profile) => profile.id === 'terminal')

    expect(onboarding).toBeDefined()
    expect(terminal).toBeDefined()
    expect(onboarding?.pitch).not.toBe(terminal?.pitch)
    expect(onboarding?.preferredNameHints).not.toEqual(terminal?.preferredNameHints)
  })
})
