import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { BUG, CHECK_BUG, CONCEPT_MAP, FLAG } from '../graphql';
import { errorText, useNav } from '../nav';
import { DocLink } from '../components/DocLink';
import { LivePreview } from '../components/LivePreview';
import { Cross, Tick } from '../components/QuestionCard';

interface BugData { id: string; conceptId: string; conceptName: string; description: string; brokenCode: string; runtime: string; hints: string[]; docTitle: string; docUrl: string }
interface Check { ran: boolean; solved: boolean; timedOut: boolean; error: string; tests: { name: string; pass: boolean; message: string }[] }

const reactSetup = [javascript({ jsx: true })];
const plainSetup = [javascript()];

export function BugHunt(props: { conceptId: string }) {
  const { go } = useNav();
  const { data, loading, error } = useQuery<any>(BUG, { variables: { conceptId: props.conceptId }, fetchPolicy: 'network-only' });

  if (error) return <main className="narrow"><p className="note miss">{errorText(error)}</p></main>;
  if (loading || !data) return <main className="narrow"><p className="muted">Loading the bug hunt</p></main>;
  const bug: BugData | null = data.bug;
  if (!bug) {
    return (
      <main className="narrow">
        <div className="card stack">
          <h1>No bug hunt for {data.concept?.name ?? 'this concept'}</h1>
          <p>This concept has no code that can be broken and tested, or its bug was flagged. Passing the quiz is enough to make it solid.</p>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go({ name: 'home' })}>Back to the map</button>
        </div>
      </main>
    );
  }
  return <Hunt key={bug.id} bug={bug} />;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function Hunt({ bug }: { bug: BugData }) {
  const { go, libraryId } = useNav();
  // A plain JavaScript hunt is a few functions checked by tests. A React one is a small app with a live preview.
  const plain = bug.runtime === 'js';
  const file = plain ? 'solution.js' : 'App.jsx';
  const [check, checking] = useMutation<{ checkBugFix: Check }>(CHECK_BUG, { refetchQueries: [{ query: CONCEPT_MAP, variables: { libraryId } }] });
  const [flag] = useMutation(FLAG, { refetchQueries: [{ query: CONCEPT_MAP, variables: { libraryId } }] });
  const [code, setCode] = useState(bug.brokenCode);
  const [runKey, setRunKey] = useState(0);
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<Check | null>(null);
  const [checkedCode, setCheckedCode] = useState('');
  const [problem, setProblem] = useState('');
  const verdict = useRef<HTMLElement>(null);

  // A result only counts for the code it was run on. Editing the code clears it.
  const shown = result && checkedCode === code ? result : null;

  // Bring the test results into view when they arrive, without moving the page if they already show.
  useEffect(() => {
    if (result) verdict.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [result]);

  const run = () => {
    if (checking.loading) return;
    setProblem('');
    setResult(null);
    setCheckedCode(code);
    check({ variables: { bugId: bug.id, code, hintsUsed: hints } })
      .then((r) => setResult(r.data!.checkBugFix))
      .catch((err) => setProblem(errorText(err)));
  };

  return (
    <main className="wide">
      <div className="stack" style={{ gap: 6 }}>
        <div className="eyebrow">{bug.conceptName}</div>
        <h1>Find and fix the bug</h1>
        <p style={{ maxWidth: 720 }}>{bug.description}</p>
      </div>
      <div className="split">
        <div className="main-col stack">
          <section
            className="card editor-card"
            aria-label="Code editor"
            // Ctrl+Enter (or Cmd+Enter) checks the fix without leaving the editor.
            onKeyDownCapture={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); run(); } }}
          >
            <div className="editor-head">
              <span className="mono small">{file}</span>
              <button type="button" className="btn quiet small" onClick={() => { setCode(bug.brokenCode); setResult(null); setRunKey(runKey + 1); }}>Reset code</button>
            </div>
            <CodeMirror
              value={code}
              onChange={setCode}
              theme="dark"
              minHeight="300px"
              maxHeight="560px"
              extensions={plain ? plainSetup : reactSetup}
              basicSetup={{ foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, autocompletion: false }}
              aria-label={`Code for ${file}`}
            />
            <div className="editor-foot">
              <button type="button" className="btn quiet small" onClick={() => flag({ variables: { kind: 'BUG', id: bug.id } }).then(() => go({ name: 'home' }))}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14V2.5" /><path d="M3 3h9l-2 3 2 3H3" /></svg>
                This bug is bad
              </button>
              <span className="keys"><kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>+<kbd>Enter</kbd></span>
              <button type="button" className="btn" disabled={checking.loading} onClick={run}>{checking.loading ? 'Running the tests' : 'Check my fix'}</button>
            </div>
          </section>

          {problem && <p className="note miss" role="alert">{problem}</p>}

          {shown && (
            <section ref={verdict} className={`feedback verdict${shown.solved ? '' : ' miss'}`} role="status" aria-label="Test results">
              <h2 className="title">{shown.solved ? <><Tick />Fixed. Every test passes.</> : shown.timedOut ? <><Cross />Your code never finished</> : shown.ran ? <><Cross />Not fixed yet</> : <><Cross />The code could not run</>}</h2>
              {!shown.ran && <p className="mono small">{shown.error}</p>}
              <ul className="tests">
                {shown.tests.map((t) => (
                  <li key={t.name} className={t.pass ? 'pass' : 'fail'}>
                    <span className="mark">{t.pass ? <Tick /> : <Cross />}</span>
                    <span>
                      {t.name}<span className="sr-only">{t.pass ? ': passes' : ': fails'}</span>
                      {!t.pass && t.message && <span className="msg">{t.message}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {shown.solved && (
                <div className="after">
                  <p><b>What was wrong:</b> {bug.hints[bug.hints.length - 1]}</p>
                  <p className="small muted">{hints === 0 ? 'Solved with no hints.' : `Solved with ${hints} ${hints === 1 ? 'hint' : 'hints'}.`}</p>
                  <div className="row" style={{ gap: '8px 20px' }}>
                    <button type="button" className="btn" onClick={() => go({ name: 'home' })}>See it on the map</button>
                    <DocLink url={bug.docUrl} title={bug.docTitle} prefix="Read this in the docs: " />
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="side-col stack">
          {plain ? (
            <section className="card stack side-card" aria-label="How it is checked">
              <h2>How it is checked</h2>
              <p className="small muted">Your code is run against a few tests. Each one shows as passed or failed, with the reason. There is no preview for this one, so read the description and follow the code by hand.</p>
              <p className="small muted">If your code never finishes, the check stops it after about 12 seconds and tells you.</p>
            </section>
          ) : (
            <section className="card stack side-card" aria-label="Live preview">
              <div className="row between">
                <h2>Live preview</h2>
                <button type="button" className="btn quiet small" onClick={() => setRunKey(runKey + 1)}>Restart preview</button>
              </div>
              <LivePreview code={code} runKey={runKey} />
              <p className="small muted">The preview runs your code as you type. Click around in it to see the bug.</p>
            </section>
          )}

          <section className="card stack side-card" aria-label="Hints">
            <div className="row between">
              <h2>Hints</h2>
              <span className="small muted nums">{hints} of {bug.hints.length} used</span>
            </div>
            {hints > 0 && <ol className="hints">{bug.hints.slice(0, hints).map((h) => <li key={h}>{h}</li>)}</ol>}
            <button type="button" className="btn second small" style={{ alignSelf: 'flex-start' }} disabled={hints >= bug.hints.length} onClick={() => setHints(hints + 1)}>
              {hints >= bug.hints.length ? 'No hints left' : hints === 0 ? 'Show a hint' : 'Show the next hint'}
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
