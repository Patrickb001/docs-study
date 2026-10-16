// The two exercises for general topics: Apply it, and ordering the steps of a process.
import { describe, expect, test } from 'vitest';
import { applyOutcome, checkOrder, verifyApply, verifyOrder } from './exercises.ts';

const apply = {
  scenario: 'Your commute just doubled, and the two hours you set aside to study each evening no longer fit.',
  task: 'Redesign your study routine so that it still works on your worst day.',
  rubric: ['Plans for the worst day, not the best day', 'Replaces a high-effort step with a low-effort one', 'Moves study to a time that avoids the new obstacle'],
  modelAnswer: 'Study for 30 minutes before work, when traffic cannot get in the way. On the worst day, do just one minute.',
  hints: ['Think about your lowest-energy day.', 'What step needs the most willpower?', 'Move the study block to a time the commute cannot touch.'],
};
const order = {
  instruction: 'Put the four steps of a failure audit in order.',
  steps: ['List every past attempt you gave up on', 'Write down the outside obstacles you hit', 'Note how you reacted to each obstacle', 'Turn the patterns into rules the new system must follow'],
  note: 'Each step feeds the next: you cannot spot patterns before you have the list of failures and reactions.',
  hints: ['Start with the raw facts.', 'Obstacles come before reactions.', 'Rules come last.'],
};

describe('verifyApply', () => {
  test('keeps a complete exercise as it is', () => {
    expect(verifyApply(apply)).toEqual({ ok: true, apply });
  });

  test.each([
    ['a checklist of 2 points', { ...apply, rubric: apply.rubric.slice(0, 2) }],
    ['a checklist of 6 points', { ...apply, rubric: [...apply.rubric, 'd', 'e', 'f'] }],
    ['2 hints', { ...apply, hints: apply.hints.slice(0, 2) }],
    ['no task', { ...apply, task: '' }],
    ['no model answer', { ...apply, modelAnswer: '  ' }],
    ['a blank checklist point', { ...apply, rubric: [apply.rubric[0], apply.rubric[1], ' '] }],
  ])('refuses %s', (_name, raw) => {
    expect(verifyApply(raw).ok).toBe(false);
  });

  test('accepts 3 to 5 checklist points', () => {
    for (const n of [3, 4, 5]) expect(verifyApply({ ...apply, rubric: Array.from({ length: n }, (_, i) => `Point ${i + 1}`) }).ok).toBe(true);
  });
});

describe('verifyOrder', () => {
  const read = (raw: unknown, rng?: () => number) => {
    const r = verifyOrder(raw, rng);
    if (!r.ok) throw new Error(r.reason);
    return r.order;
  };

  test('shuffles the steps, and reading them in the saved order gives the right sequence back', () => {
    const o = read(order, () => 0.3);
    expect([...o.steps].sort()).toEqual([...order.steps].sort());
    expect(o.order.map((i) => o.steps[i])).toEqual(order.steps);
    expect(o.note).toBe(order.note);
  });

  test('never hands back the steps already in the right order, whatever the shuffle does', () => {
    for (const roll of [0, 0.5, 0.999]) {
      const o = read(order, () => roll);
      expect(o.steps).not.toEqual(order.steps);
    }
  });

  test.each([
    ['2 steps', { ...order, steps: order.steps.slice(0, 2) }],
    ['8 steps', { ...order, steps: Array.from({ length: 8 }, (_, i) => `Step ${i + 1}`) }],
    ['the same step twice, in different capitals', { ...order, steps: ['Plan it', 'Do it', 'plan IT '] }],
    ['a blank step', { ...order, steps: ['Plan it', ' ', 'Do it'] }],
    ['no note', { ...order, note: '' }],
    ['4 hints', { ...order, hints: [...order.hints, 'More.'] }],
  ])('refuses %s', (_name, raw) => {
    expect(verifyOrder(raw).ok).toBe(false);
  });

  test('accepts 3 and 7 steps', () => {
    for (const n of [3, 7]) expect(verifyOrder({ ...order, steps: Array.from({ length: n }, (_, i) => `Step ${i + 1}`) }).ok).toBe(true);
  });
});

describe('checkOrder', () => {
  // The right sequence is shuffled position 2, then 0, then 3, then 1.
  const right = [2, 0, 3, 1];

  test('every step in place is solved', () => {
    expect(checkOrder(right, [2, 0, 3, 1])).toEqual({ placed: [true, true, true, true], correctCount: 4, solved: true });
  });

  test('marks which steps are in the right place', () => {
    expect(checkOrder(right, [2, 3, 0, 1])).toEqual({ placed: [true, false, false, true], correctCount: 2, solved: false });
  });

  test.each([
    ['a step missing', [2, 0, 3]],
    ['a step twice', [2, 2, 3, 1]],
    ['a step that does not exist', [2, 0, 3, 4]],
    ['a step that is not a whole number', [2, 0, 3, 1.5]],
  ])('refuses %s', (_name, submitted) => {
    expect(checkOrder(right, submitted)).toBeNull();
  });
});

describe('applyOutcome', () => {
  test.each([
    [[true, true, false], 2, true],
    [[true, false, false], 2, false],
    [[true, true, true, false], 3, true],
    [[true, true, false, false], 3, false],
    [[true, true, true, true, false], 4, true],
    [[true, true, true, false, false], 4, false],
  ])('%j covers %i points needed: passes is %s', (points, needed, solved) => {
    expect(applyOutcome(points)).toEqual({ covered: points.filter(Boolean).length, needed, solved });
  });
});
