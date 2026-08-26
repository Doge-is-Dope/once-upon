# QA and release evidence

No production pass should be marked complete without a URL, timestamp, device/browser, and retained evidence.

## Automated checks

- `npm run verify`: ESLint, Vitest/RTL, and production build.
- `npm run test:e2e`: Playwright host and phone viewports.
- `npx supabase db lint --linked`: migration and database function checks.
- `npx supabase test db --linked`: pgTAP schema/security smoke tests.
- `npm audit --omit=dev`: production dependency advisories.

## Required manual matrix

- ChatGPT Desktop with supported Sol and Terra configurations.
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
