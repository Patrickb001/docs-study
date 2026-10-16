// Runs a whole import and a doc update against a stand-in for Claude, so no real API calls are made.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { all, get, now, run } from '../db.ts';
import { useClaude, type Claude, type ClaudeReply, type ClaudeRequest } from '../generator/claude.ts';
import { JS_BUG } from '../generator/bugs.fixture.ts';
import { SHOP_DESIGN } from '../generator/design.fixture.ts';
import { APPLY_FIXTURE, ORDER_FIXTURE } from '../generator/exercises.fixture.ts';
import { estimateUsd } from '../generator/estimate.ts';
import { savedExplainer, saveExplainer } from '../generator/explain.ts';
import { CLEANER_VERSION, cleanHtml, fingerprint } from './clean.ts';
import { addFiles, approveUpdate, checkForChanges, confirmImport, pendingChanges, pollBatches, startImport, topUp } from './job.ts';
import { SAMPLE } from '../seed/sample.ts';
import { activeBug, addQuestion, mapFor, recordAttempt } from '../store.ts';

const sent: ClaudeRequest[] = [];
let failFirstPage = true;
// When set, the stand-in cannot reword a bug, so the first words must be kept.
let wordsFail = false;
let batch: ClaudeRequest[] = [];

function answer(request: ClaudeRequest): string {
  if (request.id.startsWith('links-')) {
    const ids = [...request.user.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    // Includes a loop on purpose: the last link must be thrown away.
    return JSON.stringify({ links: [{ first: ids[0], then: ids[1] }, { first: ids[1], then: ids[2] }, { first: ids[2], then: ids[0] }] });
  }
  // A page that Claude never answers properly, even on the second try.
  if (request.id.startsWith('page-') && request.user.includes('NEVER-GOOD-PAGE')) return 'Sorry, I cannot do that.';
  if (request.id.startsWith('bugwords-')) {
    if (wordsFail) return 'Sorry, I cannot do that.';
    // Echoes the first real failure it was given, so a test can see that it was given the facts.
    const real = /- "[^"]+" fails: [^\n]*/.exec(request.user)?.[0] ?? 'nothing failed';
    return JSON.stringify({ description: `Grounded. ${real}`, hints: ['Grounded one.', 'Grounded two.', 'Grounded three.'] });
  }
  // A page whose one concept has a plain-JavaScript bug hunt.
  if (request.id.startsWith('page-') && request.user.includes('JS-HUNT-PAGE')) {
    return JSON.stringify({ concepts: [{ name: 'Reverse a list', summary: 'Point each node at the one before it. Then return the last node.', questions: SAMPLE[0].questions, bug: JS_BUG, design: null, apply: null, order: null, fits: ['bug', 'apply'] }] });
  }
  // The page text sits inside a bug request too, so these must come before the branches that look for APPLY-PAGE.
  if (request.id.startsWith('bug-') && request.user.includes('BUG-NONE')) return JSON.stringify({ bug: null });
  if (request.id.startsWith('bug-') && request.user.includes('JS-BUG-PAGE')) return JSON.stringify({ bug: request.user.includes('BAD-JS-BUG') ? { ...JS_BUG, brokenCode: JS_BUG.workingCode + '\n// same behaviour' } : JS_BUG });
  if (request.id.startsWith('design-')) return JSON.stringify({ design: SHOP_DESIGN });
  if (request.id.startsWith('apply-')) return JSON.stringify({ apply: APPLY_FIXTURE });
  // An ordering of two steps is not allowed, so it is a bad reply. NEVER-GOOD-ORDER pages get one even on the retry.
  if (request.id.startsWith('order-')) return JSON.stringify({ order: request.user.includes('NEVER-GOOD-ORDER') ? { ...ORDER_FIXTURE, steps: ['Only', 'Two'] } : ORDER_FIXTURE });
  if (request.id.startsWith('exercise-')) return JSON.stringify(request.user.includes('EXERCISE-NONE') ? { bug: null, design: null, apply: null, order: null } : { apply: APPLY_FIXTURE });
  if (/APPLY-PAGE|ORDER-PAGE/.test(request.user)) {
    const exercise = request.user.includes('BAD-ORDER-PAGE') ? { order: { ...ORDER_FIXTURE, steps: ['Only', 'Two'] } } : request.user.includes('ORDER-PAGE') ? { order: ORDER_FIXTURE } : { apply: APPLY_FIXTURE };
    const name = request.user.includes('ORDER-PAGE') ? 'Audit steps' : 'Worst-day habit';
    return JSON.stringify({ concepts: [{ name, summary: 'Two sentences about it. Both are short.', questions: SAMPLE[0].questions, bug: null, design: null, apply: null, order: null, fits: request.user.includes('ORDER-PAGE') ? ['order'] : ['apply', 'bug'], ...exercise }] });
  }
  if (request.user.includes('LONG-PAGE')) {
    // Writes as many concepts as the request asks for at most, so a long page can be seen to get more than three.
    const most = Number(/Find the \d+ to (\d+) main concepts/.exec(request.user)![1]);
    return JSON.stringify({ concepts: Array.from({ length: most }, (_, i) => ({ name: `Idea ${i + 1}`, summary: 'Two sentences about it. Both are short.', questions: SAMPLE[0].questions, bug: null, design: null })) });
  }
  if (request.user.includes('DESIGN-PAGE')) {
    // BAD-DESIGN-PAGE gets a design whose broken version already passes, so it must be retried.
    const bad = request.user.includes('BAD-DESIGN-PAGE');
    const design = bad ? { ...SHOP_DESIGN, checks: [SHOP_DESIGN.checks[2], SHOP_DESIGN.checks[2]] } : SHOP_DESIGN;
    return JSON.stringify({ concepts: [{ name: bad ? 'Order queue' : 'Order events', summary: 'Orders travel through a queue, so a slow service never blocks them.', questions: SAMPLE[0].questions, bug: null, design }] });
  }
  const sample = SAMPLE.find((c) => request.user.includes(`<page title=${JSON.stringify(c.page.title)}>`))!;
  const bug = request.user.includes('BROKEN-BUG-PLEASE') && request.id.startsWith('page-') ? { ...sample.bug, brokenCode: sample.bug.workingCode + '\n// same behaviour' } : sample.bug;
  if (request.id.startsWith('bug-')) return JSON.stringify({ bug: sample.bug });
  return 'Here you go:\n```json\n' + JSON.stringify({ concepts: [{ name: sample.name, summary: sample.summary, questions: sample.questions, bug }] }) + '\n```';
}

