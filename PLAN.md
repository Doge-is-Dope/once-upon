# Can You Be Me? — Challenge MVP Build Plan

## 1. Outcome

Build an English-only, two-player party game in which two friends answer private multiple-choice questions while a compatible AI client acts as the public Detective through WebMCP. One player is secretly the **Mirror** and imitates the other, the **Original**. Both humans win if the Detective accuses the Original; the Detective wins if it catches the Mirror.

The submission is successful when a judge can open one public URL in a compatible AI client's browser, connect two phones by QR code, finish a coherent 5–7 minute game, observe the AI Detective making and revising suspicions through real WebMCP calls, and verify from the public repository that private roles and sealed answers never reach the Host or Agent before reveal.

## 2. Locked MVP

- One Host Board, two phone Player Views, and one AI Detective.
- No account setup, nickname field, chat, voice, photos, leaderboard, or player-written text.
- Players choose one of six preset sticker identities: Tiger, Frog, Ghost, Toast, Moon, or Cherry.
- **Learn:** The AI Detective generates one immutable batch of five shared four-choice questions. If fewer than two answers differ, it generates one adaptive Contrast question.
- The AI Detective publishes two short traits per player; each player taps `That's me` or `Not me` for each trait. Feedback is revealed only after both players finish.
- **Role reveal:** one phone privately receives Original and the other Mirror. The Host and Agent cannot read either role.
- **Challenge:** The AI Detective generates one adaptive shared question per round from public evidence. Original answers as themselves; Mirror predicts Original. Each normal question has an eight-second answer timer. A lobby accessibility toggle changes all answer timers to fifteen seconds.
- After each revealed Challenge answer, the AI Detective places one public suspicion marker with a short reason and public evidence references.
- After Q3, players get one three-second **blind shared Objection** window before the current suspicion is shown. The first tap consumes the single team token. If used, the AI Detective generates one three-choice follow-up for the suspected player from eligible public evidence, then must keep or switch its suspicion after the answer is revealed.
- After Q4, the AI Detective cites two or more public evidence events and commits one accusation. A server-owned three-second countdown reveals the roles.
- Result uses one static event timeline and playful achievement stickers. No share card and no animated replay in the MVP.
- **Demo Room** may preload fictional Learn answers and traits, but Challenge, Objection, accusation, and both phone players remain live.

## 3. UX and Timing

### Host Board

- Landscape-first presentation with a high-contrast room code and QR code in the lobby.
- Persistent top progress strip: `Learn 1/5`, `Challenge 2/4`, or the current Detective checkpoint.
- Two symmetric player columns showing sticker identity, ready/answered state, revealed choices, traits, and current suspicion.
- Center stage holds the current question, countdown, simultaneous reveal, objection prompt, or accusation countdown.
- Suspicion is a large movable sticker/magnet, never conveyed by color alone.
- Agent checkpoints explicitly show `Detective is thinking…`; player timers do not run while waiting for the AI Detective.

### Player View

- One action per screen, thumb-friendly four-card choices, 48 px minimum tap targets, and no text fields.
- Choice order is independently shuffled per phone. The Host shows no options while answers are open.
- After locking, hide the selected option and show `Locked — look up` until reveal.
- Private role requires press-and-hold to reveal and hides again on release.
- Connection loss shows a reconnect state without surrendering the seat; the same anonymous Supabase identity reclaims it automatically.
- Respect reduced-motion settings. Emoji, text labels, and shapes jointly communicate all important state.

### Target Run Time

- Join: 20–40 seconds.
- Learn and trait confirmation: 90–120 seconds.
- Role reveal: 15 seconds.
- Four Challenge rounds: 110–150 seconds.
- Optional Objection: 15–25 seconds.
- Accusation and result: 30–45 seconds.
- Target total: 5–7 minutes after both phones join.

## 4. Technical Architecture

### Frontend and Hosting

- React + TypeScript Site generated from the current ChatGPT Sites scaffold.
- Use native React state plus a room-scoped context; do not add a global state library.
- Use CSS custom properties and component CSS for the Playful Stickers visual system; do not add a general UI component library.
- Use query parameters rather than required SPA rewrites: `/?room=ABCD` for joining and the authenticated room owner automatically receives Host view.
- ChatGPT Sites is the primary public host. Supabase is the external backend over HTTPS and WebSocket.
- Vercel or Cloudflare is only a deployment fallback if the production Site cannot pass the WebMCP compatibility gate or public-access check.

### Supabase

