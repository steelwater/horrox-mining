# Milestone 4 — Crew Personalities implementation handoff

Date: 23 October 2026. Owner and acceptance authority: Dan. Status: implementation submitted for Uplink; Captain device testing in progress; **milestone not complete**.

Authority: [Milestone 4 Crew Brief](https://docs.google.com/document/d/1GuA5r9ZlOYE3u1d-_nP3rNq6OkrwxjbjMzmyvugdYDg/edit), [Roadmap](https://docs.google.com/document/d/1UIqXtDuXe7g4oSaI44l9ETkWiT705KV050qhLDV4n5A/edit), and [Cross-App Crew Chatter v0.2](https://docs.google.com/document/d/1mwqOj7ACCoEMXgn9txsB3rNTCC_BGPPrUWAqU4V4HI4/edit). Repository README remains the project lore authority.

Repository: `steelwater/horrox-mining`. Branch: `codex/milestone-4-crew-personalities`, from accepted `origin/main` at `45e0492` (merged PR #10). Pre-existing README APK-helper instructions and untracked `build-apk.sh` are preserved and excluded from this mission. Dan authorized Uplink on 23 October 2026 while continuing device testing. Uplink covers the scoped commit, feature-branch push, PR against main and CI verification. Merge, release and deployment remain outside this authorization. The roadmap status is unchanged. The [canonical Drive handoff](https://drive.google.com/file/d/1EsUEOkR0pNcSSfBrgqsGUoh7lV6_lYnI/view) records the final remote review and CI outcome.

## LogicPass and boundaries

Make existing crew identifiable through persistent traits and fact-preserving language, with rare approved ambient exchanges. Extend existing records rather than introduce an RPG or new simulated departments. Prove schema migration, repeated-save integrity, manual action precedence, five-minute fallback, critical response, voice configuration preservation, chatter priority/cooldowns, and long-session behavior. New dependencies, new vessels, shift scheduling, social menus, new TTS, and later naming/lore arcs are excluded.

## Implementation

- `types.ts`, `content.ts`, `crew.ts`: a `CrewProfile` model extends the existing `miners` save collection. Stable identity includes name/callsign, role/department, temperament, specialty, experience, radio style, nullable vessel association, relationships and existing histories. Mood, assignment and last phrase remain mutable. Names and new personality wording are **prototype content pending Dan/content-owner review**.
- `engine.ts`: Deepwell and Rill alternate reports on completed extraction runs from their shared real vessel; they do not alternate control or alter extraction results. Refinery's Sieve reports actual processing completion. Other specialists remain quiet unless an existing eligible exchange involves them. No department results are fabricated.
- `crew.ts`, `useFacility.ts`: resolve factual events first; vary code-first, plain-first or conversational presentation afterward. Codes, facts, vessel/location, urgency and options remain intact. Requests retain stable repeat wording. Same-time reports only combine when their speaker also matches. Existing voices and all Facility Control parameters are unchanged.
- Mood becomes focused during relevant faults/maintenance, steady during extraction, and settled otherwise. Focused and safety messages omit ornamental phrases. Specialty and experience explain established autonomous procedures without changing action eligibility, timing, or captain precedence.
- `chatter.ts`, `crossAppChatter.ts`: rare cross-app dialogue, persistent cooldowns and heard-context gates. Operational audio now interrupts active ambient speech and drops the remaining exchange. No backlog is synthesized on resume. Obsolete repair-in-progress chatter is removed because the new brief excludes ambient conversation during active repairs.
- `package.json`, `build.ts`: `V0.1.7 / MILESTONE 4 - Crew Personalities`. Version remains 0.1.7; no new release version/tag was chosen. Milestone remains sourced from package metadata.

## Prototype roster

| ID / callsign | Role | Temperament / specialty | Experience / radio style | Vessel |
|---|---|---|---|---|
| mara-vale / Latch | Docking lead | Protective / traffic control | Veteran / code-first | Hauler Two |
| iko-ren / Patch | Maintenance engineer | Curious / sensor repair | Established / conversational | None |
| sol-arden / Deepwell | Extraction operator | Patient / excavation | Veteran / code-first | Excavator Three |
| tess-oren / Rill | Extraction survey operator | Methodical / ore sampling | Newcomer / plain-first | Excavator Three |
| ada-sen / Sieve | Refinery operator | Precise / processing | Established / plain-first | None |
| noor-ven / Facet | Grading operator | Reserved / grade assessment | Veteran / code-first | None |
| eli-moss / Ledger | Storage custodian | Careful / inventory | Established / plain-first | None |
| bea-kade / Crate | Cargo Mech supervisor | Dry-witted / cargo handling | Veteran / conversational | None |
| oren-dax / Keel | Transport pilot | Practical / transport navigation | Veteran / code-first | Hauler Two |

Existing relationships remain. Rill has a lightweight mentor association with Deepwell; no historical Cantina incident or social outcome is invented.

## Save contract and rollback

Schema **5**, same `horrox-facility-v1` Preferences key and portable envelope. Schemas 3/4 portable saves migrate; installation schemas 1/2 retain their previous recovery path. Schema 4 migrations retain vessels, cargo, active faults/repairs, station age and history while adding deterministic personnel/default traits and empty chatter memory. Current schemas validate fixed roster IDs, profile fields, coworker/vessel references, operator association and bounded known memory keys. Future schemas fail safely.

Crew identity and vessel reassignment survive reopen/export/import. Cooldowns use station age and survive transcript/history rollover. Memory validation permits a line saved between simulation ticks and rejects future memory. The existing explicit import confirmation, serialized writes and rollback path remain intact.

Before installing this test build over an accepted installation, export its schema 4 save. An older build cannot read schema 5. Roll back using the accepted build plus the pre-upgrade export; do not point an older build at a schema 5 operation. Source rollback remains the unchanged main baseline; no production environment was changed.

## Dialogue and timing

Implemented: **TS-06** and exact authored **RL-01, RL-02, RL-03, RL-04**. TS-06 uses quiet routine downtime instead of assuming a modeled off-duty location. RL-01 requires a genuine safe cargo-return transfer involving Rill's associated vessel; later RL exchanges require its recommendation to have been heard. Transcript retains `C.A.R.L.`; speech renders separated letters.

Timing: 90-second opportunities, 65% chance of considering eligible chatter, 15% rare-pack selection when available, with a 65% preference for eligible mining exchanges in the ordinary pool. All ambient starts need two minutes since previous ambience and 30 seconds since operational traffic. Cross-app starts require at least 15 minutes of operation age, 45 minutes between packs, six hours per exchange, and at least a minute before known vessel/processing transitions. No chatter during faults, repairs, system inspections, approach, or unresolved decisions. The audio queue must be idle. Heard-context unlocks occur only at the final line, after the title/recommendation has been spoken, so an early interruption cannot unlock the next pack.

**Content decision — 22 October 2026, owner Dan:** Keep TS-06 for Milestone 4. Context: the remaining Text Solitaire references depend on unmodeled off-shift activity, card arrangements, or incident/handbook details. Alternatives considered: retain TS-06 only, or adapt the remaining exchanges for quiet-work contexts. Dan selected TS-06 only. Consequence: TS-01–05 and TS-07–08 remain outside this milestone; all four RL exchanges are included. No shift or incident history is invented.

## Same-event examples

For the actual fact `Excavator Three completed extraction run 2. Returning with 12 tonnes.` and operation code 112:

- Before: Facility Control reads the fact with one generic voice.
- Deepwell: `1 1 2. Mining operation complete. Excavator Three completed extraction run 2. Returning with 12 tonnes. Steady work.`
- Rill: `Excavator Three completed extraction run 2. Returning with 12 tonnes. Code 1 1 2: Mining operation complete. Keeping the sequence clear.`

Critical alerts retain code-first urgency for every speaker. The factual event and `operationCode` stay unchanged; these are presentation examples, not a claimed device transcript.

## Verification and limits

- Full Vitest suite: **237 tests passed** using `npm test -- --maxWorkers=2`. Includes 29 new checks for schema 4 migration with active repairs, schema 3 migration, profile/vessel reassignment, invalid references, phrase persistence, codes 112/205/303, manual/automatic repair equivalence, five-minute deadlines, interrupted-game context, inter-tick save clocks, rollover, and simulated 30-minute/six-hour sessions.
- Initial unrestricted test parallelism hit a 5-second timeout in the existing long-calendar test under host load. Limiting workers passed without changing test timeouts or weakening assertions. Repeat-wording and save-clock regressions found during development were fixed and retested.
- Final focused crew/chatter recheck: **44 tests passed**, including reassignment with a zero-run vessel and safe transfer context. Final diff reviewed; `git diff --check` passed.
- Type checking and production web build passed; playtest web build and Android debug assembly passed. Existing Gradle `flatDir` warnings remain. No lint script exists.
- Browser manual checks: accepted an existing uncommissioned save with schema migration; exported it before testing; delegated readiness; requested docking; repeated the identical request; manually cleared approach; inspected normal, high-contrast white and dark layouts; checked transcript; rejected malformed JSON; validated and imported the preserved save. Import showed `Save imported. Operation restored.` and restored the original uncommissioned operation and history.
- No physical Android device or emulator was attached (`adb devices -l` empty). **Real-device audio differentiation transcript, code/callsign intelligibility, e-paper contrast, phone/tablet responsive layouts, Bluetooth, native background/resume and iOS runtime are unverified.** Browser checks used a desktop viewport; no phone/tablet viewport API was available in this browser session.
- Google's official [testing/testing-setup](https://github.com/android/skills/blob/main/testing/testing-setup/SKILL.md) informed test inventory and restoration/failure checks. Android uses the Capacitor WebView shell with JUnit4 and AndroidX/Espresso declarations. Business logic is Vue/TypeScript, covered by Vitest. Native DI/Compose/Room setup, R8, Play, profiling and AGP changes are outside this scope. No durable framework or configuration dependency was added.
- Uplink requires both configured CI jobs (Tests, Typecheck, Build; Android Debug APK) to pass on the latest PR commit. PR review, merge, real-device playtesting and Dan's acceptance are required before milestone completion.

## Next action

Run Captain device listening/playtesting and capture a real device transcript. Listen for Deepwell versus Rill across completed runs; confirm both still report identical operational facts. Exercise repairs manually and unattended, background/reopen, export/import, both high-contrast modes and at least 30 minutes of ordinary listening. Cross-app dialogue is deliberately rare; longer sessions are needed. Continue Captain device testing alongside Uplink; record findings before acceptance and merge.
