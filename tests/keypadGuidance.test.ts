import { describe, expect, it } from 'vitest'
import { instructionForKey, repairActionProtected, spokenMenuChoices } from '../src/game/keypadGuidance'
import { createInitialState } from '../src/game/engine'
describe('audio-first keypad guidance', () => {
  it('announces an unprotected press', () => { expect(instructionForKey('1','Diagnostics',false,3)).toBe('Press 1 for diagnostics.') })
  it('uses singular/plural touch durations', () => {
    expect(instructionForKey('2','Drone support',true,1,'touch')).toContain('1 second')
    expect(instructionForKey('2','Drone support',true,5,'touch')).toContain('5 seconds')
  })
  it('describes deliberate keyboard reactivation', () => { expect(instructionForKey('2','Dock repair',true,3,'keyboard')).toContain('release, wait 3 seconds, then press 2 again') })
  it('describes both modalities when unknown', () => {
    const phrase=instructionForKey('2','Drone support',true,3)
    expect(phrase).toContain('on touch'); expect(phrase).toContain('on a keyboard')
  })
  it('respects Off, Critical Only and All', () => {
    const state=createInitialState(0)
    state.keypadProtection.mode='off'; expect(repairActionProtected(state,'drone')).toBe(false)
    state.keypadProtection.mode='critical'; expect(repairActionProtected(state,'drone')).toBe(true)
    expect(repairActionProtected(state,'diagnostics')).toBe(false)
    expect(repairActionProtected(state,'recommend')).toBe(false)
    state.keypadProtection.mode='all'; expect(repairActionProtected(state,'diagnostics')).toBe(true)
  })
})

describe('concise spoken repair menus', () => {
  const choices = [
    { key: '1' as const, label: 'Diagnostics', protectedAction: false },
    { key: '2' as const, label: 'Dispatch repair drone', protectedAction: true },
    { key: '3' as const, label: 'Dock repair', protectedAction: true },
    { key: '8' as const, label: 'Facility recommendation', protectedAction: false },
  ]
  it('explains shared protection only once and lists each option once', () => {
    const result = spokenMenuChoices(choices, 3)
    expect(result.match(/on touch/g)).toHaveLength(1)
    expect(result.match(/On a keyboard/g)).toHaveLength(1)
    expect(result).toContain('2: dispatch repair drone.')
    expect(result).toContain('3: dock repair.')
    expect(result).toContain('Press 1 for diagnostics.')
    expect(result).toContain('Press 8 for facility recommendation.')
    expect(result).not.toContain('For dispatch repair drone, hold')
  })
  it('does not announce a protection explanation when protection is off', () => {
    const result = spokenMenuChoices(choices.map(option => ({ ...option, protectedAction: false })), 3)
    expect(result).not.toContain('Protected choices')
    expect(result).toContain('Press 2 for dispatch repair drone.')
  })
  it('uses selected threshold for all-protected mode, including diagnostics', () => {
    const result = spokenMenuChoices(choices.map(option => ({ ...option, protectedAction: true })), 5)
    expect(result).toContain('hold the chosen key for 5 seconds')
    expect(result).toContain('1: diagnostics.')
    expect(result).not.toContain('Press 1 for diagnostics.')
    expect(result.match(/on touch/g)).toHaveLength(1)
  })
  it('only narrates offered choices and retains singular second', () => {
    const result = spokenMenuChoices(choices.filter(option => option.key !== '2'), 1)
    expect(result).not.toContain('dispatch repair drone')
    expect(result).toContain('1 second')
  })
})
