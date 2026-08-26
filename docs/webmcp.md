# WebMCP contract

The Host document registers exactly ten singleton tools. Inputs never accept `roomId`; the registry binds tools to the active Host room.

| Tool | Purpose |
| --- | --- |
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

Write inputs share `checkpointId` and `expectedRevision`. Generated question, option, target, kind, and round IDs are server-owned where applicable. `wait_for_public_event` accepts `afterSequence`, caps `timeoutMs` at 20 seconds, and propagates cancellation through `AbortSignal`.

Important error codes are `INVALID_QUESTION`, `IDEMPOTENCY_CONFLICT`, `REVISION_CONFLICT`, `CHECKPOINT_EXPIRED`, `INVALID_EVIDENCE`, `ALREADY_COMPLETED`, and `NOT_AUTHORIZED`. A caller should refresh state before choosing any retry except a corrected `INVALID_QUESTION` submission.

After 20 seconds without an Agent action, the Host Board exposes a copyable recovery prompt. Recovery always starts with `get_public_game_state` and follows the single `eligibleAgentActions` entry.
