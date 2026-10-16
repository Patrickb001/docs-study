// The design fix API: what the screen may see, how a design is checked, and when a concept turns solid.
import { ApolloServer } from '@apollo/server';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { get, now, run } from '../db.ts';
import { useClaude, type ClaudeRequest } from '../generator/claude.ts';
import { JS_BUG } from '../generator/bugs.fixture.ts';
import { SHOP_DESIGN } from '../generator/design.fixture.ts';
import { saveExplainer } from '../generator/explain.ts';
import { APPLY_FIXTURE, ORDER_FIXTURE } from '../generator/exercises.fixture.ts';
import { verifyOrder } from '../generator/exercises.ts';
import { fingerprint } from '../importer/clean.ts';
import { addApply, addBug, addDesign, addOrder, mapFor } from '../store.ts';
import { resolvers, typeDefs } from './schema.ts';

const Q = resolvers.Query as any;
const M = resolvers.Mutation as any;
let libraryId = 0;
let conceptId = 0;
let designId = 0;

beforeAll(() => {
  libraryId = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Design API', 'https://example.com/a', 'list', now());
  const pageId = run('INSERT INTO page (library_id, url, title, text, fingerprint, position, generated) VALUES (?, ?, ?, ?, ?, ?, 1)', libraryId, 'https://example.com/a', 'Event-driven shop', 'text', 'fp', 0);
  conceptId = run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', libraryId, pageId, 'Order events', 'Orders go through a queue.', 0);
  designId = addDesign(conceptId, SHOP_DESIGN);
});

describe('design fix API', () => {
  test('shows the broken design, goals and parts to add, but never the checks or the answer', () => {
    const fix = Q.designFix(null, { conceptId: String(conceptId) });
    expect(fix.parts).toEqual(SHOP_DESIGN.broken.parts);
    expect(fix.links).toEqual(SHOP_DESIGN.broken.links);
    expect(fix.goals).toEqual(SHOP_DESIGN.goals);
    expect(fix.palette).toEqual(SHOP_DESIGN.palette);
    expect(fix.docTitle).toBe('Event-driven shop');
    expect(JSON.stringify(fix)).not.toContain('neverWaits');
    expect(JSON.stringify(fix)).not.toContain('queue-1');
    expect(Q.bug(null, { conceptId: String(conceptId) })).toBeNull();
    expect(mapFor(libraryId).concepts[0].exerciseKind).toBe('design');
  });

  test('checking the broken design names what fails and keeps the answer hidden', async () => {
    const r = await M.checkDesign(null, { designId: String(designId), design: JSON.stringify(SHOP_DESIGN.broken), hintsUsed: 0 });
    expect(r.solved).toBe(false);
    expect(r.solution).toBeNull();
    expect(r.checks.find((c: any) => !c.pass).message).toBe('Order service still waits on Inventory service.');
  });

  test('a fixed design is solved, shows one way to fix it, and makes the concept solid once the quiz is passed', async () => {
    run('INSERT INTO quiz_pass (concept_id, passed_at) VALUES (?, ?)', conceptId, now());
    const r = await M.checkDesign(null, { designId: String(designId), design: JSON.stringify(SHOP_DESIGN.working), hintsUsed: 1 });
    expect(r.solved).toBe(true);
    expect(r.solution).toEqual(SHOP_DESIGN.working);
    const concept = mapFor(libraryId).concepts[0];
    expect(concept.bugState).toBe('fixed');
    expect(concept.status).toBe('solid');
  });

  test('a malformed or oversized design gets a plain error and records nothing', async () => {
    const attempts = () => get('SELECT COUNT(*) AS n FROM attempt WHERE bug_id = ?', designId)!.n;
    const before = attempts();
    await expect(M.checkDesign(null, { designId: String(designId), design: '{not json', hintsUsed: 0 })).rejects.toThrow('That design could not be checked.');
    const huge = JSON.stringify({ parts: Array.from({ length: 41 }, (_, i) => ({ id: `s${i}`, kind: 'service', label: `S${i}` })), links: [] });
    await expect(M.checkDesign(null, { designId: String(designId), design: huge, hintsUsed: 0 })).rejects.toThrow('That design could not be checked.');
    expect(attempts()).toBe(before);
  });

  test('startImport takes a list of links and passes on a plain error for a bad line', async () => {
    await expect(M.startImport(null, { urls: ['https://example.com/a', 'nope'], pageLimit: 0, name: 'X' })).rejects.toThrow('Link 2 does not look like a link.');
  });
});

