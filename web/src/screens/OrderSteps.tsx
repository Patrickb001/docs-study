// Order the steps: put the steps of a process in the right order, using buttons so it works from the keyboard.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { CHECK_ORDER, CONCEPT_MAP, FLAG, ORDER_IT, type OrderData, type OrderResult } from '../graphql';
import { errorText, useNav } from '../nav';
import { DocLink } from '../components/DocLink';
import { HintsCard } from '../components/HintsCard';
import { Cross, Tick } from '../components/QuestionCard';

export function OrderSteps(props: { conceptId: string }) {
  const { go } = useNav();
  const { data, loading, error } = useQuery<{ concept: { id: string; name: string } | null; orderIt: OrderData | null }>(ORDER_IT, { variables: { conceptId: props.conceptId }, fetchPolicy: 'network-only' });
  if (error) return <main className="narrow"><p className="note miss">{errorText(error)}</p></main>;
  if (loading || !data) return <main className="narrow"><p className="muted">Loading the exercise</p></main>;
  if (!data.orderIt) {
    return (
      <main className="narrow">
        <div className="card stack">
          <h1>No ordering exercise for {data.concept?.name ?? 'this concept'}</h1>
          <p>This concept has no exercise like this, or it was flagged. Passing the quiz is enough to make it solid.</p>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go({ name: 'home' })}>Back to the map</button>
        </div>
      </main>
    );
  }
  return <Exercise key={data.orderIt.id} exercise={data.orderIt} />;
}

function Exercise({ exercise: ex }: { exercise: OrderData }) {
  const { go, libraryId } = useNav();
  const refetch = { refetchQueries: [{ query: CONCEPT_MAP, variables: { libraryId } }] };
  const [check, checking] = useMutation<{ checkOrder: OrderResult }>(CHECK_ORDER, refetch);
  const [flag] = useMutation(FLAG, refetch);
  const start = ex.steps.map((s) => s.id);
  const text = new Map(ex.steps.map((s) => [s.id, s.text]));
  const [order, setOrder] = useState<number[]>(start);
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [checkedOrder, setCheckedOrder] = useState('');
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focus, setFocus] = useState<{ id: number; dir: 'up' | 'down' } | null>(null);

  // A result only counts for the order it was run on. Any move clears it.
  const key = order.join(',');
  const shown = result && checkedOrder === key ? result : null;
  const done = shown?.solved === true;

  // After a move, keep the keyboard on the step that moved, so you can press the same button again.
  useEffect(() => {
    if (!focus) return;
    const index = order.indexOf(focus.id);
    const dir = focus.dir === 'up' && index === 0 ? 'down' : focus.dir === 'down' && index === order.length - 1 ? 'up' : focus.dir;
    buttons.current.get(`${focus.id}-${dir}`)?.focus();
    setFocus(null);
  }, [focus, order]);

  const move = (id: number, by: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    setResult(null);
    setSaid(`Moved “${text.get(id)}” to place ${j + 1} of ${order.length}.`);
    setFocus({ id, dir: by === -1 ? 'up' : 'down' });
  };
  const reset = () => { setOrder(start); setResult(null); setSaid('Put the steps back as they were.'); };
  const run = () => {
    if (checking.loading) return;
    setProblem('');
    setResult(null);
    setCheckedOrder(key);
    check({ variables: { exerciseId: ex.id, order, hintsUsed: hints } })
      .then((r) => setResult(r.data!.checkOrder))
      .catch((err) => setProblem(errorText(err)));
  };

  return (
    <main className="medium">
      <div className="stack" style={{ gap: 6 }}>
        <div className="eyebrow">{ex.conceptName}</div>
        <h1>Order the steps</h1>
        <p style={{ maxWidth: 720 }}>{ex.instruction}</p>
      </div>

      <section className="card stack" aria-label="The steps">
        <ol className="order-list">
          {order.map((id, place) => {
            const mark = shown ? (shown.placed[place] ? 'right' : 'wrong') : '';
            return (
              <li key={id} className={mark}>
                <span className="num" aria-hidden="true">{place + 1}</span>
                <span>
                  {text.get(id)}
                  {shown && <span className="sr-only">{shown.placed[place] ? ': in the right place' : ': in the wrong place'}</span>}
                </span>
                <span className="moves">
                  {shown && (shown.placed[place] ? <Tick /> : <Cross />)}
                  <button type="button" className="btn quiet boxed small" disabled={done || place === 0} aria-label={`Move “${text.get(id)}” up`} ref={(el) => { if (el) buttons.current.set(`${id}-up`, el); }} onClick={() => move(id, -1)}>Up</button>
                  <button type="button" className="btn quiet boxed small" disabled={done || place === order.length - 1} aria-label={`Move “${text.get(id)}” down`} ref={(el) => { if (el) buttons.current.set(`${id}-down`, el); }} onClick={() => move(id, 1)}>Down</button>
                </span>
              </li>
            );
          })}
        </ol>
        <div className="sr-only" role="status" aria-live="polite">{said}</div>
        {problem && <p className="note miss" role="alert">{problem}</p>}
        <div className="row between">
          <span className="row" style={{ gap: 6 }}>
            <button type="button" className="btn quiet small" onClick={() => flag({ variables: { kind: 'BUG', id: ex.id } }).then(() => go({ name: 'home' }))}>This exercise is bad</button>
            <button type="button" className="btn quiet small" disabled={done || key === start.join(',')} onClick={reset}>Reset the order</button>
          </span>
          <button type="button" className="btn" disabled={checking.loading || done} onClick={run}>{checking.loading ? 'Checking' : 'Check my order'}</button>
        </div>
      </section>

      {shown && (
        <section className={`feedback verdict${shown.solved ? '' : ' miss'}`} role="status" aria-label="Check results">
          <h2 className="title">{shown.solved ? <><Tick />Right. Every step is in place.</> : <><Cross />Not yet. {shown.correctCount} of {shown.total} steps are in the right place.</>}</h2>
          {!shown.solved && <p>Steps that are in the right place are marked green. Try moving the others.</p>}
          {shown.solved && (
            <div className="after">
              {shown.note && <p><b>Why this order:</b> {shown.note}</p>}
              <p className="small muted">{hints === 0 ? 'Solved with no hints.' : `Solved with ${hints} ${hints === 1 ? 'hint' : 'hints'}.`}</p>
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
