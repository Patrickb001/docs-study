// Checking an answer to Apply it or to an ordering, and what each check records.
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { all, get, now, run } from '../db.ts';
import { useClaude, type Claude, type ClaudeRequest } from '../generator/claude.ts';
import { APPLY_FIXTURE, ORDER_FIXTURE } from '../generator/exercises.fixture.ts';
import { verifyOrder } from '../generator/exercises.ts';
import { addApply, addOrder } from '../store.ts';
import { checkApply, checkOrderAnswer } from './exerciseCheck.ts';

let sent: ClaudeRequest[] = [];
const marks = (covered: boolean[]) => JSON.stringify({ points: covered.map((c, i) => ({ covered: c, comment: `Comment ${i + 1}.` })), summary: 'A fair start.' });
const grader = (reply: string | 'unreachable'): Claude => ({
  async send(request) {
    sent.push(request);
    if (reply === 'unreachable') return { id: request.id, ok: false, text: '', tokensIn: 0, tokensOut: 0, error: 'offline' };
    return { id: request.id, ok: true, text: reply, tokensIn: 300, tokensOut: 80, error: '' };
  },
  async createBatch() { throw new Error('not used'); },
  async batchDone() { return true; },
  async batchResults() { return []; },
});
const answer = 'I would study for half an hour before work, when traffic cannot reach me, and on a bad day just do one minute.';
const attempts = (exerciseId: number) => all('SELECT mode, correct, hints_used FROM attempt WHERE bug_id = ? ORDER BY id', exerciseId).map((a) => [a.mode, a.correct, a.hints_used]);

let applyId = 0;
let orderId = 0;
beforeAll(() => {
  const libraryId = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Checks', '', 'files', now());
  const pageId = run('INSERT INTO page (library_id, url, title, text, fingerprint, position) VALUES (?, ?, ?, ?, ?, ?)', libraryId, 'file:h.md', 'Habits', 'PAGE-TEXT-MARKER', 'fp', 0);
  const conceptId = run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', libraryId, pageId, 'Worst day', 'Plan for the worst day.', 0);
  applyId = addApply(conceptId, APPLY_FIXTURE);
  const made = verifyOrder(ORDER_FIXTURE, () => 0.4);
  if (!made.ok) throw new Error(made.reason);
  orderId = addOrder(conceptId, made.order);
});
afterEach(() => { useClaude(null); sent = []; });