// These run real GraphQL documents through the real schema, the way the screens send them.
describe('markdown files API', () => {
  const server = new ApolloServer({ typeDefs, resolvers });
  const words = (n: number) => 'study '.repeat(n).trim();
  let filesLibraryId = 0;

  async function ask(query: string, variables: Record<string, unknown> = {}) {
    const res = await server.executeOperation({ query, variables });
    if (res.body.kind !== 'single') throw new Error('Expected a single result.');
    return res.body.singleResult as { data: any; errors?: readonly { message: string }[] };
  }

  beforeAll(async () => {
    await server.start();
    filesLibraryId = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'My notes', '', 'files', now());
    run('INSERT INTO page (library_id, url, title, text, fingerprint, position, generated) VALUES (?, ?, ?, ?, ?, ?, 1)', filesLibraryId, 'file:notes/a.md', 'A', words(200), fingerprint(words(200)), 0);
    run('INSERT INTO import_job (library_id, status, created_at) VALUES (?, ?, ?)', filesLibraryId, 'ready', now());
  });
  afterAll(() => server.stop());

  test('files alone can start an import, with no links', async () => {
    const r = await ask('mutation Start($files: [FileInput!]) { startImport(urls: [], files: $files) { libraryId } }', { files: [{ name: 'notes/start.md', text: words(200) }] });
    expect(r.errors).toBeUndefined();
    const library = get('SELECT name, way_in FROM library WHERE id = ?', Number(r.data.startImport.libraryId))!;
    expect([library.name, library.way_in]).toEqual(['notes', 'files']);
  });

  test('adding files returns a plain message and the changes waiting, with a cost for each', async () => {
    const r = await ask(
      'mutation Add($id: ID!, $files: [FileInput!]!) { addFiles(libraryId: $id, files: $files) { message changes { title kind estimateUsd } } }',
      { id: String(filesLibraryId), files: [{ name: 'notes/a.md', text: words(200) + ' edited' }, { name: 'notes/b.md', text: words(1000) }] },
    );
    expect(r.errors).toBeUndefined();
    expect(r.data.addFiles.message).toBe('1 new file and 1 changed file to review.');
    expect(r.data.addFiles.changes.map((c: any) => [c.title, c.kind])).toEqual([['A', 'changed'], ['b', 'new']]);
    expect(r.data.addFiles.changes[1].estimateUsd).toBe(0.04);
  });

  test('the library list counts the pages that came from files, not the new ones still waiting', async () => {
    const r = await ask('query { libraries { id fileCount } }');
    expect(r.data.libraries.find((l: any) => l.id === String(filesLibraryId)).fileCount).toBe(1);
  });

  test('a refusal comes back as a plain sentence', async () => {
    const r = await ask('mutation Add($files: [FileInput!]!) { addFiles(libraryId: "999999", files: $files) { message } }', { files: [] });
    expect(r.errors?.[0].message).toBe('That source could not be found.');
  });
});

