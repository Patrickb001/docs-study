// Runs imports and doc updates. Progress is saved after each step, so a restart picks up where it left off.
import { config } from '../config.ts';
import { all, get, now, run, type Row } from '../db.ts';
import { claude, claudeReady, type ClaudeReply } from '../generator/claude.ts';
import { runtimeOf, verifyBug, type RunResult } from '../generator/bugCheck.ts';
import { estimateUsd } from '../generator/estimate.ts';
import { verifyDesign, type NewDesign } from '../generator/designCheck.ts';
import { verifyApply, verifyOrder, type NewApply, type NewOrder } from '../generator/exercises.ts';
import { applyRequest, bugRequest, bugWordsRequest, designRequest, exerciseRequest, linksRequest, orderRequest, pageRequest, questionsRequest, readApplyReply, readBugReply, readBugWordsReply, readDesignReply, readExerciseReply, readLinksReply, readOrderReply, readPageReply, readQuestionsReply, type NewBug } from '../generator/prompt.ts';
import { withoutLoops } from '../rules/status.ts';
import { activeQuestions, addApply, addBug, addDesign, addOrder, addQuestion, storedFits } from '../store.ts';
import { CLEANER_VERSION, fingerprint, wordCount } from './clean.ts';
import { checkFiles, isFileUrl, readFiles, type ChosenFile } from './files.ts';
import { checkLinkList, readPages, readSource } from './read.ts';

type JobStatus = 'reading' | 'estimated' | 'waiting' | 'writing' | 'linking' | 'ready' | 'failed';

const job = (id: number): Row => {
  const row = get('SELECT * FROM import_job WHERE id = ?', id);
  if (!row) throw new Error('That import could not be found.');
  return row;
};
const setJob = (id: number, status: JobStatus, message?: string) =>
  message === undefined ? run('UPDATE import_job SET status = ? WHERE id = ?', status, id) : run('UPDATE import_job SET status = ?, message = ? WHERE id = ?', status, message, id);
const addTokens = (id: number, reply: ClaudeReply) => run('UPDATE import_job SET tokens_in = tokens_in + ?, tokens_out = tokens_out + ? WHERE id = ?', reply.tokensIn, reply.tokensOut, id);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Background work must never crash the server. A failure is written onto the job so the screen can show it.
function inBackground(jobId: number, work: () => Promise<void>) {
  work().catch((err) => {
    console.error(err);
    setJob(jobId, 'failed', String(err?.message ?? err).slice(0, 300));
  });
}

// ---------- step 1 to 4: read the pages and estimate the cost

export function startImport(urls: string[], pageLimit: number, name = '', files: ChosenFile[] = []): Row {
  checkFiles(files);
  const pasted = urls.map((u) => u.trim()).filter(Boolean).length;
  if (pasted === 0 && files.length === 0) throw new Error('Paste a link or choose a markdown file first.');
  const list = pasted > 0 ? checkLinkList(urls) : [];
  // Several links pasted means "only these pages", even when they turn out to be the same page.
  // Deciding by what was pasted, not what is left, means a list never falls back to crawling a site.
  const wayIn = pasted === 0 ? 'files' : pasted > 1 ? 'list' : 'web';
  // A name you give is kept. Without one, the library is named after the source once its pages are read.
  const libraryId = run('INSERT INTO library (name, source_url, way_in, cleaner, created_at) VALUES (?, ?, ?, ?, ?)', name.trim(), list.join('\n'), wayIn, CLEANER_VERSION, now());
  const jobId = run('INSERT INTO import_job (library_id, status, message, page_limit, created_at) VALUES (?, ?, ?, ?, ?)', libraryId, 'reading', 'Finding the pages', wayIn === 'web' ? Math.max(0, pageLimit) : 0, now());
  inBackground(jobId, () => readStep(jobId, files));
  return job(jobId);
}

