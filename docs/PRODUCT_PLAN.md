# The Last Manuscript — Product and Implementation Plan

## 1. Product thesis

Build a short solo dark-fantasy mystery in which the player talks to ChatGPT
while an illustrated manuscript page shows the shared world. The engine, not
the Agent, determines truth. The Agent interprets intent, calls WebMCP tools,
and writes the consequences into the manuscript.

The memorable WebMCP moment is capability acquisition: finding an artifact on
the page registers a new page-local ability the Agent can actually call. A
normal chat can pretend that the Agent learned a spell; this app lets the live
web state grant and revoke the capability itself.

The product is designed against the WebMCP Challenge criteria of originality,
execution, thoughtful WebMCP use, and the quality of the human-Agent
experience. The demo should make the capability unlock visible without needing
a technical explanation.

### Audience and success criteria

- A first-time player understands how to begin in under 60 seconds.
- One run takes roughly 5–8 minutes and no more than six resolved turns.
- The player sees at least one artifact become a real Agent ability.
- Every roll and state change remains inspectable on the web page.
- Stopping ChatGPT, refreshing the page, or repeating a tool call never creates
  a second roll or advances from an incomplete turn.
- A distinctive 1080×1350 PNG is the first stretch goal after the core client
  and recovery gates pass.

## 2. Player experience

### Opening

The cover presents three steps: open this page in ChatGPT, copy the short
companion prompt, and tell the Agent what the character does. The player enters
a name and selects one specialty: Wits, Nerve, or Grace. The specialty is +2;
the other two attributes are +1. Resolve starts at 3.

The UI and authored story ship in English. All interface and story strings use
locale keys so another language can be added without changing mechanics. The
player may describe an action in any language; the Agent submits normalized
IDs and a short intent to the engine. Manuscript prose is English in v1.

### Core turn

1. The player says an action in ChatGPT, such as “I hold the mirror shard over
   the letter.”
2. The Agent reads the current state and calls an action or unlocked-ability
   tool with a unique operation ID and the expected revision.
3. The engine validates the current phase, target, location, and approach;
   rolls `crypto.getRandomValues()` D20; applies the authored outcome; and
   atomically saves a canonical turn receipt.
4. The page shows the die, modifier, DC, result tier, clock movement, and state
   changes. The saved phase becomes `AWAITING_MANUSCRIPT`.
5. In the same ChatGPT turn, the Agent calls `write_manuscript_entry` using the
   saved receipt. Only then does the engine return to `READY_FOR_ACTION`.

The manuscript entry should be 35–60 English words, use the supplied facts,
and end with tension rather than suggested action buttons. There is no chat box
or pretend AI control on the page.

### Rules

- A valid meaningful action consumes one of six Midnight Clock segments.
- Roll: `D20 + chosen attribute` against the authored DC.
- `total >= DC`: success. `DC - 3 <= total < DC`: success with a complication.
  A lower total is a setback that changes the situation; it never asks the
  player to repeat the same action.
- Natural 20 adds a benefit; natural 1 adds a complication. Authored tables,
  not the Agent, select the mechanical effect.
- Major setbacks remove 1 Resolve. Resolve 0 or the sixth bell can force the
  New Keeper ending when the True Name route has not been completed.
- Invalid, unavailable, or ambiguous actions return current affordances and do
  not roll or advance the clock.

## 3. Chapter design

### Premise and areas

The player wakes in the last tavern before dawn. The front door is chained, the
hearth is dying, a raven watches from the rafters, and something beneath the
floor breathes in time with the clock.

The chapter contains three compact areas:

1. **Main Hall** — hearth, chained entrance, raven, old ledger.
2. **Upstairs Room** — black mirror shard, former keeper's belongings, hidden
   writing.
3. **Cellar** — the entity, the final choice, and all three endings.

Each area exposes a small authored list of targets and approaches while still
letting the player phrase intent freely. Unknown ideas map to a scene-specific
improvised action with bounded outcomes; they never let the Agent invent new
items, clues, or exits.

