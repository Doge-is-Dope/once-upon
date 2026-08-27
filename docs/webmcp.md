# WebMCP contract

The homepage and Host document share eleven singleton tools. `start_game` creates a standard room from the homepage or resumes the active Host room. The ten game tools remain scoped to that Host room. Inputs never accept `roomId`, and phone/join pages do not register these tools.

| Tool | Purpose |
| --- | --- |
| `start_game` | Create or resume the Host room, show its QR code, and return public state plus Detective guidance. |
| `get_public_game_state` | Read public state, checkpoint, eligible action, evidence, and question request. |
| `wait_for_public_event` | Durable read, private subscribe, re-read, bounded wait, then durable read. |
| `propose_learn_questions` | Submit exactly five four-option Learn questions atomically. |
| `propose_contrast_question` | Submit one evidence-grounded four-option Contrast question. |
| `propose_player_traits` | Submit two traits for each player with Learn evidence. |
| `propose_challenge_question` | Submit the active round's evidence-grounded four-option question. |
| `place_suspicion` | Suspect one seat with a short reason and public evidence. |
| `propose_objection_question` | Submit a three-option follow-up for the server-selected target. |
| `resolve_objection` | Keep or switch suspicion using follow-up evidence. |
| `propose_accusation` | Accuse one seat with at least two evidence events. |

Checkpoint write inputs share `checkpointId` and `expectedRevision`; `start_game` takes no arguments. Generated question, option, target, kind, and round IDs are server-owned where applicable. `wait_for_public_event` accepts `afterSequence`, caps `timeoutMs` at 20 seconds, and propagates cancellation through `AbortSignal`.

## Starting with the AI

The user can say “Let’s play” to their connected AI client. `start_game` returns `roomCode`, a current-origin `joinUrl`, `publicState`, and instructions for the Detective. It never returns the bootstrap's private player state. The Host binding is ready before the tool resolves, so the AI can immediately read public state.

AI and manual starts share the same pending creation request. A successful room is reused on subsequent calls. A cancelled invocation cannot create a room if it was already cancelled before execution; if the server has created a room, that room remains usable. Creation failures are reported, not automatically retried: the underlying create RPC has no idempotency key, so a lost response is not guaranteed safe to retry.

Two humans join and ready themselves on their phones. The Detective follows `eligibleAgentActions`, `checkpoint.id`, and `revision`, then waits using the current `sequence` when no action is eligible. In particular, a both-ready game can still have `phase: lobby` while `propose_learn_questions` is eligible. Stop at `phase: revealed`. The tool descriptions carry these rules; players do not need a special setup prompt.

Registering tools does not wake an AI client or prove one is connected. A compatible client must discover and invoke them in response to the user's request. See the [Chrome imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api).

## Recovery

Important error codes are `INVALID_QUESTION`, `IDEMPOTENCY_CONFLICT`, `REVISION_CONFLICT`, `CHECKPOINT_EXPIRED`, `INVALID_EVIDENCE`, `ALREADY_COMPLETED`, and `NOT_AUTHORIZED`. A caller should refresh state before choosing any retry except a corrected `INVALID_QUESTION` submission.

After 20 seconds without an Agent action, the Host Board exposes a copyable recovery prompt. Recovery always starts with `get_public_game_state` and follows the single `eligibleAgentActions` entry.
