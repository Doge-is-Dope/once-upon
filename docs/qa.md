# QA and release evidence

No production pass should be marked complete without a URL, timestamp, device/browser, and retained evidence.

## Automated checks

- `pnpm run verify`: ESLint, Vitest/RTL, and production build.
- `pnpm run test:e2e`: Playwright host and phone viewports.
- `pnpm run test:supabase`: independent anonymous Host/player/outsider projection and authorization smoke test.
- `pnpm run test:supabase:e2e`: complete standard game plus versioned Demo Room against the configured Supabase project.
- `pnpm exec supabase db lint --linked`: migration and database function checks.
- `pnpm exec supabase test db --linked`: pgTAP schema/security smoke tests.
- `pnpm audit --prod`: production dependency advisories.

## Local AI entry verification

Recorded 2026-08-27 against `http://localhost:3000`, without remote room creation or deployment:

- `pnpm run verify` passed: lint, 108 unit tests, and production build.
- Host/Phone Playwright passed 41 tests, with one expected desktop-only check skipped on the phone profile. The new flow invokes the real page tool handlers against a mocked gateway: homepage discovery, room creation, immediate public-state read, QR display, two-player readiness, and the first Learn question. Manual start and phone-only entry also pass.
- Commit review found three new player-array/tuple type errors in `components/game-app.states.test.tsx`; these are now fixed by updating each fixture player's readiness without replacing the tuple. Lint and all 108 unit tests pass after the fix. `pnpm exec tsc --noEmit --incremental false` now reports only the pre-existing event actor error in `lib/game/gateway.test.ts:9` (`'server'` is not a valid actor).

## Gate 2 automated production evidence

Recorded 2026-08-26 UTC on `https://can-you-be-me.clement-liang.chatgpt.site`:

- Public HTTPS page loaded and created a Supabase-backed room from the deployed origin.
- The deployed document exposed exactly ten WebMCP tools; `get_public_game_state` executed successfully against the bound Host room.
- A complete standard game reached the durable reveal result at revision/sequence 50, including five Learn rounds, traits, private roles, four Challenges, blind Objection, resolution, accusation, and countdown advancement.
- Demo fixture `demo-v1` reached private role reveal with two traits per player.
- Invalid question rollback, Agent retry/idempotency conflict, stable private option order, unrelated-user denial, and hidden private schema checks passed.

This automated evidence does not replace the physical two-phone or three-consecutive-game release matrix below.

## Gate 3 automated production evidence

Recorded 2026-08-26 UTC against the production Supabase project before feature freeze:

- The staged Q3 suspicion target remains absent from the public projection throughout the blind Objection window.
- Concurrent Objection claims produce one durable event and one winner; the losing call is an idempotent no-op.
- Duplicate answers do not increment revision, and a one-player answer deadline records the other seat as `No answer` with `timedOut: true`.
- Stale revision, expired checkpoint, wrong phase, invalid evidence, invalid question, and conflicting Agent retry paths return structured errors without mutating revision.
- The complete standard game again reached reveal at revision/sequence 50; Demo fixture `demo-v1` again reached private role reveal.
- `wait_for_public_event` now has automated durable-read, subscribe/re-read, timeout cap, cancellation-race, and cleanup coverage.
- Desktop and phone Playwright projects pass at 320px and 16:9, with axe, keyboard, 48px touch targets, and reduced-motion assertions.

Physical-device runs remain in the post-freeze production game matrix below.

## Required manual matrix

- From the homepage, tell a connected AI client “Let’s play” without a setup prompt. Verify room creation, QR join from two phones, readiness, and the first Learn questions. Repeat from an already-open Host room and confirm no second room is created. The historical production evidence above predates this entry tool; local mocked tool tests do not establish natural-language client compatibility.
- Compatible AI clients with imperative WebMCP support.
- Chrome WebMCP testing build.
- iOS Safari and Android Chrome on two physical phones.
- 320px phone viewport and 16:9 Host Board.
- Keyboard-only flow, focus changes, live regions, press-and-hold cancellation, and reduced motion.
- Lost/out-of-order invalidation, refresh, background/foreground, reconnect, Agent wait cancel/timeout, interrupted checkpoint recovery, and countdown reload.
- Negative reads as Host, other player, and unrelated anonymous user for roles, answers, feedback, staged suspicion, and unopened questions.

## Production game log

Any migration or code correction resets the consecutive-pass count.

| Pass | URL | UTC timestamp | Host/phones | Duration | Checkpoint latency evidence | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | — | — | — | — | — | Not run |
| 2 | — | — | — | — | — | Not run |
| 3 | — | — | — | — | — | Not run |

## Release checklist

- Production source matches the saved Sites version and local release commit.
- HTTPS, origin isolation, WebMCP discovery/execution, and Supabase WSS pass on the deployed origin.
- Public URL, repository, video, and Devpost page open logged out and in incognito.
- README fresh-user setup was completed without undocumented steps.
- Submission is published, not draft.
