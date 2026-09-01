# Adding or replacing a story

An `ExperienceDefinition` combines a title, a prologue, one short player-facing
starter, a versioned agent contract, a frame, allowlisted discoveries, and
declarative `StoryInteractionDefinition` entries.

## Add a story

1. Create `experiences/<experience-id>/story.ts` with a prologue, discovery IDs,
   and interactions.
2. Export the `ExperienceDefinition` from `definition.ts`.
3. Add it to `experiences/catalog.ts`.
4. Add lifecycle, sealed-fact, and tool-surface tests.

## Agent bootstrap contract

Keep `startMessage` short enough to work as a natural player request. It may
include an example first move, but it must not contain tool names, revisions,
receipts, internal status rules, or narration policy.

Put story-specific creative boundaries in `agentContract.instructions` and
increment `agentContract.version` when those instructions change materially.
The always-available `get_story_state` tool combines that contract with the
shared Living Manuscript turn protocol in its returned bootstrap instructions,
not in long tool metadata. Keep the tool description concise. The structured
bootstrap state reports the protocol version, story-contract version, and one
of four modes: `opening`, `continuing`, `recovering`, or `complete`.

Runtime invariants still belong in the engine. A contract can guide prose style
and explicit-action semantics, but it must not be the only protection for
session identity, phase, revision, pending receipts, discovery prerequisites,
sealed facts, one-shot retirement, or completion policy.

The registry rejects duplicate tool names, duplicate interaction IDs, unknown
interaction prerequisites, discovery requirements outside the authored graph,
and completion requirements that no interaction can reveal.

## Interaction contract

Each story-object interaction owns:

- an authored tool name, title, short description, and visible in-world cue;
- discovery, fact, and prior-interaction prerequisites;
- sealed facts that are absent from agent context and the DOM before use;
- the immediate page presentation;
- a `completionPolicy`: `must_continue`, `may_complete`, or `must_complete`.

`completionRequiredFactIds` lists authored facts that must exist before a
chapter can set `status: complete`. Use it for a required final reveal, not for
score, success, or a prescribed player choice.

`discoveryRequirements` delays an allowlisted discovery until its required
facts exist and its required interactions have been fully written into a
chapter. Use it when merely naming the right discovery ID too early would skip
an authored search or story beat.

AI can establish only an allowlisted discovery ID through
`commit_story_chapter`. It cannot submit tool metadata or dynamically invent a
new interaction. Every interaction is one-shot. When it executes, the runtime
holds its facts and effect receipt in the current page before the agent writes
the next chapter.

The core `get_story_state`, `begin_story_turn`, and `commit_story_chapter` tools
stay registered for the document lifetime. Once an interaction is unlocked,
its story-object tool stays registered through Ready and Awaiting chapter
phases until invocation retires it. Do not use registration presence as an
authorization check: `allowedNextTools` and `requiredNextTool` in the current
state define what the agent may call. Every mutation must carry the current
`expectedSessionId` and `expectedRevision` from that state.

The current story uses this dependent chain:

```text
pencil_found → reveal_pressed_words
sixth_attempt_note → follow_north_station_memory
north_station_memory completed → manuscript_found may be established
manuscript_found + north_station_flashback → read_the_last_manuscript
national_correction_network → completion allowed
```

Breaking story changes must change `story.id`. There is no game-save migration:
every new document starts from the current prologue.
