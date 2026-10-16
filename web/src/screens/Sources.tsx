import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@apollo/client/react';
import { ADD_FILES, APPROVE_UPDATE, APP_INFO, CHECK_CHANGES, CONFIRM_IMPORT, DELETE_LIBRARY, LIBRARIES, START_IMPORT, type Library } from '../graphql';
import { errorText, useNav } from '../nav';
import { ChooseFiles } from '../components/FilePicker';
import { filesProblem, mergePicked, type ChosenFile, type Picked } from '../files';

const WAY_IN: Record<string, string> = { github: 'Source files on GitHub', textCopy: 'A ready-made text copy of the docs', web: 'Web pages', list: 'Pages you listed', files: 'Markdown files you chose', sample: 'Built into the app' };
const BUSY = ['reading', 'waiting', 'writing', 'linking'];
const money = (n: number) => '$' + n.toFixed(2);

export function Sources() {
  const info = useQuery<any>(APP_INFO);
  const { data, error, refetch, startPolling, stopPolling } = useQuery<{ libraries: Library[] }>(LIBRARIES, { fetchPolicy: 'cache-and-network' });
  const libraries = data?.libraries ?? [];
  // While an import is running, look for progress every three seconds.
  const busy = libraries.some((l) => l.job && BUSY.includes(l.job.status));
  if (busy) startPolling(3000); else stopPolling();
  const hasKey = !!info.data?.appInfo.hasApiKey;

  return (
    <main className="medium">
      <div className="stack" style={{ gap: 6 }}>
        <h1>Sources</h1>
        <p className="muted" style={{ maxWidth: 620 }}>Each source becomes its own library with its own concept map. Nothing is sent to Claude or updated until you approve it.</p>
      </div>
      {error && <p className="note miss" role="alert">{errorText(error)}</p>}
      {info.data && !hasKey && (
        <p className="note warn">
          No Claude API key is set, so new docs cannot be imported yet. The sample library works without one. To add your key, put it in the <span className="mono">.env</span> file and restart the app.
        </p>
      )}
      {libraries.map((l) => <LibraryCard key={l.id} library={l} hasKey={hasKey} limit={info.data?.appInfo.spendLimitUsd ?? 10} onChange={() => refetch()} />)}
      <AddSource onAdded={() => refetch()} />
    </main>
  );
}

