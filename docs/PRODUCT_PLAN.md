# Living Manuscript product boundary

The current release proves one loop:

```text
player chooses → AI writes → discovery unlocks a page tool →
player explicitly asks to use it → page changes → AI continues
```

The player starts with one natural sentence and may include the first move in
that same message. Internal tool order, recovery rules, and narrative boundaries
travel through the bootstrap instructions returned by `get_story_state`, not
through long tool metadata or a prompt that the player must copy.

`The Last Manuscript` is the only story in scope. Its pencil, voluntary memory
flashback, and hidden manuscript demonstrate a dependent progression of
unlockable WebMCP verbs:

```text
Pencil → Memory → Last Manuscript
```

Every present-time scene remains inside one correction room. The final reveal
widens the setting to a national system, but the player never crosses the
threshold and their identity remains unresolved.

For one document lifetime, the runtime holds chapters, continuity, discoveries,
revealed facts, pending turns, interaction usage, session identity, revision,
and idempotency records in memory. Reload, close, and Start over all return to
the prologue.
The three core tools stay registered for the document lifetime; an unlocked
story-object tool remains registered until invocation retires it. Current
`allowedNextTools` and `requiredNextTool`, not registration presence, govern
callability. Every mutation must match both the active session and revision.
The runtime does not contain dice, attributes, clocks, resolve, fixed choices,
turn limits, or mechanical ending branches. A story may require authored facts
before accepting a final chapter; this protects reveal order rather than
scoring the player.

Accounts, cloud game sync, a story builder, and community worldbuilding remain
outside this release. A completed player may explicitly publish an anonymous,
unlisted, read-only manuscript for 30 days; no gameplay session is uploaded.
Declarative interactions preserve the boundary needed to build future features
without letting player or model text generate executable tools.
