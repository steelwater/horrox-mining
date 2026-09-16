# 1st Horrox Mining Ltd.

An audio-first, mobile-only space mining simulation set in Horrox's orbit before the catastrophic events of Terminal Lore.

The player is the captain of a small orbital mining facility. Sound is the primary interface, a telephone-style keypad is the primary control, and the facility continues operating safely when the player does nothing.

## Project authority

- [Crew Brief v0.1](https://docs.google.com/document/d/17gsrWFUz87kP_HKOsciiEYQc0mBk24D_Pd-vLmqCP6U)
- Product owner and final decision-maker: Dan

The Google Drive brief is the canonical source for product scope, acceptance criteria, and deferred work.

## First-playable objective

Prove that one small orbital facility, a tiny crew, one mining loop, one docking loop, and ambient chatter can feel alive while the phone sits beside the player.

The north-star test is:

> Would 1st Horrox Mining Ltd. still be enjoyable if the player did not press a single button for twenty minutes?

## Guardrails

- Audio-led interaction; minimal terminal-like visuals.
- Touchscreen keypad and physical keyboard/Bluetooth numpad share one command system.
- Inactivity is safe and never produces a game-over state.
- Crew and automation resolve unattended matters sensibly.
- Safety-critical matters resolve immediately.
- Local persistence makes the facility and its history feel continuous.
- Final lore content, final facility AI identity, monetization, complex economy, multiplayer, combat, and elaborate graphics are outside the first playable.

## Current status

Capacitor + Vue 3 is the approved mobile stack. The first prototype slice includes:

- Android and iOS native shells
- boot sequence with clearly labeled placeholder branding
- touchscreen and physical-keyboard/numpad command routing
- data-driven terminal commands, miners, voice profiles, and events
- system text-to-speech with priority queueing and ambience ducking
- resumable/skippable onboarding using the real keypad
- mining, docking, maintenance, non-critical problem, and immediate-safety flows
- five-minute autonomous resolution
- autopilot activity, passive chatter, local persistence, and reconnect summaries
- standard, dim, and black-screen display modes
- optional transcript/history

Prototype miner names and dialogue are placeholders pending content-owner approval. The official logo asset is also still required.

## Development

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run cap:sync
```

For Android builds on this machine, use Android Studio's bundled JDK:

```sh
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" npm run android:debug
```