- Anonymous Auth assigns every browser a stable `auth.uid()`. The room creator becomes Host; the next two accepted users claim seats A and B.
- Use the browser-safe Supabase publishable key only. Never ship a service-role key.
- Postgres is authoritative for phases, checkpoints, deadlines, roles, answers, revisions, and event order.
- Private Realtime Broadcast sends only `{ gameId, revision, sequence, eventType }`. Every receiver refetches durable state; Broadcast ordering or loss cannot affect correctness.
- All state transitions occur through Postgres RPCs. Direct client updates to core game tables are denied.
- Every mutation increments `games.revision` and appends exactly one ordered public `game_events` row in the same transaction.
- The second answer submission reveals both answers atomically. If a deadline expires, any connected client may call idempotent `advance_if_due`; Postgres checks server time and publishes `no_answer` for missing seats.

### Core Data

- `games`: room code, phase, checkpoint, revision, event sequence, round, timer mode, deadline, and result state.
- `game_members`: game, anonymous user, `host | seat_a | seat_b`, sticker identity, ready state, and timestamps.
- `question_batches`, `game_questions`, and `game_question_options`: immutable game-scoped Agent generations, server-owned IDs, kind/round, English prompt, options, and public basis evidence.
- `game_rounds`: one durable answer window bound to a generated question, stable option ordering, server deadline, and reveal state.
- `private_roles`: game, seat, and `original | mirror`; readable only by the matching player until result publication.
- `sealed_answers`: game, question, seat, option ID, locked time, and reveal sequence; option ID is private before reveal.
- `player_traits`: seat, two Agent-authored traits, public evidence IDs, and sealed player feedback.
- `suspicions`: round, target seat, reason, and public evidence event IDs.
- `objections`: single game-level token, pending target, selected follow-up, and resolution.
- `agent_actions`: checkpoint/tool idempotency record and original result.
- `game_events`: monotonic sequence, actor, action, and public payload only.

### Public and Private Boundary

- Public: room phase, checkpoint, revision, sequence, timers, sticker identities, readiness, answered booleans, current public question, revealed answers, published traits/feedback, suspicion history, Objection state, accusation countdown, result, and public event timeline.
- Private: anonymous user identity, role before result, local draft choice, sealed answer before reveal, and sealed trait feedback before its barrier.
- Host and WebMCP tools read only a server-produced public projection. Private fields must never appear in DOM data, Broadcast payloads, logs, tool responses, or preloaded JavaScript.
- RLS tests must prove that Host, Agent/Host session, the other player, and an unrelated anonymous user cannot read protected rows.

## 5. State and Checkpoints

Use a broad `GamePhase` plus an optional `AgentCheckpoint` rather than a large fragile phase enum.

```ts
type GamePhase =
  | "lobby"
  | "learn"
  | "trait_review"
  | "role_reveal"
  | "challenge"
  | "objection"
  | "accuse"
  | "revealed";

type AgentCheckpoint =
  | "awaiting_learn_questions"
  | "awaiting_contrast_question"
  | "awaiting_traits"
  | "awaiting_challenge_question"
  | "awaiting_suspicion"
  | "awaiting_objection_question"
  | "awaiting_objection_resolution"
  | "awaiting_accusation"
  | null;
```

No player timer runs at an Agent checkpoint. If the AI client is interrupted, the game remains at that checkpoint. Resumption is always `get_public_game_state` followed by the eligible idempotent action; no separate resume tool exists.

## 6. WebMCP Contract

Register tools directly with `document.modelContext.registerTool(...)` from a document-level singleton so React Strict Mode cannot duplicate names. Tools bind to the active Host room and never accept an arbitrary `roomId`.

Before allowing Host room creation, require HTTPS, `window.originAgentCluster === true`, and a callable `document.modelContext.registerTool`. Register one harmless read tool during the production spike and verify discovery/execution in the actual target browser.

### Tools

1. `get_public_game_state`: returns the complete public projection, active checkpoint, eligible Agent actions, and evidence IDs. Read-only.
2. `wait_for_public_event`: accepts `afterSequence` and `timeoutMs`, capped at 20 seconds; checks durable events, subscribes, rechecks to avoid a lost wake-up, and respects the execution `AbortSignal`. Read-only.
3. `propose_player_traits`: publishes exactly two short traits per player with valid Learn evidence IDs.
4. `propose_learn_questions`: atomically publishes exactly five generated questions with four options each.
5. `propose_contrast_question`: publishes one evidence-aware four-choice Contrast question when required.
6. `propose_challenge_question`: publishes one evidence-aware four-choice question for the current Challenge round.
7. `place_suspicion`: selects one seat and cites revealed evidence IDs with a reason capped at 140 characters.
8. `propose_objection_question`: publishes one three-choice follow-up; the server fixes the suspected target.
9. `resolve_objection`: chooses `keep | switch`, cites revealed follow-up evidence, and publishes a short reason.
10. `propose_accusation`: selects one seat, cites at least two eligible public evidence events, and starts the server-owned reveal countdown without returning the secret result.

