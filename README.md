# The Last Manuscript

> Working title for a WebMCP-native solo mystery RPG.

The player speaks naturally to their Agent. The web page owns the game rules,
rolls, inventory, clues, and endings. The Agent resolves the player's intent
through WebMCP and turns each canonical result into a shared manuscript.
Artifacts discovered in the story unlock new page-local tools for the Agent:
the Agent's toolset becomes its spellbook.

## Status

The local playable build is implemented. It includes the six-turn True Name
route, three endings, dynamic artifact abilities, IndexedDB persistence,
idempotent operations, pending-turn recovery, and a responsive manuscript UI.

The automated engine and Chromium recovery suites pass. Testing in the actual
ChatGPT in-app browser remains a release gate because this repository has not
been deployed or published.

## Locked direction

- One complete English-first chapter, designed for a 5–8 minute run.
- Three areas, six meaningful turns, public D20 rolls, three attributes, and
  three endings.
- Two artifact abilities plus a final True Name ability.
- The player's existing Agent is the only language model; the website has no
  model API or API key.
- The manuscript is written after every resolved action.
- A pending roll always survives interruption and must be narrated before the
  next action can begin.
- A shareable sealed-manuscript image remains a stretch goal after the core
  real-client gate passes.

## Local development

Requires Node 24.15 or newer and Corepack.

```sh
corepack pnpm@11.24.0 install
corepack pnpm@11.24.0 run dev
```

Run the complete local verification suite with:

```sh
corepack pnpm@11.24.0 run verify
corepack pnpm@11.24.0 run test:e2e
```

## Documents

- [Product and implementation plan](docs/PRODUCT_PLAN.md)
- [Turn recovery protocol](docs/RECOVERY_PROTOCOL.md)
- [Dependency compatibility record](docs/COMPATIBILITY.md)

## Naming note

`The Last Manuscript` is a working title. An existing Stockholm escape-room
game already uses the same name, so a final naming check and likely rename are
required before public submission.
