import { describe, expect, it } from 'vitest'
import { instructionForKey, repairActionProtected } from '../src/game/keypadGuidance'
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
