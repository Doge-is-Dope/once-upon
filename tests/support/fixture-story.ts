import type {
  ExperienceDefinition,
  StoryDefinition,
  StoryInteractionDefinition,
} from '../../lib/runtime/types';

/**
 * A small authored story with the same shape as The Last Manuscript — three
 * chained interactions, two discoveries, six clues, one required completion
 * fact — but neutral names and short text. Engine, tool, clue, and sheet
 * tests exercise runtime behaviour through it so the real story can change
 * without touching them.
 *
 * Dependency chain:
 *   key_found → drawer (open_the_drawer) reveals drawer_note
 *   drawer_note → memory (follow_the_memory) reveals memory_return + memory_second
 *   memory completed + memory_return → panel_found may be established
 *   panel_found + memory_return → panel (open_the_panel) reveals panel_ledger + panel_truth
 *   panel_truth → completion allowed
 */
export const fixtureIds = {
  experience: 'fixture-story',
  story: 'fixture-story-v1',
  contract: 'fixture-agent-v1',
  discoveries: { key: 'key_found', panel: 'panel_found' },
  interactions: { drawer: 'drawer', memory: 'memory', panel: 'panel' },
  tools: {
    drawer: 'open_the_drawer',
    memory: 'follow_the_memory',
    panel: 'open_the_panel',
  },
  facts: {
    drawerNote: 'drawer_note',
    memoryReturn: 'memory_return',
    memorySecond: 'memory_second',
    panelLedger: 'panel_ledger',
    panelTruth: 'panel_truth',
  },
  clues: {
    ledger: 'blank-ledger',
    lamp: 'behind-the-lamp',
    key: 'key',
    note: 'drawer-note',
    memory: 'returned-memory',
    panel: 'wall-panel',
  },
} as const;

/** Sealed wording the engine must reject in agent-written text. */
export const fixtureProtectedTerms = {
  drawerNote: 'Do not answer yet',
  memoryReturn: 'The bell rings twice before the door',
  memorySecond: 'Nothing happened in the study',
  panelLedger: 'stamped SETTLED',
  panelTruth: 'a corridor of doors',
} as const;

const interactions: readonly StoryInteractionDefinition[] = [
  {
    id: fixtureIds.interactions.drawer,
    toolName: fixtureIds.tools.drawer,
    title: 'The Drawer',
    description:
      'Open the locked drawer with the discovered key only when the player explicitly asks to unlock or open it.',
    cue: 'The key fits the drawer beneath the desk.',
    requiredDiscoveryIds: [fixtureIds.discoveries.key],
    requiredInteractionIds: [],
    requiredFactIds: [],
    sealedFacts: [
      {
        id: fixtureIds.facts.drawerNote,
        value:
          'Do not answer yet.\nThe panel is behind the lamp. Read the ledger first.',
        recordValue:
          'The subject must not answer yet.\nThe panel is behind the lamp. The subject must read the ledger first.',
        protectedTerms: [fixtureProtectedTerms.drawerNote],
      },
    ],
    presentation: 'pressed_writing',
    completionPolicy: 'must_continue',
  },
  {
    id: fixtureIds.interactions.memory,
    toolName: fixtureIds.tools.memory,
    title: 'The Memory',
    description:
      'Follow the returning memory only when the player explicitly chooses to close their eyes and begin with the bell.',
    cue: 'The note offers a way in: close your eyes and begin with the bell.',
    requiredDiscoveryIds: [],
    requiredInteractionIds: [fixtureIds.interactions.drawer],
    requiredFactIds: [fixtureIds.facts.drawerNote],
    sealedFacts: [
      {
        id: fixtureIds.facts.memoryReturn,
        value:
          'You close your eyes and begin with the bell. The bell rings twice before the door opens.\n\nThe study was never empty. Someone left before the lamp went out.',
        recordValue:
          'The subject closes their eyes and begins with the bell. The bell rings twice before the door opens.\n\nThe study was never empty. Someone left before the lamp went out.',
        protectedTerms: [fixtureProtectedTerms.memoryReturn],
      },
      {
        id: fixtureIds.facts.memorySecond,
        value:
          'When you open your eyes the study is unchanged. The voice repeats its version: “Nothing happened in the study.”',
        recordValue:
          'When the subject opens their eyes the study is unchanged. The voice repeats its version: “Nothing happened in the study.”',
        protectedTerms: [fixtureProtectedTerms.memorySecond],
      },
    ],
    presentation: 'memory_flashback',
    completionPolicy: 'must_continue',
  },
  {
    id: fixtureIds.interactions.panel,
    toolName: fixtureIds.tools.panel,
    title: 'The Wall Panel',
    description:
      'Open the panel found behind the lamp only when the player explicitly asks to open or examine it. Carry every revealed fact into the next chapter.',
    cue: 'The panel behind the lamp is loose. The note asked you to read the ledger before opening it.',
    requiredDiscoveryIds: [fixtureIds.discoveries.panel],
    requiredInteractionIds: [fixtureIds.interactions.memory],
    requiredFactIds: [fixtureIds.facts.memoryReturn],
    sealedFacts: [
      {
        id: fixtureIds.facts.panelLedger,
        value:
          'Inside the panel is a ledger of names. Each entry ends with the same line and is stamped SETTLED.',
        recordValue:
          'Inside the panel is a ledger of names. Each entry ends with the same line and is stamped SETTLED.',
        protectedTerms: [fixtureProtectedTerms.panelLedger],
      },
      {
        id: fixtureIds.facts.panelTruth,
        value:
          'The wall swings open onto a corridor of doors. Every door carries a study number. Yours is the only one still lit.',
        recordValue:
          'The wall swings open onto a corridor of doors. Every door carries a study number. The subject’s door is the only one still lit.',
        protectedTerms: [fixtureProtectedTerms.panelTruth],
      },
    ],
    presentation: 'world_shift',
    completionPolicy: 'must_complete',
  },
];