describe('summary API', () => {
  const server = new ApolloServer({ typeDefs, resolvers });
  const sent: ClaudeRequest[] = [];
  const reply = { gist: 'A fuller summary.', paragraphs: ['One.', 'Two.', 'Three.'], example: null, scenario: 'A worked scenario from the page.', watchOut: ['Careful.'], terms: [{ term: 'System', meaning: 'Steps that run themselves.' }] };
  let summaryConceptId = 0;

  async function ask(query: string) {
    const res = await server.executeOperation({ query });
    if (res.body.kind !== 'single') throw new Error('Expected a single result.');
    return res.body.singleResult as { data: any; errors?: readonly { message: string }[] };
  }

  beforeAll(async () => {
    await server.start();
    const library = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Summaries', '', 'files', now());
    const page = run('INSERT INTO page (library_id, url, title, text, fingerprint, position, generated) VALUES (?, ?, ?, ?, ?, ?, 1)', library, 'file:s.md', 'S', 'Text.', 'fp', 0);
    summaryConceptId = run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', library, page, 'Systems', 'Systems beat willpower.', 0);
    saveExplainer(summaryConceptId, { gist: 'A short old summary.', paragraphs: ['Old.'], example: null, watchOut: [], terms: [] });
    useClaude({
      async send(request) { sent.push(request); return { id: request.id, ok: true, text: JSON.stringify(reply), tokensIn: 900, tokensOut: 400, error: '' }; },
      async createBatch() { throw new Error('not used'); },
      async batchDone() { return true; },
      async batchResults() { return []; },
    });
  });
  afterAll(async () => { useClaude(null); await server.stop(); });

  test('asking for a summary that is saved returns it, without asking Claude and without a scenario if it has none', async () => {
    const r = await ask(`mutation { writeExplainer(conceptId: ${summaryConceptId}) { gist scenario } }`);
    expect(r.errors).toBeUndefined();
    expect(r.data.writeExplainer).toEqual({ gist: 'A short old summary.', scenario: null });
    expect(sent).toHaveLength(0);
  });

  test('a rewrite replaces the saved summary, and the summary query then shows the new one with its scenario', async () => {
    const r = await ask(`mutation { writeExplainer(conceptId: ${summaryConceptId}, rewrite: true) { gist scenario } }`);
    expect(r.errors).toBeUndefined();
    expect(r.data.writeExplainer).toEqual({ gist: 'A fuller summary.', scenario: 'A worked scenario from the page.' });
    expect(sent).toHaveLength(1);
    const after = await ask(`query { explainer(conceptId: ${summaryConceptId}) { gist scenario } }`);
    expect(after.data.explainer).toEqual({ gist: 'A fuller summary.', scenario: 'A worked scenario from the page.' });
  });
});

