# 1st Horrox Mining Ltd.

An audio-first, mobile-only space mining simulation set on Minerva, the first moon of Horrox, before the catastrophic events of Terminal Lore.

The player is the captain of a staffed mining facility on Minerva. Sound is the primary interface, a telephone-style keypad is the primary control, and the facility continues operating safely when the player does nothing.

## Project authority

- [Crew Brief v0.1](https://docs.google.com/document/d/17gsrWFUz87kP_HKOsciiEYQc0mBk24D_Pd-vLmqCP6U)
- [Milestone 2 Crew Brief — The Living Mine](https://docs.google.com/document/d/1z4XdfSmxUQitOvMrb87Cztb1MBMKvapDhYRaKurQIhI/edit)
- [Milestone 3 Crew Brief — Vessel Damage & Repair Operations](https://docs.google.com/document/d/1FeslP44gUyMT6Rk0nI0QaKhoXf1aUw3YDUmOhBSINgU/edit)
- Product owner and final decision-maker: Dan

The Google Drive brief is the canonical source for product scope, acceptance criteria, and deferred work.

## First-playable objective

Prove that one small Minerva mining facility, a tiny crew, one mining loop, one docking loop, and ambient chatter can feel alive while the phone sits beside the player.

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

This README is the canonical project-side source for **1st Horrox Mining Ltd. lore**. The separate `terminal-lore` repository will be synchronized from this canon later. Product scope and milestone acceptance criteria remain governed by the Drive briefs and milestone plan.

### Corporate and planetary setting

**1st Horrox Mining Ltd.** is a **LightTech Corp subsidiary** responsible for LightTech's space-mining activity in the Horrox system.

The operation is based on **Minerva**, Horrox's first moon. Horrox has **two known moons**:

- **Minerva** — the established mining moon and home of this game's facility.
- **M2** — the historical designation for Horrox's second moon, which later becomes central to the Terminal Lore catastrophe.

Minerva mining infrastructure predates the staffed operation in this game. The earlier Terminal Lore chronology establishes an unmanned LightTech mining station on Minerva in **2054**, the Horrox orbital station in **2056**, the loss of Minerva mine communications in **2065**, and the arrival of Viajero and its long-distance human crew in **2073**, when the mine is restarted. **1st Horrox Mining Ltd. begins its staffed operation on 17 September 2075**, after those events and before M2 destabilization on **23 August 2076**.

The Horrox orbital station remains a separate piece of infrastructure from the Minerva mining facility.

### Launch Day

The operation starts on **17 September 2075**. First run is the actual **Launch Day / Commissioning Sequence** for 1st Horrox Mining Ltd. Facility Control confirms its identity and the date, then guides mining-system, vessel, docking, power, processing, communications, repair-drone/support, crew, and autopilot checks before final readiness confirmation. Checks can be delegated safely; later readiness reviews do not restart the operation.

The canonical launch date never changes with installation date, reinstall, cache clearing, save reset, locale, or timezone. A genuinely new save starts at 2075-09-17 00:00 station time. Existing saves preserve elapsed facility age and progress. The displayed calendar is launch date plus deterministic facility age: one second per elapsed real second, including the full duration of long absences. Only mining/processing catch-up work is capped at seven days. Both transcript and operational history use this station calendar; device timestamps remain internal for elapsed-time calculations.

### The Minerva Cluster and Hydronium

Commercial Hydronium extraction is centered on the **Minerva Cluster**, a population of asteroids operating near Minerva. Surveyed mining targets use stable identifiers in the form:

`MNV-####`

The identifier is permanent; changing operational data is stored separately. A target can carry:

- size class
- current range from Minerva
- bearing
- relative altitude
- estimated Hydronium concentration
- mining state
- later informal crew nickname

The game can combine a curated starter registry with procedurally generated MNV targets. Normal miner traffic should naturally mention target assignment, departure, approach, visual contact, anchoring, drilling, concentration readings, loose fragments, extraction completion, and return to Minerva.

Important asteroids may acquire crew nicknames without losing their official MNV registry code.

### Hydronium production and export

The normal production chain is:

**Asteroid → Mining Vessel → Minerva Facility → Refining → Grading → Storage → Cargo Mech → Hydronium Transport → Mars**

The facility therefore operates as more than a mine. It is also a processing, storage, maintenance, docking, and export hub.

**Refinery** separates usable Hydronium-bearing material from incoming asteroid ore. **Grading** classifies processed material. **Storage** tracks and holds export batches until transport capacity is available.

These departments have real crews, but their comms are intentionally quieter than miner chatter. They usually speak when they have something relevant to report: unusual yield, contamination, grade results, capacity pressure, inventory mismatch, equipment trouble, or another operational exception.

### Cargo Mechs

Heavy cargo is moved by industrial **Cargo Mechs** supervised by Cargo crew.

Mechs retrieve containers from storage, move Hydronium through cargo decks, load and unload transports, reposition heavy equipment, and assist Maintenance with large components. They are industrial machines rather than sentient characters.

Individual Mechs may nevertheless develop reputations through repeated maintenance quirks and crew chatter: a bad actuator, a noisy hydraulic system, a dislike of narrow routes, or another recurring fault can become part of facility folklore.

### Mars transports

Dedicated Hydronium transports use **HT-###** logistics identifiers.

They travel between Mars and Minerva, carrying supplies, replacement equipment, mail, personnel, empty containers, and other cargo inbound, then departing with processed and graded Hydronium.

Transport operations include:

- inbound detection and approach
- docking assignment and clearance
- pressure and seal checks
- unloading
- maintenance and inspection
- Hydronium loading
- manifest verification
- departure clearance
- outbound Mars traffic

Frequently visiting transports may acquire informal crew nicknames while retaining their official HT identifier.

Visiting transports can require dockside help with docking collars, maneuvering thrusters, coolant, electrical systems, sensors, cargo hardware, hull inspection, or other routine spacecraft maintenance. Repair drones and Cargo Mechs can assist when appropriate.

### Operations Handbook and safety record

The facility maintains a formal **1st Horrox Mining Ltd. Operations Handbook** covering practical procedure for mining approaches, docking, EVA, repair work, Cargo Mech exclusion zones, Hydronium processing and storage, emergency response, shift handover, and other routine operations.

Handbook sections have stable references so they can appear naturally in comms. Fran is the most precise user of the Handbook: when a rule is relevant, the AI may cite the section and immediately explain the practical requirement in plain language. Crew can paraphrase, misremember, dispute, or jokingly invoke sections, but communications should never become constant manual recitation.

The facility also keeps an old-industry-style safety display based on **consecutive station-days without a recordable safety accident**. The exact display can be physical, electronic, or both, but it is part of the workplace rather than a game achievement.

The Handbook distinguishes between:

- a **recordable safety accident**, which resets the counter
- a **minor first-aid event**, which is logged but normally does not reset it
- an **equipment-only incident**, which is logged separately
- a **near-miss**, which is recorded for safety review but does not reset the counter

The counter advances in station-days, persists across saves and absences, and becomes part of facility history. Store the current streak, the best historical streak, and the incident that last reset it. Crew may care about round numbers such as 100 or 365 days, but the simulation must never manufacture an accident simply because a milestone is approaching.

Fran's announcements remain characteristically technical. A suitable example is:

> “Facility safety record: three hundred sixty-four consecutive station-days without a recordable accident.”

Crew reactions can be much less formal, especially when the counter is close to a milestone or after somebody insists that an embarrassing event was “technically a near-miss.” Injuries themselves are not punchlines; the humor comes from workplace ritual, bureaucracy, superstition, and Fran's exact classifications.

### Crew life and the Cantina

The facility includes a shared off-shift recreation space known simply as **the Cantina**.

Miners, Refinery, Grading, Storage, Cargo, Docking, Maintenance, visiting transport crews, and other personnel meet there after shifts for meals, drinks, games, music, old media, arguments, bets, celebrations, and ordinary social life.

The game should rarely narrate complete Cantina scenes. Most Cantina events are discovered later through short fragments of working comms: somebody owes somebody a drink, a chair was broken, a card-game dispute continues into the next shift, an asteroid receives a ridiculous nickname, or a visiting transport crew is still being teased about the previous night.

This lets off-duty life become **implied shared history** instead of a second nonstop dialogue channel.

### Fran and The Kettle

At Launch Day, neither informal name is established.

The Mining Facility AI begins as **Facility AI / Control**. Through the later Milestone 9 relationship arc, the crew gradually gives it the informal name **Fran**. The existing Facility AI voice configuration is part of the game's identity and must remain unchanged unless explicitly requested.

Likewise, the Minerva facility does **not** begin the game already named **The Kettle**. That nickname is earned later through the canonical **Kettle Incident** in Milestone 11. Afterward, repeated crew references and Cantina retellings gradually turn the incident into workplace folklore until “the Kettle” becomes the facility's accepted informal identity.

This chronology matters: the player should live in the facility before its nicknames become history.

### Tone of the pre-catastrophe era

The 2075 operation is a functioning workplace and community, not a facility waiting around for disaster. Miners work asteroid assignments, refinery crews process ore, Cargo Mechs cross the loading decks, Mars transports arrive and leave, maintenance keeps aging equipment running, and people meet in the Cantina after shift.

The later catastrophe is part of Terminal Lore, but everyday life should dominate this game. Ordinary routines, relationships, jokes, repairs, deliveries, and accumulated history are what give the later events their weight.

Current prototype identities are Excavator Three (`excavator-03`), Hauler Two (`hauler-02`), Berth Four, Processor One, repair drone DR-01, coolant pump two, and the ore scanner. The crew remains Mara Vale / Latch (docking), Iko Ren / Patch (maintenance), and Sol Arden / Deepwell (extraction). Crew names and banter remain prototype content pending approval. The existing **Mining Facility AI voice configuration remains unchanged**.

## Milestone 2 — The Living Mine

The mine persists vessels, miners, assignments, cargo, processing, routine drone service, facility systems, and structured operational history. One deterministic event clock drives foreground and offline work, with safe five-minute autonomy and concise return briefings. Key 0 repeats commissioning/open requests and otherwise reports live operational status. Conversational banter is an ordered short exchange; replies start 600 milliseconds after the previous line finishes. Priority reports can interrupt and discard an unfinished exchange.

**Screen-off simulation is supported through deterministic catch-up. Continuous live audio while the phone is locked is deferred.** Hiding the app suspends foreground ticking and chatter scheduling, saves the operation, and catches up on resume. This PR adds no native background-audio service or promise of locked-screen speech. Dedicated native lifecycle/audio work and hardware verification belong to a later milestone.

See [implementation, migration, verification, and limitations](docs/milestone-2.md). Native listening and device lifecycle checks remain pending before acceptance.

## Milestone 3 — Vessel Damage & Repair Operations

Named vessel faults, persistent conditions, remote and dockside repairs, reserved repair-drone assignments, safe five-minute autonomy, and structured service history now share the existing simulation clock. Mining, Docking, Emergency, Facility, and Repeat / Status expose the repair choices without a new top-level menu. Save schema 4 preserves existing progress; the Mining Facility AI voice configuration remains unchanged.

The core PR is merged. The [Milestone 3 follow-up brief](https://docs.google.com/document/d/1EX_KnELwg7UkkG1D3HPb68h12kcnEMgBmG3oamHAxHg/edit) reopens acceptance for speech chronology, normal-operation repair activity, and copy/paste tools. This follow-up queues answers behind their requests, introduces a real early sensor-service interaction, and adds **Copy Transcript**, **Export Save**, and **Import Save** under the secondary terminal menu. Import validates before an explicit replacement confirmation and rolls back failed storage/reinitialization.

`package.json` maintains the app `version` and `milestone`; `src/game/build.ts` derives the footer label and export/transcript metadata. The current label is V0.1.0 / MILESTONE 3; no release version was chosen. Portable JSON wraps the complete persistent state with format/schema/build/export-time metadata. It supports complete schema 3 and 4 envelopes, migrates schema 3 through the existing loader, and rejects unsupported versions or invalid state. Existing installed schema 1–3 saves still migrate normally; export them from the current app to obtain a portable schema 4 envelope.

See [implementation, codes, playtest instructions, save contract, and verification](docs/milestone-3.md). Dan reported successful playtesting of the final Milestone 3 follow-up on 29 September 2026 and authorized Uplink.

The [High Contrast & Copy Transcript completion brief](https://docs.google.com/document/d/1jzOUAJKVj5cxg4uw5WhExZ9a5CYFTjIHc3E-SvmQ3Vg/edit) adds pure black/white **High Contrast White** and **High Contrast Dark** modes under Terminal options and the Display cycle. Copy Transcript now exposes selectable text if clipboard access fails. See the [implementation and device-playtest handoff](docs/milestone-3-display-playtest.md). Dan reported no issues in the tested version and authorized Uplink on 29 September 2026; the build still identifies V0.1.0 / MILESTONE 3. No Milestone 4 work is included.

## Continuous integration

GitHub Actions runs `npm ci`, `npm test`, `npm run typecheck`, and `npm run build` on Node 24 for pull requests and pushes to `main`. After **Tests, Typecheck, Build** passes, **Android Debug APK** builds the checked-out code with Java 21, the committed Gradle wrapper and the hosted Ubuntu 24.04 Android SDK. It rebuilds web assets, syncs only Android, and runs `assembleDebug`. Merging a PR triggers this workflow through the push to `main`; PR runs verify the proposed merge before approval.

To download a testing APK: open **Actions → CI → the successful run for the desired commit → Artifacts → `horrox-mining-debug-<commit>`**. Extract the ZIP to obtain `horrox-mining-debug.apk`, `SHA256SUMS`, and `build-info.txt` (source commit and run URL). PR artifacts identify the tested merge commit; post-merge artifacts identify the actual `main` commit. Artifacts expire after 14 days and are testing conveniences, not approved release archives. Missing APK output or failed web/native checks fails the workflow; no artifact is published from a failed build.

These APKs use the runner's generated debug signing key. A different run or local build may have a different signature, so Android may refuse an in-place update. **Export your save before uninstalling an existing build** and import it after installation; uninstalling removes local app data. Stable signing, store releases, GitHub Releases, deployment and native version changes remain separate decisions. No signing secret is added. Existing branch-protection availability is unchanged.

CI configuration verification follows Google's official [Android testing/setup guidance](https://github.com/android/skills/blob/main/testing/testing-setup/SKILL.md): retain the existing Vitest/native shell setup and verify the actual Gradle build and produced APK. No new device-test framework or runtime dependency is introduced. The pipeline does not install or playtest the APK on a device.

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
