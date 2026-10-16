// How many concepts a page is asked to yield, and how many a reply may hold.
import { describe, expect, test } from 'vitest';
import { SAMPLE } from '../seed/sample.ts';
import { applyGradeRequest, applyRequest, bugRequest, bugWordsRequest, conceptRange, exerciseRequest, orderRequest, pageRequest, readApplyGradeReply, readApplyReply, readBugWordsReply, readExerciseReply, readOrderReply, readPageReply } from './prompt.ts';

describe('conceptRange', () => {
  test.each([
    [0, 1, 3],
    [1249, 1, 3],
    [1750, 1, 4],
    [2500, 2, 5],
    [3799, 5, 8],
    [50_000, 5, 8],
  ])('a page of %i words is asked for %i to %i concepts', (words, fewest, most) => {
    expect(conceptRange(words)).toEqual({ fewest, most });
  });
});

describe('pageRequest', () => {
  const page = (words: number) => ({ id: 1, title: 'A page', text: 'study '.repeat(words).trim() });

  test('asks a short page for 1 to 3 concepts, with no limit on exercises', () => {
    const { user } = pageRequest(page(800));
    expect(user).toContain('Find the 1 to 3 main concepts this page teaches.');
    expect(user).not.toContain('to at most 3 of them');
  });

  test('asks a long page for more concepts, and for a bug or a design on only some of them, because those are long', () => {
    const { user } = pageRequest(page(3800));
    expect(user).toContain('Find the 5 to 8 main concepts this page teaches.');
    expect(user).toContain('give a bug or a design to at most 5 of them');
    expect(user).toContain('An order or an apply exercise is short, so it can go on any concept.');
  });
});

describe('readPageReply', () => {
  const reply = (concepts: number) => JSON.stringify({
    concepts: Array.from({ length: concepts }, (_, i) => ({ name: `Idea ${i + 1}`, summary: 'Two sentences. Both are short.', questions: SAMPLE[0].questions, bug: null, design: null })),
  });

  test('accepts up to 8 concepts and refuses 9', () => {
    expect(readPageReply(reply(8)).ok).toBe(true);
    expect(readPageReply(reply(9)).ok).toBe(false);
  });
});

const page = { id: 7, title: 'Habits', text: 'Willpower runs out. ' + 'study '.repeat(200) };
const concept = { name: 'Worst-Day Rule', summary: 'A routine counts only if you can do it on your worst day.' };
const apply = {
  scenario: 'Your commute just doubled.', task: 'Redesign your study routine so it works on your worst day.',
  rubric: ['Plans for the worst day', 'Swaps a high-effort step for a low-effort one', 'Avoids the new obstacle'],
  modelAnswer: 'Study before work and do one minute on bad days.', hints: ['One.', 'Two.', 'Three.'],
};
const order = { instruction: 'Put the audit steps in order.', steps: ['List failures', 'List obstacles', 'Note reactions', 'Write rules'], note: 'Each step feeds the next.', hints: ['One.', 'Two.', 'Three.'] };

describe('the page request, for exercises beyond bugs and designs', () => {
  const { user } = pageRequest(page);

  test('tells Claude when to write an order or an apply exercise, and what each looks like', () => {
    expect(user).toContain('an "order", only when the page gives a clear sequence of 3 to 7 steps');
    expect(user).toContain('an "apply"');
    expect(user).toContain('"rubric"');
    expect(user).toContain('"steps"');
    expect(user).toContain('"apply":apply or null,"order":order or null');
  });

  test('still says at most one exercise per concept', () => {
    expect(user).toContain('at most one hands-on exercise');
  });
});

describe('reading a page reply with the new exercises', () => {
  const concept1 = { name: 'A', summary: 'Two sentences. Both short.', questions: SAMPLE[0].questions };

  test('passes an apply and an order exercise on to be checked, and gives null when they are missing', () => {
    const read = readPageReply(JSON.stringify({ concepts: [{ ...concept1, bug: null, design: null, apply, order: null }, concept1] }));
    if (!read.ok) throw new Error(read.reason);
    expect(read.value.concepts[0].apply).toEqual(apply);
    expect(read.value.concepts[0].order).toBeNull();
    expect(read.value.concepts[1].apply).toBeNull();
    expect(read.value.concepts[1].order).toBeNull();
  });
});

