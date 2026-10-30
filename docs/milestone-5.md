# Milestone 5 — Conversational Operations handoff

Date: 30 October 2026. Owner and acceptance authority: Dan. Status: core implementation submitted for review; **Milestone 5 is not accepted or complete**. Physical-device playtesting remains required.

Authority: [M5 Crew Brief](https://docs.google.com/document/d/128SZqNfnv26d8SFVyciFsh67WWziFEQfanmRRNqhLWc/edit), [roadmap](https://docs.google.com/document/d/1UIqXtDuXe7g4oSaI44l9ETkWiT705KV050qhLDV4n5A/edit), [audio reference](https://docs.google.com/document/d/1Mcdu4dXuK_RC7qTr_fgX8ii76nqHiB0F0y297tHIOFA/edit), repository README and the approved personnel direction. No roadmap status was changed.

Repository: `steelwater/horrox-mining`. Branch: `codex/milestone-5-conversational-operations`, based on accepted M4 `d23a4aa`. Pre-existing README APK-helper changes and untracked `build-apk.sh` remain excluded. Version remains 0.1.7; the label identifies Milestone 5. No release version, tag, merge or deployment is authorized by this handoff.

## Outcome and boundaries

The LogicPass scoped this work to existing deterministic operations: state-valid choices, audio-completion clocks, protected input, sparse factual departmental speech, and separate informational views. No new simulation department, dependency, voice casting, network service or staffing model was introduced.

- Presented requests receive 15 seconds after the complete prompt finishes. Repeat restarts that opportunity; diagnostics/recommendation do not authorize a repair. Early valid input cancels the remaining heard prompt; an unheard queued request stays ahead of its confirmation. Failures, interruptions, backgrounding and reload preserve the chance to respond, with Repeat recovery. Unpresented/offline events retain established safe autonomy; critical safety actions remain immediate.
- Conversation records carry stable cause/prompt/choice identifiers and reference existing crew, vessel, code and history records. Mining, docking, coolant and scanner requests check their actual prerequisites. Existing repair menus determine available actions.
- Keypad Protection defaults to Critical Actions Only, three seconds, adjustable from one to five seconds. Touch uses an actual hold with percentage feedback. Keyboard/Bluetooth/assistive activation uses press-and-release, wait, then a second press; auto-repeat cannot confirm. The second press expires 15 seconds after the configured interval. This is an explicit platform compromise, not a claimed authenticated physical hold. Repeat remains immediate. A valid hold reserves the response across its deadline; cancellation leaves Repeat recovery available.
- Docking and Refinery have sparse state-gated lines; Cargo reports actual completed transfers. A Runic Labyrinth callback requires RL-01 heard context and a six-hour cooldown. Automatic generic sign-offs were removed; existing identities, radio styles, voice settings and TS/RL exchanges remain. Legacy last-phrase fields remain migration-compatible.
- About contains the approved introduction and four shorter topics, with readable text, Play/Replay, Stop and Back. Live operational speech interrupts optional narration. Recent Events displays actual saved commissioning, first extraction and completed repairs, newest first, with older entries available. Informational playback adds no transcript/history rows. Normal simulation still advances while these views are open.
- Save schema 6 persists conversation clocks, protection preferences and notable events independently of the rolling operational log. Schema 5 and supported earlier portable saves migrate. Older saves backfill only eligible recorded facts; missing commissioning or first-extraction dates are not invented.

## Verification

- 262 tests passed across 18 files, including complete-prompt timing, speech failure, early action, repeat, interruption, hold/deadline collisions, keyboard repeats, safe defaults, save migration/import, informational no-log behavior, archival retention and earned callback gates.
- Typecheck, production build, Android playtest debug assembly and diff whitespace checks passed. No lint script exists. Final scoped diff reviewed; no native source or voice configuration changed.
- Browser checks covered About navigation/playback controls, Recent Events from a migrated save, protected keyboard confirmation, high-contrast presentation and phone/tablet layouts. The phone layout had no horizontal overflow. Automated audio tests use controlled completion/failure signals; these are not evidence of real-device speech quality or timing.
- Google's official Android `testing/testing-setup` skill was inspected. Existing Vitest and native JUnit/Espresso setup were retained; no test-framework dependency was added. An Android emulator was detected, but this pass did not install over its existing app or claim a native UI/audio playtest. Physical Android/e-paper/Bluetooth checks and iOS execution remain unrun. The debug APK is a local playtest artifact, not an approved release.
- Remote CI status is recorded in the PR and canonical Drive completion note after the latest-commit run completes. Local success alone does not establish that gate.

## Short playtest guide

Use a separate browser profile/origin or disposable test device, with a portable export of any operation you intend to retain. Never clear an ordinary save to obtain a test fixture. Local manual checks advanced the localhost test operation normally; no production save was reset.

1. Complete or delegate readiness. On a fresh operation the existing first-run sensor fault provides a normal repair request. Press 3 for support; hear all choices, try Diagnostics and Recommendation, then authorize one valid action. Confirm one assignment and one outcome in Operational History. Test timeout on a separate fresh request.
2. Press 5 for the existing coolant request when coolant is nominal and the channel cooldown permits it. Listen for numbered choices, repeat with 0, and verify a fresh 15-second window after playback. Test early selection, background/resume and safe timeout independently. A gated channel correctly reports no new request when prerequisites fail.
3. In Settings, test Off, Critical and All at 1 and 5 seconds, restoring Critical/3 afterward. Release touch before completion; begin a valid hold just before timeout; hold a physical key to generate repeat signals; verify only the documented released second press confirms. Test critical preemption and cancellation on actual hardware.
4. Open About, select topics, Stop/Replay and return. Open Recent Events and replay a real repair. Compare logs before/after while accounting for genuine concurrent simulation events. Repeat with text hidden and both contrast modes; assess speech intelligibility, e-paper progress and keyboard focus.
5. Allow ordinary mining/processing/docking to run for sparse departmental traffic. The earned callback requires actual prior RL-01 playback and its cooldown; absence during a short test is expected. Automated tests prove gating without adding production event toggles or fake history.

## Deferred work and rollback

Shift rota/handovers remain a separately commissioned follow-up: stable qualified personnel/relief assignments, continuous emergency coverage and bounded absence summaries must be agreed before implementation. Three eight-hour watches are only a candidate. Grading/Storage/HT transport lifecycle, safety-day accidents, roster UI, developer event toggles and later lore/voice milestones remain deferred because their supporting systems are absent or separately scoped.

M4 watchlist: command-attempt audits remain and gain prompt/choice links; dockside repair scheduling is unchanged and retains regression coverage; repetitive closers are removed; real mobile/background/Bluetooth listening remains Captain playtesting work.

Source rollback is the accepted baseline `d23a4aa` or a normal revert of this feature after review. Keep a pre-upgrade schema-5 export before running M5 against an important save: an older build cannot read schema 6. Do not claim source rollback also downgrades a migrated save. No existing save, branch or release artifact was deleted. Next action: green PR checks, First Officer review, then Captain device/audio/e-paper acceptance; no merge or milestone-status change until authorized.
