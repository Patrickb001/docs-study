import { describe, expect, test } from 'vitest';
import { verifyBug, runTests } from '../generator/bugCheck.ts';
import { readPageReply } from '../generator/prompt.ts';
import { SAMPLE } from './sample.ts';

describe('sample library', () => {
  test('every concept has 5 questions in the shape the importer expects', () => {
    const reply = JSON.stringify({ concepts: SAMPLE.slice(0, 3).map((c) => ({ name: c.name, summary: c.summary, questions: c.questions, bug: c.bug })) });
    const read = readPageReply(reply);
    expect(read.ok).toBe(true);
    for (const c of SAMPLE) expect(c.questions).toHaveLength(5);
  });

  test.each(SAMPLE.map((c) => [c.name, c.bug] as const))('the %s bug passes its checks', async (_name, bug) => {
    expect(await verifyBug(bug)).toMatchObject({ ok: true, reason: '' });
  });

  test('code that runs forever or does not parse is reported, not crashed on', async () => {
    const broken = await runTests('export default function A( {', SAMPLE[0].bug.tests);
    expect(broken.ran).toBe(false);
    expect(broken.error).not.toBe('');
  });
});