describe('the exercise requests', () => {
  test.each([
    ['applyRequest', applyRequest(page, concept, ['An earlier scenario about traffic']), 'apply-7'],
    ['orderRequest', orderRequest(page, concept, ['An earlier ordering of the audit']), 'order-7'],
  ])('%s names the concept, the page, and what not to repeat', (_name, request, id) => {
    expect(request.id).toBe(id);
    expect(request.user).toContain('Worst-Day Rule');
    expect(request.user).toContain('<page title="Habits">');
    expect(request.user).toMatch(/Do not repeat these earlier (scenarios|orderings):\n- An earlier/);
  });

  test('exerciseRequest asks for whichever kind fits, and for no more than one', () => {
    const request = exerciseRequest(page, concept);
    expect(request.id).toBe('exercise-7');
    expect(request.user).toContain('Write at most one hands-on exercise for this concept');
    expect(request.user).toContain('{"bug":bug or null,"design":design or null,"apply":apply or null,"order":order or null}');
  });
});

describe('reading an exercise reply', () => {
  test('readApplyReply gives null for null, the exercise when it is complete, and a reason when it is not', () => {
    expect(readApplyReply(JSON.stringify({ apply: null }))).toEqual({ ok: true, apply: null });
    expect(readApplyReply(JSON.stringify({ apply }))).toEqual({ ok: true, apply: { ...apply } });
    const bad = readApplyReply(JSON.stringify({ apply: { ...apply, rubric: ['only one'] } }));
    expect(bad.ok).toBe(false);
  });

  test('readOrderReply gives null for null, a shuffled exercise when it is complete, and a reason when it is not', () => {
    expect(readOrderReply(JSON.stringify({ order: null }))).toEqual({ ok: true, order: null });
    const good = readOrderReply(JSON.stringify({ order }));
    if (!good.ok || !good.order) throw new Error('expected an order exercise');
    expect(good.order.order.map((i) => good.order!.steps[i])).toEqual(order.steps);
    expect(readOrderReply(JSON.stringify({ order: { ...order, steps: ['only', 'two'] } })).ok).toBe(false);
  });

  test('readExerciseReply keeps each kind that is there and gives null for the rest', () => {
    const read = readExerciseReply(JSON.stringify({ apply }));
    if (!read.ok) throw new Error(read.reason);
    expect(read.value.apply).toEqual(apply);
    expect(read.value.bug).toBeNull();
    expect(read.value.design).toBeNull();
    expect(read.value.order).toBeNull();
  });
});

describe('marking an apply answer', () => {
  const request = applyGradeRequest({ id: 9, scenario: apply.scenario, task: apply.task, rubric: apply.rubric }, 'I would study before work.');

  test('the grader is shown the situation, the task, the numbered checklist, and the answer, but not the page', () => {
    expect(request.id).toBe('apply-grade-9');
    expect(request.user).toContain('Your commute just doubled.');
    expect(request.user).toContain('Redesign your study routine so it works on your worst day.');
    expect(request.user).toContain('1. Plans for the worst day');
    expect(request.user).toContain('3. Avoids the new obstacle');
    expect(request.user).toContain('I would study before work.');
    expect(request.user).not.toContain('<page');
  });

  test('readApplyGradeReply wants one mark for every checklist point, and no more or fewer', () => {
    const marks = (n: number) => JSON.stringify({ points: Array.from({ length: n }, (_, i) => ({ covered: i === 0, comment: `Note ${i + 1}.` })), summary: 'A fair start.' });
    const three = readApplyGradeReply(marks(3), 3);
    if (!three.ok) throw new Error(three.reason);
    expect(three.value.points.map((p) => p.covered)).toEqual([true, false, false]);
    expect(readApplyGradeReply(marks(2), 3).ok).toBe(false);
    expect(readApplyGradeReply(marks(4), 3).ok).toBe(false);
  });
});

describe('bug hunts on plain JavaScript', () => {
  const { user } = pageRequest(page);

  test('the bug shape offers both kinds, and says to write the bug in JavaScript when the page uses another language', () => {
    expect(user).toContain('"runtime":"js" or "react"');
    expect(user).toContain('plain JavaScript module with no imports');
    expect(user).toContain("import { reverseList } from './solution.js';");
    expect(user).toContain('write the bug in JavaScript');
    expect(user).toContain('A mistake that makes the code loop forever is fine');
  });

  test('prefers a bug for a concept with code, but does not insist', () => {
    expect(user).toContain('Prefer a "bug" over an "apply" or an "order" exercise for a concept with code like this');
    expect(user).toContain('Pick the one that fits best');
  });

  test('the description must come from following the broken code, and the hints must be true of it', () => {
    expect(user).toContain('follow the broken code by hand through one input from the tests');
    expect(user).toContain('The hints must be true of what the broken code really does');
  });

  test('a request for a single bug uses the same shape', () => {
    expect(bugRequest(page, concept, []).user).toContain('"runtime":"js" or "react"');
  });

  test('asks which exercise types suit each concept', () => {
    expect(user).toContain('"fits"');
    expect(user).toContain('"order":order or null,"fits":[');
  });
});

