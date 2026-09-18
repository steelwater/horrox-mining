# 1st Horrox Mining Ltd.

An audio-first, mobile-only space mining simulation set in Horrox's orbit before the catastrophic events of Terminal Lore.

The player is the captain of a small orbital mining facility. Sound is the primary interface, a telephone-style keypad is the primary control, and the facility continues operating safely when the player does nothing.

## Project authority

- [Crew Brief v0.1](https://docs.google.com/document/d/17gsrWFUz87kP_HKOsciiEYQc0mBk24D_Pd-vLmqCP6U)
- [Milestone 2 Crew Brief — The Living Mine](https://docs.google.com/document/d/1z4XdfSmxUQitOvMrb87Cztb1MBMKvapDhYRaKurQIhI/edit)
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
- system text-to-speech with established Facility Control and crew voice profiles, priority queueing, and ambience ducking
- resumable commissioning checks using the real keypad, with safe delegation
- mining, docking, maintenance, non-critical problem, and immediate-safety flows
- five-minute autonomous resolution
- autopilot activity, passive chatter, local persistence, and reconnect summaries
- standard, dim, and black-screen display modes
- optional transcript/history

Prototype miner names and dialogue are placeholders pending content-owner approval. The official logo asset is also still required.

## Correctness pass (17 September 2026)

The accepted MVP and correctness pass are under review in [PR #1](https://github.com/steelwater/horrox-mining/pull/1). Work on `fix/terminal-correctness` fixes tutorial autopilot activation, tutorial repeat, repeat during pending requests, resumed tutorial prompts, startup ambience, and Android speech interruption. Commands are ignored until the saved facility has loaded, preventing keyboard input during boot from overwriting progress. Android discovers installed offline voices and caches a suitable distinct voice per profile as profiles are first used, reusing voices when the installed selection is limited.

Verification: 21 tests pass, including facility-level autopilot/repeat/resume regressions, boot-input protection, speech-error recovery, stopping queued speech, and delayed speech-callback handling. Production web/type build and Android debug build pass. Emulator logs confirm ambience before keypad input, native docking request repetition, different installed voices for terminal and miner, and native stop followed immediately by safety speech during a reconnect announcement. Hardware Bluetooth input/audio, screen-off behavior, multiple device voice inventories, and iOS runtime verification remain pending. These changes do not expand persisted simulation entities or add accessibility settings.

## Canonical operation and lore

The operation starts on **17 September 2075**. First run is the actual **Launch Day / Commissioning Sequence** for 1st Horrox Mining Ltd. Facility Control confirms its identity and the date, then guides mining-system, vessel, docking, power, processing, communications, repair-drone/support, crew, and autopilot checks before final readiness confirmation. Checks can be delegated safely; later readiness reviews do not restart the operation.

Horrox orbital infrastructure predates this operation: the station exists from 2056, and Viajero and the first long-distance human crew reach the system in 2073. This staffed mining operation begins in 2075, before M2 destabilization on 23 August 2076. This project-side context was approved in [Dan's PR #2 playtest review](https://github.com/steelwater/horrox-mining/pull/2); Dan will synchronize the separate `terminal-lore` repository later.

The canonical launch date never changes with installation date, reinstall, cache clearing, save reset, locale, or timezone. A genuinely new save starts at 2075-09-17 00:00 station time. Existing saves preserve elapsed facility age and progress. The displayed calendar is launch date plus deterministic facility age: one second per processed second, with the existing seven-day catch-up limit. Both transcript and operational history use this station calendar; device timestamps remain internal for elapsed-time calculations.

Current prototype identities are Excavator Three (`excavator-03`), Hauler Two (`hauler-02`), Berth Four, Processor One, repair drone DR-01, coolant pump two, and the ore scanner. The crew remains Mara Vale / Latch (docking), Iko Ren / Patch (maintenance), and Sol Arden / Deepwell (extraction). Crew names and banter remain prototype content pending approval; no new cast or final Facility AI name is introduced here. The existing **Mining Facility AI voice configuration remains unchanged**.

## Milestone 2 — The Living Mine

The mine persists vessels, miners, assignments, cargo, processing, routine drone service, facility systems, and structured operational history. One deterministic event clock drives foreground and offline work, with safe five-minute autonomy and concise return briefings. Key 0 repeats commissioning/open requests and otherwise reports live operational status. Conversational banter is an ordered short exchange; replies start 600 milliseconds after the previous line finishes. Priority reports can interrupt and discard an unfinished exchange.

**Screen-off simulation is supported through deterministic catch-up. Continuous live audio while the phone is locked is deferred.** Hiding the app suspends foreground ticking and chatter scheduling, saves the operation, and catches up on resume. This PR adds no native background-audio service or promise of locked-screen speech. Dedicated native lifecycle/audio work and hardware verification belong to a later milestone.

See [implementation, migration, verification, and limitations](docs/milestone-2.md). Native listening and device lifecycle checks remain pending before acceptance.

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