const standIn: Claude = {
  async send(request): Promise<ClaudeReply> {
    sent.push(request);
    if (failFirstPage && request.id.startsWith('page-')) {
      failFirstPage = false;
      return { id: request.id, ok: true, text: 'Sorry, I cannot do that.', tokensIn: 10, tokensOut: 5, error: '' };
    }
    return { id: request.id, ok: true, text: answer(request), tokensIn: 1000, tokensOut: 500, error: '' };
  },
  async createBatch(requests) { batch = requests; return 'batch_test'; },
  async batchDone() { return true; },
  async batchResults() { return batch.map((r) => ({ id: r.id, ok: true, text: answer(r), tokensIn: 1000, tokensOut: 500, error: '' })); },
};

function addLibrary(name: string, pages: typeof SAMPLE): { libraryId: number; jobId: number } {
  const libraryId = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', name, 'https://example.com/docs', 'web', now());
  pages.forEach((c, i) => {
    const text = c.page.text + (i === 1 ? '\nBROKEN-BUG-PLEASE' : '');
    run('INSERT INTO page (library_id, url, title, text, fingerprint, position) VALUES (?, ?, ?, ?, ?, ?)', libraryId, c.page.url, c.page.title, text, fingerprint(text), i);
  });
  const jobId = run('INSERT INTO import_job (library_id, status, words, created_at) VALUES (?, ?, ?, ?)', libraryId, 'estimated', 600, now());
  return { libraryId, jobId };
}

// A markdown file titled like a sample page, so the stand-in for Claude knows how to answer for it.
// The padding gets it past the 150-word minimum for a page.
const fileFor = (c: (typeof SAMPLE)[number], path: string, extra = '') => ({
  name: path,
  text: `---\ntitle: ${JSON.stringify(c.page.title)}\n---\n\n${c.page.text}\n\n${'More about this. '.repeat(40)}${extra}`,
});