describe('reading a page reply with runtime and fits', () => {
  const base = { name: 'A', summary: 'Two sentences. Both short.', questions: SAMPLE[0].questions, design: null, apply: null, order: null };
  const bug = (extra: object) => ({ description: 'It breaks.', workingCode: 'export const a = 1;', brokenCode: 'export const a = 2;', tests: "import { a } from './solution.js';", hints: ['One.', 'Two.', 'Three.'], ...extra });

  test('keeps the runtime of a bug, and treats an unknown one as not said', () => {
    const read = readPageReply(JSON.stringify({ concepts: [{ ...base, bug: bug({ runtime: 'js' }) }, { ...base, bug: bug({ runtime: 'python' }) }, { ...base, bug: bug({}) }] }));
    if (!read.ok) throw new Error(read.reason);
    expect(read.value.concepts.map((c) => c.bug?.runtime)).toEqual(['js', undefined, undefined]);
  });

  test('keeps fits as written, and gives none when it is missing or is not a list', () => {
    const read = readPageReply(JSON.stringify({ concepts: [{ ...base, bug: null, fits: ['bug', 'apply'] }, { ...base, bug: null }, { ...base, bug: null, fits: 'apply' }] }));
    if (!read.ok) throw new Error(read.reason);
    expect(read.value.concepts.map((c) => c.fits ?? [])).toEqual([['bug', 'apply'], [], []]);
  });
});

describe('a page that was studied before', () => {
  const studied = { id: 1, title: 'A page', text: 'study '.repeat(800).trim() };

  test('lists the concepts that exist, and asks for the same names, so progress is kept', () => {
    const { user } = pageRequest(studied, ['Dummy head node', 'kth from end']);
    expect(user).toContain('These concepts already exist for this page: "Dummy head node", "kth from end".');
    expect(user).toContain('use exactly the same name');
  });

  test('says nothing about it for a page that is new', () => {
    expect(pageRequest(studied).user).not.toContain('already exist');
    expect(pageRequest(studied, []).user).not.toContain('already exist');
  });
});

describe('rewording a bug from what really happens', () => {
  const bug = { runtime: 'js' as const, description: 'Old.', workingCode: 'export const a = 1;', brokenCode: 'export const a = 2;', tests: "import { a } from './solution.js';\ntest('a is one', () => { expect(a).toBe(1); });", hints: ['One.', 'Two.', 'Three.'] };
  const real = (extra: object = {}) => ({ ran: true, allPass: false, error: '', timedOut: false, tests: [{ name: 'a is one', pass: false, message: 'expected 2 to be 1' }, { name: 'a exists', pass: true, message: '' }], ...extra });

  test('gives Claude both versions of the code, the tests, and the real result of each test', () => {
    const r = bugWordsRequest(7, bug, real());
    expect(r.id).toBe('bugwords-7');
    expect(r.user).toContain('export const a = 1;');
    expect(r.user).toContain('export const a = 2;');
    expect(r.user).toContain("test('a is one'");
    expect(r.user).toContain('- "a is one" fails: expected 2 to be 1');
    expect(r.user).toContain('- "a exists" passes');
  });

  test('keeps the words short, and hint 1 does not name the cause', () => {
    const { user } = bugWordsRequest(7, bug, real());
    expect(user).toContain('"description" is 2 to 4 sentences');
    expect(user).toContain('Hint 1 only points at where to look and does not name the cause');
    expect(user).toContain('Each hint is one or two sentences');
  });

  test('says when the broken code never finishes', () => {
    const r = bugWordsRequest(7, bug, real({ ran: false, timedOut: true, tests: [] }));
    expect(r.user).toContain('The broken code never finishes. The check was stopped after 12 seconds.');
  });

  test('asks for words that are true of the results, written once, in the same shape', () => {
    const { user } = bugWordsRequest(7, bug, real());
    expect(user).toContain('everything in them is true of what really happens');
    expect(user).toContain('Leave out corrections and second thoughts');
    expect(user).toContain('{"description":string,"hints":[3 strings]}');
  });

  test('reads a good reply, and refuses an empty description or the wrong number of hints', () => {
    expect(readBugWordsReply(JSON.stringify({ description: 'It fails.', hints: ['a', 'b', 'c'] }))).toEqual({ ok: true, value: { description: 'It fails.', hints: ['a', 'b', 'c'] } });
    expect(readBugWordsReply(JSON.stringify({ description: ' ', hints: ['a', 'b', 'c'] })).ok).toBe(false);
    expect(readBugWordsReply(JSON.stringify({ description: 'It fails.', hints: ['a', 'b'] })).ok).toBe(false);
    expect(readBugWordsReply('no json here').ok).toBe(false);
  });
});