async function readStep(jobId: number, files: ChosenFile[] = []) {
  const j = job(jobId);
  const library = get('SELECT * FROM library WHERE id = ?', j.library_id)!;
  const progress = (done: number, total: number) => setJob(jobId, 'reading', `Reading page ${done} of ${total}`);
  // The pages from links come first, then the files you chose. A source with no links is made of files alone.
  const fromLinks = library.way_in === 'files' ? null
    : library.way_in === 'list' ? await readPages(String(library.source_url).split('\n'), progress)
    : await readSource(library.source_url, j.page_limit, progress);
  const fromFiles = readFiles(files);
  const gathered = [...(fromLinks?.pages ?? []), ...fromFiles.pages];
  if (gathered.length === 0) throw new Error(fromLinks ? 'No pages with enough text were found at that link.' : 'None of these files have enough text to study.');
  // Two links can lead to the same article. Only the first is kept, so its concepts are not written twice.
  const seen = new Set<string>();
  const pages = gathered.filter((page) => {
    const print = fingerprint(page.text);
    if (seen.has(print)) return false;
    seen.add(print);
    return true;
  });
  const repeated = gathered.length - pages.length;
  run('UPDATE library SET name = ?, way_in = ? WHERE id = ?', library.name || fromLinks?.name || fromFiles.name, fromLinks?.wayIn ?? 'files', library.id);
  let words = 0;
  pages.forEach((page, i) => {
    words += wordCount(page.text);
    run('INSERT INTO page (library_id, url, title, text, fingerprint, position) VALUES (?, ?, ?, ?, ?, ?)', library.id, page.url, page.title, page.text, fingerprint(page.text), i);
  });
  const skipped = (fromLinks?.skipped ?? 0) + fromFiles.skipped;
  const failed = fromLinks?.failed.length ?? 0;
  const notes = [`${plural(pages.length, 'page')} read`];
  if (skipped > 0) notes.push(`${plural(skipped, 'short page')} skipped`);
  if (repeated > 0) notes.push(repeated === 1 ? '1 page repeated an earlier page and was skipped' : `${repeated} pages repeated earlier pages and were skipped`);
  if (fromFiles.leftOut > 0) notes.push(`${plural(fromFiles.leftOut, 'file')} left out`);
  if (failed > 0) notes.push(`${plural(failed, 'page')} could not be fetched`);
  run('UPDATE import_job SET words = ?, estimate_usd = ? WHERE id = ?', words, estimateUsd(words, 'batch'), jobId);
  setJob(jobId, 'estimated', notes.join('. ') + '.');
}

// ---------- step 5 and 6: send the requests

export async function confirmImport(jobId: number, mode: 'batch' | 'direct'): Promise<Row> {
  const j = job(jobId);
  if (j.status !== 'estimated') throw new Error('This import is not waiting for your approval.');
  if (!claudeReady()) throw new Error('No Claude API key is set. Add ANTHROPIC_API_KEY to your .env file and restart the app.');
  const estimate = estimateUsd(j.words, mode);
  if (estimate > config.spendLimitUsd) {
    throw new Error(`The estimate is $${estimate.toFixed(2)}, which is $${(estimate - config.spendLimitUsd).toFixed(2)} over your $${config.spendLimitUsd} limit. Import fewer pages, or raise SPEND_LIMIT_USD in your .env file.`);
  }
  run('UPDATE import_job SET mode = ?, estimate_usd = ? WHERE id = ?', mode, estimate, jobId);
  if (mode === 'batch') {
    const pages = all('SELECT id, title, text FROM page WHERE library_id = ? AND generated = 0 ORDER BY position', j.library_id);
    const batchId = await claude().createBatch(pages.map((p) => pageRequestFor(p as any)));
    run('UPDATE import_job SET batch_id = ? WHERE id = ?', batchId, jobId);
    setJob(jobId, 'waiting', 'Sent to Claude. Batches usually finish within an hour, and can take up to a day.');
  } else {
    setJob(jobId, 'writing', 'Claude is writing the questions and bugs');
    inBackground(jobId, () => writeDirect(jobId));
  }
  return job(jobId);
}

// The request for a page, with the names of the concepts it already has when it is being written again.
const pageRequestFor = (page: { id: number; title: string; text: string }) =>
  pageRequest(page, all('SELECT name FROM concept WHERE page_id = ? ORDER BY position', page.id).map((c) => c.name as string));

