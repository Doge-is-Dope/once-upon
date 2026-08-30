# Once Upon

> Stories shaped by you, told by AI.

Once Upon is a platform for interactive stories you play with AI. Describe what
your character does in natural language; the page applies the rules, rolls the
dice, and saves the exact outcome on your device. AI turns that result into the
next part of the story without changing what happened.

## The Last Manuscript

**The Last Manuscript** is the first and currently only playable Once Upon
experience: a dark-fantasy mystery with up to six pages before midnight. Create
a traveler, choose a strength, and tell ChatGPT what you do. Every saved result
becomes another page in your manuscript.

Playing requires a WebMCP-enabled ChatGPT browser with site tools turned on.
Other browsers can explore the sample manuscript, but cannot start or continue
the story.

## How to play

1. Open the experience in a WebMCP-enabled ChatGPT browser.
2. Create your character and choose one strength: Wits, Nerve, or Grace.
3. Copy the opening message from the manuscript into the chat beside the page.
4. Describe what you do. The page resolves and saves the outcome, ChatGPT writes
   it into the manuscript, and you choose what to do next.

Keep the page open while you play. Once started, the same local save is
available at `/` and `/experiences/the-last-manuscript`.

## How it works

| You                                | The page                                                                        | AI                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Choose actions in natural language | Owns the rules, D20 rolls, inventory, clues, abilities, endings, and local save | Interprets your intent and narrates the exact saved result |

The page saves an action before AI narrates it. It will not accept another
action until that result has been committed to the story.

## What makes it different

- **The AI's tools become part of the story.** Progress can unlock new
  page-local abilities that ChatGPT can actually call, then retire after use.
- **A saved outcome cannot be rewritten.** AI can bring each turn to life, but
  it cannot change the roll, clues, inventory, abilities, or ending.
- **Interruptions do not reroll the story.** If ChatGPT stops mid-turn or the
  page reloads, the exact pending result is restored before play continues.

## Architecture

Each experience binds a story, presentation frame, and narration contract. The
current experience uses:

| Contract   | ID                    | Responsibility                                |
| ---------- | --------------------- | --------------------------------------------- |
| Experience | `the-last-manuscript` | Binds the compatible contracts below          |
| Story      | `last-tavern`         | Rules, state, actions, abilities, and endings |
| Frame      | `book`                | Book-specific interaction and presentation    |
| Narration  | `prose`               | Validates grounded prose from AI              |

```text
app/                              Routes and Once Upon metadata
components/experience-app.tsx     Frame-neutral experience shell
components/frames/book/           The Book Frame and its view model
experiences/registry.ts            Valid experience definitions
experiences/the-last-manuscript/  The first story and experience contract
lib/runtime/                       Shared engine, controller, session, storage
lib/webmcp/                        Narration-neutral browser tools
```

The shared WebMCP contract exposes `get_story_state`, `perform_action`, and
`commit_narration`. Story-specific ability tools are registered only while the
current experience has unlocked them.

Sessions use schema version 2 in the `once-upon` IndexedDB database, under the
`experience-sessions` store and `active:${experienceId}` keys. The previous
database is intentionally neither read, migrated, nor deleted.

See [Adding or replacing a story](docs/EXPERIENCES.md) and the
[interruption and recovery protocol](docs/RECOVERY_PROTOCOL.md) for the full
contracts.

## Local development

```bash
pnpm install
pnpm dev
pnpm verify
pnpm test:e2e
```

`pnpm verify` runs route type generation, TypeScript, lint, unit tests, and a
production build. No hosted Sites project is configured yet.
