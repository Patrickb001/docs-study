// Apply it: use a concept in a new situation. Claude marks your answer against a checklist you cannot see until you check.
import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { APPLY_IT, CHECK_APPLY, CONCEPT_MAP, FLAG, type ApplyData, type ApplyResult } from '../graphql';
import { errorText, useNav } from '../nav';
import { DocLink } from '../components/DocLink';
import { HintsCard } from '../components/HintsCard';
import { Cross, Tick } from '../components/QuestionCard';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function ApplyIt(props: { conceptId: string }) {
  const { go } = useNav();
  const { data, loading, error } = useQuery<{ concept: { id: string; name: string } | null; applyIt: ApplyData | null }>(APPLY_IT, { variables: { conceptId: props.conceptId }, fetchPolicy: 'network-only' });
  if (error) return <main className="narrow"><p className="note miss">{errorText(error)}</p></main>;
  if (loading || !data) return <main className="narrow"><p className="muted">Loading the exercise</p></main>;
  if (!data.applyIt) {
    return (
      <main className="narrow">
        <div className="card stack">
          <h1>No Apply it exercise for {data.concept?.name ?? 'this concept'}</h1>
          <p>This concept has no exercise like this, or it was flagged. Passing the quiz is enough to make it solid.</p>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go({ name: 'home' })}>Back to the map</button>
        </div>
      </main>
    );
  }
  return <Exercise key={data.applyIt.id} exercise={data.applyIt} />;
}

function Exercise({ exercise: ex }: { exercise: ApplyData }) {
  const { go, libraryId } = useNav();
  const refetch = { refetchQueries: [{ query: CONCEPT_MAP, variables: { libraryId } }] };
  const [check, checking] = useMutation<{ checkApply: ApplyResult }>(CHECK_APPLY, refetch);
  const [flag] = useMutation(FLAG, refetch);
  const [answer, setAnswer] = useState('');
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [checkedText, setCheckedText] = useState('');
  const [problem, setProblem] = useState('');
  const verdict = useRef<HTMLElement>(null);

  // The feedback stays while you rework your answer, because it is what you are working from.
  const changed = result !== null && checkedText !== answer;
  const run = () => {
    if (checking.loading) return;
    setProblem('');
    setCheckedText(answer);
    check({ variables: { exerciseId: ex.id, answer, hintsUsed: hints } })
      .then((r) => { setResult(r.data!.checkApply); requestAnimationFrame(() => verdict.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); })
      .catch((err) => setProblem(errorText(err)));
  };

  return (
    <main className="medium">
      <div className="stack" style={{ gap: 6 }}>
        <div className="eyebrow">{ex.conceptName}</div>
        <h1>Apply it</h1>
      </div>

      <section className="card stack" aria-label="The situation">
        <div className="stack" style={{ gap: 4 }}>
          <h2>The situation</h2>
          <p>{ex.scenario}</p>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <h2>Your task</h2>
          <p><b>{ex.task}</b></p>
        </div>
      </section>

      <section className="card stack" aria-label="Write your answer">
        <div className="field">
          <label htmlFor="apply-answer">Your answer</label>
          <textarea
            id="apply-answer" className="input" rows={9} value={answer} disabled={result?.solved}
            placeholder="Write a few sentences, using the idea from this concept."
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } }}
          />
          <div className="small muted nums">{answer.trim().length} characters. Claude marks what you wrote against a checklist of what a good answer does.</div>
        </div>
        {problem && <p className="note miss" role="alert">{problem}</p>}
        <div className="row between">
          <button type="button" className="btn quiet small" onClick={() => flag({ variables: { kind: 'BUG', id: ex.id } }).then(() => go({ name: 'home' }))}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14V2.5" /><path d="M3 3h9l-2 3 2 3H3" /></svg>
            This exercise is bad
          </button>
          <span className="row" style={{ gap: 14 }}>
            <span className="keys"><kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>+<kbd>Enter</kbd></span>
            <button type="button" className="btn" disabled={checking.loading || result?.solved} onClick={run}>{checking.loading ? 'Marking your answer' : result && !result.solved ? 'Check again' : 'Check my answer'}</button>
          </span>
        </div>
      </section>

      {result && (
        <section ref={verdict} className={`feedback verdict${result.solved ? '' : ' miss'}`} role="status" aria-label="Feedback">
          <h2 className="title">
            {result.solved ? <><Tick />Passed. You covered {result.covered} of {result.points.length} points.</> : <><Cross />Not there yet. You covered {result.covered} of {result.points.length} points and need {result.needed}.</>}
          </h2>
          <p>{result.summary}</p>
          {changed && !result.solved && <p className="small muted">This feedback is for your earlier answer. Press Check again to mark the new one.</p>}
          <ul className="tests">
            {result.points.map((p) => (
              <li key={p.text} className={p.covered ? 'pass' : 'fail'}>
                <span className="mark">{p.covered ? <Tick /> : <Cross />}</span>
                <span>
                  {p.text}<span className="sr-only">{p.covered ? ': covered' : ': missed'}</span>
                  <span className="small muted" style={{ display: 'block' }}>{p.comment}</span>
                </span>
              </li>
            ))}
          </ul>
          {result.solved && (
            <div className="after">
              {result.modelAnswer && (
                <>
                  <h3 className="small" style={{ fontWeight: 700 }}>One strong answer</h3>
                  <p>{result.modelAnswer}</p>
                </>
              )}
              <p className="small muted">{hints === 0 ? 'Passed with no hints.' : `Passed with ${hints} ${hints === 1 ? 'hint' : 'hints'}.`}</p>
              <div className="row" style={{ gap: '8px 20px' }}>
                <button type="button" className="btn" onClick={() => go({ name: 'home' })}>See it on the map</button>
                <DocLink url={ex.docUrl} title={ex.docTitle} prefix="Read this in the docs: " />
              </div>
            </div>
          )}
        </section>
      )}

      <HintsCard hints={ex.hints} used={hints} onUse={() => setHints(hints + 1)} />
    </main>
  );
}