describe('exercise API', () => {
  const server = new ApolloServer({ typeDefs, resolvers });
  let applyConcept = 0;
  let orderConcept = 0;
  let applyId = 0;
  let orderId = 0;
  let stepIds: { id: number; text: string }[] = [];

  async function ask(query: string) {
    const res = await server.executeOperation({ query });
    if (res.body.kind !== 'single') throw new Error('Expected a single result.');
    return res.body.singleResult as { data: any; errors?: readonly { message: string }[] };
  }

  beforeAll(async () => {
    await server.start();
    const library = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Exercises', '', 'files', now());
    const page = run('INSERT INTO page (library_id, url, title, text, fingerprint, position, generated) VALUES (?, ?, ?, ?, ?, ?, 1)', library, 'file:e.md', 'Habits', 'Text.', 'fp', 0);
    applyConcept = run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', library, page, 'Worst day', 'Plan for it.', 0);
    orderConcept = run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', library, page, 'Audit', 'Four steps.', 1);
    applyId = addApply(applyConcept, APPLY_FIXTURE);
    const made = verifyOrder(ORDER_FIXTURE, () => 0.4);
    if (!made.ok) throw new Error(made.reason);
    orderId = addOrder(orderConcept, made.order);
    useClaude({
      async send(request) {
        return { id: request.id, ok: true, text: JSON.stringify({ points: [{ covered: true, comment: 'Yes.' }, { covered: false, comment: 'Not yet.' }, { covered: false, comment: 'Missing.' }], summary: 'A start.' }), tokensIn: 300, tokensOut: 60, error: '' };
      },
      async createBatch() { throw new Error('not used'); },
      async batchDone() { return true; },
      async batchResults() { return []; },
    });
  });
  afterAll(async () => { useClaude(null); await server.stop(); });

  test('Apply it shows the situation, the task and the hints, and never the checklist or the model answer', async () => {
    const r = await ask(`query { applyIt(conceptId: ${applyConcept}) { id scenario task hints docTitle } }`);
    expect(r.errors).toBeUndefined();
    expect(r.data.applyIt).toMatchObject({ scenario: APPLY_FIXTURE.scenario, task: APPLY_FIXTURE.task, hints: APPLY_FIXTURE.hints, docTitle: 'Habits' });
    expect(JSON.stringify(r.data)).not.toContain(APPLY_FIXTURE.rubric[0]);
    expect(JSON.stringify(r.data)).not.toContain(APPLY_FIXTURE.modelAnswer);
  });

  test('the ordering shows the shuffled steps with plain positions as ids, and never the right sequence or the note', async () => {
    const r = await ask(`query { orderIt(conceptId: ${orderConcept}) { id instruction steps { id text } hints } }`);
    expect(r.errors).toBeUndefined();
    stepIds = r.data.orderIt.steps;
    expect(stepIds.map((s) => s.id)).toEqual([0, 1, 2, 3]);
    expect(stepIds.map((s) => s.text).sort()).toEqual([...ORDER_FIXTURE.steps].sort());
    expect(stepIds.map((s) => s.text)).not.toEqual(ORDER_FIXTURE.steps);
    expect(JSON.stringify(r.data)).not.toContain(ORDER_FIXTURE.note);
  });

  test('a concept that has the other kind of exercise returns nothing for this one', async () => {
    const r = await ask(`query { applyIt(conceptId: ${orderConcept}) { id } orderIt(conceptId: ${applyConcept}) { id } }`);
    expect(r.data).toEqual({ applyIt: null, orderIt: null });
  });

  test('checking an apply answer returns each point with its comment, and the model answer only once it passes', async () => {
    const answer = 'I would study before work and, on a bad day, do just one minute.';
    const first = await ask(`mutation { checkApply(exerciseId: ${applyId}, answer: ${JSON.stringify(answer)}, hintsUsed: 0) { solved covered needed summary modelAnswer points { text covered comment } } }`);
    expect(first.errors).toBeUndefined();
    expect(first.data.checkApply).toMatchObject({ solved: false, covered: 1, needed: 2, summary: 'A start.', modelAnswer: null });
    expect(first.data.checkApply.points[0]).toEqual({ text: APPLY_FIXTURE.rubric[0], covered: true, comment: 'Yes.' });
  });

  test('checking an order marks each place, and turns the concept solid once the quiz is passed and the order is right', async () => {
    const right = ORDER_FIXTURE.steps.map((text) => stepIds.find((s) => s.text === text)!.id);
    const wrong = await ask(`mutation { checkOrder(exerciseId: ${orderId}, order: [${[right[1], right[0], right[2], right[3]]}], hintsUsed: 1) { solved placed correctCount total note } }`);
    expect(wrong.data.checkOrder).toEqual({ solved: false, placed: [false, false, true, true], correctCount: 2, total: 4, note: null });

    run('INSERT INTO quiz_pass (concept_id, passed_at) VALUES (?, ?)', orderConcept, now());
    const solved = await ask(`mutation { checkOrder(exerciseId: ${orderId}, order: [${right}], hintsUsed: 1) { solved note } }`);
    expect(solved.data.checkOrder).toEqual({ solved: true, note: ORDER_FIXTURE.note });
    const concept = mapFor(Number(get('SELECT library_id FROM concept WHERE id = ?', orderConcept)!.library_id)).concepts.find((c) => c.id === orderConcept)!;
    expect([concept.exerciseKind, concept.bugState, concept.status]).toEqual(['order', 'fixed', 'solid']);
  });

  test('a bad request comes back as a plain sentence', async () => {
    const r = await ask(`mutation { checkOrder(exerciseId: ${orderId}, order: [0, 0, 1, 2], hintsUsed: 0) { solved } }`);
    expect(r.errors?.[0].message).toBe('That order could not be checked.');
  });
});

