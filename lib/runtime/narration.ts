import type { NarrationContract, NarrationPayload } from './types';

// Single source for the payload bounds shared by each contract's JSON schema
// and its normalize() validator.
const PROSE_TEXT_BOUNDS = { minLength: 80, maxLength: 700 } as const;
const TERMINAL_BOUNDS = {
  minLines: 1,
  maxLines: 60,
  maxLineLength: 280,
} as const;

const proseSchema = {
  type: 'object',
  properties: {
    format: { type: 'string', const: 'prose' },
    text: {
      type: 'string',
      minLength: PROSE_TEXT_BOUNDS.minLength,
      maxLength: PROSE_TEXT_BOUNDS.maxLength,
      description:
        'One natural 35–60 word paragraph grounded only in the saved facts.',
    },
  },
  required: ['format', 'text'],
  additionalProperties: false,
};

const terminalSchema = {
  type: 'object',
  properties: {
    format: { type: 'string', const: 'terminal' },
    lines: {
      type: 'array',
      minItems: TERMINAL_BOUNDS.minLines,
      maxItems: TERMINAL_BOUNDS.maxLines,
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['command', 'output', 'system'],
          },
          text: {
            type: 'string',
            minLength: 1,
            maxLength: TERMINAL_BOUNDS.maxLineLength,
          },
        },
        required: ['kind', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['format', 'lines'],
  additionalProperties: false,
};

export const PROSE_NARRATION_CONTRACT: NarrationContract = {
  format: 'prose',
  inputSchema: proseSchema,
  instruction:
    'Write one natural 35–60 word paragraph grounded only in the saved facts.',
  normalize(payload) {
    if (payload.format !== 'prose' || typeof payload.text !== 'string')
      return null;
    const text = plainText(payload.text);
    if (
      text.length < PROSE_TEXT_BOUNDS.minLength ||
      text.length > PROSE_TEXT_BOUNDS.maxLength
    )
      return null;
    return { format: 'prose', text };
  },
};

export const TERMINAL_NARRATION_CONTRACT: NarrationContract = {
  format: 'terminal',
  inputSchema: terminalSchema,
  instruction:
    'Return one or more concise terminal lines grounded only in the saved facts.',
  normalize(payload) {
    if (payload.format !== 'terminal' || !Array.isArray(payload.lines))
      return null;
    if (
      payload.lines.length < TERMINAL_BOUNDS.minLines ||
      payload.lines.length > TERMINAL_BOUNDS.maxLines
    )
      return null;
    if (
      payload.lines.some(
        (line) =>
          !line ||
          !['command', 'output', 'system'].includes(line.kind) ||
          typeof line.text !== 'string',
      )
    )
      return null;
    const lines = payload.lines.map((line) => ({
      kind: line.kind,
      text: plainText(line.text),
    }));
    if (
      lines.some(
        (line) =>
          !line.text || line.text.length > TERMINAL_BOUNDS.maxLineLength,
      )
    )
      return null;
    return { format: 'terminal', lines };
  },
};

export function isNarrationPayload(value: unknown): value is NarrationPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<NarrationPayload>;
  if (payload.format === 'prose')
    return typeof (payload as { text?: unknown }).text === 'string';
  if (payload.format !== 'terminal') return false;
  const lines = (payload as { lines?: unknown }).lines;
  return (
    Array.isArray(lines) &&
    lines.every(
      (line) =>
        line &&
        typeof line === 'object' &&
        ['command', 'output', 'system'].includes(
          String((line as { kind?: unknown }).kind),
        ) &&
        typeof (line as { text?: unknown }).text === 'string',
    )
  );
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