### Agent spellbook

- **Reveal Hidden Ink** unlocks after the lit tin lantern and black mirror
  shard are both held. It reveals canonical text on the half-burnt letter or
  ledger and creates a normal narrated turn.
- **Ask the Raven** unlocks after earning the raven's trust. It is usable once;
  the Agent maps the player's wording to one of the currently offered truth
  questions, and the engine returns the authored answer.
- **Speak the True Name** unlocks only when the hidden-ink clue and raven clue
  form the complete name. It is the final action for the true ending.

Unlocked abilities appear visually in the right-page spellbook. Dynamic tool
registration creates the reveal moment, but every handler also validates the
saved game phase and unlock conditions because clients may cache a previous
tool list.

### Endings

- **Escape** — leave before resolving the curse; the player survives and the
  tavern waits for someone else.
- **New Keeper** — open the cellar without the complete truth, lose all
  Resolve, or reach the sixth bell unprepared.
- **True Name** — assemble both clue fragments and speak the name in the
  cellar, breaking the cycle.

All routes write a final entry before the session becomes `COMPLETE`.

## 4. Interface and visual direction

The main screen resembles an open field journal in warm dark fantasy: parchment,
candlelight, aged ink, a cozy tavern that becomes subtly wrong as midnight
approaches. Motion stays restrained and respects reduced-motion settings.

- **Left page:** manuscript entries, current location illustration, and latest
  D20 receipt.
- **Right page:** Midnight Clock, Resolve, attributes, artifacts, clues, and
  the Agent spellbook.
- **Pending ribbon:** “The dice have spoken. Your Agent still owes this page
  its words.” It includes a copyable recovery prompt, not an action button.
- **Final seal:** cover, character, route, ending, key rolls, and selected
  passages rendered locally to a 1080×1350 PNG. No manuscript text or player
  data is uploaded.

Desktop uses the open-book layout; narrow screens stack manuscript before
status without hiding any state. Keyboard navigation, semantic headings,
visible focus, contrast, and screen-reader roll announcements are required.

## 5. Technical architecture

Create a clean independent OpenAI Sites project using React, TypeScript, and
Vinext. Use native IndexedDB for the versioned session and idempotency ledger.
There is no account, backend, database service, model API, analytics, or remote
asset dependency in v1.

### Authoritative data model

```ts
type GamePhase =
  | 'SETUP'
  | 'READY_FOR_ACTION'
  | 'AWAITING_MANUSCRIPT'
  | 'AWAITING_FINAL_MANUSCRIPT'
  | 'COMPLETE';

interface GameSession {
  schemaVersion: 1;
  sessionId: string;
  revision: number;
  phase: GamePhase;
  turn: number;
  clock: number;
  character: { name: string; specialty: 'wits' | 'nerve' | 'grace' };
  stats: Record<'wits' | 'nerve' | 'grace', number>;
  resolve: number;
  locationId: string;
  inventoryIds: string[];
  clueIds: string[];
  unlockedAbilityIds: string[];
  usedAbilityIds: string[];
  manuscript: ManuscriptEntry[];
  pendingResolution: TurnResolution | null;
  endingId: string | null;
}
```

`AdventureDefinition` keeps mechanics data-driven: locale keys, areas, targets,
approaches, DCs, outcome effects, artifacts, ability unlock rules, and endings.
Only one chapter ships; there is no authoring UI or general campaign engine.

### WebMCP surface

- `get_adventure_state()` — read-only; always returns the phase, revision,
  valid next tools, current affordances, and any complete pending receipt.
- `perform_action({ operationId, expectedRevision, targetId, approach, intent })`
  — resolves one authored or bounded improvised action.
- `write_manuscript_entry({ operationId, expectedRevision, resolutionId,
representedEventIds, prose })` — can only finish the exact pending receipt.
- `reveal_hidden_ink(...)`, `ask_the_raven(...)`, and
  `speak_the_true_name(...)` — state-gated abilities that use the same atomic
  resolution pipeline.

