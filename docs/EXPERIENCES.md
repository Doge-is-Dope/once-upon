# Adding or replacing a story

An experience binds four pieces (see `lib/runtime/types.ts`): a
`StoryDefinition` (rules and labels), a `NarrationContract` (payload format),
a `FrameDefinition` (which renderer draws it), and the agent start/continue
messages. Frames talk to stories only through these contracts — never import
a story module from a frame.

## Adding a new story

1. Create `experiences/<experience-id>/` with a `story.ts` implementing
   `StoryDefinition` (including `attributes` and `limits`), content tables,
   and a `definition.ts` exporting the `ExperienceDefinition`.
2. Register it with one line in `experiences/catalog.ts`.
3. Add one line to `tests/story-contract.test.ts` so the reusable contract
   suite (`tests/story-contract.ts`) validates it.

The registry (`experiences/registry.ts`) validates every definition at
module evaluation — an invalid story fails the build, not a user session.

## Replacing or reworking an existing story

Saved sessions record the `storyId` that wrote them, and the session store
refuses to load a save whose `storyId` differs from the current definition
(it is quarantined through the corrupt-save path and the player starts
fresh).

**Convention: any breaking change to a story — renamed action, location,
item, clue, or ability IDs, changed limits, or changed progression — must
bump the story ID** (for example `last-tavern` → `last-tavern-v2`). Old
saves are then quarantined automatically instead of feeding stale IDs to
the new rules. Purely additive changes (new labels for new IDs) may keep
the ID.
