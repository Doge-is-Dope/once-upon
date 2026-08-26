import type { QuestionDraft } from './contracts';

export interface QuestionIssue { path: string; code: string; message: string }

const urlPattern = /(?:https?:\/\/|www\.)/i;
const markupPattern = /<[^>]*>|[\[\]*_`~]|^\s*[#>+-]\s/;
const controlPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function normalizeQuestionText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function validateQuestionDrafts(
  questions: QuestionDraft[],
  expectedCount: number,
  expectedOptions: 3 | 4,
  existingPrompts: string[] = [],
): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  if (questions.length !== expectedCount) {
    issues.push({ path: 'questions', code: 'count', message: `Expected exactly ${expectedCount} question${expectedCount === 1 ? '' : 's'}.` });
  }

  const known = new Set(existingPrompts.map((value) => normalizeQuestionText(value).toLocaleLowerCase('en')));
  questions.forEach((question, questionIndex) => {
    const promptPath = `questions.${questionIndex}.prompt`;
    const prompt = normalizeQuestionText(question.prompt);
    if (prompt.length < 8 || prompt.length > 120) {
      issues.push({ path: promptPath, code: 'length', message: 'Prompt must be 8–120 characters.' });
    }
    if (question.prompt.includes('\n') || question.prompt.includes('\r')) {
      issues.push({ path: promptPath, code: 'single_line', message: 'Prompt must be one line.' });
    }
    if (urlPattern.test(prompt) || markupPattern.test(prompt) || controlPattern.test(prompt)) {
      issues.push({ path: promptPath, code: 'plain_text', message: 'Prompt must be plain text without URLs or markup.' });
    }
    const normalizedPrompt = prompt.toLocaleLowerCase('en');
    if (known.has(normalizedPrompt)) {
      issues.push({ path: promptPath, code: 'duplicate', message: 'Prompt must be unique in this game.' });
    }
    known.add(normalizedPrompt);

    if (question.options.length !== expectedOptions) {
      issues.push({ path: `questions.${questionIndex}.options`, code: 'count', message: `Expected exactly ${expectedOptions} options.` });
    }
    const options = new Set<string>();
    question.options.forEach((rawOption, optionIndex) => {
      const path = `questions.${questionIndex}.options.${optionIndex}`;
      const option = normalizeQuestionText(rawOption);
      if (option.length < 1 || option.length > 48) {
        issues.push({ path, code: 'length', message: 'Option must be 1–48 characters.' });
      }
      if (rawOption.includes('\n') || rawOption.includes('\r') || urlPattern.test(option) || markupPattern.test(option) || controlPattern.test(option)) {
        issues.push({ path, code: 'plain_text', message: 'Option must be single-line plain text.' });
      }
      const normalized = option.toLocaleLowerCase('en');
      if (options.has(normalized)) issues.push({ path, code: 'duplicate', message: 'Options must be unique.' });
      options.add(normalized);
    });
  });
  return issues;
}