The action result includes `resolutionId`, die, modifier, DC, result tier,
canonical event IDs, state changes, `mustInclude`, and `mustNotClaim`. Prose is
a presentation layer: it cannot change inventory, clues, clock, Resolve,
location, abilities, or ending.

### Cancellation compatibility

The first implementation milestone is a real ChatGPT in-app-browser spike. If
the execution context supplies `AbortSignal`, check it before work and abort the
IndexedDB transaction when possible. If the current client omits it, allow only
these reversible, device-local game mutations and display Compatibility Mode.
Operation IDs, expected revisions, phase validation, and the pending receipt
still apply. This is an explicit weaker cancellation contract, not a claim that
a lifetime signal equals per-call cancellation.

No correctness rule depends on dynamic tool discovery, ChatGPT conversation
memory, or the Agent remembering its last response. The saved session decides
the only legal next operation.

## 6. Build sequence

1. **Feasibility gate:** scaffold the Sites app; implement the minimal state,
   `get_adventure_state`, one action, and manuscript write; test the complete
   and interrupted sequences in the real ChatGPT client.
2. **Engine:** implement versioned IndexedDB storage, atomic turn ledger,
   injectable D20 roller, outcome effects, three attributes, Resolve, six-segment
   clock, and all recovery errors.
3. **Chapter:** encode the three areas, artifact dependencies, two core
   abilities, final ability, and three endings in `AdventureDefinition`.
4. **WebMCP experience:** register baseline tools, add ability registrations,
   show capability status, and tune tool descriptions so one Agent turn resolves
   and narrates without extra prompting.
5. **Presentation:** build the responsive manuscript UI, restrained transitions,
   accessibility states, onboarding prompt, pending ribbon, and ending seal.
   Add PNG export only after the core gates pass.
6. **Submission readiness:** run real-client routes, record the three-minute
   demo around the first ability unlock and interruption recovery, prepare the
   public repository and live Sites app only after explicit authorization.

## 7. Verification and acceptance

### State-machine tests

- A successful action atomically changes canonical state and stores exactly one
  pending receipt.
- Any new action during a pending receipt returns `NARRATION_REQUIRED` and the
  same receipt without rolling.
- Refreshing or reopening restores `AWAITING_MANUSCRIPT` and lets a new Agent
  call finish it.
- Reusing an action operation ID returns the original roll; it never rolls
  again. Reusing a manuscript operation ID never appends twice.
- A stale revision or wrong resolution ID changes nothing and instructs the
  Agent to reread state.
- Aborting before commit changes nothing; interruption after commit leaves a
  recoverable pending receipt.
- A narration call cannot smuggle mechanical state changes.

### Game and UI tests

- Deterministic fixtures cover success, complication, setback, natural 1,
  natural 20, Resolve 0, and the sixth bell.
- One automated route reaches each ending; the True Name route proves both
  ability unlocks and the final gate.
- Real ChatGPT tests cover normal play, cancellation or stop after the roll,
  reload in the pending phase, duplicated calls, and a client without an
  execution signal.
- Playwright covers desktop and mobile layouts, keyboard-only play, reduced
  motion, accessible announcements, and interrupted-turn recovery. Corrupted
  save recovery and PNG export remain follow-up coverage.
- The shipped build makes no model API or remote persistence request.

## 8. Explicit boundaries and open risk

- Do not reuse or rewrite the current house-cocreation repository; this is a
  separate Git history and project directory.
- Do not build multiplayer, accounts, cloud saves, a level editor, procedural
  campaigns, voice, image generation, or direct social posting for v1.
- Do not publish, deploy, register, submit, or make the repository public
  without a later explicit instruction.
- `The Last Manuscript` collides with an existing escape-room game title. Keep
  it as a working title during the feasibility build, then select and re-check
  a more ownable public name before submission materials are created.
- The protocol guarantees canonical state continuity. It cannot guarantee that
  arbitrary generated prose is factually perfect, so the UI always displays the
  canonical roll and events beside the prose and allows narration to be retried
  against the same receipt before advancing.