const recordStory: StoryDefinition = {
  id: fixtureIds.story,
  narration: 'record',
  prologue: {
    title: 'The locked study',
    prose:
      '“Please answer: who was in the study when the lamp went out?”\n\nThe question wakes you at a desk. A ledger lies open, its first page blank. A lamp stands against the wall beside the only door, which has no handle.\n\nWhen the voice repeats the question, something clicks behind the lamp and falls still.',
    recordProse:
      '“Please answer: who was in the study when the lamp went out?”\n\nThe question wakes the subject at a desk. A ledger lies open, its first page blank. A lamp stands against the wall beside the only door, which has no handle.\n\nWhen the voice repeats the question, something clicks behind the lamp and falls still.',
    continuitySummary:
      'You woke at a desk in a locked study while a voice asked who was in the study when the lamp went out. The ledger is blank, the door has no handle, and something clicked behind the lamp.',
  },
  clues: [
    {
      id: fixtureIds.clues.ledger,
      title: 'The Blank Ledger',
      observation: 'The first page is blank, but the paper is indented.',
      revealedBy: { kind: 'prologue' },
    },
    {
      id: fixtureIds.clues.lamp,
      title: 'Behind the Lamp',
      observation: 'Something clicked behind the lamp when the voice spoke.',
      revealedBy: { kind: 'prologue' },
      lead: {
        text: 'Move the lamp aside and search the wall behind it.',
        target: { kind: 'discovery', id: fixtureIds.discoveries.panel },
      },
    },
    {
      id: fixtureIds.clues.key,
      title: 'The Key',
      observation: 'A small key, left where I could reach it.',
      revealedBy: { kind: 'discovery', id: fixtureIds.discoveries.key },
      lead: {
        text: 'Try the key in the drawer beneath the desk.',
        target: { kind: 'interaction', id: fixtureIds.interactions.drawer },
      },
    },
    {
      id: fixtureIds.clues.note,
      title: 'The Drawer Note',
      observation:
        'A note in the drawer tells me not to answer yet and to read the ledger first.',
      revealedBy: { kind: 'fact', id: fixtureIds.facts.drawerNote },
      lead: {
        text: 'Close my eyes and begin with the bell.',
        target: { kind: 'interaction', id: fixtureIds.interactions.memory },
      },
    },
    {
      id: fixtureIds.clues.memory,
      title: 'The Returned Memory',
      observation:
        'The bell rang before the door opened. The study was never empty.',
      revealedBy: { kind: 'fact', id: fixtureIds.facts.memoryReturn },
    },
    {
      id: fixtureIds.clues.panel,
      title: 'The Wall Panel',
      observation: 'A loose panel behind the lamp, where the click came from.',
      revealedBy: { kind: 'discovery', id: fixtureIds.discoveries.panel },
      lead: {
        text: 'Open the panel and read the ledger before answering the voice.',
        target: { kind: 'interaction', id: fixtureIds.interactions.panel },
      },
    },
  ],
  completionPassage: {
    prose:
      'The corridor is quiet. You walk past the unlit doors without looking back.\n\nBy the last door the ledger is under your coat and no one has followed. You keep walking.',
    recordProse:
      'The corridor is quiet. The subject walks past the unlit doors without looking back.\n\nBy the last door the ledger is under the subject’s coat and no one has followed. The subject continues walking.',
  },
  discoveryIds: [fixtureIds.discoveries.key, fixtureIds.discoveries.panel],
  discoveryRequirements: [
    {
      id: fixtureIds.discoveries.panel,
      requiredInteractionIds: [fixtureIds.interactions.memory],
      requiredFactIds: [fixtureIds.facts.memoryReturn],
    },
  ],
  completionRequiredFactIds: [fixtureIds.facts.panelTruth],
  interactions,
};

/** Fixture story that keeps an official record alongside the prose. */
export const recordFixtureExperience: ExperienceDefinition = {
  id: fixtureIds.experience,
  title: 'Fixture Story',
  story: recordStory,
  frame: { id: 'book' },
  startMessage:
    'Play Fixture Story with me through this page. I look around the study before answering the voice.',
  agentContract: {
    version: fixtureIds.contract,
    instructions:
      'Write in close second person and submit recordProse with the same events rewritten as an official record about the subject. Keep every scene inside the study until the final authored fact opens the wall. An interaction receipt is already visible prose; begin after it.',
  },
};

function withoutRecordLayer(story: StoryDefinition): StoryDefinition {
  const prologue = { ...story.prologue };
  delete prologue.recordProse;
  const completionPassage = { ...story.completionPassage };
  delete completionPassage.recordProse;
  return {
    ...story,
    id: 'fixture-story-prose-v1',
    narration: 'prose',
    prologue,
    completionPassage,
    interactions: story.interactions.map((interaction) => ({
      ...interaction,
      sealedFacts: interaction.sealedFacts.map((fact) => {
        const plain = { ...fact };
        delete plain.recordValue;
        return plain;
      }),
    })),
  };
}

/** The same story with no official record: prose only. */
export const fixtureExperience: ExperienceDefinition = {
  ...recordFixtureExperience,
  id: 'fixture-story-prose',
  title: 'Prose Fixture Story',
  story: withoutRecordLayer(recordStory),
  agentContract: {
    version: 'fixture-prose-agent-v1',
    instructions:
      'Write in close second person. Keep every scene inside the study until the final authored fact opens the wall. An interaction receipt is already visible prose; begin after it.',
  },
};
