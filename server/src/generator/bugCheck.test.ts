// Runs real tests in a separate process, so these take a few seconds each.
import { describe, expect, test } from 'vitest';
import { JS_BUG } from './bugs.fixture.ts';
import { runtimeOf, runTests, verifyBug } from './bugCheck.ts';

describe('runtimeOf', () => {
  test('uses what the bug says, and otherwise guesses from the tests', () => {
    expect(runtimeOf({ runtime: 'js', tests: "import { render } from '@testing-library/react';" })).toBe('js');
    expect(runtimeOf({ tests: "import { render } from '@testing-library/react';" })).toBe('react');
    expect(runtimeOf({ tests: "import { reverseList } from './solution.js';" })).toBe('js');
  });
});

describe('running plain JavaScript', () => {
  test('working code passes every test', async () => {
    const r = await runTests(JS_BUG.workingCode, JS_BUG.tests, 'js');
    expect(r).toMatchObject({ ran: true, allPass: true, timedOut: false });
    expect(r.tests.map((t) => t.name)).toEqual(['reverses a list of three', 'an empty list stays empty']);
  });

  test('broken code fails a test, and says why', async () => {
    const r = await runTests(JS_BUG.brokenCode, JS_BUG.tests, 'js');
    expect(r.ran).toBe(true);
    expect(r.allPass).toBe(false);
    expect(r.tests.find((t) => !t.pass)!.message).not.toBe('');
  });

  test('code that never finishes is stopped, and says it may be an endless loop', async () => {
    const r = await runTests(JS_BUG.loopingCode, JS_BUG.tests, 'js');
    expect(r).toMatchObject({ ran: false, allPass: false, timedOut: true });
    expect(r.error).toBe('Your code ran for too long. It may be stuck in an endless loop.');
  });
});

describe('verifyBug for plain JavaScript', () => {
  test('accepts a bug whose broken code fails a test, and hands back what really happened', async () => {
    const r = await verifyBug(JS_BUG);
    expect(r).toMatchObject({ ok: true, reason: '' });
    expect(r.broken?.tests.filter((t) => !t.pass).map((t) => t.name)).toEqual(['reverses a list of three']);
    expect(r.broken?.tests.find((t) => !t.pass)?.message).toMatch(/expected/);
  });

  test('accepts a bug whose broken code never finishes, and says that it timed out', async () => {
    const r = await verifyBug({ ...JS_BUG, brokenCode: JS_BUG.loopingCode });
    expect(r.ok).toBe(true);
    expect(r.broken?.timedOut).toBe(true);
  });

  test('refuses broken code that cannot run at all, such as a typo', async () => {
    const typo = JS_BUG.workingCode.replace('while (cur) {', 'while (cur {');
    const r = await verifyBug({ ...JS_BUG, brokenCode: typo });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/could not run/);
  });

  test('refuses broken code that passes, and broken code that is the working code', async () => {
    expect((await verifyBug({ ...JS_BUG, brokenCode: JS_BUG.workingCode + '\n// same' })).ok).toBe(false);
    expect((await verifyBug({ ...JS_BUG, brokenCode: JS_BUG.workingCode })).reason).toBe('The broken code is the same as the working code.');
  });

  test('refuses working code that fails its own tests', async () => {
    const r = await verifyBug({ ...JS_BUG, workingCode: JS_BUG.brokenCode, brokenCode: JS_BUG.loopingCode });
    expect(r).toEqual({ ok: false, reason: 'The working code fails its own tests.' });
  });
});
