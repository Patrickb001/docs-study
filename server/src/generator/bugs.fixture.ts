// One plain-JavaScript bug hunt, in the shape Claude is asked to write it. The mistake is a missing line.
const WORKING = `export function reverseList(head) {
  let prev = null;
  let cur = head;
  while (cur) {
    const next = cur.next;
    cur.next = prev;
    prev = cur;
    cur = next;
  }
  return prev;
}
`;

export const JS_BUG = {
  runtime: 'js' as const,
  description: 'reverseList should return the head of the reversed list. It returns a list with only the last node.',
  workingCode: WORKING,
  brokenCode: WORKING.replace('    cur.next = prev;\n', ''),
  // Same code, but the pointer never moves on, so the loop never ends.
  loopingCode: WORKING.replace('    cur = next;\n', ''),
  tests: `import { reverseList } from './solution.js';

const list = (...vals) => vals.reduceRight((next, val) => ({ val, next }), null);
const toArray = (node) => {
  const out = [];
  while (node) {
    out.push(node.val);
    node = node.next;
  }
  return out;
};

test('reverses a list of three', () => {
  expect(toArray(reverseList(list(1, 2, 3)))).toEqual([3, 2, 1]);
});

test('an empty list stays empty', () => {
  expect(reverseList(null)).toBe(null);
});
`,
  hints: ['Follow what happens to one node as the loop goes round.', 'The new head comes out right, but the arrows between nodes do not.', 'Each node must be pointed at the one before it: set cur.next = prev.'],
};
