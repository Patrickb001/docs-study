import { describe, expect, test } from 'vitest';
import { nextGap } from './review.ts';
import { gradeSimple, passMark, quizPassed } from './quiz.ts';
import { nextConcept, statuses, withoutLoops, type ConceptFacts } from './status.ts';

const concept = (id: number, over: Partial<ConceptFacts> = {}): ConceptFacts => ({
  id, position: id, triedQuiz: false, passedQuiz: false, hasBug: true, fixedBug: false, slipping: false, ...over,
});
const solid = { triedQuiz: true, passedQuiz: true, fixedBug: true };

describe('review dates', () => {
  test('a first answer starts at 1 day', () => expect(nextGap(null, true)).toBe(1));
  test('right answers climb 1, 3, 7, 14, 30', () => {
    expect([1, 3, 7, 14].map((g) => nextGap(g, true))).toEqual([3, 7, 14, 30]);
  });
  test('30 days is the longest gap', () => expect(nextGap(30, true)).toBe(30));
  test('a miss goes back to 1 day', () => expect(nextGap(14, false)).toBe(1));
});

describe('quizzes', () => {
  test('5 questions need 4 right', () => expect(passMark(5)).toBe(4));
  test('3 questions need 3 right', () => expect(passMark(3)).toBe(3));
  test('an empty quiz cannot be passed', () => expect(quizPassed(0, 0)).toBe(false));
  test('multiple choice compares the option number', () => {
    expect(gradeSimple('choice', '1', '1')).toBe(true);
    expect(gradeSimple('choice', '1', '2')).toBe(false);
  });
  test('code output ignores case, spacing, and quotes', () => {
    expect(gradeSimple('output', 'Hello  World', ' "hello world" ')).toBe(true);
    expect(gradeSimple('output', '6', '5')).toBe(false);
  });
});

describe('concept status', () => {
  test('a concept is locked until what it depends on is solid', () => {
    const s = statuses([concept(1), concept(2)], [{ firstId: 1, thenId: 2 }]);
    expect(s.get(1)).toBe('fresh');
    expect(s.get(2)).toBe('locked');
  });
  test('it unlocks when the earlier concept turns solid', () => {
    const s = statuses([concept(1, solid), concept(2)], [{ firstId: 1, thenId: 2 }]);
    expect(s.get(1)).toBe('solid');
    expect(s.get(2)).toBe('fresh');
  });
  test('passing the quiz without fixing the bug is learning', () => {
    const s = statuses([concept(1, { triedQuiz: true, passedQuiz: true })], []);
    expect(s.get(1)).toBe('learning');
  });
  test('a concept with no bug needs only the quiz', () => {
    const s = statuses([concept(1, { triedQuiz: true, passedQuiz: true, hasBug: false })], []);
    expect(s.get(1)).toBe('solid');
  });
  test('two review misses in a row drop a solid concept back to learning', () => {
    const s = statuses([concept(1, { ...solid, slipping: true })], []);
    expect(s.get(1)).toBe('learning');
  });
});

describe('suggested next concept', () => {
  test('something you are learning comes before something new', () => {
    const list = [concept(1), concept(2, { triedQuiz: true })];
    expect(nextConcept(list, statuses(list, []))).toBe(2);
  });
  test('otherwise it is the first unlocked concept in page order', () => {
    const list = [concept(1, solid), concept(2), concept(3)];
    expect(nextConcept(list, statuses(list, [{ firstId: 2, thenId: 3 }]))).toBe(2);
  });
  test('there is none when everything is solid', () => {
    const list = [concept(1, solid)];
    expect(nextConcept(list, statuses(list, []))).toBe(null);
  });
});

describe('concept links', () => {
  test('a link that would make a loop is removed', () => {
    const links = withoutLoops([{ firstId: 1, thenId: 2 }, { firstId: 2, thenId: 3 }, { firstId: 3, thenId: 1 }]);
    expect(links).toEqual([{ firstId: 1, thenId: 2 }, { firstId: 2, thenId: 3 }]);
  });
  test('repeats and self-links are removed', () => {
    expect(withoutLoops([{ firstId: 1, thenId: 1 }, { firstId: 1, thenId: 2 }, { firstId: 1, thenId: 2 }])).toEqual([{ firstId: 1, thenId: 2 }]);
  });
});
