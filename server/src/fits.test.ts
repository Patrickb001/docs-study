// Which exercise types the screen offers for a concept.
import { describe, expect, test } from 'vitest';
import { fitsOf, storedFits } from './store.ts';

describe('storedFits', () => {
  test('keeps what Claude said, in a fixed order, with the exercise it wrote added', () => {
    expect(storedFits(['order', 'bug'], 'apply')).toBe('code,apply,order');
  });
  test('turns the names Claude uses into the stored names, and drops names it does not know', () => {
    expect(storedFits(['bug', 'design', 'poem'], null)).toBe('code,design');
  });
  test('is empty when Claude did not say, even if an exercise was written', () => {
    expect(storedFits(undefined, 'apply')).toBe('');
    expect(storedFits([], 'apply')).toBe('');
    expect(storedFits(['poem'], 'apply')).toBe('');
  });
});

describe('fitsOf', () => {
  test('uses the saved list', () => {
    expect(fitsOf({ fits: 'code,order', exerciseKind: 'order', hasCode: false })).toEqual(['code', 'order']);
  });
  test('without a saved list, offers apply and order, and bug hunt when the page has code', () => {
    expect(fitsOf({ fits: '', exerciseKind: 'none', hasCode: false })).toEqual(['apply', 'order']);
    expect(fitsOf({ fits: '', exerciseKind: 'none', hasCode: true })).toEqual(['code', 'apply', 'order']);
  });
  test('without a saved list, also offers the kind the concept already has, such as a design fix', () => {
    expect(fitsOf({ fits: '', exerciseKind: 'design', hasCode: false })).toEqual(['apply', 'order', 'design']);
  });
});