describe('checking an apply answer', () => {
  test('marks each checklist point, and an answer below two thirds is not solved and shows no model answer', async () => {
    useClaude(grader(marks([true, false, false])));
    const result = await checkApply(applyId, answer, 1);
    expect(result).toEqual({
      solved: false, covered: 1, needed: 2, summary: 'A fair start.', modelAnswer: null,
      points: [
        { text: APPLY_FIXTURE.rubric[0], covered: true, comment: 'Comment 1.' },
        { text: APPLY_FIXTURE.rubric[1], covered: false, comment: 'Comment 2.' },
        { text: APPLY_FIXTURE.rubric[2], covered: false, comment: 'Comment 3.' },
      ],
    });
  });

  test('two of three points solves it, and then the model answer is shown', async () => {
    useClaude(grader(marks([true, true, false])));
    const result = await checkApply(applyId, answer, 0);
    expect(result.solved).toBe(true);
    expect(result.modelAnswer).toBe(APPLY_FIXTURE.modelAnswer);
  });

  test('the grader is given the checklist and the answer, but never the model answer or the page', async () => {
    useClaude(grader(marks([true, true, true])));
    await checkApply(applyId, answer, 0);
    expect(sent).toHaveLength(1);
    expect(sent[0].user).toContain(APPLY_FIXTURE.rubric[1]);
    expect(sent[0].user).toContain(answer);
    expect(sent[0].user).not.toContain(APPLY_FIXTURE.modelAnswer);
    expect(sent[0].user).not.toContain('PAGE-TEXT-MARKER');
  });

  test('every check is recorded as an attempt, with the hints used', async () => {
    const before = attempts(applyId).length;
    useClaude(grader(marks([true, false, false])));
    await checkApply(applyId, answer, 2);
    useClaude(grader(marks([true, true, true])));
    await checkApply(applyId, answer, 3);
    expect(attempts(applyId).slice(before)).toEqual([['apply', 0, 2], ['apply', 1, 3]]);
  });

  test.each([
    ['an answer that is too short', 'Be nice.', 'Write a few sentences first, then check.'],
    ['an answer that is too long', 'a'.repeat(4001), 'That answer is too long to check.'],
  ])('refuses %s, without asking Claude or recording anything', async (_name, text, message) => {
    useClaude(grader(marks([true, true, true])));
    const before = attempts(applyId).length;
    await expect(checkApply(applyId, text, 0)).rejects.toThrow(message);
    expect(sent).toHaveLength(0);
    expect(attempts(applyId)).toHaveLength(before);
  });

  test('says plainly when no API key is set', async () => {
    await expect(checkApply(applyId, answer, 0)).rejects.toThrow('Only Claude can mark this exercise, and no API key is set.');
  });

  test.each([
    ['cannot be reached', 'unreachable' as const],
    ['marks the wrong number of points', marks([true, true])],
    ['sends something that is not JSON', 'Sorry, I cannot do that.'],
  ])('when the grader %s, says so and records nothing', async (_name, reply) => {
    useClaude(grader(reply));
    const before = attempts(applyId).length;
    await expect(checkApply(applyId, answer, 0)).rejects.toThrow('The answer could not be marked just now. Try again.');
    expect(attempts(applyId)).toHaveLength(before);
  });

  test('says plainly when the exercise is not an apply exercise', async () => {
    useClaude(grader(marks([true, true, true])));
    await expect(checkApply(orderId, answer, 0)).rejects.toThrow('That exercise could not be found.');
    await expect(checkApply(999999, answer, 0)).rejects.toThrow('That exercise could not be found.');
  });
});

describe('checking an order', () => {
  const shuffledSteps = () => JSON.parse(get('SELECT broken_code FROM bug WHERE id = ?', orderId)!.broken_code).steps as string[];
  // What a learner who knows the answer would send: the ids of the shuffled steps, in the right sequence.
  const rightAnswer = () => ORDER_FIXTURE.steps.map((step) => shuffledSteps().indexOf(step));

  test('a wrong order says which steps are in the right place, and gives away nothing else', () => {
    const right = rightAnswer();
    const swapped = [right[1], right[0], right[2], right[3]];
    expect(checkOrderAnswer(orderId, swapped, 1)).toEqual({ solved: false, placed: [false, false, true, true], correctCount: 2, total: 4, note: null });
  });

  test('the right order is solved, and then shows why the order matters', () => {
    expect(checkOrderAnswer(orderId, rightAnswer(), 0)).toEqual({ solved: true, placed: [true, true, true, true], correctCount: 4, total: 4, note: ORDER_FIXTURE.note });
  });

  test('every check is recorded as an attempt, with the hints used', () => {
    const before = attempts(orderId).length;
    const right = rightAnswer();
    checkOrderAnswer(orderId, [right[1], right[0], right[2], right[3]], 2);
    checkOrderAnswer(orderId, right, 3);
    expect(attempts(orderId).slice(before)).toEqual([['order', 0, 2], ['order', 1, 3]]);
  });

  test('refuses what is not an order of these steps, and records nothing', () => {
    const before = attempts(orderId).length;
    expect(() => checkOrderAnswer(orderId, [0, 0, 1, 2], 0)).toThrow('That order could not be checked.');
    expect(() => checkOrderAnswer(orderId, [0, 1, 2], 0)).toThrow('That order could not be checked.');
    expect(attempts(orderId)).toHaveLength(before);
  });

  test('says plainly when the exercise is not an ordering', () => {
    expect(() => checkOrderAnswer(applyId, [0, 1, 2, 3], 0)).toThrow('That exercise could not be found.');
  });
});
