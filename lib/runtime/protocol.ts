export const CORE_TOOL_NAMES = {
  getState: 'get_story_state',
  beginTurn: 'begin_story_turn',
  commitChapter: 'commit_story_chapter',
} as const;

export const LIVING_MANUSCRIPT_PROTOCOL_VERSION =
  'living-manuscript-v2' as const;

export const RUNTIME_LIMITS = {
  operationIdMinLength: 6,
  idMaxLength: 160,
  chapterTitleMaxLength: 80,
  chapterTextMaxLength: 20_000,
  chapterWordsMax: 500,
  chapterParagraphsMax: 3,
  summaryMaxLength: 700,
  choiceMaxLength: 500,
  ledgerRecordsMax: 60,
} as const;
