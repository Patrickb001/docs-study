// Plain summaries of concepts, written once by a stand-in for Claude and then read from the database.
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { all, get, now, run } from '../db.ts';
import { addSampleExplainers, SAMPLE, seedSample } from '../seed/sample.ts';
import { addQuestion } from '../store.ts';
import { useClaude, type Claude, type ClaudeRequest } from './claude.ts';
import { savedExplainer, writeExplainer } from './explain.ts';
import { readExplainerReply } from './prompt.ts';

const good = {
  gist: 'A component is a function that returns what should appear on screen.',
  paragraphs: ['You write a component once and use it like an HTML tag.', 'Its name starts with a capital letter, so React can tell it apart from HTML.'],
  example: { code: 'function Hello() {\n  return <h1>Hello</h1>;\n}', note: 'Hello is a component because it returns markup.' },
  watchOut: ['Do not define a component inside another component.'],
  terms: [{ term: 'markup', meaning: 'The tags that describe what to show.' }],
};

let sent: ClaudeRequest[] = [];
const standIn = (reply: string): Claude => ({
  async send(request) {
    sent.push(request);
    return { id: request.id, ok: true, text: reply, tokensIn: 900, tokensOut: 300, error: '' };
  },
  async createBatch() { throw new Error('not used'); },
  async batchDone() { return true; },
  async batchResults() { return []; },
});

const conceptId = (name: string) => get("SELECT c.id FROM concept c JOIN library l ON l.id = c.library_id WHERE l.way_in = 'sample' AND c.name = ?", name)!.id as number;

beforeAll(() => { seedSample(); });
afterEach(() => { useClaude(null); sent = []; });

