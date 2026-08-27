# Security model

## Trust boundaries

- `private` owns games, membership, roles, answers, feedback, staged suspicion, generated content, idempotency records, and ordered events.
- Browser roles receive no direct table grants. They can execute only named `api` RPCs.
- Every security-definer function uses an empty `search_path` and fully qualified objects.
- Host/Agent receives only the public projection. A player receives the public projection plus a seat-scoped self projection.
- Private Realtime channels carry invalidation metadata, never snapshots or secrets.

## Data that must remain sealed

Before the corresponding reveal, the following must not appear in Host/player projections, DOM, Realtime payloads, public events, logs, or tool results:

- unopened Learn questions;
- private roles;
- sealed answers;
- unrevealed trait feedback;
- staged Q3 suspicion.

The accepted exception is that a generated five-question Learn batch can remain visible in the Host AI client's tool history. Host Board and phones receive only the opened question.

## Input and concurrency controls

- Question batches are atomic. The server validates exact counts, 3/4 option cardinality, normalized uniqueness, lengths, one-line plain text, URLs, HTML, Markdown markers, control characters, and public evidence IDs.
- Invalid content returns a structured tool error without changing the action ledger, revision, sequence, or events.
- Canonical JSON payload hashes make same-payload retries return the original result; different payloads at the same checkpoint conflict.
- Answer, Objection, timeout, and reveal calls are idempotent around unique round/window constraints and a locked game row.
- Deadlines and reveal times use the database clock. Client timers are display and advancement triggers only.

## Known limits

- English-only and 13+ party safety are instructions to the Detective, not a semantic guarantee. No moderation service or sensitive-topic denylist is claimed.
- Anonymous identity reclaim works only while the original browser storage remains available.
- WebMCP is a preview capability. Secure context, origin isolation, discovery, execution, and external Supabase WebSocket behavior must be verified on the deployed origin.
