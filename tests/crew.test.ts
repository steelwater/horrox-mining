import { describe, expect, it } from 'vitest'
import { advanceFacility, applyPendingDecision, beginRequest, commissionFacility, createInitialState, restoreState } from '../src/game/engine'
import { crewReport, miningReporter, updateCrewState } from '../src/game/crew'
import { migrateFacility } from '../src/game/persistence'
import { exportSave, parseSave } from '../src/game/portableSave'
import { codeReport } from '../src/game/operations'
import { decideRepair, detectFault } from '../src/game/repairs'
import { chatter, eligibleChatter, rememberChatter, rememberChatterContext } from '../src/game/chatter'

const start = 1_800_000_000_000
const minute = 60_000
function operation() {
  const state = createInitialState(start)
  commissionFacility(state, start)
  state.onboardingStatus = 'complete'
  return state
}
function schema4() {
  const state = operation()
  advanceFacility(state, start + 3 * minute)
  const envelope = JSON.parse(exportSave(state, start + 3 * minute))
  envelope.schemaVersion = envelope.state.version = 4
  delete envelope.state.chatterMemory
  envelope.state.miners = envelope.state.miners.slice(0, 3)
  for (const crew of envelope.state.miners) for (const key of ['department', 'temperament', 'specialty', 'experience', 'radioStyle', 'vesselId', 'lastPhrase']) delete crew[key]
  return envelope
}

