import { describe, expect, it } from 'vitest'
import { advanceOnboarding, onboardingSteps } from '../src/game/onboarding'

describe('onboarding', () => {
  it('preserves progress when the wrong key is pressed', () => {
    const result = advanceOnboarding('active', 0, '3')
    expect(result.accepted).toBe(false)
    expect(result.step).toBe(0)
    expect(result.status).toBe('active')
  })

  it('advances using the real terminal command keys', () => {
    const result = advanceOnboarding('active', 0, '2')
    expect(result.accepted).toBe(true)
    expect(result.step).toBe(1)
  })

  it('completes on the final hash confirmation', () => {
    const result = advanceOnboarding('active', onboardingSteps.length - 1, '#')
    expect(result.status).toBe('complete')
  })

  it('does not restart a skipped tutorial implicitly', () => {
    const result = advanceOnboarding('skipped', 2, '3')
    expect(result.status).toBe('skipped')
    expect(result.accepted).toBe(false)
  })
})
