# Once Upon

> You choose. The web keeps the truth. Your agent tells the story.

Once Upon is a platform for agent-narrated, browser-owned story experiences.
Each experience binds one story, one presentation frame, and one narration
contract so the agent can tell the story without owning or rewriting its rules.

## First experience

**The Last Manuscript** is the first Once Upon experience. It combines:

- story: `last-tavern`
- frame: `book`
- narration: `prose`

The player chooses actions in natural language. The browser resolves the rules,
rolls, inventory, clues, abilities, and ending. The connected agent commits
grounded narration for the exact saved result.

Open it at either `/` or `/experiences/the-last-manuscript`. Both routes use the
same experience definition and local save.

## Architecture

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

## Local development

```bash
pnpm install
pnpm dev
pnpm verify
pnpm test:e2e
```

`pnpm verify` runs route type generation, TypeScript, lint, unit tests, and a
production build. No hosted Sites project is configured yet.
