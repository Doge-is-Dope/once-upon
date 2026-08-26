# Architecture

The browser is a projection client, not a second game engine.

```text
ChatGPT Detective ── document.modelContext tools ──┐
                                                   │ Host anonymous session
Host Board ────────────────────────────────────────┼── api RPC ── private Supabase state
Player A phone ── player-only projection ──────────┤                  │
Player B phone ── player-only projection ──────────┘                  └─ private Realtime invalidation
```

Every gameplay mutation locks the game row, updates durable state, increments `revision` and `sequence`, writes one ordered public event, and only then broadcasts an invalidation. Clients replace the complete snapshot when its revision is newer. They refetch after initial load, subscription, reconnect, foregrounding, mutation success, and low-frequency polling.

Human writes use the server-owned `windowId` plus the authenticated seat. Agent writes use the server-owned `checkpointId` plus `expectedRevision`. Accepted generated content is immutable and receives server-generated IDs.

The Host and Detective share the Host's anonymous Supabase identity. This proves room ownership and checkpoint validity, but it cannot cryptographically prove that prose came from ChatGPT instead of Host-page JavaScript.