async function until(jobId: number, status: string) {
  for (let i = 0; i < 600; i++) {
    const j = get('SELECT status, message FROM import_job WHERE id = ?', jobId)!;
    if (j.status === status) return j;
    if (j.status === 'failed') throw new Error('job failed: ' + j.message);
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('timed out waiting for ' + status);
}

beforeAll(() => useClaude(standIn));

describe('importing with ordinary requests', () => {
  let libraryId = 0;

  test('writes concepts, questions, checked bugs, and loop-free links', async () => {
    const made = addLibrary('Direct', SAMPLE.slice(0, 3));
    libraryId = made.libraryId;
    await confirmImport(made.jobId, 'direct');
    const done = await until(made.jobId, 'ready');
    expect(done.message).toContain('3 concepts and 3 bug hunts ready.');

    const map = mapFor(libraryId);
    expect(map.concepts.map((c) => c.name).sort()).toEqual(['Components', 'JSX', 'Props']);
    expect(map.concepts.every((c) => c.questionCount === 5)).toBe(true);
    expect(map.links).toHaveLength(2);
    // The first reply was unusable, so that page was retried once.
    expect(sent.filter((r) => r.id.startsWith('page-')).length).toBe(4);
    // One page's bug did not behave differently from its working code, so a replacement was asked for.
    expect(sent.filter((r) => r.id.startsWith('bug-')).length).toBe(1);
    expect(get('SELECT tokens_in FROM import_job WHERE id = ?', made.jobId)!.tokens_in).toBeGreaterThan(3000);
  });

  test('a React bug hunt is not reworded, because only plain JavaScript has a readable failure to go on', () => {
    expect(sent.filter((r) => r.id.startsWith('bugwords-'))).toHaveLength(0);
  });

  test('an approved update retires old items and keeps the concept', async () => {
    const page = get('SELECT * FROM page WHERE library_id = ? AND position = 0', libraryId)!;
    const concept = get('SELECT id FROM concept WHERE page_id = ?', page.id)!;
    saveExplainer(concept.id, SAMPLE[0].explainer);
    const newText = page.text + '\nA new paragraph.';
    run('UPDATE page SET pending_text = ?, pending_fingerprint = ?, pending_kind = ? WHERE id = ?', newText, fingerprint(newText), 'changed', page.id);
    const job = approveUpdate(libraryId, [page.id]);
    await until(job.id, 'ready');

    const after = get('SELECT * FROM page WHERE id = ?', page.id)!;
    expect(after.text).toBe(newText);
    expect(after.pending_kind).toBeNull();
    expect(get('SELECT id FROM concept WHERE page_id = ?', page.id)!.id).toBe(concept.id);
    expect(get('SELECT COUNT(*) AS n FROM question WHERE concept_id = ? AND retired = 1', concept.id)!.n).toBe(5);
    expect(get('SELECT COUNT(*) AS n FROM question WHERE concept_id = ? AND retired = 0', concept.id)!.n).toBe(5);
    expect(all('SELECT retired FROM bug WHERE concept_id = ? ORDER BY id', concept.id).map((b) => b.retired)).toEqual([1, 0]);
    // The old summary described the old page, so it goes. A new one can be written from the new text.
    expect(savedExplainer(concept.id)).toBeNull();
  });
});

describe('importing with a batch', () => {
  test('waits for the batch, then finishes the same way', async () => {
    const made = addLibrary('Batch', SAMPLE.slice(3, 5));
    const job = await confirmImport(made.jobId, 'batch');
    expect(job.status).toBe('waiting');
    await pollBatches();
    await until(made.jobId, 'ready');
    expect(mapFor(made.libraryId).concepts.map((c) => c.name).sort()).toEqual(['State', 'State updates']);
  });

  test('an import over the spending limit is refused', async () => {
    const made = addLibrary('Too big', SAMPLE.slice(0, 1));
    run('UPDATE import_job SET words = ? WHERE id = ?', 5_000_000, made.jobId);
    await expect(confirmImport(made.jobId, 'batch')).rejects.toThrow(/over your \$10 limit/);
  });
});

describe('design fixes', () => {
  let libraryId = 0;

  test('a concept about connecting parts gets a checked design fix, retried once when the first is rejected', async () => {
    libraryId = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Design', 'https://example.com/design', 'web', now());
    ['DESIGN-PAGE', 'BAD-DESIGN-PAGE'].forEach((marker, i) => {
      const text = `Event-driven shop ${marker} ` + 'word '.repeat(200);
      run('INSERT INTO page (library_id, url, title, text, fingerprint, position) VALUES (?, ?, ?, ?, ?, ?)', libraryId, `https://example.com/design/${i}`, `Event-driven shop ${i}`, text, fingerprint(text), i);
    });
    const jobId = run('INSERT INTO import_job (library_id, status, words, created_at) VALUES (?, ?, ?, ?)', libraryId, 'estimated', 400, now());
    const before = sent.length;
    await confirmImport(jobId, 'direct');
    const done = await until(jobId, 'ready');

    expect(done.message).toContain('2 concepts and 2 design fixes ready.');
    const kinds = all('SELECT b.kind FROM bug b JOIN concept c ON c.id = b.concept_id WHERE c.library_id = ?', libraryId).map((r) => r.kind);
    expect(kinds).toEqual(['design', 'design']);
    expect(sent.slice(before).filter((r) => r.id.startsWith('design-'))).toHaveLength(1);
    expect(mapFor(libraryId).concepts.every((c) => c.exerciseKind === 'design' && c.bugState === 'open')).toBe(true);
  });

  test('"Write another exercise" writes another design fix for a design concept', async () => {
    const concept = mapFor(libraryId).concepts[0];
    const result = await topUp(concept.id, 'exercise');
    expect(result.message).toBe('A new design fix was added.');
    expect(get("SELECT COUNT(*) AS n FROM bug WHERE concept_id = ? AND kind = 'design'", concept.id)!.n).toBe(2);
  });
});

describe('importing a list of pages', () => {
  const html = (title: string, words: number) =>
    `<html><body><ul><li><a href="/courses">Courses</a></li><li><a href="/tutorials">Tutorials</a></li></ul><main><h1>${title}</h1><p>${'study '.repeat(words)}</p></main></body></html>`;
  const site: Record<string, string> = {
    'https://example.com/robots.txt': 'User-agent: *\nDisallow: /private/',
    'https://example.com/system/monolith/': html('Monoliths', 300),
    'https://example.com/system/microservices': html('Microservices', 300),
    'https://example.com/system/cookie-wall': html('Accept cookies', 20),
    'https://other.org/pub-sub': html('Pub/sub', 300),
    // The same article under another address, as two of the user's real links were.
    'https://example.com/system/monolith-copy': html('Monoliths', 300),
  };
  const asked: string[] = [];

  beforeEach(() => {
    asked.length = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(String(url));
      const body = site[String(url)];
      if (body === undefined) return new Response('', { status: 404 });
      return new Response(body, { status: 200, headers: { 'content-type': String(url).endsWith('robots.txt') ? 'text/plain' : 'text/html' } });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  test('reads exactly the listed pages into one library, with no crawling', async () => {
    const j = startImport([
      ' https://example.com/system/monolith/ ',
      'https://example.com/system/monolith',
      '',
      'https://example.com/system/microservices#intro',
      'https://example.com/system/cookie-wall',
      'https://example.com/private/notes',
      'https://other.org/pub-sub',
    ], 0, 'System design');
    const done = await until(j.id, 'estimated');
    const library = get('SELECT * FROM library WHERE id = ?', j.library_id)!;

    expect(library.name).toBe('System design');
    expect(library.way_in).toBe('list');
    expect(all('SELECT title FROM page WHERE library_id = ? ORDER BY position', j.library_id).map((p) => p.title)).toEqual(['Monoliths', 'Microservices', 'Pub/sub']);
    expect(done.message).toBe('3 pages read. 1 short page skipped. 1 page could not be fetched.');
    // The same page written two ways is read once, and nothing beyond the list is fetched.
    expect(asked.filter((u) => u.includes('monolith'))).toHaveLength(1);
    expect(asked.some((u) => u.includes('sitemap'))).toBe(false);
  });

  test('a page that repeats an earlier one is skipped, and the import says so', async () => {
    const j = startImport(['https://example.com/system/monolith/', 'https://example.com/system/monolith-copy', 'https://example.com/system/microservices'], 0, 'Repeats');
    const done = await until(j.id, 'estimated');
    expect(all('SELECT title FROM page WHERE library_id = ? ORDER BY position', j.library_id).map((p) => p.title)).toEqual(['Monoliths', 'Microservices']);
    expect(done.message).toBe('2 pages read. 1 page repeated an earlier page and was skipped.');
    // The estimate counts only the pages that are kept: two pages of 300 words plus the two words of "# Title".
    expect(get('SELECT words FROM import_job WHERE id = ?', j.id)!.words).toBe(604);
  });

  test('says "were skipped" for more than one', async () => {
    site['https://example.com/system/monolith-copy-2'] = html('Monoliths', 300);
    try {
      const j = startImport(['https://example.com/system/monolith/', 'https://example.com/system/monolith-copy', 'https://example.com/system/monolith-copy-2'], 0, 'Repeats');
      const done = await until(j.id, 'estimated');
      expect(done.message).toBe('1 page read. 2 pages repeated earlier pages and were skipped.');
    } finally {
      delete site['https://example.com/system/monolith-copy-2'];
    }
  });

  test('checking for changes does not list a new page that repeats one the library already has', async () => {
    const text = cleanHtml(site['https://example.com/system/monolith/'], 'x').text;
    const libraryId = run('INSERT INTO library (name, source_url, way_in, cleaner, created_at) VALUES (?, ?, ?, ?, ?)', 'Has a copy', 'https://example.com/system/monolith/\nhttps://example.com/system/monolith-copy', 'list', CLEANER_VERSION, now());
    run('INSERT INTO page (library_id, url, title, text, fingerprint, position, generated) VALUES (?, ?, ?, ?, ?, ?, 1)', libraryId, 'https://example.com/system/monolith/', 'Monoliths', text, fingerprint(text), 0);
    expect(await checkForChanges(libraryId)).toEqual([]);
    expect(get('SELECT COUNT(*) AS n FROM page WHERE library_id = ?', libraryId)!.n).toBe(1);
  });

  test('a list that collapses to one page still reads only that page, never the whole site', async () => {
    const j = startImport(['https://Example.com/system/monolith/', 'https://example.com/system/monolith'], 0, '');
    await until(j.id, 'estimated');
    const library = get('SELECT * FROM library WHERE id = ?', j.library_id)!;
    expect(library.way_in).toBe('list');
    expect(library.name).toBe('example.com, 1 page');
    expect(all('SELECT title FROM page WHERE library_id = ?', j.library_id).map((p) => p.title)).toEqual(['Monoliths']);
    expect(asked.some((u) => u.includes('sitemap') || u.includes('llms.txt'))).toBe(false);
  });

  test('the first check after the cleaner improved quietly re-baselines a crawled site instead of flagging every page', async () => {
    const oldText = 'Text cleaned the old way, with the site menu still in it.';
    const libraryId = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Old crawl', 'https://other.org/pub-sub', 'web', now());
    run('INSERT INTO page (library_id, url, title, text, fingerprint, position, generated) VALUES (?, ?, ?, ?, ?, ?, 1)', libraryId, 'https://other.org/pub-sub', 'Pub/sub', oldText, fingerprint(oldText), 0);
    expect(await checkForChanges(libraryId)).toEqual([]);
    site['https://other.org/pub-sub'] = html('Pub/sub', 350);
    expect((await checkForChanges(libraryId)).map((c) => [c.title, c.kind])).toEqual([['Pub/sub', 'changed']]);
  });

  test('names the library after the site when no name is given', async () => {
    const j = startImport(['https://example.com/system/monolith/', 'https://example.com/system/microservices'], 0, '');
    await until(j.id, 'estimated');
    expect(get('SELECT name FROM library WHERE id = ?', j.library_id)!.name).toBe('example.com, 2 pages');
  });

  test('refuses a GitHub folder inside a list, and a line that is not a link', () => {
    expect(() => startImport(['https://github.com/reactjs/react.dev/tree/main/src/content/learn', 'https://example.com/a'], 0, '')).toThrow('GitHub links import a whole folder, so add that one on its own.');
    expect(() => startImport(['https://example.com/a', 'not a link'], 0, '')).toThrow('Link 2 does not look like a link.');
    expect(() => startImport(['   '], 0, '')).toThrow('Paste a link or choose a markdown file first.');
  });

  test('checking for changes re-reads the same list and finds changed pages only', async () => {
    const j = startImport(['https://example.com/system/monolith/', 'https://example.com/system/microservices'], 0, 'Changes');
    await until(j.id, 'estimated');
    site['https://example.com/system/microservices'] = html('Microservices', 320);
    const changes = await checkForChanges(j.library_id);
    expect(changes.map((c) => [c.title, c.kind])).toEqual([['Microservices', 'changed']]);
  });

  const queuesFile = () => ({ name: 'notes/queues.md', text: '---\ntitle: Message queues\n---\n\n' + 'study '.repeat(200) });

  test('a list can include markdown files, which are read after the pages from the links', async () => {
    const j = startImport(['https://example.com/system/monolith/', 'https://example.com/system/microservices'], 0, 'Mixed', [queuesFile()]);
    const done = await until(j.id, 'estimated');
    const library = get('SELECT * FROM library WHERE id = ?', j.library_id)!;

    expect(library.way_in).toBe('list');
    expect(library.name).toBe('Mixed');
    expect(all('SELECT url, title FROM page WHERE library_id = ? ORDER BY position', j.library_id).map((p) => [p.url, p.title])).toEqual([
      ['https://example.com/system/monolith/', 'Monoliths'],
      ['https://example.com/system/microservices', 'Microservices'],
      ['file:notes/queues.md', 'Message queues'],
    ]);
    expect(done.message).toBe('3 pages read.');
  });

  test('one link and some files still crawl the link, then add the files after it', async () => {
    const j = startImport(['https://example.com/system/monolith/'], 0, '', [queuesFile()]);
    await until(j.id, 'estimated');
    const library = get('SELECT * FROM library WHERE id = ?', j.library_id)!;

    expect(library.way_in).toBe('web');
    expect(library.name).toBe('example.com/system/monolith');
    expect(all('SELECT title FROM page WHERE library_id = ? ORDER BY position', j.library_id).map((p) => p.title)).toEqual(['Monoliths', 'Message queues']);
  });

  test('checking for changes re-reads the links only, and leaves file pages and their waiting changes alone', async () => {
    site['https://example.com/system/microservices'] = html('Microservices', 330);
    const j = startImport(['https://example.com/system/monolith/', 'https://example.com/system/microservices'], 0, 'Mixed too', [queuesFile()]);
    await until(j.id, 'estimated');
    run('UPDATE import_job SET status = ? WHERE id = ?', 'ready', j.id);
    // Two changes to files are already waiting: an edited file and a new one.
    run("UPDATE page SET pending_text = ?, pending_fingerprint = ?, pending_kind = 'changed' WHERE library_id = ? AND url = 'file:notes/queues.md'", 'Edited queues', fingerprint('Edited queues'), j.library_id);
    run("INSERT INTO page (library_id, url, title, text, fingerprint, position, pending_text, pending_fingerprint, pending_kind) VALUES (?, 'file:notes/new.md', 'A new note', '', '', 9, ?, ?, 'new')", j.library_id, 'New text', fingerprint('New text'));
    site['https://example.com/system/microservices'] = html('Microservices', 340);

    const changes = await checkForChanges(j.library_id);
    // The files are not in the web read, but they are not "removed" either, and the waiting new file was not thrown away.
    expect(changes.map((c) => [c.title, c.kind])).toEqual([['Microservices', 'changed'], ['Message queues', 'changed'], ['A new note', 'new']]);
  });
});

describe('importing markdown files', () => {
  test('a source made only of files is read into one library named after the folder', async () => {
    const j = startImport([], 0, '', [
      fileFor(SAMPLE[0], 'notes/jsx.md'),
      fileFor(SAMPLE[1], 'notes/components.md'),
      { name: 'notes/tiny.md', text: 'Too short to study.' },
      { name: 'notes/logo.png', text: 'not text' },
    ]);
    const done = await until(j.id, 'estimated');
    const library = get('SELECT * FROM library WHERE id = ?', j.library_id)!;

    expect(library.name).toBe('notes');
    expect(library.way_in).toBe('files');
    expect(library.source_url).toBe('');
    expect(all('SELECT url, title FROM page WHERE library_id = ? ORDER BY position', j.library_id).map((p) => [p.url, p.title])).toEqual([
      ['file:notes/jsx.md', 'Writing markup with JSX'],
      ['file:notes/components.md', 'Your first component'],
    ]);
    expect(done.message).toBe('2 pages read. 1 short page skipped. 1 file left out.');
  });

  test('files go through the same estimate and writing steps as web pages', async () => {
    const j = startImport([], 0, 'Files import', [fileFor(SAMPLE[0], 'notes/jsx.md'), fileFor(SAMPLE[1], 'notes/components.md')]);
    await until(j.id, 'estimated');
    await confirmImport(j.id, 'direct');
    const done = await until(j.id, 'ready');

    expect(done.message).toContain('2 concepts and 2 bug hunts ready.');
    expect(mapFor(j.library_id).concepts.map((c) => c.docUrl).sort()).toEqual(['file:notes/components.md', 'file:notes/jsx.md']);
  });

  test('nothing to read is refused, and so is a file that is too large, before anything is saved', () => {
    const libraries = () => get('SELECT COUNT(*) AS n FROM library')!.n;
    const before = libraries();
    expect(() => startImport(['  '], 0, '', [])).toThrow('Paste a link or choose a markdown file first.');
    expect(() => startImport([], 0, '', [{ name: 'big.md', text: 'a'.repeat(150_001) }])).toThrow('"big.md" is larger than 150 KB');
    expect(libraries()).toBe(before);
  });

  test('files that are all too short fail with a plain message', async () => {
    const j = startImport([], 0, '', [{ name: 'tiny.md', text: 'Too short to study.' }]);
    const failed = await until(j.id, 'failed');
    expect(failed.message).toBe('None of these files have enough text to study.');
  });
});

describe('adding and updating files', () => {
  let libraryId = 0;
  const jsx = () => fileFor(SAMPLE[0], 'notes/jsx.md');
  const components = (extra = '') => fileFor(SAMPLE[1], 'notes/components.md', extra);
  const props = (extra = '') => fileFor(SAMPLE[2], 'notes/props.md', extra);
  const pageOf = (url: string) => get('SELECT * FROM page WHERE library_id = ? AND url = ?', libraryId, url)!;
  const waiting = () => all('SELECT url, pending_kind FROM page WHERE library_id = ? AND pending_kind IS NOT NULL ORDER BY position', libraryId).map((p) => [p.url, p.pending_kind]);

  beforeAll(async () => {
    const j = startImport([], 0, 'Notes', [jsx(), components()]);
    libraryId = j.library_id;
    await until(j.id, 'estimated');
    await confirmImport(j.id, 'direct');
    await until(j.id, 'ready');
  });

  test('lists new and changed files for approval, and leaves unchanged, short, and non-markdown files out', () => {
    const result = addFiles(libraryId, [
      jsx(),
      components(' An extra sentence.'),
      props(),
      { name: 'notes/tiny.md', text: 'Too short to study.' },
      { name: 'notes/logo.png', text: 'not text' },
    ]);

    expect(result.message).toBe('1 new file and 1 changed file to review. 1 file unchanged. 1 short file skipped. 1 file left out.');
    expect(result.changes.map((c) => [c.title, c.kind])).toEqual([['Your first component', 'changed'], ['Passing props to a component', 'new']]);
    expect(waiting()).toEqual([['file:notes/components.md', 'changed'], ['file:notes/props.md', 'new']]);
    // A new file is a page with no text yet and no concepts. Its text waits for approval.
    expect(pageOf('file:notes/props.md').text).toBe('');
    expect(get('SELECT COUNT(*) AS n FROM page WHERE library_id = ?', libraryId)!.n).toBe(3);
  });

  test('a waiting change follows the latest version of the file', () => {
    addFiles(libraryId, [components(' Second edit.')]);
    expect(pageOf('file:notes/components.md').pending_text).toContain('Second edit.');
    expect(pageOf('file:notes/components.md').pending_text).not.toContain('An extra sentence.');
    expect(waiting()).toEqual([['file:notes/components.md', 'changed'], ['file:notes/props.md', 'new']]);
  });

  test('choosing the original text again clears a waiting change', () => {
    addFiles(libraryId, [components()]);
    expect(waiting()).toEqual([['file:notes/props.md', 'new']]);
  });

  test('a new file chosen twice is still one page, with its latest text waiting', () => {
    addFiles(libraryId, [props(' Edited before approving.')]);
    expect(get("SELECT COUNT(*) AS n FROM page WHERE library_id = ? AND url = 'file:notes/props.md'", libraryId)!.n).toBe(1);
    expect(pageOf('file:notes/props.md').pending_text).toContain('Edited before approving.');
    expect(pageOf('file:notes/props.md').pending_kind).toBe('new');
  });

  test('approving a changed file rewrites that page only, and keeps progress on the others', async () => {
    addFiles(libraryId, [components(' Approved edit.')]);
    const jsxConcept = get('SELECT id FROM concept WHERE page_id = ?', pageOf('file:notes/jsx.md').id)!;
    const componentsConcept = get('SELECT id FROM concept WHERE page_id = ?', pageOf('file:notes/components.md').id)!;
    const retired = (conceptId: number) => get('SELECT COUNT(*) AS n FROM question WHERE concept_id = ? AND retired = 1', conceptId)!.n;

    const job = approveUpdate(libraryId, [pageOf('file:notes/components.md').id]);
    await until(job.id, 'ready');

    expect(pageOf('file:notes/components.md').text).toContain('Approved edit.');
    expect(retired(componentsConcept.id)).toBe(5);
    expect(retired(jsxConcept.id)).toBe(0);
    // The new file was not ticked, so it is still waiting.
    expect(waiting()).toEqual([['file:notes/props.md', 'new']]);
  });

  test('approving a new file writes its concept, which joins the map with nothing before it', async () => {
    const job = approveUpdate(libraryId, [pageOf('file:notes/props.md').id]);
    await until(job.id, 'ready');

    const map = mapFor(libraryId);
    expect(map.concepts.map((c) => c.name).sort()).toEqual(['Components', 'JSX', 'Props']);
    expect(map.concepts.find((c) => c.name === 'Props')!.status).toBe('fresh');
    expect(map.concepts.find((c) => c.name === 'Props')!.docUrl).toBe('file:notes/props.md');
    expect(waiting()).toEqual([]);
  });

  test('refuses a source that is not ready, the sample library, and one that does not exist', () => {
    const busy = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Busy', '', 'files', now());
    run('INSERT INTO import_job (library_id, status, created_at) VALUES (?, ?, ?)', busy, 'writing', now());
    const sample = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Sample', '', 'sample', now());

    expect(() => addFiles(busy, [jsx()])).toThrow('This source is not ready yet. Wait for its import to finish, or delete it and add it again.');
    expect(() => addFiles(sample, [jsx()])).toThrow('The sample library is built in, so you cannot add files to it.');
    expect(() => addFiles(999999, [jsx()])).toThrow('That source could not be found.');
    expect(get('SELECT COUNT(*) AS n FROM page WHERE library_id IN (?, ?)', busy, sample)!.n).toBe(0);
  });

  test('a source made only of files has nothing to look up online', async () => {
    await expect(checkForChanges(libraryId)).rejects.toThrow('This source was made from files you chose, so there is nothing to look up online. Use Add or update files instead.');
  });

  test('approving more than the spending limit allows at full price is refused, and nothing changes', () => {
    const page = pageOf('file:notes/jsx.md');
    // About $15.92 at full price, but only about $7.96 at batch price. Updates are written right away, so full price counts.
    const huge = 'word '.repeat(400_000);
    run("UPDATE page SET pending_text = ?, pending_fingerprint = ?, pending_kind = 'changed' WHERE id = ?", huge, fingerprint(huge), page.id);

    expect(() => approveUpdate(libraryId, [page.id])).toThrow(/over your \$10 limit/);
    expect(pageOf('file:notes/jsx.md').pending_kind).toBe('changed');
    expect(get('SELECT COUNT(*) AS n FROM question q JOIN concept c ON c.id = q.concept_id WHERE c.page_id = ? AND q.retired = 1', page.id)!.n).toBe(0);
    run('UPDATE page SET pending_text = NULL, pending_fingerprint = NULL, pending_kind = NULL WHERE id = ?', page.id);
  });

  test('each waiting change carries the full-price estimate for its new text, and a removed page has none', () => {
    addFiles(libraryId, [{ name: 'notes/thousand.md', text: 'study '.repeat(1000) }]);
    run("UPDATE page SET pending_kind = 'removed' WHERE library_id = ? AND url = 'file:notes/jsx.md'", libraryId);

    const changes = pendingChanges(libraryId);
    expect(changes.find((c) => c.title === 'thousand')!.estimateUsd).toBe(estimateUsd(1000, 'direct'));
    expect(estimateUsd(1000, 'direct')).toBeGreaterThan(estimateUsd(1000, 'batch'));
    expect(changes.find((c) => c.kind === 'removed')!.estimateUsd).toBe(0);
  });
});

describe('a long page', () => {
  let libraryId = 0;
  let jobId = 0;

  beforeAll(async () => {
    libraryId = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Long', 'https://example.com/long', 'web', now());
    const text = 'LONG-PAGE ' + 'word '.repeat(3800);
    run('INSERT INTO page (library_id, url, title, text, fingerprint, position) VALUES (?, ?, ?, ?, ?, ?)', libraryId, 'https://example.com/long', 'A long page', text, fingerprint(text), 0);
    jobId = run('INSERT INTO import_job (library_id, status, words, created_at) VALUES (?, ?, ?, ?)', libraryId, 'estimated', 3800, now());
    await confirmImport(jobId, 'direct');
    await until(jobId, 'ready');
  });

  test('gets more than three concepts, in the order Claude wrote them', () => {
    expect(mapFor(libraryId).concepts.map((c) => c.name)).toEqual(['Idea 1', 'Idea 2', 'Idea 3', 'Idea 4', 'Idea 5', 'Idea 6', 'Idea 7', 'Idea 8']);
  });

  test('a library with no exercises says how many concepts are ready, and nothing about bug hunts', () => {
    expect(get('SELECT message FROM import_job WHERE id = ?', jobId)!.message).toBe('8 concepts ready.');
  });
});

describe('exercises for general topics', () => {
  const importPages = async (name: string, markers: string[]) => {
    const libraryId = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', name, '', 'files', now());
    markers.forEach((marker, i) => {
      const text = `${marker} ` + 'word '.repeat(200);
      run('INSERT INTO page (library_id, url, title, text, fingerprint, position) VALUES (?, ?, ?, ?, ?, ?)', libraryId, `file:${name}/${i}.md`, `Page ${i}`, text, fingerprint(text), i);
    });
    const jobId = run('INSERT INTO import_job (library_id, status, words, created_at) VALUES (?, ?, ?, ?)', libraryId, 'estimated', 400, now());
    await confirmImport(jobId, 'direct');
    await until(jobId, 'ready');
    return { libraryId, jobId };
  };
  const exercises = (libraryId: number) => all('SELECT b.* FROM bug b JOIN concept c ON c.id = b.concept_id WHERE c.library_id = ? ORDER BY b.id', libraryId);

  test('a habit gets an apply exercise and a process gets an ordering exercise, and the ready message says so', async () => {
    const { libraryId, jobId } = await importPages('general', ['APPLY-PAGE', 'ORDER-PAGE']);
    expect(get('SELECT message FROM import_job WHERE id = ?', jobId)!.message).toBe('2 concepts, 1 apply-it exercise and 1 ordering exercise ready.');
    expect(mapFor(libraryId).concepts.map((c) => [c.name, c.exerciseKind, c.bugState])).toEqual([['Worst-day habit', 'apply', 'open'], ['Audit steps', 'order', 'open']]);

    const [apply, order] = exercises(libraryId);
    expect(apply.description).toBe(APPLY_FIXTURE.scenario);
    expect(JSON.parse(apply.broken_code)).toEqual({ task: APPLY_FIXTURE.task });
    expect(JSON.parse(apply.tests)).toEqual(APPLY_FIXTURE.rubric);
    expect(JSON.parse(apply.working_code)).toEqual({ modelAnswer: APPLY_FIXTURE.modelAnswer });
    // The ordering is saved shuffled, and its saved order reads the steps back in the right sequence.
    const saved = JSON.parse(order.broken_code).steps as string[];
    const { order: positions } = JSON.parse(order.working_code) as { order: number[] };
    expect(saved).not.toEqual(ORDER_FIXTURE.steps);
    expect(positions.map((i) => saved[i])).toEqual(ORDER_FIXTURE.steps);
  });

  test('saves which types fit each concept, with the one written added, and shows them on the map', async () => {
    const { libraryId } = await importPages('fits', ['APPLY-PAGE', 'ORDER-PAGE']);
    expect(all('SELECT fits FROM concept WHERE library_id = ? ORDER BY position', libraryId).map((c) => c.fits)).toEqual(['code,apply', 'order']);
    expect(mapFor(libraryId).concepts.map((c) => c.fits)).toEqual([['code', 'apply'], ['order']]);
  });

  test('a concept whose reply said nothing about fits has none saved, and the map offers the usual ones', async () => {
    const { libraryId } = await importPages('no-fits', ['LONG-PAGE']);
    expect(all('SELECT fits FROM concept WHERE library_id = ?', libraryId).every((c) => c.fits === '')).toBe(true);
    expect(mapFor(libraryId).concepts[0].fits).toEqual(['apply', 'order']);
  });

  test('a bad ordering is asked for again once, and the second try is kept', async () => {
    const before = sent.length;
    // The retry does not carry the NEVER-GOOD-ORDER marker, so it comes back fine.
    const { libraryId } = await importPages('retry', ['BAD-ORDER-PAGE']);
    expect(sent.slice(before).filter((r) => r.id.startsWith('order-'))).toHaveLength(1);
    expect(exercises(libraryId).map((b) => b.kind)).toEqual(['order']);
  });

  test('an ordering that is still bad on the second try is dropped, and the concept is solid from its quiz alone', async () => {
    const before = sent.length;
    const { libraryId, jobId } = await importPages('dropped', ['NEVER-GOOD-ORDER BAD-ORDER-PAGE']);
    expect(sent.slice(before).filter((r) => r.id.startsWith('order-'))).toHaveLength(1);
    expect(exercises(libraryId)).toHaveLength(0);
    expect(get('SELECT message FROM import_job WHERE id = ?', jobId)!.message).toBe('1 concept ready.');
  });

  describe('updating a page whose concepts were written again', () => {
    test('asks Claude to keep the names that exist, and removes an old concept the new text no longer covers', async () => {
      const { libraryId } = await importPages('renamed', ['APPLY-PAGE']);
      const page = get('SELECT * FROM page WHERE library_id = ?', libraryId)!;
      const keptId = mapFor(libraryId).concepts[0].id;
      // An old concept that the new reply does not write again. It has a quiz, and an arrow into the concept that stays.
      const oldId = run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', libraryId, page.id, 'Old idea', 'It used to be here.', 5);
      addQuestion(oldId, SAMPLE[0].questions[0]);
      run('INSERT INTO concept_link (library_id, first_id, then_id) VALUES (?, ?, ?)', libraryId, oldId, keptId);
      const newText = page.text + '\nMore.';
      run('UPDATE page SET pending_text = ?, pending_fingerprint = ?, pending_kind = ? WHERE id = ?', newText, fingerprint(newText), 'changed', page.id);

      const before = sent.length;
      await until(approveUpdate(libraryId, [page.id]).id, 'ready');

      const asked = sent.slice(before).filter((r) => r.id.startsWith('page-'));
      expect(asked[0].user).toContain('These concepts already exist for this page: "Worst-day habit", "Old idea".');
      // The old concept had nothing left to study, so it could never become solid and would hold back what waits for it.
      expect(get('SELECT id FROM concept WHERE id = ?', oldId)).toBeUndefined();
      expect(get('SELECT COUNT(*) AS n FROM concept_link WHERE library_id = ?', libraryId)!.n).toBe(0);
      expect(all('SELECT id FROM concept WHERE library_id = ?', libraryId).map((c) => c.id)).toEqual([keptId]);
    });

    test('a page whose new reply could not be used keeps all of its concepts', async () => {
      const { libraryId } = await importPages('kept-on-failure', ['APPLY-PAGE']);
      const page = get('SELECT * FROM page WHERE library_id = ?', libraryId)!;
      const oldId = run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', libraryId, page.id, 'Old idea', 'It used to be here.', 5);
      const newText = 'NEVER-GOOD-PAGE ' + 'word '.repeat(200);
      run('UPDATE page SET pending_text = ?, pending_fingerprint = ?, pending_kind = ? WHERE id = ?', newText, fingerprint(newText), 'changed', page.id);
      await until(approveUpdate(libraryId, [page.id]).id, 'ready');
      expect(get('SELECT failed FROM page WHERE id = ?', page.id)!.failed).toMatch(/could not be used/);
      // Nothing new was written, so nothing is taken away.
      expect(get('SELECT id FROM concept WHERE id = ?', oldId)).toBeDefined();
    });
  });

  describe('words around a plain-JavaScript bug hunt', () => {
    test('are written again from what the broken code really does, and the real failure is what Claude is given', async () => {
      const before = sent.length;
      const { libraryId } = await importPages('grounded', ['JS-HUNT-PAGE']);
      const asked = sent.slice(before).filter((r) => r.id.startsWith('bugwords-'));
      expect(asked).toHaveLength(1);
      expect(asked[0].user).toContain('- "reverses a list of three" fails: ');
      expect(asked[0].user).toContain('- "an empty list stays empty" passes');
      const saved = exercises(libraryId)[0];
      expect(saved.description).toMatch(/^Grounded\. - "reverses a list of three" fails: /);
      expect(JSON.parse(saved.hints)).toEqual(['Grounded one.', 'Grounded two.', 'Grounded three.']);
      expect(saved.runtime).toBe('js');
    });

    test('are kept as Claude first wrote them when the new words cannot be used', async () => {
      wordsFail = true;
      let libraryId = 0;
      try {
        ({ libraryId } = await importPages('not-grounded', ['JS-HUNT-PAGE']));
      } finally {
        wordsFail = false;
      }
      const saved = exercises(libraryId)[0];
      expect(saved.description).toBe(JS_BUG.description);
      expect(JSON.parse(saved.hints)).toEqual(JS_BUG.hints);
    });
  });

  describe('writing another exercise', () => {
    const conceptIn = (libraryId: number, i = 0) => mapFor(libraryId).concepts[i].id;

    test('writes another of the same kind', async () => {
      const { libraryId } = await importPages('more', ['APPLY-PAGE', 'ORDER-PAGE']);
      const apply = await topUp(conceptIn(libraryId, 0), 'exercise');
      const order = await topUp(conceptIn(libraryId, 1), 'exercise');
      expect([apply.message, order.message]).toEqual(['A new apply-it exercise was added.', 'A new ordering exercise was added.']);
      expect(exercises(libraryId).map((b) => b.kind)).toEqual(['apply', 'order', 'apply', 'order']);
    });

    test('writes the type that was picked, whatever the concept has now', async () => {
      // The page reply gives this concept an apply exercise to begin with.
      const { libraryId } = await importPages('picked', ['APPLY-PAGE JS-BUG-PAGE']);
      const id = conceptIn(libraryId);
      const before = sent.length;
      expect((await topUp(id, 'exercise', 'order')).message).toBe('A new ordering exercise was added.');
      expect((await topUp(id, 'exercise', 'code')).message).toBe('A new bug hunt was added.');
      expect((await topUp(id, 'exercise', 'apply')).message).toBe('A new apply-it exercise was added.');
      expect((await topUp(id, 'exercise', 'design')).message).toBe('A new design fix was added.');
      expect(sent.slice(before).map((r) => r.id.split('-')[0])).toEqual(['order', 'bug', 'bugwords', 'apply', 'design']);
      expect(exercises(libraryId).map((b) => b.kind)).toEqual(['apply', 'order', 'code', 'apply', 'design']);
      // The new bug hunt is plain JavaScript, and was run for real before it was saved.
      expect(all('SELECT runtime, description FROM bug WHERE kind = ? AND concept_id = ?', 'code', id).map((b) => [b.runtime, b.description.startsWith('Grounded. ')])).toEqual([['js', true]]);
      // The newest one is what the concept shows.
      expect(mapFor(libraryId).concepts[0].exerciseKind).toBe('design');
    });

    test('says plainly when the picked type does not fit, and saves nothing', async () => {
      const { libraryId } = await importPages('no-fit', ['APPLY-PAGE BUG-NONE']);
      const before = exercises(libraryId).length;
      await expect(topUp(conceptIn(libraryId), 'exercise', 'code')).rejects.toThrow('A bug hunt does not fit this concept, so nothing was saved.');
      expect(exercises(libraryId)).toHaveLength(before);
    });

    test('says plainly when the picked bug hunt fails its checks, and saves nothing', async () => {
      // The stand-in writes a bug whose broken code behaves like the working code.
      const { libraryId } = await importPages('bad-bug', ['APPLY-PAGE JS-BUG-PAGE BAD-JS-BUG']);
      const before = exercises(libraryId).length;
      await expect(topUp(conceptIn(libraryId), 'exercise', 'code')).rejects.toThrow('The new bug hunt did not pass its checks, so nothing was saved. Try again.');
      expect(exercises(libraryId)).toHaveLength(before);
    });

    test('a new exercise starts open even when an earlier one was solved, and the concept stays solid', async () => {
      const { libraryId } = await importPages('solved-then-another', ['APPLY-PAGE JS-BUG-PAGE']);
      const id = conceptIn(libraryId);
      run('INSERT INTO quiz_pass (concept_id, passed_at) VALUES (?, ?)', id, now());
      recordAttempt({ bugId: activeBug(id)!.id, mode: 'apply', answer: 'a good answer', correct: true });
      let concept = mapFor(libraryId).concepts[0];
      expect([concept.status, concept.bugState, concept.activeExerciseDone]).toEqual(['solid', 'fixed', true]);

      await topUp(id, 'exercise', 'order');
      concept = mapFor(libraryId).concepts[0];
      // Practice you ask for never takes away what you earned, but the new exercise has not been done.
      expect([concept.status, concept.bugState, concept.exerciseKind, concept.activeExerciseDone]).toEqual(['solid', 'fixed', 'order', false]);

      recordAttempt({ bugId: activeBug(id)!.id, mode: 'order', answer: '0,1', correct: true });
      expect(mapFor(libraryId).concepts[0].activeExerciseDone).toBe(true);
    });

    test('without a type it still writes another of the same kind', async () => {
      const { libraryId } = await importPages('same-kind', ['ORDER-PAGE']);
      expect((await topUp(conceptIn(libraryId), 'exercise')).message).toBe('A new ordering exercise was added.');
    });

    test('for a concept with no exercise, asks once for whichever kind fits', async () => {
      const { libraryId } = await importPages('none-yet', ['NEVER-GOOD-ORDER BAD-ORDER-PAGE EXERCISE-APPLY']);
      expect(exercises(libraryId)).toHaveLength(0);
      const before = sent.length;
      const result = await topUp(conceptIn(libraryId), 'exercise');
      expect(result.message).toBe('A new apply-it exercise was added.');
      expect(sent.slice(before).map((r) => r.id.split('-')[0])).toEqual(['exercise']);
    });

    test('says plainly when nothing fits', async () => {
      const { libraryId } = await importPages('nothing-fits', ['NEVER-GOOD-ORDER BAD-ORDER-PAGE EXERCISE-NONE']);
      await expect(topUp(conceptIn(libraryId), 'exercise')).rejects.toThrow('Claude could not write a hands-on exercise for this concept.');
    });
  });
});