describe('persistent crew identity', () => {
  it('migrates a real schema 4 shape with an active fault without changing operational progress', () => {
    const old = schema4()
    old.state.miners[0].currentMood = 'thoughtful'
    old.state.miners[0].relationships['iko-ren'] = 'Cantina card rival'
    const migrated = parseSave(JSON.stringify(old), start + 3 * minute)
    expect(migrated.version).toBe(5)
    expect(migrated.miners).toHaveLength(9)
    for (const field of ['vessels', 'repairJobs', 'repairDrones', 'processingQueue', 'operations', 'facilityAgeMs', 'nextRepairId'] as const) expect(migrated[field]).toEqual(old.state[field])
    expect(migrated.miners[0]?.currentMood).toBe('thoughtful')
    expect(migrated.miners[0]?.relationships['iko-ren']).toBe('Cantina card rival')
    expect(parseSave(exportSave(migrated), start + 3 * minute)).toEqual(migrated)
    expect(migrateFacility(old.state, start + 3 * minute)).toEqual(migrated)
  })

  it('preserves traits, changed assignment, relationships, and vessel operator through reopen and portable saves', () => {
    const state = operation()
    const rill = state.miners.find((crew) => crew.id === 'tess-oren')!
    rill.vesselId = 'hauler-02'
    rill.currentAssignment = 'Hauler Two survey support'
    rill.currentMood = 'thoughtful'
    rill.relationships['bea-kade'] = 'Cantina card rival'
    state.vessels[1]!.minerId = rill.id
    expect(miningReporter(state, state.vessels[1]!)).toBe(rill.id)
    const restored = parseSave(exportSave(state), start)
    expect(restored).toEqual(state)
    expect(migrateFacility(restored, start)).toEqual(state)
    advanceFacility(restored, start + minute)
    expect(restored.miners.find((crew) => crew.id === rill.id)).toMatchObject({
      id: rill.id, callsign: 'Rill', experience: 'newcomer', vesselId: 'hauler-02', currentAssignment: 'Hauler Two: standby',
    })
    expect(restored.miners.filter((crew) => crew.vesselId === null).map((crew) => crew.department)).toEqual(['Maintenance', 'Refinery', 'Grading', 'Storage', 'Cargo'])
  })

  it.each(['missing identity', 'unknown vessel', 'unknown coworker', 'duplicate identity', 'invalid experience', 'future memory', 'unknown memory', 'extra field', 'missing operator'])('rejects %s without changing the live state', (scenario) => {
    const state = operation()
    const before = JSON.stringify(state)
    const envelope = JSON.parse(exportSave(state))
    const crew = envelope.state.miners[0]
    if (scenario === 'missing identity') delete crew.radioStyle
    if (scenario === 'unknown vessel') crew.vesselId = 'ghost'
    if (scenario === 'unknown coworker') crew.relationships.ghost = 'friend'
    if (scenario === 'duplicate identity') envelope.state.miners[1] = crew
    if (scenario === 'invalid experience') crew.experience = 'reckless'
    if (scenario === 'future memory') envelope.state.chatterMemory['TS-06'] = minute
    if (scenario === 'unknown memory') envelope.state.chatterMemory.ghost = 0
    if (scenario === 'extra field') crew.secret = 'unmodeled'
    if (scenario === 'missing operator') envelope.state.vessels[0].minerId = 'ghost'
    expect(() => parseSave(JSON.stringify(envelope), start)).toThrow()
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('event-safe personality', () => {
  it.each([112, 205, 303])('preserves code %i, facts, urgency and captain options for veteran and newcomer', (code) => {
    const state = operation()
    const fact = 'Excavator Three at Berth Four. Condition CRITICAL. Press 3 for vessel support.'
    const category = code >= 300 ? 'safety' as const : 'maintenance' as const
    const summary = codeReport(code, fact)
    const event = { source: 'sol-arden', summary, category, operationCode: code }
    const first = crewReport(state, event)
    const second = crewReport(state, { ...event, source: 'tess-oren' })
    for (const text of [first, second]) {
      expect(text).toContain(fact)
      expect(text).toContain(String(code).split('').join(' '))
      expect(text.match(/Condition CRITICAL/g)).toHaveLength(1)
    }
    expect(event.summary).toBe(summary)
    if (code < 300) expect(first).not.toBe(second)
    else expect(first).toBe(second) // No personality delays a critical alert.
  })

  it('alternates characteristic phrases across save/reopen and keeps fault mood restrained', () => {
    const state = operation()
    const event = { source: 'tess-oren', summary: 'Sampling report.', category: 'mining' as const }
    const first = crewReport(state, event)
    const restored = parseSave(exportSave(state), start)
    expect(crewReport(restored, event)).not.toBe(first)
    detectFault(restored, 'excavator-03', 'sensor-degradation', start)
    updateCrewState(restored)
    expect(restored.miners.find((crew) => crew.id === 'tess-oren')!.currentMood).toBe('focused')
    expect(crewReport(restored, event)).toBe('Sampling report.')
  })

  it('keeps captain repair decisions and five-minute autonomy identical across personality changes', () => {
    for (const manual of [true, false]) {
      const states = [operation(), operation()]
      Object.assign(states[1]!.miners[2]!, { experience: 'newcomer', currentMood: 'irritated', temperament: 'impulsive', radioStyle: 'plain-first' })
      for (const state of states) {
        const fault = detectFault(state, 'excavator-03', 'sensor-degradation', start)!
        if (manual) decideRepair(state, state.vessels[0]!, fault, 'dock', start + minute)
        else {
          advanceFacility(state, start + 5 * minute - 1)
          expect(fault.decisionAt).toBe(start + 5 * minute)
        }
        advanceFacility(state, start + 5 * minute)
      }
      expect(states[1]!.vessels).toEqual(states[0]!.vessels)
      expect(states[1]!.repairJobs).toEqual(states[0]!.repairJobs)
      expect(states[1]!.repairDrones).toEqual(states[0]!.repairDrones)
    }
  })

  it('explains safe choices with specialty while retaining the existing decision outcome', () => {
    const state = operation()
    beginRequest(state, 'mining-vein-choice', start)
    const message = applyPendingDecision(state, null, start + 5 * minute)
    expect(message).toContain('excavation')
    expect(state.vessels[0]!.cut).toBe('stable')
  })
})

describe('rare approved chatter', () => {
  it('requires the Text Solitaire title to be heard before Runic Labyrinth and the recommendation before initials', () => {
    const state = operation()
    state.nextRepairId = 2
    const ts = chatter.find((exchange) => exchange.id === 'TS-06')!
    advanceFacility(state, start + 15 * minute)
    rememberChatter(state, ts, start + 15 * minute)
    advanceFacility(state, start + 60 * minute)
    expect(eligibleChatter(state, start + 60 * minute).some((e) => e.pack === 'RL')).toBe(false)
    rememberChatterContext(state, ts, start + 60 * minute)
    // A real safe transfer with at least a minute before arrival.
    state.vessels[0]!.assignment = 'delivery'
    state.vessels[0]!.dockingState = 'returning'
    state.vessels[0]!.completesAt = start + 62 * minute
    state.vessels[0]!.routineServiceDue = false
    state.repairDrones[0]!.state = 'available'
    state.operations = []
    state.processingQueue = []
    const options = eligibleChatter(state, start + 60 * minute)
    expect(options.filter((e) => e.pack === 'RL').map((e) => e.id)).toEqual(['RL-01'])
    const rl = options.find((e) => e.id === 'RL-01')!
    rememberChatter(state, rl, start + 60 * minute)
    rememberChatterContext(state, rl, start + 60 * minute)
    const restored = parseSave(exportSave(state), start + 60 * minute)
    expect(restored.chatterMemory).toEqual(state.chatterMemory)
    expect(eligibleChatter(restored, start + 60 * minute)).toEqual([])
  })

  it.each(['fault', 'repair', 'alarm', 'pending', 'inspection', 'approach'])('suppresses every chatter pack during %s', (scenario) => {
    const state = operation()
    if (scenario === 'fault' || scenario === 'repair') {
      const fault = detectFault(state, 'excavator-03', 'sensor-degradation', start)!
      if (scenario === 'repair') decideRepair(state, state.vessels[0]!, fault, 'drone', start)
    }
    if (scenario === 'alarm') state.systems.berth = 'isolated'
    if (scenario === 'pending') state.pendingEvent = { eventId: 'mining-vein-choice', requestedAt: start }
    if (scenario === 'inspection') state.systems.coolant = 'inspection'
    if (scenario === 'approach') state.vessels[1]!.dockingState = 'approaching'
    expect(eligibleChatter(state, start + minute)).toEqual([])
  })

  it('restores chatter saved between simulation ticks without rejecting its fractional-second clock', () => {
    const state = operation()
    const exchange = chatter.find((e) => e.id === 'TS-06')!
    advanceFacility(state, start + 30 * minute)
    rememberChatter(state, exchange, state.lastProcessedAt + 600)
    state.lastSavedAt = state.lastProcessedAt + 600
    expect(parseSave(exportSave(state), state.lastSavedAt)).toEqual(state)
    expect(migrateFacility(state, state.lastSavedAt)).toEqual(state)
  })

  it('keeps six-hour cooldowns after history rollover and produces no resume backlog', () => {
    const state = operation()
    advanceFacility(state, start + 30 * minute)
    const exchange = chatter.find((e) => e.id === 'TS-06')!
    rememberChatter(state, exchange, state.lastProcessedAt)
    rememberChatterContext(state, exchange, state.lastProcessedAt)
    state.operations = []
    state.transcript = []
    const restored = restoreState(parseSave(exportSave(state), state.lastProcessedAt), start + 4 * 60 * minute).state
    expect(restored.chatterMemory['TS-06']).toBe(30 * minute)
    expect(restored.operations.filter((e) => e.category === 'chatter')).toEqual([])
    expect(eligibleChatter(restored, restored.lastProcessedAt).some((e) => e.id === 'TS-06')).toBe(false)
  })

  it.each([30, 360])('keeps a %i-minute simulation varied, safe and free of future lore', (duration) => {
    const state = operation()
    const last = new Map<string, number>()
    const speakers = new Set<string>()
    for (let seconds = 30; seconds <= duration * 60; seconds += 30) {
      const before = state.nextOperationId
      const now = start + seconds * 1000
      advanceFacility(state, now)
      for (const event of state.operations.filter((e) => Number(e.id.slice(3)) >= before)) {
        if (event.operationCode === 112) speakers.add(event.source)
        expect(crewReport(state, event)).not.toMatch(/\bFran\b|the Kettle|Chronolith/i)
      }
      const options = eligibleChatter(state, now)
      // Prefer the rare pack to exercise the complete sequence deterministically.
      const exchange = options.find((e) => e.pack) ?? options.find((e) => !last.has(e.id)) ?? options[0]
      if (!exchange) continue
      expect(seconds * 1000 - (last.get(exchange.id) ?? -Infinity)).toBeGreaterThanOrEqual(exchange.cooldownMs)
      last.set(exchange.id, seconds * 1000)
      rememberChatter(state, exchange, now)
      rememberChatterContext(state, exchange, now)
      expect(exchange.lines.map((line) => line.text).join(' ')).not.toMatch(/\bFran\b|the Kettle|Chronolith/i)
    }
    expect(state.vessels[0]!.miningProgress).toBeGreaterThanOrEqual(0)
    if (duration > 30) {
      expect(state.oreProcessed).toBeGreaterThan(0)
      expect(speakers).toEqual(new Set(['sol-arden', 'tess-oren']))
      expect(last.has('TS-06')).toBe(true)
      for (const id of ['RL-01', 'RL-02', 'RL-03', 'RL-04']) expect(last.has(id), id).toBe(true)
    }
  })
})
