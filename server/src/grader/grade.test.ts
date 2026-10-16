// Grading one answer. A choice is compared. An output answer in different words is judged by the AI grader. A written answer always is.
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { now, run } from '../db.ts';
import { useClaude, type Claude, type ClaudeRequest } from '../generator/claude.ts';
import { grade } from './grade.ts';

let sent: ClaudeRequest[] = [];
const grader = (verdict: { correct: boolean; feedback: string } | 'unreachable'): Claude => ({
  async send(request) {
    sent.push(request);
    if (verdict === 'unreachable') return { id: request.id, ok: false, text: '', tokensIn: 0, tokensOut: 0, error: 'offline' };
    return { id: request.id, ok: true, text: JSON.stringify(verdict), tokensIn: 300, tokensOut: 40, error: '' };
  },
  async createBatch() { throw new Error('not used'); },
  async batchDone() { return true; },
  async batchResults() { return []; },
});

let conceptId = 0;
beforeAll(() => {
  const libraryId = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Grading', '', 'files', now());
  const pageId = run('INSERT INTO page (library_id, url, title, text, fingerprint, position) VALUES (?, ?, ?, ?, ?, ?)', libraryId, 'file:notes.md', 'Notes', 'PAGE-TEXT-MARKER willpower plans break down under stress.', 'fp', 0);
  conceptId = run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', libraryId, pageId, 'Systems', 'Systems beat willpower.', 0);
});
afterEach(() => { useClaude(null); sent = []; });

const output = () => ({
  id: 1, concept_id: conceptId, type: 'output', prompt: 'According to the page, what happens to this willpower-based plan?',
  code: 'Plan: study 2h each evening / Day: heavy traffic and exhaustion', answer: 'It breaks down',
  explanation: 'The page says willpower-based plans suffer catastrophic breakdown under stressors.',
});
const written = () => ({ ...output(), id: 2, type: 'written', code: '', answer: '', prompt: 'Why does the page prefer short daily sessions?' });
const choice = () => ({ ...output(), id: 3, type: 'choice', code: '', answer: '1', prompt: 'Which one?' });

describe('an output answer', () => {
  test('in different words goes to the AI grader, which sees the model answer and what the learner wrote', async () => {
    useClaude(grader({ correct: true, feedback: 'Yes, falling apart is the same as breaking down.' }));
    const result = await grade(output(), 'It falls apart because it depends on willpower');
    expect(result).toEqual({ correct: true, feedback: 'Yes, falling apart is the same as breaking down.', needsSelfGrade: false });
    expect(sent).toHaveLength(1);
    expect(sent[0].user).toContain('Model answer: It breaks down');
    expect(sent[0].user).toContain('It falls apart because it depends on willpower');
  });

  test('that matches exactly, apart from case and spacing, is right without asking the AI grader', async () => {
    useClaude(grader({ correct: false, feedback: 'Would have said no.' }));
    expect(await grade(output(), '  it BREAKS   down ')).toEqual({ correct: true, feedback: '', needsSelfGrade: false });
    expect(sent).toHaveLength(0);
  });

  test('that the AI grader rejects is wrong, with its feedback', async () => {
    useClaude(grader({ correct: false, feedback: 'That is a different idea.' }));
    expect(await grade(output(), 'It gets faster')).toEqual({ correct: false, feedback: 'That is a different idea.', needsSelfGrade: false });
  });

  test('about real code must match exactly, so a near miss is wrong and the AI grader is never asked', async () => {
    useClaude(grader({ correct: true, feedback: 'Close enough.' }));
    const code = { ...output(), code: "const name = 'Ada';\nconst element = <h1>Hello, {name}!</h1>;", answer: 'Hello, Ada!' };
    expect(await grade(code, 'Hello Ada')).toEqual({ correct: false, feedback: '', needsSelfGrade: false });
    expect(await grade(code, ' "hello,  ADA!" ')).toEqual({ correct: true, feedback: '', needsSelfGrade: false });
    expect(sent).toHaveLength(0);
  });

  test.each([
    'Motivation -> Work -> Completion -> ?',
    'Plan: study 2h each evening / Day: heavy traffic + exhaustion',
    '1. Identify the barrier (commute traffic) / 2. ???',
    'Order service sends an event to the queue. What happens next?',
  ])('about a flow written in words, "%s", can be right in other words', async (flow) => {
    useClaude(grader({ correct: true, feedback: 'Yes.' }));
    expect((await grade({ ...output(), code: flow }, 'It falls apart')).correct).toBe(true);
    expect(sent).toHaveLength(1);
  });

  test('is simply wrong when it does not match and no API key is set', async () => {
    expect(await grade(output(), 'It falls apart')).toEqual({ correct: false, feedback: '', needsSelfGrade: false });
  });

  test('is left for the learner to mark when the AI grader cannot be reached', async () => {
    useClaude(grader('unreachable'));
    expect(await grade(output(), 'It falls apart')).toEqual({ correct: false, feedback: '', needsSelfGrade: true });
  });

  test('is judged without the whole page, which keeps grading cheap', async () => {
    useClaude(grader({ correct: true, feedback: 'Yes.' }));
    await grade(output(), 'It falls apart');
    expect(sent[0].user).not.toContain('PAGE-TEXT-MARKER');
  });
});

describe('the other kinds of answer', () => {
  test('a written answer is still judged against the page', async () => {
    useClaude(grader({ correct: true, feedback: 'Good.' }));
    await grade(written(), 'Because they compound.');
    expect(sent[0].user).toContain('PAGE-TEXT-MARKER');
  });

  test('a choice is compared, never sent to the AI grader', async () => {
    useClaude(grader({ correct: false, feedback: 'No.' }));
    expect((await grade(choice(), '1')).correct).toBe(true);
    expect((await grade(choice(), '2')).correct).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