Every write accepts `checkpointId` and `expectedRevision`. `(game_id, checkpoint_id, tool_name)` is unique and returns the original result on retry.

```ts
type ToolResult<T> =
  | {
      ok: true;
      revision: number;
      sequence: number;
      phase: GamePhase;
      data: T;
    }
  | {
      ok: false;
      code:
        | "REVISION_CONFLICT"
        | "CHECKPOINT_EXPIRED"
        | "INVALID_PHASE"
        | "INVALID_EVIDENCE"
        | "ALREADY_COMPLETED"
        | "NOT_AUTHORIZED";
      revision: number;
      sequence: number;
      retry: "refresh" | "none";
    };
```

Feature absence is a blocking Host error, not a degraded Judge Mode. Human phone views remain ordinary web pages without WebMCP.

## 7. Build Checklist

- [ ] **1. Prove the deployed vertical slice**
  Spec ref: `PLAN.md > Technical Architecture` and `WebMCP Contract`
  What to build: Scaffold the React/TypeScript Site, configure Supabase environments, deploy a public shell, and expose one read-only plus one revision-checked test tool against one temporary room row.
  Acceptance: A production Site opens without authentication, two phones can reach it, and compatible AI clients plus Chrome 149+ can discover and execute the tools.
  Verify: Inspect `window.originAgentCluster`, list registered tools, execute both calls, and confirm the write appears once in Postgres.

- [ ] **2. Implement schema, RPC foundation, and RLS**
  Spec ref: `PLAN.md > Supabase`, `Core Data`, and `Public and Private Boundary`
  What to build: Add migrations, game-scoped generated-question storage, public-state RPC, mutation transaction helpers, revision/event sequencing, membership policies, and secret-row policies.
  Acceptance: Anonymous users can access only their membership/private rows; Host receives only the public projection; stale revisions and duplicate checkpoints cannot overwrite state.
  Verify: Run database tests for each role, migration reset/seed, revision conflict, idempotent retry, and invalid evidence.

- [ ] **3. Build lobby, QR join, and reconnect**
  Spec ref: `PLAN.md > Host Board` and `Player View`
  What to build: Room creation, four-character code, QR/link join, six sticker identities, seat capacity, ready state, timer-mode toggle, and same-user seat reclaim.
  Acceptance: Exactly two players join; a third receives Room Full; duplicate identity claims fail; refresh restores the correct Host/player view.
  Verify: Manual three-device lobby test plus automated room-full, duplicate-submit, and reconnect cases.

- [ ] **4. Complete Learn and trait review**
  Spec ref: `PLAN.md > Locked MVP`
  What to build: One Agent-generated five-question batch, independent option shuffle, lock/privacy curtain, atomic reveal, conditional Agent-generated Contrast question, Agent trait checkpoint, and sealed two-player feedback barrier.
  Acceptance: No answer leaks before both lock or timeout; the same semantic question reaches both phones; Contrast runs only when fewer than two Learn answers differ.
  Verify: Automated reveal/timeout/contrast tests and one production three-device run through trait confirmation.

- [ ] **5. Complete private role reveal and Challenge rounds**
  Spec ref: `PLAN.md > Locked MVP` and `State and Checkpoints`
  What to build: Atomic random Original/Mirror assignment, private press-and-hold role UI, four per-round Agent-generated Challenge questions, timers, reveal, and suspicion checkpoints.
  Acceptance: Only each player reads their role; Host and Agent cannot infer it from network responses; four rounds advance through valid Agent actions and public evidence.
  Verify: RLS negative tests, network-payload inspection, timeout tests, and one full Challenge run with suspicion movement.

- [ ] **6. Add blind shared Objection**
  Spec ref: `PLAN.md > Locked MVP`
  What to build: Q3 hidden-suspicion staging, three-second blind tap window, atomic shared-token claim, eligible follow-up selection, targeted answer, and keep/switch resolution.
  Acceptance: Players cannot see Q3 suspicion before deciding; simultaneous taps consume the token once; the Agent cannot use an arbitrary follow-up or private evidence.
  Verify: Simultaneous-claim test, unused-token path, used-token path, invalid-question rejection, and Agent interruption at both Objection checkpoints.

- [ ] **7. Finish accusation and result**
  Spec ref: `PLAN.md > Locked MVP` and `WebMCP Contract`
  What to build: Evidence-checked accusation, persistent `revealAt`, three-second Board countdown, role publication, Team/Detective win copy, static timeline, and deterministic result stickers.
  Acceptance: Lost Agent response or Host reload cannot change the accusation/result; humans win only when Original is accused; result contains no unrevealed private answer data.
  Verify: Correct/wrong accusation tests, retry-after-lost-response test, reload-during-countdown test, and deterministic timeline snapshot.

