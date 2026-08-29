# Once Upon — The Last Manuscript Experience Plan

## Product frame

Once Upon hosts interactive stories where the player chooses, the browser owns
canonical state, and a connected agent narrates only what the saved result
permits. The platform identity is independent of any particular story or
renderer.

The first experience is **The Last Manuscript**:

| Contract   | ID                    | Responsibility                                |
| ---------- | --------------------- | --------------------------------------------- |
| Experience | `the-last-manuscript` | Binds the compatible contracts below          |
| Story      | `last-tavern`         | Rules, state, actions, abilities, and endings |
| Frame      | `book`                | Book-specific interaction and presentation    |
| Narration  | `prose`               | Validates a grounded prose payload            |

## Player loop

1. The player creates a character and chooses a strength.
2. The agent calls `get_story_state` and presents the current scene.
3. The player describes an action.
4. The agent calls `perform_action` with the current revision and an available
   target. The browser saves the roll and enters `AWAITING_NARRATION` or
   `AWAITING_FINAL_NARRATION`.
5. The agent calls `commit_narration` for the exact resolution and canonical
   event IDs.
6. The browser validates the narration payload, commits it, and either returns
   to `READY_FOR_ACTION` or completes the experience.

An interrupted agent must call `get_story_state` again and obey
`requiredNextTool`. A saved result is never rerolled during recovery.

## Runtime boundaries

`lib/runtime` owns only experience-neutral concepts:

- `ExperienceDefinition`, `ExperienceSession`, and `StoryStateSnapshot`
- deterministic action resolution and narration receipts
- serialized controller mutations and fault reporting
- experience-scoped persistence and corrupt-save quarantine

`experiences/the-last-manuscript` owns the current setting, authored content,
action rules, labels, abilities, and ending precedence.

`components/frames/book` owns the Book Frame view model, interaction, and visual
language. A future frame may use a different narration contract without
changing the shared session engine.

## Narration payloads

The common receipt carries one discriminated payload:

```ts
type NarrationPayload =
  | { format: 'prose'; text: string }
  | {
      format: 'terminal';
      lines: Array<{
        kind: 'command' | 'output' | 'system';
        text: string;
      }>;
    };
```

The current experience accepts only `prose`. The terminal contract is exercised
as a runtime fixture; no second story or Terminal Frame is part of this version.

## Routes, persistence, and release

- `/` resolves the default registry entry directly.
- `/experiences/the-last-manuscript` is the canonical experience route.
- Unknown experience IDs return 404.
- IndexedDB uses database `once-upon`, store `experience-sessions`, and key
  `active:${experienceId}`.
- Session schema version 2 includes `experienceId` and `storyId`.
- The previous database remains untouched as an intentional clean break.

The project is not deployed automatically. When a Sites project and Devpost
submission are created, both should start directly with the Once Upon identity.
