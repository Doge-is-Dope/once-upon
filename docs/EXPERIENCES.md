# Adding or replacing a story

An `ExperienceDefinition` combines a title, a `StoryDefinition`, a frame with
optional copy overrides, one short player-facing starter, and a versioned agent
contract. Everything the page renders, registers, or enforces derives from that
object: adding a story touches `experiences/` and nothing else.

## Add a story

1. Create `experiences/<experience-id>/story.ts` with a `StoryDefinition`: a
   `narration` mode, a prologue, clues, a completion passage, allowlisted
   discovery IDs, discovery requirements, completion facts, and declarative
   `StoryInteractionDefinition` entries.
2. Put the starter message and the agent contract in `content.ts`.
3. Export the `ExperienceDefinition` from `definition.ts`, choosing the frame
   and any copy overrides.
4. Add it to `experiences/catalog.ts`. The registry validates the whole graph at
   module load and refuses to start on an inconsistent story.
5. Add lifecycle, sealed-fact, and tool-surface tests. Runtime behaviour is
   already covered through the neutral fixture in
   `tests/support/fixture-story.ts`; new tests should assert only what is
   specific to the new story.

## Narration: prose or record

`story.narration` is `'prose'` or `'record'`.

- `prose` stories carry one player-facing text. The prologue and sealed
  facts declare only `prose` / `value`, and the agent submits only `prose`.
- `record` stories also keep an official third-person record of every
  chapter. The prologue pairs `prose` with `recordProse` and every sealed fact
  pairs `value` with `recordValue` (same paragraph structure, no second-person
  pronouns). The `commit_story_chapter` schema and the shared turn protocol
  require `recordProse` from the agent, and a shared copy stores both versions.

Independently of narration, a story may give `completionPassage.recordProse`.
When present, in either mode, the fixed ending rewrites its last paragraph into
that wording after typing, the restricted sheet censors its lines, and a shared
copy stores both versions of the ending. The registry validates it as a pair
(same paragraph count, no second person). Leave it out and the fixed ending is
typed once and the restricted sheet shows the prose plainly.

The registry rejects a `prose` story that declares a prologue `recordProse` or
a fact `recordValue`, and a `record` story that omits either. The engine
rejects a `recordProse` on a prose story and a missing one on a record story.

## Presentations

Each interaction names a `presentation` the frame can render. The book frame
supports:

| id                 | Rendering                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `generic`          | Titled section listing every sealed fact.                                                                                            |
| `pressed_writing`  | A notepad artifact; each fact's first line is the raised fragment.                                                                   |
| `memory_flashback` | A remembered scene from the interaction's **first** sealed fact, then each further fact as a present-time block under its `heading`. |
| `world_shift`      | A titled section; also brightens the desk lamp permanently.                                                                          |

The manifest lives in `lib/frames/book.ts`; the renderers live in
`components/frames/desk/presentations/`. The registry rejects an id the frame
cannot render. An interaction may set `announcement` to replace the
presentation's default screen-reader line when its effect lands.

## Frame copy

The book frame ships neutral wording for the turn prompt, waiting states, hint
fallbacks, the resume message, the clue notebook labels, and the shared-page
return link (`DEFAULT_BOOK_COPY` in `lib/frames/book.ts`). A story overrides
only the lines it wants through `frame.copy`; see
`experiences/the-last-manuscript/definition.ts` for the full set.

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
interaction prerequisites, unsupported presentation ids, discovery requirements
outside the authored graph, and completion requirements that no interaction can
reveal.

## Interaction contract

Each story-object interaction owns:

- an authored tool name, title, short description, and visible in-world cue;
- discovery, fact, and prior-interaction prerequisites;
- sealed facts that are absent from agent context and the DOM before use. A
  fact's `value` is what the page shows; an optional `heading` labels it in a
  presentation, and an optional `agentNote` carries branches or consequences
  the page never shows — it travels only in the effect receipt;
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

## Current shape constraints

- A story declares exactly one `must_complete` interaction, and its
  `completionRequiredFactIds` must be revealed by that interaction.
- Sharing a completed manuscript requires every authored interaction to appear
  in authored order, ending with the `must_complete` one. Branching or optional
  interactions are not yet supported by the share validator.
