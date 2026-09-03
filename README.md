# Once Upon

> **Every discovery changes what AI can do.**

Once Upon is a story you play with your agent beside the page. Tell your agent
what your character does; it writes the result into a continuous manuscript.
As the story reveals certain objects, the page gives your agent a new WebMCP
action that did not exist before.

The first story, **The Last Manuscript**, begins in a room with a handleless
door. There is no character sheet, dice roll, stat block, turn limit, or fixed
action menu.

## How to play

1. Open the page in a browser or app with a WebMCP-aware agent.
2. Ask your agent to play and include your first move in the same message.
3. Read the next chapter on the page and keep choosing.

For example:

> Play The Last Manuscript with me through this page. I look around the room
> before answering the speaker.

The page offers this starter through an optional **Copy starter** button on the
sheet; there is no setup prompt to paste. The sheet shows when your agent is
writing the next chapter or writing what follows after an object changes the
page, and it echoes each move while that chapter is pending. The desk lamp
brightens after the agent joins and breathes while a page tool is running.

[WebMCP](https://webmachinelearning.github.io/webmcp/) is an evolving browser
API for exposing page tools to agents. Availability depends on the browser or
app hosting the agent; Once Upon does not require a specific AI provider.

Most characters, locations, consequences, and branches are freeform. Three
author-designed secrets stay in the page until the player discovers and
explicitly uses the right story object:

```text
The Pencil         → raise the warning pressed through the torn page
The Memory         → follow one North Station memory when the player chooses to
The Last Manuscript → read the testimony hidden behind the wardrobe
```

The final authored reveal opens the room onto a larger system. After the agent's
final chapter, a fixed closing passage carries the subject out of the building,
and the manuscript stops before the player's next choice.

Enable **Settings → Tool inspector** to watch the current tool surface and
lifecycle — prerequisites, registration, invocation, and retirement. The panel
stays out of the player experience by default.

## Human + AI + page

- **Player** chooses what the character does and when to use a discovered
  object.
- **AI** freely continues the story in 1–3 short paragraphs.
- **Page** holds authored secrets, keeps a stable core surface, unlocks
  story-object tools, and preserves the manuscript.

Using a story object changes the page before the agent writes the chapter. The
page keeps that exact effect in memory until the matching chapter is committed,
and the commit must reference the same effect and every fact it revealed.
Reloading, closing the tab, or choosing Start over opens the prologue again.

The page paces the story. A committed chapter is typed onto the sheet at reading
speed, and the commit result tells the agent how long that takes so it does not
repeat the prose in chat or rush the next question; the reader can press
**Finish typing** to settle the page at once. The next-move prompt and hint wait
for the typing to end.

## WebMCP surface

Registration and callability have separate lifecycles. The three core tools —
`get_story_state`, `begin_story_turn`, and `commit_story_chapter` — are
registered once for the document lifetime. An unlocked, unused story-object
tool remains registered through both Ready and Awaiting chapter phases, then
retires only after its interaction is invoked.

The state returned by `get_story_state`, rather than registration presence,
governs the next valid call:

| Phase            | `requiredNextTool`     | `allowedNextTools`                                 |
| ---------------- | ---------------------- | -------------------------------------------------- |
| Ready            | `none`                 | `begin_story_turn` and eligible story-object tools |
| Awaiting chapter | `commit_story_chapter` | `commit_story_chapter`                             |
| Complete         | `none`                 | none                                               |

`get_story_state` is also the start-and-continue bootstrap. Its tool metadata
stays concise; the returned bootstrap instructions carry the versioned turn
protocol and story-specific narration contract, so the player never has to
transport internal instructions through chat. The state identifies whether the
manuscript is opening, continuing an unfinished same-page turn, or complete.

Every mutation includes both `expectedSessionId` and `expectedRevision`. A
request from a replaced manuscript or an older revision is rejected before it
can change the active page session.

AI may submit only allowlisted discovery IDs. A story can give later discoveries
fact and completed-interaction requirements, so naming a real ID before its
authored stage does not unlock it. Tool names, descriptions, schemas,
prerequisites, and sealed facts come from declarative story definitions and
cannot be created by story text.

A story may also declare `completionRequiredFactIds`. The runtime rejects a
final chapter until every required authored fact has been revealed, so an agent
cannot close the manuscript before its final turn.

Each interaction also declares a `completionPolicy`: early interactions must
continue, while the Last Manuscript must complete the story. A wrong status is
rejected without consuming the pending receipt.

## Sharing a completed manuscript

Nothing is uploaded during play. After completion, the player may explicitly
choose **Create a link**. The server validates and rebuilds the reader document,
then stores only that anonymous, unlisted, read-only copy in D1. The link
expires after 30 days.

## Project layout

```text
app/                              Routes and global metadata
components/frames/desk/           Living Manuscript UI, presentations, inspector
experiences/<story-id>/           Declarative story, starter, and agent contract
lib/frames/                        Frame manifests and default copy
lib/runtime/                       In-memory narrative state machine
lib/manuscript/                    Shared reading order and text export
lib/share/                         Public document validation and D1 access
lib/webmcp/                        State-derived WebMCP registration
tests/                             Deterministic engine and tool tests
tests/support/                     Neutral fixture story and share fixtures
e2e/                               Full browser journey, reset, and sharing
```

Game sessions never use browser storage. `sessionId`, revision, and the
operation ledger exist only for same-page concurrency and idempotent retries.
Set `SHARE_SIGNING_SECRET` for local or hosted public-link publishing; D1 is
bound as `DB` and R2 is unused.

See [Adding a story](docs/EXPERIENCES.md), the
[recovery protocol](docs/RECOVERY_PROTOCOL.md), and the
[WebMCP evaluation set](docs/WEBMCP_EVALS.md).

## Local development

```bash
pnpm install
pnpm dev
pnpm verify
pnpm test:e2e
```

`pnpm verify` runs route type generation, strict TypeScript, lint, the Drizzle
schema check, unit tests, and a production build.

MIT — see [LICENSE](LICENSE).