function LibraryCard({ library: l, hasKey, limit, onChange }: { library: Library; hasKey: boolean; limit: number; onChange: () => void }) {
  const { go, setLibraryId } = useNav();
  const [confirm, confirming] = useMutation(CONFIRM_IMPORT);
  const [checkChanges, checking] = useMutation(CHECK_CHANGES);
  const [approve, approving] = useMutation(APPROVE_UPDATE);
  const [remove] = useMutation(DELETE_LIBRARY);
  const [addFiles, adding] = useMutation(ADD_FILES);
  const [problem, setProblem] = useState('');
  const [note, setNote] = useState('');
  const [skipped, setSkipped] = useState(false);
  const [unticked, setUnticked] = useState<string[]>([]);
  const [sure, setSure] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const job = l.job;
  const status = job?.status ?? 'ready';
  const act = (work: Promise<unknown>, after?: () => void) => {
    setProblem(''); setNote('');
    work.then(() => { after?.(); onChange(); }).catch((err) => setProblem(errorText(err)));
  };
  const ticked = l.changes.filter((c) => !unticked.includes(c.pageId));
  // Updates are written right away at full price, so the cost is worked out for the pages that are ticked.
  const updateCost = ticked.reduce((sum, c) => sum + c.estimateUsd, 0);
  const overLimit = updateCost > limit;
  const sendFiles = (picked: Picked) => {
    const left = picked.leftOut.length > 0 ? ` ${picked.leftOut.length} other ${picked.leftOut.length === 1 ? 'file was' : 'files were'} left out.` : '';
    const trouble = filesProblem(picked.files) || (picked.files.length === 0 ? 'None of those are markdown files. Choose files that end in .md, .markdown or .mdx.' : '');
    if (trouble) { setNote(''); setProblem(trouble); return; }
    act(addFiles({ variables: { libraryId: l.id, files: picked.files } }).then((r: any) => { setSkipped(false); setUnticked([]); setAddOpen(false); setNote(r.data.addFiles.message + left); }));
  };
  const KIND: Record<string, string> = { changed: 'Changed', new: 'New page', removed: 'Removed from the docs' };

  return (
    <section className="card stack" aria-label={l.name || 'New source'}>
      <div className="row between" style={{ gap: '12px 20px' }}>
        <div className="stack" style={{ gap: 2 }}>
          <h2>{l.name || 'New source'}</h2>
          <div className="small muted">{WAY_IN[l.wayIn] ?? l.wayIn} · {l.pageCount} {l.pageCount === 1 ? 'page' : 'pages'}{l.fileCount > 0 && l.wayIn !== 'files' ? ` (${l.fileCount} from files)` : ''}{l.conceptCount > 0 ? ` · ${l.solidCount} of ${l.conceptCount} concepts solid` : ''}</div>
          {status === 'ready' && l.lastCheckedAt && <div className="small"><b>{job?.message}</b> {l.wayIn === 'files' ? 'Last updated' : 'Last checked'} {new Date(l.lastCheckedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.{job && job.costUsd > 0 ? ` This import cost about ${money(job.costUsd)}.` : ''}</div>}
        </div>
        <div className="row">
          {l.conceptCount > 0 && <button type="button" className="btn" onClick={() => { setLibraryId(l.id); go({ name: 'home' }); }}>Study this</button>}
          {status === 'ready' && l.wayIn !== 'sample' && l.sourceUrl !== '' && l.changes.length === 0 && (
            <button type="button" className="btn second" disabled={checking.loading} onClick={() => act(checkChanges({ variables: { libraryId: l.id } }).then((r: any) => { setSkipped(false); setUnticked([]); if (r.data.checkForChanges.length === 0) setNote('No pages have changed.'); }))}>
              {checking.loading ? 'Checking' : 'Check for changes'}
            </button>
          )}
          {status === 'ready' && l.wayIn !== 'sample' && (
            <button type="button" className="btn second" aria-expanded={addOpen} onClick={() => setAddOpen(!addOpen)}>Add or update files</button>
          )}
        </div>
      </div>

      {job && BUSY.includes(status) && (
        <div className="note row" role="status"><span className="spinner" aria-hidden="true" /><span>{job.message}</span></div>
      )}
      {job && status === 'failed' && <p className="note miss" role="status"><b>This import stopped.</b> {job.message}</p>}

      {addOpen && status === 'ready' && (
        <div className="note stack" style={{ gap: 10 }}>
          <div>Choose markdown files, or a folder of them. The app compares each file with what it has stored and lists the ones that are new or changed. A file is matched by its path inside the folder, so choose a folder the same way each time. Nothing is sent to Claude until you approve.</div>
          <div className="row">
            <ChooseFiles disabled={adding.loading} onPicked={sendFiles} onProblem={setProblem} />
            <button type="button" className="btn quiet boxed small" onClick={() => setAddOpen(false)}>Cancel</button>
            {adding.loading && <span className="spinner" role="status" aria-label="Reading the files" />}
          </div>
        </div>
      )}

      {job && status === 'estimated' && (
        <div className="note warn stack" style={{ gap: 12, padding: '20px 22px' }}>
          <div className="stack" style={{ gap: 2 }}>
            <b className="display" style={{ fontSize: 18 }}>Ready to send to Claude</b>
            <div>{job.message} That is about {job.words.toLocaleString()} words.</div>
          </div>
          <ul className="rows">
            <li style={{ background: 'var(--surface)' }}><div><b>As a batch: about {money(job.estimateBatchUsd)}</b><span className="small muted">Half price. Usually done within an hour, and can take up to a day.</span></div>
              <button type="button" className="btn" disabled={!hasKey || confirming.loading} onClick={() => act(confirm({ variables: { jobId: job.id, mode: 'BATCH' } }))}>Send as a batch</button></li>
            <li style={{ background: 'var(--surface)' }}><div><b>Right away: about {money(job.estimateDirectUsd)}</b><span className="small muted">Full price. Starts now and takes a few minutes. Good for a small trial.</span></div>
              <button type="button" className="btn second" disabled={!hasKey || confirming.loading} onClick={() => act(confirm({ variables: { jobId: job.id, mode: 'DIRECT' } }))}>Write it now</button></li>
          </ul>
          <div className="small">These are estimates. Your spending limit is {money(limit)} for one import.{!hasKey ? ' Add your Claude API key to the .env file to continue.' : ''}</div>
        </div>
      )}

      {status === 'ready' && l.changes.length > 0 && !skipped && (
        <div className="note warn stack" style={{ gap: 14, padding: '20px 22px' }}>
          <div className="stack" style={{ gap: 2 }}>
            <b className="display" style={{ fontSize: 18, color: 'var(--warn)' }}>{l.changes.length} {l.changes.length === 1 ? 'page' : 'pages'} changed since your last check</b>
            <div>Tick the pages to update. The app rewrites their questions and bugs from the new text.</div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {l.changes.map((c) => (
              <label key={c.pageId} className="check-row">
                <input type="checkbox" checked={!unticked.includes(c.pageId)} onChange={() => setUnticked(unticked.includes(c.pageId) ? unticked.filter((id) => id !== c.pageId) : [...unticked, c.pageId])} />
                <span><b>{c.title}</b><span className="small muted">{KIND[c.kind]}. {c.kind === 'new' ? 'Writes new questions and bugs.' : `Replaces ${c.questions} ${c.questions === 1 ? 'question' : 'questions'} and ${c.bugs} ${c.bugs === 1 ? 'bug' : 'bugs'}.`}</span></span>
              </label>
            ))}
          </div>
          {updateCost > 0 && (
            <div className="small">
              Writing {ticked.length === 1 ? 'this page' : 'these pages'} now costs about {money(updateCost)}, at full price. Your spending limit is {money(limit)} for one update.{overLimit ? ' That is over the limit, so untick some pages.' : ''}
            </div>
          )}
          <div className="row">
            <button type="button" className="btn" disabled={ticked.length === 0 || approving.loading || !hasKey || overLimit} onClick={() => act(approve({ variables: { libraryId: l.id, pageIds: ticked.map((c) => c.pageId) } }))}>
              {ticked.length === 0 ? 'Tick a page to update' : `Approve update of ${ticked.length} ${ticked.length === 1 ? 'page' : 'pages'}`}
            </button>
            <button type="button" className="btn second" onClick={() => setSkipped(true)}>Skip for now</button>
          </div>
          {!hasKey && <div className="small">Add your Claude API key to the .env file to update pages.</div>}
        </div>
      )}

      {note && <p className="note" role="status">{note}</p>}
      {problem && <p className="note miss" role="alert">{problem}</p>}
      {l.failedPages.length > 0 && (
        <details className="small">
          <summary>{l.failedPages.length} {l.failedPages.length === 1 ? 'page' : 'pages'} could not be used</summary>
          <ul>{l.failedPages.map((p) => <li key={p}>{p}</li>)}</ul>
        </details>
      )}
      <div className="card-foot">
        {!sure ? (
          <button type="button" className="btn quiet small danger-quiet" onClick={() => setSure(true)}>Delete this source</button>
        ) : (
          <>
            <span className="small">Delete {l.name} and all your progress in it?</span>
            <button type="button" className="btn second small" onClick={() => act(remove({ variables: { id: l.id } }))}>Yes, delete it</button>
            <button type="button" className="btn quiet boxed small" onClick={() => setSure(false)}>Keep it</button>
          </>
        )}
      </div>
    </section>
  );
}

// How many links were pasted. Two or more always means "only these pages", as on the server.
const pastedLines = (raw: string) => raw.split(/\r?\n/).filter((l) => l.trim()).length;

// Splits the links box into links, one per line. The server checks the same rules again.
export function linksFrom(raw: string): { links: string[]; error: string } {
  const links: string[] = [];
  const seen = new Set<string>();
  for (const [i, line] of raw.split(/\r?\n/).entries()) {
    const link = line.trim();
    if (!link) continue;
    if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(link)) return { links, error: `Line ${i + 1} does not look like a link. A link starts with https:// and has a site name.` };
    // The same page written two ways counts once, using the same rule as the server.
    let key: string;
    try {
      const url = new URL(link);
      key = url.origin + url.pathname.replace(/\/+$/, '') + url.search;
    } catch {
      return { links, error: `Line ${i + 1} does not look like a link. A link starts with https:// and has a site name.` };
    }
    if (!seen.has(key)) { seen.add(key); links.push(link); }
  }
  if (links.length === 0) return { links, error: 'Paste a link first.' };
  if (links.length > 100) return { links, error: 'A list can have at most 100 links. Split it into two sources.' };
  if (pastedLines(raw) > 1 && links.some((l) => /^https?:\/\/(www\.)?github\.com\//i.test(l))) return { links, error: 'GitHub links import a whole folder, so add that one on its own.' };
  return { links, error: '' };
}

function AddSource(props: { onAdded: () => void }) {
  const [start, starting] = useMutation(START_IMPORT);
  const [problem, setProblem] = useState('');
  const [picked, setPicked] = useState<ChosenFile[]>([]);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const form = useForm<{ urls: string; name: string; pageLimit: number }>({ defaultValues: { urls: '', name: '', pageLimit: 5 } });
  const urls = form.watch('urls');
  const links = linksFrom(urls).links;
  const many = pastedLines(urls) > 1;
  // With no links, there is nothing to limit. The files are always taken in full.
  const filesOnly = pastedLines(urls) === 0 && picked.length > 0;
  const fileProblem = filesProblem(picked);
  const choose = (more: Picked) => {
    setPicked(mergePicked(picked, more.files));
    // The same file chosen again is still one file that was left out.
    setLeftOut([...new Set([...leftOut, ...more.leftOut])]);
    setProblem('');
    // Having files is a way to start, so the message about an empty form no longer applies.
    form.clearErrors('urls');
  };
  const clearFiles = () => { setPicked([]); setLeftOut([]); };
  const submit = form.handleSubmit((values) => {
    setProblem('');
    start({ variables: { urls: linksFrom(values.urls).links, pageLimit: many || filesOnly ? 0 : Number(values.pageLimit) || 0, name: values.name.trim() || null, files: picked } })
      .then(() => { form.reset(); clearFiles(); props.onAdded(); })
      .catch((err) => setProblem(errorText(err)));
  });
  const errors = form.formState.errors;
  return (
    <section className="card stack" aria-label="Add a source">
      <h2>Add a source</h2>
      <form className="stack" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="src-urls">Links to the docs, one per line</label>
          <textarea id="src-urls" className="input links" rows={Math.min(Math.max(links.length + 1, 3), 10)} spellCheck={false} autoComplete="off"
            placeholder={'https://github.com/reactjs/react.dev/tree/main/src/content/learn\n\nOr paste several pages, one per line.'}
            {...form.register('urls', { validate: (v) => (v.trim() === '' ? picked.length > 0 || 'Paste a link or choose a markdown file first.' : linksFrom(v).error || true) })} />
          <div className="small muted">{many ? links.length === 1 ? 'Reads exactly this one page, and nothing else.' : `Reads exactly these ${links.length} pages, and nothing else.` : 'One link reads a GitHub folder or a docs site, starting from that page. Several links read only those pages.'}</div>
          {errors.urls && <div className="error" role="alert">{errors.urls.message}</div>}
        </div>
        <div className="field" role="group" aria-labelledby="src-files-title">
          <span id="src-files-title" className="field-title">Markdown files (optional)</span>
          <div className="row">
            <ChooseFiles onPicked={choose} onProblem={setProblem} />
            {picked.length > 0 && <button type="button" className="btn quiet small" onClick={clearFiles}>Clear the list</button>}
          </div>
          {picked.length > 0 && (
            <ul className="rows picked" aria-label="Files you chose">
              {picked.map((f) => (
                <li key={f.name}>
                  <span className="mono small">{f.name}</span>
                  <button type="button" className="btn quiet small" aria-label={`Remove ${f.name}`} onClick={() => setPicked(picked.filter((x) => x.name !== f.name))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="small muted">
            {picked.length === 0
              ? 'Choose files, or a whole folder. They are copied into the app and sent to Claude only after you approve the estimate.'
              : `${picked.length} markdown ${picked.length === 1 ? 'file' : 'files'} chosen.${leftOut.length > 0 ? ` ${leftOut.length} other ${leftOut.length === 1 ? 'file was' : 'files were'} left out.` : ''} They are read after any pages from links.`}
          </div>
          {fileProblem && <div className="error" role="alert">{fileProblem}</div>}
        </div>
        <div className="field">
          <label htmlFor="src-name">Name (optional)</label>
          <input id="src-name" className="input" autoComplete="off" placeholder="System design" style={{ maxWidth: 420 }} {...form.register('name')} />
        </div>
        {!many && !filesOnly && (
          <div className="field">
            <label htmlFor="src-limit">How many pages to import</label>
            <input id="src-limit" className="input short" type="number" min={0} max={2000} style={{ fontSize: 17 }}
              {...form.register('pageLimit', { min: { value: 0, message: 'Use 0 or more.' }, max: { value: 2000, message: 'Use 2000 or fewer.' } })} />
            <div className="small muted">Start with 5 to see what an import costs. Use 0 for every page.{picked.length > 0 ? ' This applies to the link only. Your files are always read in full.' : ''}</div>
            {errors.pageLimit && <div className="error" role="alert">{errors.pageLimit.message}</div>}
          </div>
        )}
        <button type="submit" className="btn" style={{ alignSelf: 'flex-start' }} disabled={starting.loading || !!fileProblem}>{starting.loading ? 'Starting' : 'Read the pages'}</button>
        <div className="small muted">Reading the pages is free. You see a cost estimate before anything is sent to Claude. For websites that are not open source, check their terms of use first.</div>
        {problem && <p className="note miss" role="alert">{problem}</p>}
      </form>
    </section>
  );
}
