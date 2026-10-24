import type { ChatterExchange } from './types'

// Approved Cross-App Crew Chatter v0.2, 15 October 2026. RL wording is verbatim.
// TS-06 fits quiet routine downtime without invented incidents, handbook rules or AI nickname.
// Other TS contexts need shifts/leisure state not modeled at this milestone; retain their IDs in the source reference.
const voices: Record<string, { speaker: string; profile: string }> = {
  Miner: { speaker: 'Rill', profile: 'bright' }, Cargo: { speaker: 'Crate', profile: 'steady' },
  Grading: { speaker: 'Facet', profile: 'steady' }, Pilot: { speaker: 'Keel', profile: 'measured' },
  Maintenance: { speaker: 'Patch', profile: 'bright' }, Docking: { speaker: 'Latch', profile: 'steady' },
}
function exchange(id: string, context: ChatterExchange['context'], lines: Array<[string, string]>, requires?: string): ChatterExchange {
  return { id, context, pack: id.startsWith('TS') ? 'TS' : 'RL', cooldownMs: 6 * 60 * 60_000, requires,
    lines: lines.map(([role, text]) => ({ ...voices[role]!, text })) }
}
export const crossAppChatter: ChatterExchange[] = [
  exchange('TS-06', 'quiet', [
    ['Cargo', "This ancient terminal won't even draw a card."],
    ['Grading', "It's Text Solitaire. It literally tells you which card it is."],
    ['Cargo', "That's not a feature."],
    ['Grading', "On this station? I'll take readable text over decorative blinking lights."],
  ]),
  exchange('RL-01', 'transfer', [
    ['Miner', 'Found an old Earth game called Runic Labyrinth. You should try it.'],
    ['Cargo', "What's it about?"],
    ['Miner', 'A boy, some ghouls, and a maze beneath a cemetery.'],
    ['Cargo', 'How are you even running that antique?'],
    ['Miner', 'A World Wide Web emulator.'],
    ['Cargo', 'You emulated the entire World Wide Web to play one game?'],
    ['Miner', 'Just the browser. The old pop-ups came back anyway.'],
  ]),
  exchange('RL-02', 'quiet', [
    ['Pilot', 'It says C.A.R.L. Simulator. Catacombs Adventure Rogue-Like?'],
    ['Maintenance', 'Maybe Cryptic Adventure something.'],
    ['Cargo', "Maybe it's just the boy's name."],
    ['Pilot', 'Then why did someone put dots between the letters?'],
  ], 'RL-01'),
  exchange('RL-03', 'quiet', [
    ['Miner', 'Runic Labyrinth is oddly specific for something so old.'],
    ['Grading', "It's a maze with letters for monsters."],
    ['Miner', "That's not the part I mean."],
    ['Grading', "Then maybe don't play it alone before lights-out."],
  ], 'RL-01'),
  exchange('RL-04', 'maintenance', [
    ['Maintenance', 'The World Wide Web emulator froze again.'],
    ['Docking', 'Are you emulating a browser or the entire twenty-first century?'],
    ['Maintenance', 'Just the browser. It keeps asking me to accept cookies.'],
    ['Docking', "Don't tell the Cantina. They'll want some."],
  ], 'RL-01'),
]