- [ ] **8. Harden WebMCP lifecycle and recovery**
  Spec ref: `PLAN.md > WebMCP Contract`
  What to build: Singleton registration manager, current-state callbacks, abortable waits, structured errors, checkpoint recovery, and unsupported-environment screen.
  Acceptance: Strict Mode, reload, room change, cancellation, duplicated events, and stale revisions create no duplicate tool or state mutation.
  Verify: Unit tests for registration/cancellation plus production interruption/resume prompts in compatible AI clients.

- [ ] **9. Polish the party-game experience**
  Spec ref: `PLAN.md > UX and Timing`
  What to build: Playful Stickers design tokens, Board layouts, phone ergonomics, countdown/reveal motion, reduced motion, empty/loading/error states, and Demo Room entry.
  Acceptance: No phone text inputs exist; primary actions work at 320 px width; Board is readable at 16:9; one fresh tester finishes without verbal setup from the developer.
  Verify: Responsive/accessibility audit, reduced-motion check, fresh-user observation, and a timed 5–7 minute run.

- [ ] **10. Production QA and security proof**
  Spec ref: `PLAN.md > Public and Private Boundary`
  What to build: Automated unit/integration coverage, Playwright browser flows where possible, Supabase policy tests, and `docs/qa.md`, `docs/security.md`, and `docs/webmcp.md` evidence.
  Acceptance: Three consecutive real Host + two-phone production games pass, including one timeout, one Objection, one reconnect, and one Agent interruption.
  Verify: Record exact clients/models, production URL, timestamps, failures, and fixes in the QA document.

- [ ] **11. Package and submit**
  Spec ref: `PLAN.md > Outcome`
  What to build: English README, root MIT license, public repository, public live URL, Devpost description, screenshots, and a 2:40–2:52 public YouTube demo with English audio/subtitles.
  Acceptance: README explains the problem, WebMCP fit, human+Agent novelty, architecture, privacy boundary, exact testing prompt, three-device requirement, and setup; video shows the working app in its first 15 seconds and stays under three minutes.
  Verify: Open repo, video, and live URL in logged-out/incognito sessions; have a new tester follow only the README; complete every required Devpost field and verify submission is not a draft.

## 8. Test Matrix

- Correct flow: lobby through both possible winners.
- Learn: same semantic question, independent shuffle, both-lock reveal, one/both timeout, conditional Contrast.
- Security: Host, other player, unrelated anonymous user, and WebMCP public projection cannot read role or sealed answer.
- Concurrency: repeated answer, simultaneous second answers, duplicate Agent write, stale revision, two Objection taps.
- Recovery: phone refresh, Host refresh, Broadcast loss/reordering, Agent wait timeout/cancel, Agent interruption at every checkpoint, reload during accusation countdown.
- Validation: invalid/private evidence, invalid generated-question structure, duplicate or overlong Agent text, wrong phase, expired checkpoint, full room.
- Compatibility: compatible AI clients with imperative WebMCP support; Chrome 149+ with WebMCP testing enabled; two current mobile browsers.
- UX: 320 px phone, 16:9 Board, keyboard focus, contrast, reduced motion, no player text inputs.

## 9. Delivery Gates

- **August 27:** deployed read/write WebMCP vertical slice with one Host and two phones.
- **August 29:** lobby, Learn, roles, Challenge, and basic accusation complete end to end.
- **August 31:** Objection, checkpoint recovery, RLS negative tests, and production compatibility pass.
- **September 1:** feature freeze; three consecutive production runs and fresh-user README test.
- **September 2:** final public video, screenshots, README, license, and Devpost copy complete.
- **September 3 at 18:00 Taipei:** internal submission deadline, leaving ten hours before the official deadline.
- **September 4 at 04:00 Taipei:** official submission deadline. Do not modify the submitted Devpost entry, repository, or deployment during judging; continue development only in a separate fork.

## 10. Submission Story

The wow moment is the Q3 sequence: both humans must decide whether to object before seeing where the AI Detective's suspicion lands; the AI then asks a bounded follow-up, publicly explains whether the new evidence changed its mind, and commits a final accusation without ever receiving the secret role. The demo should lead with this human–Agent tension, then prove the structured WebMCP calls and privacy boundary.

Official references:

- [The WebMCP Challenge](https://webmcp.devpost.com/)
- [Official Rules](https://webmcp.devpost.com/rules)
- [OpenAI Site tools](https://learn.chatgpt.com/docs/webmcp)
- [ChatGPT Sites](https://learn.chatgpt.com/docs/sites)
- [Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp)