async function writeDirect(jobId: number) {
  const j = job(jobId);
  const pages = all('SELECT * FROM page WHERE library_id = ? AND generated = 0 AND failed = ? ORDER BY position', j.library_id, '');
  let next = 0;
  // Three pages at a time keeps an import quick without flooding the API.
  const worker = async () => {
    while (next < pages.length) {
      const page = pages[next++];
      const reply = await claude().send(pageRequestFor(page as any));
      addTokens(jobId, reply);
      await savePage(jobId, page, reply);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  await finish(jobId);
}

// ---------- step 7: collect batch replies

export async function pollBatches() {
  for (const j of all('SELECT * FROM import_job WHERE status = ? AND batch_id != ?', 'waiting', '')) {
    try {
      if (!claudeReady() || !(await claude().batchDone(j.batch_id))) continue;
      setJob(j.id, 'writing', 'Checking what Claude wrote');
      const replies = await claude().batchResults(j.batch_id);
      inBackground(j.id, async () => {
        for (const reply of replies) {
          addTokens(j.id, reply);
          const page = get('SELECT * FROM page WHERE id = ? AND library_id = ?', Number(reply.id.replace('page-', '')), j.library_id);
          if (page && !page.generated) await savePage(j.id, page, reply);
        }
        await finish(j.id);
      });
    } catch (err) {
      console.error('Could not check batch', j.batch_id, err);
    }
  }
}

// ---------- step 7 and 8: check one page's reply, save it, and check its bugs

async function savePage(jobId: number, page: Row, firstReply: ClaudeReply) {
  let read = firstReply.ok ? readPageReply(firstReply.text) : { ok: false as const, reason: firstReply.error };
  if (!read.ok) {
    // One ordinary retry, as the design says.
    const retry = await claude().send(pageRequestFor(page as any));
    addTokens(jobId, retry);
    read = retry.ok ? readPageReply(retry.text) : { ok: false as const, reason: retry.error };
  }
  if (!read.ok) {
    run('UPDATE page SET failed = ? WHERE id = ?', ('Claude\u2019s reply could not be used: ' + read.reason).slice(0, 300), page.id);
    return;
  }
  const written: number[] = [];
  for (const [i, c] of read.value.concepts.entries()) {
    // When a page is updated, a concept with the same name keeps its place on the map and its history.
    const existing = get('SELECT id FROM concept WHERE page_id = ? AND lower(name) = lower(?)', page.id, c.name);
    const conceptId = existing
      ? (run('UPDATE concept SET summary = ? WHERE id = ?', c.summary, existing.id), existing.id as number)
      : run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', page.library_id, page.id, c.name, c.summary, page.position * 10 + i);
    for (const q of c.questions) addQuestion(conceptId, q);
    // The kind that was written and passed its checks. The types that fit always include it.
    let kept: string | null = null;
    if (c.bug) {
      const checked = await checkedBug(jobId, page, c, c.bug);
      if (checked) { addBug(conceptId, await reworded(jobId, { id: page.id }, checked.bug, checked.broken)); kept = 'code'; }
    } else if (c.design) {
      const design = await checkedDesign(jobId, page, c, c.design);
      if (design) { addDesign(conceptId, design); kept = 'design'; }
    } else if (c.apply) {
      const apply = await checkedApply(jobId, page, c, c.apply);
      if (apply) { addApply(conceptId, apply); kept = 'apply'; }
    } else if (c.order) {
      const order = await checkedOrder(jobId, page, c, c.order);
      if (order) { addOrder(conceptId, order); kept = 'order'; }
    }
    run('UPDATE concept SET fits = ? WHERE id = ?', storedFits(c.fits, kept), conceptId);
    written.push(conceptId);
  }
  // A concept from the old text that the new text does not write again has nothing left to study: its questions were
  // retired with the page. It could never become solid, which would hold back every concept that waits for it. So it goes,
  // and its arrows with it.
  run(
    `DELETE FROM concept WHERE page_id = ? AND id NOT IN (${written.map(() => '?').join(', ')})
       AND NOT EXISTS (SELECT 1 FROM question q WHERE q.concept_id = concept.id AND q.retired = 0)`,
    page.id, ...written,
  );
  run('UPDATE page SET generated = 1, failed = ? WHERE id = ?', '', page.id);
  const done = get('SELECT COUNT(*) AS n FROM page WHERE library_id = ? AND generated = 1', page.library_id)!.n;
  const total = get('SELECT COUNT(*) AS n FROM page WHERE library_id = ?', page.library_id)!.n;
  setJob(jobId, 'writing', `${done} of ${plural(total, 'page')} done`);
}

// A bug is kept only if its tests pass on the working code and fail on the broken code. One retry, then it is dropped.
// It comes back with what the broken code really did, which is what its description is checked against.
async function checkedBug(jobId: number, page: Row, concept: { name: string; summary: string }, first: NewBug): Promise<{ bug: NewBug; broken?: RunResult } | null> {
  const tried = await verifyBug(first);
  if (tried.ok) return { bug: first, broken: tried.broken };
  const retry = await claude().send(bugRequest(page as any, concept, [first.description]));
  addTokens(jobId, retry);
  const read = retry.ok ? readBugReply(retry.text) : null;
  let why = !read ? 'Claude did not answer the second request' : !read.ok ? read.reason : !read.value.bug ? 'Claude gave no bug the second time' : '';
  if (read && read.ok && read.value.bug) {
    const again = await verifyBug(read.value.bug);
    if (again.ok) return { bug: read.value.bug, broken: again.broken };
    why = again.reason;
  }
  // Nothing on screen says why a concept has no bug hunt, so the reason goes in the terminal.
  console.log(`Left out a bug hunt for "${concept.name}". First try: ${tried.reason} Second try: ${why}`);
  return null;
}

// Claude writes good bugs but sometimes describes the failure wrongly, and a learner would trust it. For plain JavaScript,
// where the failing tests give a clear picture, the description and hints are written again from what really happened.
// If that cannot be done, the first words are kept.
async function reworded(jobId: number | null, page: { id: number }, bug: NewBug, broken: RunResult | undefined): Promise<NewBug> {
  if (!broken || runtimeOf(bug) !== 'js') return bug;
  const reply = await claude().send(bugWordsRequest(page.id, bug, broken));
  if (jobId !== null) addTokens(jobId, reply);
  const read = reply.ok ? readBugWordsReply(reply.text) : null;
  return read && read.ok ? { ...bug, description: read.value.description, hints: read.value.hints } : bug;
}

// A design fix is kept only if its working design passes every check and its broken design fails one. One retry, then it is dropped.
async function checkedDesign(jobId: number, page: Row, concept: { name: string; summary: string }, raw: unknown): Promise<NewDesign | null> {
  const first = verifyDesign(raw);
  if (first.ok) return first.design;
  const retry = await claude().send(designRequest(page as any, concept, [], first.reason));
  addTokens(jobId, retry);
  const read = retry.ok ? readDesignReply(retry.text) : null;
  return read && read.ok ? read.design : null;
}

// An apply exercise is kept only if it is complete. One retry with the reason, then it is dropped.
async function checkedApply(jobId: number, page: Row, concept: { name: string; summary: string }, raw: unknown): Promise<NewApply | null> {
  const first = verifyApply(raw);
  if (first.ok) return first.apply;
  const retry = await claude().send(applyRequest(page as any, concept, [], first.reason));
  addTokens(jobId, retry);
  const read = retry.ok ? readApplyReply(retry.text) : null;
  return read && read.ok ? read.apply : null;
}

// An ordering is kept only if it has 3 to 7 different steps. One retry with the reason, then it is dropped.
async function checkedOrder(jobId: number, page: Row, concept: { name: string; summary: string }, raw: unknown): Promise<NewOrder | null> {
  const first = verifyOrder(raw);
  if (first.ok) return first.order;
  const retry = await claude().send(orderRequest(page as any, concept, [], first.reason));
  addTokens(jobId, retry);
  const read = retry.ok ? readOrderReply(retry.text) : null;
  return read && read.ok ? read.order : null;
}

// "3 concepts ready.", "3 concepts and 3 bug hunts ready.", or "4 concepts, 1 bug hunt and 2 design fixes ready."
function readyMessage(concepts: number, made: { code: number; design: number; apply: number; order: number }): string {
  const count = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;
  const parts = [
    made.code > 0 && count(made.code, 'bug hunt', 'bug hunts'),
    made.design > 0 && count(made.design, 'design fix', 'design fixes'),
    made.apply > 0 && count(made.apply, 'apply-it exercise', 'apply-it exercises'),
    made.order > 0 && count(made.order, 'ordering exercise', 'ordering exercises'),
  ].filter((part): part is string => !!part);
  if (parts.length === 0) return `${plural(concepts, 'concept')} ready.`;
  const last = parts.pop()!;
  return parts.length === 0 ? `${plural(concepts, 'concept')} and ${last} ready.` : `${plural(concepts, 'concept')}, ${parts.join(', ')} and ${last} ready.`;
}

// ---------- step 9 and 10: link the concepts and finish

async function finish(jobId: number) {
  const j = job(jobId);
  const concepts = all('SELECT id, name, summary FROM concept WHERE library_id = ? ORDER BY position', j.library_id);
  if (concepts.length === 0) throw new Error('Claude could not write study material from these pages. Try the import again.');
  const linked = get('SELECT COUNT(*) AS n FROM concept_link WHERE library_id = ?', j.library_id)!.n;
  if (j.kind === 'import' && concepts.length > 1 && linked === 0) {
    setJob(jobId, 'linking', 'Working out which concepts come first');
    const reply = await claude().send(linksRequest(j.library_id, concepts as any));
    addTokens(jobId, reply);
    const read = reply.ok ? readLinksReply(reply.text) : null;
    if (read && read.ok) {
      const ids = new Set(concepts.map((c) => c.id));
      const links = withoutLoops(read.value.links.filter((l) => ids.has(l.first) && ids.has(l.then)).map((l) => ({ firstId: l.first, thenId: l.then })));
      for (const l of links) run('INSERT INTO concept_link (library_id, first_id, then_id) VALUES (?, ?, ?)', j.library_id, l.firstId, l.thenId);
    }
  }
  run('UPDATE library SET last_checked_at = ? WHERE id = ?', now(), j.library_id);
  const failed = get('SELECT COUNT(*) AS n FROM page WHERE library_id = ? AND failed != ?', j.library_id, '')!.n;
  const kinds = all('SELECT b.kind, COUNT(*) AS n FROM bug b JOIN concept c ON c.id = b.concept_id WHERE c.library_id = ? AND b.retired = 0 GROUP BY b.kind', j.library_id);
  const count = (kind: string) => (kinds.find((k) => k.kind === kind)?.n as number | undefined) ?? 0;
  setJob(jobId, 'ready', readyMessage(concepts.length, { code: count('code'), design: count('design'), apply: count('apply'), order: count('order') }) + (failed ? ` ${plural(failed, 'page')} could not be used.` : ''));
}

// ---------- restarts

export function resumeJobs() {
  for (const j of all('SELECT * FROM import_job WHERE status IN (?, ?, ?)', 'reading', 'writing', 'linking')) {
    if (j.status === 'reading') setJob(j.id, 'failed', 'The app closed while reading the pages. Delete this source and add it again.');
    else if (!claudeReady()) setJob(j.id, 'failed', 'The app restarted without a Claude API key, so this import could not continue.');
    else if (j.status === 'linking') inBackground(j.id, () => finish(j.id));
    else inBackground(j.id, () => writeDirect(j.id));
  }
}

// ---------- doc updates, only after you approve

export interface Change {
  pageId: number;
  title: string;
  kind: 'changed' | 'new' | 'removed';
  questions: number;
  bugs: number;
  estimateUsd: number; // what it costs to rewrite this page now, at full price
}

export function pendingChanges(libraryId: number): Change[] {
  return all('SELECT * FROM page WHERE library_id = ? AND pending_kind IS NOT NULL ORDER BY position', libraryId).map((p) => ({
    pageId: p.id,
    title: p.title,
    kind: p.pending_kind,
    questions: get('SELECT COUNT(*) AS n FROM question q JOIN concept c ON c.id = q.concept_id WHERE c.page_id = ? AND q.retired = 0 AND q.flagged = 0', p.id)!.n,
    bugs: get('SELECT COUNT(*) AS n FROM bug b JOIN concept c ON c.id = b.concept_id WHERE c.page_id = ? AND b.retired = 0 AND b.flagged = 0', p.id)!.n,
    estimateUsd: p.pending_kind === 'removed' ? 0 : estimateUsd(wordCount(p.pending_text ?? ''), 'direct'),
  }));
}

// Fetches the pages again and compares fingerprints. This never calls Claude, so it costs nothing.
export async function checkForChanges(libraryId: number): Promise<Change[]> {
  const library = get('SELECT * FROM library WHERE id = ?', libraryId);
  if (!library) throw new Error('That source could not be found.');
  if (library.way_in === 'sample') throw new Error('The sample library is built in, so it has no docs to check.');
  if (library.way_in === 'files') throw new Error('This source was made from files you chose, so there is nothing to look up online. Use Add or update files instead.');
  const firstJob = get('SELECT page_limit FROM import_job WHERE library_id = ? AND kind = ? ORDER BY id LIMIT 1', libraryId, 'import');
  const everyPage = all('SELECT * FROM page WHERE library_id = ?', libraryId);
  // Pages from files are never looked up online. They change only when you add the files again.
  const pages = everyPage.filter((p) => !isFileUrl(p.url));
  // With a page limit, only look at the pages already imported, so the limit is respected.
  const limited = (firstJob?.page_limit ?? 0) > 0;
  const fresh = library.way_in === 'list'
    ? await readPages(String(library.source_url).split('\n'), () => {})
    : await readSource(library.source_url, limited ? firstJob!.page_limit : 0, () => {});
  const byUrl = new Map(fresh.pages.map((p) => [p.url, p]));
  // A crawled site cleaned by an older cleaner would show every page as changed. Take today's text
  // as the new starting point once instead, so nothing is rewritten that did not really change.
  if (library.way_in === 'web' && (library.cleaner ?? 1) < CLEANER_VERSION) {
    for (const p of pages) {
      const latest = byUrl.get(p.url);
      if (!latest || p.text === '') continue;
      p.fingerprint = fingerprint(latest.text);
      run('UPDATE page SET text = ?, fingerprint = ? WHERE id = ?', latest.text, p.fingerprint, p.id);
    }
    run('UPDATE library SET cleaner = ? WHERE id = ?', CLEANER_VERSION, libraryId);
  }
  run('UPDATE page SET pending_text = NULL, pending_fingerprint = NULL, pending_kind = NULL WHERE library_id = ? AND url NOT LIKE ?', libraryId, 'file:%');
  run('DELETE FROM page WHERE library_id = ? AND generated = 0 AND text = ? AND url NOT LIKE ?', libraryId, '', 'file:%');
  for (const p of pages) {
    const latest = byUrl.get(p.url);
    if (!latest) {
      if (!limited) run('UPDATE page SET pending_kind = ? WHERE id = ?', 'removed', p.id);
    } else if (fingerprint(latest.text) !== p.fingerprint) run('UPDATE page SET pending_text = ?, pending_fingerprint = ?, pending_kind = ? WHERE id = ?', latest.text, fingerprint(latest.text), 'changed', p.id);
  }
  if (!limited) {
    const known = new Set(pages.map((p) => p.url));
    let position = Math.max(-1, ...everyPage.map((p) => p.position as number));
    // A new page whose text is already in the library under another address is not a new page.
    const have = new Set(everyPage.map((p) => p.fingerprint as string).filter((f) => f !== ''));
    for (const p of fresh.pages.filter((x) => !known.has(x.url))) {
      const print = fingerprint(p.text);
      if (have.has(print)) continue;
      have.add(print);
      run('INSERT INTO page (library_id, url, title, text, fingerprint, position, pending_text, pending_fingerprint, pending_kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        libraryId, p.url, p.title, '', '', ++position, p.text, print, 'new');
    }
  }
  run('UPDATE library SET last_checked_at = ? WHERE id = ?', now(), libraryId);
  return pendingChanges(libraryId);
}

// ---------- files you choose: new ones, and new versions of ones already here

// Compares each file with the page it matches by path. Nothing is rewritten until you approve it, as with web changes.
export function addFiles(libraryId: number, files: ChosenFile[]): { message: string; changes: Change[] } {
  checkFiles(files);
  const library = get('SELECT * FROM library WHERE id = ?', libraryId);
  if (!library) throw new Error('That source could not be found.');
  if (library.way_in === 'sample') throw new Error('The sample library is built in, so you cannot add files to it.');
  const latest = get('SELECT status FROM import_job WHERE library_id = ? ORDER BY id DESC LIMIT 1', libraryId);
  if (latest && latest.status !== 'ready') throw new Error('This source is not ready yet. Wait for its import to finish, or delete it and add it again.');

  const read = readFiles(files);
  const existing = new Map(all('SELECT * FROM page WHERE library_id = ?', libraryId).map((p) => [p.url as string, p]));
  let position = Math.max(-1, ...[...existing.values()].map((p) => p.position as number));
  let added = 0;
  let changed = 0;
  let unchanged = 0;
  for (const page of read.pages) {
    const print = fingerprint(page.text);
    const old = existing.get(page.url);
    if (!old) {
      run('INSERT INTO page (library_id, url, title, text, fingerprint, position, pending_text, pending_fingerprint, pending_kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        libraryId, page.url, page.title, '', '', ++position, page.text, print, 'new');
      added++;
    } else if (old.pending_kind === 'new') {
      // A new file that is still waiting follows its latest version.
      run('UPDATE page SET title = ?, pending_text = ?, pending_fingerprint = ? WHERE id = ?', page.title, page.text, print, old.id);
      added++;
    } else if (print === old.fingerprint) {
      // The same text as before, so any change that was waiting is no longer a change.
      run('UPDATE page SET pending_text = NULL, pending_fingerprint = NULL, pending_kind = NULL WHERE id = ?', old.id);
      unchanged++;
    } else {
      run('UPDATE page SET pending_text = ?, pending_fingerprint = ?, pending_kind = ? WHERE id = ?', page.text, print, 'changed', old.id);
      changed++;
    }
  }
  const review = [added > 0 && plural(added, 'new file'), changed > 0 && plural(changed, 'changed file')].filter(Boolean).join(' and ');
  const notes = [review ? `${review} to review.` : 'No files changed.'];
  if (unchanged > 0) notes.push(`${plural(unchanged, 'file')} unchanged.`);
  if (read.skipped > 0) notes.push(`${plural(read.skipped, 'short file')} skipped.`);
  if (read.leftOut > 0) notes.push(`${plural(read.leftOut, 'file')} left out.`);
  return { message: notes.join(' '), changes: pendingChanges(libraryId) };
}

function retirePage(pageId: number) {
  run('DELETE FROM review WHERE question_id IN (SELECT q.id FROM question q JOIN concept c ON c.id = q.concept_id WHERE c.page_id = ?)', pageId);
  run('UPDATE question SET retired = 1 WHERE concept_id IN (SELECT id FROM concept WHERE page_id = ?)', pageId);
  run('UPDATE bug SET retired = 1 WHERE concept_id IN (SELECT id FROM concept WHERE page_id = ?)', pageId);
  // A summary describes the old text, so it goes too. A new one can be written from the new text.
  run('DELETE FROM concept_explainer WHERE concept_id IN (SELECT id FROM concept WHERE page_id = ?)', pageId);
}

export function approveUpdate(libraryId: number, pageIds: number[]): Row {
  if (!claudeReady()) throw new Error('No Claude API key is set. Add ANTHROPIC_API_KEY to your .env file and restart the app.');
  const chosen = pageIds.map((id) => get('SELECT * FROM page WHERE id = ? AND library_id = ? AND pending_kind IS NOT NULL', id, libraryId)).filter((p): p is Row => !!p);
  // Updates are written right away at full price, so they are held to the same spending limit as an import.
  const estimate = estimateUsd(chosen.reduce((sum, p) => sum + (p.pending_kind === 'removed' ? 0 : wordCount(p.pending_text ?? '')), 0), 'direct');
  if (estimate > config.spendLimitUsd) {
    throw new Error(`The estimate is $${estimate.toFixed(2)}, which is $${(estimate - config.spendLimitUsd).toFixed(2)} over your $${config.spendLimitUsd} limit. Update fewer pages, or raise SPEND_LIMIT_USD in your .env file.`);
  }
  let rewrite = 0;
  for (const p of chosen) {
    retirePage(p.id);
    if (p.pending_kind === 'removed') {
      run('UPDATE page SET pending_kind = NULL, failed = ? WHERE id = ?', 'This page was removed from the docs.', p.id);
    } else {
      run('UPDATE page SET text = pending_text, fingerprint = pending_fingerprint, pending_text = NULL, pending_fingerprint = NULL, pending_kind = NULL, generated = 0, failed = ? WHERE id = ?', '', p.id);
      rewrite++;
    }
  }
  const jobId = run('INSERT INTO import_job (library_id, kind, mode, status, message, created_at) VALUES (?, ?, ?, ?, ?, ?)', libraryId, 'update', 'direct', 'writing', `Rewriting ${plural(rewrite, 'page')}`, now());
  inBackground(jobId, () => writeDirect(jobId));
  return job(jobId);
}

// ---------- top-ups: more questions or another bug for one concept

export type ExerciseChoice = 'code' | 'design' | 'apply' | 'order';

export async function topUp(conceptId: number, what: 'questions' | 'exercise', kind?: ExerciseChoice): Promise<{ added: number; message: string }> {
  if (!claudeReady()) throw new Error('No Claude API key is set. Add ANTHROPIC_API_KEY to your .env file and restart the app.');
  const concept = get('SELECT c.*, p.title, p.text, p.id AS pid FROM concept c JOIN page p ON p.id = c.page_id WHERE c.id = ?', conceptId);
  if (!concept) throw new Error('That concept could not be found.');
  const page = { id: concept.pid, title: concept.title, text: concept.text };
  if (what === 'questions') {
    const reply = await claude().send(questionsRequest(page, concept as any, activeQuestions(conceptId).map((q) => q.prompt)));
    const read = reply.ok ? readQuestionsReply(reply.text) : null;
    if (!read || !read.ok) throw new Error('Claude\u2019s reply could not be used. Try again.');
    for (const q of read.value.questions) addQuestion(conceptId, q);
    return { added: read.value.questions.length, message: `${plural(read.value.questions.length, 'new question')} added.` };
  }
  // The type picked, or else another of the same kind. A concept that never had one gets one request that asks for whichever kind fits.
  const last = get('SELECT kind FROM bug WHERE concept_id = ? ORDER BY id DESC LIMIT 1', conceptId);
  const earlier = all('SELECT description FROM bug WHERE concept_id = ?', conceptId).map((b) => b.description as string);
  const picked = kind ?? (last?.kind as ExerciseChoice | undefined);

  // When a type was picked, "nothing came back" means it does not fit. Without one, it means no exercise was possible.
  const nothing = (plain: string) => new Error(kind ? `A ${plain} does not fit this concept, so nothing was saved.` : 'Claude could not write a hands-on exercise for this concept.');
  const unchecked = (plain: string) => new Error(`The new ${plain} did not pass its checks, so nothing was saved. Try again.`);

  if (picked === 'code') {
    const reply = await claude().send(bugRequest(page, concept as any, earlier));
    const read = reply.ok ? readBugReply(reply.text) : null;
    if (!read || !read.ok) throw new Error('Claude\u2019s reply could not be used. Try again.');
    if (!read.value.bug) throw kind ? nothing('bug hunt') : new Error('Claude could not write a bug for this concept.');
    const checked = await verifyBug(read.value.bug);
    if (!checked.ok) throw unchecked('bug hunt');
    addBug(conceptId, await reworded(null, page, read.value.bug, checked.broken));
    return { added: 1, message: 'A new bug hunt was added.' };
  }
  if (picked === 'design') {
    const reply = await claude().send(designRequest(page, concept as any, earlier));
    const read = reply.ok ? readDesignReply(reply.text) : null;
    if (!read || !read.ok) throw unchecked('design fix');
    if (!read.design) throw nothing('design fix');
    addDesign(conceptId, read.design);
    return { added: 1, message: 'A new design fix was added.' };
  }
  if (picked === 'apply') {
    const reply = await claude().send(applyRequest(page, concept as any, earlier));
    const read = reply.ok ? readApplyReply(reply.text) : null;
    if (!read || !read.ok) throw unchecked('apply-it exercise');
    if (!read.apply) throw nothing('apply-it exercise');
    addApply(conceptId, read.apply);
    return { added: 1, message: 'A new apply-it exercise was added.' };
  }
  if (picked === 'order') {
    const reply = await claude().send(orderRequest(page, concept as any, earlier));
    const read = reply.ok ? readOrderReply(reply.text) : null;
    if (!read || !read.ok) throw unchecked('ordering exercise');
    if (!read.order) throw nothing('ordering exercise');
    addOrder(conceptId, read.order);
    return { added: 1, message: 'A new ordering exercise was added.' };
  }

  const reply = await claude().send(exerciseRequest(page, concept as any));
  const read = reply.ok ? readExerciseReply(reply.text) : null;
  if (!read || !read.ok) throw new Error('Claude’s reply could not be used. Try again.');
  const { bug, design, apply, order } = read.value;
  // The first kind that passes its checks is kept.
  const checkedBug = bug ? await verifyBug(bug) : null;
  if (bug && checkedBug?.ok) {
    addBug(conceptId, await reworded(null, page, bug, checkedBug.broken));
    return { added: 1, message: 'A new bug hunt was added.' };
  }
  const checkedDesign = design ? verifyDesign(design) : null;
  if (checkedDesign?.ok) {
    addDesign(conceptId, checkedDesign.design);
    return { added: 1, message: 'A new design fix was added.' };
  }
  const checkedApply = apply ? verifyApply(apply) : null;
  if (checkedApply?.ok) {
    addApply(conceptId, checkedApply.apply);
    return { added: 1, message: 'A new apply-it exercise was added.' };
  }
  const checkedOrder = order ? verifyOrder(order) : null;
  if (checkedOrder?.ok) {
    addOrder(conceptId, checkedOrder.order);
    return { added: 1, message: 'A new ordering exercise was added.' };
  }
  throw new Error('Claude could not write a hands-on exercise for this concept.');
}