describe('bug hunt on plain JavaScript', () => {
  let jsConceptId = 0;
  let jsBugId = 0;

  beforeAll(() => {
    const lib = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'JS API', 'https://example.com/js', 'list', now());
    const pageId = run('INSERT INTO page (library_id, url, title, text, fingerprint, position, generated) VALUES (?, ?, ?, ?, ?, ?, 1)', lib, 'https://example.com/js', 'Reversing a list', 'text', 'fp-js', 0);
    jsConceptId = run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', lib, pageId, 'Reverse a list', 'Point each node at the one before it.', 0);
    jsBugId = addBug(jsConceptId, JS_BUG);
  });

  test('tells the screen which kind of bug hunt it is, and shows the broken code only', () => {
    const bug = Q.bug(null, { conceptId: String(jsConceptId) });
    expect(bug.runtime).toBe('js');
    expect(bug.brokenCode).toBe(JS_BUG.brokenCode);
    expect(JSON.stringify(bug)).not.toContain(JS_BUG.workingCode);
  });

  test('checks a fix with the plain JavaScript runner', async () => {
    const wrong = await M.checkBugFix(null, { bugId: String(jsBugId), code: JS_BUG.brokenCode, hintsUsed: 0 });
    expect(wrong).toMatchObject({ ran: true, solved: false });
    const right = await M.checkBugFix(null, { bugId: String(jsBugId), code: JS_BUG.workingCode, hintsUsed: 1 });
    expect(right).toMatchObject({ ran: true, solved: true, timedOut: false, error: '' });
  });

  test('says so when the code never finishes', async () => {
    const r = await M.checkBugFix(null, { bugId: String(jsBugId), code: JS_BUG.loopingCode, hintsUsed: 0 });
    expect(r).toMatchObject({ ran: false, solved: false, timedOut: true, error: 'Your code ran for too long. It may be stuck in an endless loop.' });
  });
});

describe('write another exercise API', () => {
  const server = new ApolloServer({ typeDefs, resolvers });
  const sent: ClaudeRequest[] = [];
  let pickConcept = 0;
  let pickLibrary = 0;

  async function ask(query: string) {
    const res = await server.executeOperation({ query });
    if (res.body.kind !== 'single') throw new Error('Expected a single result.');
    return res.body.singleResult as { data: any; errors?: readonly { message: string }[] };
  }

  beforeAll(async () => {
    await server.start();
    pickLibrary = run('INSERT INTO library (name, source_url, way_in, created_at) VALUES (?, ?, ?, ?)', 'Picking', '', 'files', now());
    const page = run('INSERT INTO page (library_id, url, title, text, fingerprint, position, generated) VALUES (?, ?, ?, ?, ?, ?, 1)', pickLibrary, 'file:p.md', 'Habits', 'Text with ```js\nlet a;\n``` code.', 'fp', 0);
    pickConcept = run('INSERT INTO concept (library_id, page_id, name, summary, position, fits) VALUES (?, ?, ?, ?, ?, ?)', pickLibrary, page, 'Worst day', 'Plan for it.', 0, 'code,order');
    useClaude({
      async send(request) {
        sent.push(request);
        const body = request.id.startsWith('order-') ? { order: ORDER_FIXTURE } : request.id.startsWith('apply-') ? { apply: APPLY_FIXTURE } : { bug: null };
        return { id: request.id, ok: true, text: JSON.stringify(body), tokensIn: 300, tokensOut: 60, error: '' };
      },
      async createBatch() { throw new Error('not used'); },
      async batchDone() { return true; },
      async batchResults() { return []; },
    });
  });
  afterAll(async () => { useClaude(null); await server.stop(); });

  test('the concept map lists the types that fit each concept', async () => {
    const r = await ask(`query { conceptMap(libraryId: ${pickLibrary}) { concepts { name fits } } }`);
    expect(r.errors).toBeUndefined();
    expect(r.data.conceptMap.concepts).toEqual([{ name: 'Worst day', fits: ['code', 'order'] }]);
  });

  test('writes the type that was picked', async () => {
    const r = await ask(`mutation { topUp(conceptId: ${pickConcept}, what: EXERCISE, kind: ORDER) { added message } }`);
    expect(r.errors).toBeUndefined();
    expect(r.data.topUp).toEqual({ added: 1, message: 'A new ordering exercise was added.' });
    expect(sent.map((s) => s.id.split('-')[0])).toEqual(['order']);
  });

  test('says plainly when the type picked does not fit', async () => {
    const r = await ask(`mutation { topUp(conceptId: ${pickConcept}, what: EXERCISE, kind: BUG) { added message } }`);
    expect(r.errors?.[0].message).toBe('A bug hunt does not fit this concept, so nothing was saved.');
  });

  test('a mutation with no kind still works, as before', async () => {
    const r = await ask(`mutation { topUp(conceptId: ${pickConcept}, what: EXERCISE) { message } }`);
    expect(r.errors).toBeUndefined();
    expect(r.data.topUp.message).toBe('A new ordering exercise was added.');
  });
});