describe('reading a summary reply', () => {
  test('accepts a reply wrapped in prose and a code fence', () => {
    const read = readExplainerReply('Here it is:\n```json\n' + JSON.stringify(good) + '\n```');
    expect(read.ok).toBe(true);
  });

  test('accepts a concept with no example and no terms', () => {
    expect(readExplainerReply(JSON.stringify({ ...good, example: null, terms: [] })).ok).toBe(true);
  });

  test('accepts a fuller summary: six paragraphs, a worked scenario, five warnings and eight key terms', () => {
    const fuller = {
      ...good,
      paragraphs: Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1}.`),
      example: null,
      scenario: 'An accountant plans two hours at home after work. Traffic and a late dinner end the plan.',
      watchOut: Array.from({ length: 5 }, (_, i) => `Warning ${i + 1}.`),
      terms: Array.from({ length: 8 }, (_, i) => ({ term: `Term ${i + 1}`, meaning: 'What it means.' })),
    };
    expect(readExplainerReply(JSON.stringify(fuller)).ok).toBe(true);
  });

  test('still accepts a summary with no scenario, such as one saved before scenarios existed', () => {
    expect(readExplainerReply(JSON.stringify(good)).ok).toBe(true);
    expect(readExplainerReply(JSON.stringify({ ...good, scenario: '' })).ok).toBe(true);
  });

  test('refuses nine paragraphs, which is more than a summary should hold', () => {
    expect(readExplainerReply(JSON.stringify({ ...good, paragraphs: Array.from({ length: 9 }, () => 'Words.') })).ok).toBe(false);
  });

  test('rejects a reply with no one-sentence gist', () => {
    const { gist, ...rest } = good;
    expect(readExplainerReply(JSON.stringify(rest)).ok).toBe(false);
  });
});

describe('the sample library', () => {
  test.each(SAMPLE.map((c) => [c.name, c.explainer] as const))('the %s summary is in the shape Claude is asked for', (_name, explainer) => {
    expect(readExplainerReply(JSON.stringify(explainer)).ok).toBe(true);
  });

  test('comes with every summary already written, so it works without an API key', () => {
    for (const c of SAMPLE) expect(savedExplainer(conceptId(c.name))?.gist).toBe(c.explainer.gist);
  });

  test('gets its summaries back in a database made before summaries existed, once only', () => {
    run('DELETE FROM concept_explainer');
    addSampleExplainers();
    addSampleExplainers();
    expect(all('SELECT * FROM concept_explainer')).toHaveLength(SAMPLE.length);
  });
});

describe('writing a summary', () => {
  test('sends the concept and its docs page to Claude, then saves the reply', async () => {
    const id = conceptId('Props');
    run('DELETE FROM concept_explainer WHERE concept_id = ?', id);
    useClaude(standIn(JSON.stringify(good)));

    expect(await writeExplainer(id)).toEqual(good);
    expect(sent).toHaveLength(1);
    expect(sent[0].user).toContain('Props');
    expect(sent[0].user).toContain('<page title="Passing props to a component">');
    expect(savedExplainer(id)).toEqual(good);
  });

  test('does not pay twice: a saved summary is returned without asking Claude', async () => {
    const id = conceptId('JSX');
    useClaude(standIn(JSON.stringify(good)));
    expect((await writeExplainer(id)).gist).toBe(SAMPLE[0].explainer.gist);
    expect(sent).toHaveLength(0);
  });

  test('saves nothing when the reply cannot be used', async () => {
    const id = conceptId('State');
    run('DELETE FROM concept_explainer WHERE concept_id = ?', id);
    useClaude(standIn('Sorry, I cannot help with that.'));
    await expect(writeExplainer(id)).rejects.toThrow('could not be used');
    expect(savedExplainer(id)).toBeNull();
  });

  test('says plainly when no API key is set', async () => {
    const id = conceptId('State');
    await expect(writeExplainer(id)).rejects.toThrow('No Claude API key is set');
  });

  test('says plainly when the concept does not exist', async () => {
    useClaude(standIn(JSON.stringify(good)));
    await expect(writeExplainer(999999)).rejects.toThrow('could not be found');
  });
});

describe('writing a summary with the quiz in view', () => {
  let id = 0;
  const wrote = () => sent[0].user;

  beforeAll(() => {
    const libraryId = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Quiz view', '', 'files', now());
    const pageId = run('INSERT INTO page (library_id, url, title, text, fingerprint, position) VALUES (?, ?, ?, ?, ?, ?)', libraryId, 'file:habits.md', 'Habits', 'Willpower runs out. Systems keep running.', 'fp', 0);
    id = run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', libraryId, pageId, 'Systems', 'Systems beat willpower.', 0);
    addQuestion(id, { type: 'choice', prompt: 'Which is NOT one of the four tactics?', code: '', options: ['Core driver reminders', 'Body doubling', 'Clock races', 'Routine anchoring'], answer: 1, explanation: 'Body doubling is a friction tool, not a tactic.' });
    addQuestion(id, { type: 'output', prompt: 'What follows task completion?', code: 'Motivation -> Work -> Completion -> ?', answer: 'Heightened motivation', explanation: 'The loop feeds back into motivation.' });
    addQuestion(id, { type: 'written', prompt: 'Explain what slowing down to speed up means.', code: '', explanation: 'Rushing raises errors, so pacing saves time.' });
    const gone = addQuestion(id, { type: 'written', prompt: 'RETIRED-PROMPT', code: '', explanation: 'Gone.' });
    run('UPDATE question SET retired = 1 WHERE id = ?', gone);
    const flagged = addQuestion(id, { type: 'written', prompt: 'FLAGGED-PROMPT', code: '', explanation: 'Flagged.' });
    run('UPDATE question SET flagged = 1 WHERE id = ?', flagged);
  });

  test('tells Claude each active question and its answer, so the summary can teach what the quiz asks', async () => {
    useClaude(standIn(JSON.stringify(good)));
    await writeExplainer(id);
    expect(wrote()).toContain('Which is NOT one of the four tactics?');
    expect(wrote()).toContain('Answer: Body doubling');
    expect(wrote()).toContain('What follows task completion?');
    expect(wrote()).toContain('Answer: Heightened motivation');
    expect(wrote()).toContain('Explain what slowing down to speed up means.');
    expect(wrote()).toContain('Answer: Rushing raises errors, so pacing saves time.');
  });

  test('leaves out questions that were retired or flagged', async () => {
    useClaude(standIn(JSON.stringify(good)));
    run('DELETE FROM concept_explainer WHERE concept_id = ?', id);
    await writeExplainer(id);
    expect(wrote()).not.toContain('RETIRED-PROMPT');
    expect(wrote()).not.toContain('FLAGGED-PROMPT');
  });

  test('a concept with no questions gets no quiz section', async () => {
    const empty = conceptId('Props');
    run('DELETE FROM concept_explainer WHERE concept_id = ?', empty);
    run('UPDATE question SET retired = 1 WHERE concept_id = ?', empty);
    useClaude(standIn(JSON.stringify(good)));
    await writeExplainer(empty);
    expect(wrote()).not.toContain('<quiz>');
  });
});

describe('rewriting a summary', () => {
  const newer = { ...good, gist: 'A fuller version of the same idea.', scenario: 'A short worked scenario from the page.' };

  test('asks Claude again and replaces the saved summary', async () => {
    const id = conceptId('JSX');
    useClaude(standIn(JSON.stringify(newer)));
    expect((await writeExplainer(id, true)).gist).toBe('A fuller version of the same idea.');
    expect(sent).toHaveLength(1);
    expect(savedExplainer(id)?.gist).toBe('A fuller version of the same idea.');
    expect(savedExplainer(id)?.scenario).toBe('A short worked scenario from the page.');
  });

  test('keeps the old summary when the new reply cannot be used', async () => {
    const id = conceptId('Components');
    const before = savedExplainer(id);
    useClaude(standIn('Sorry, I cannot help with that.'));
    await expect(writeExplainer(id, true)).rejects.toThrow('could not be used');
    expect(savedExplainer(id)).toEqual(before);
  });

  test('keeps the old summary and says plainly when no API key is set', async () => {
    const id = conceptId('Components');
    const before = savedExplainer(id);
    await expect(writeExplainer(id, true)).rejects.toThrow('No Claude API key is set');
    expect(savedExplainer(id)).toEqual(before);
  });
});
