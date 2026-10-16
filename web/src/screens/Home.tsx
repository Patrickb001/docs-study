import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { APP_INFO, CONCEPT_MAP, FLAG, TOP_UP, type Concept, type Library, type Link } from '../graphql';
import { errorText, useNav } from '../nav';
import { CHOICE, EXERCISES, exerciseOf, type ExerciseKind } from '../exercises';
import { ConceptMap } from '../components/ConceptMap';
import { DocLink } from '../components/DocLink';
import { SummaryModal } from '../components/SummaryModal';



const STATUS: Record<string, { label: string; chip: string }> = {
  solid: { label: 'Solid', chip: 'good' },
  learning: { label: 'Learning', chip: 'warn' },
  fresh: { label: 'Not started', chip: '' },
  locked: { label: 'Locked', chip: '' },
};

const Check = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5l2.5 2.5L11 4.5" /></svg>
);

export function Home(props: { libraries: Library[]; loading: boolean; failed: unknown }) {
  const { libraryId, go, setLibraryId } = useNav();
  const { data, error } = useQuery<any>(CONCEPT_MAP, { variables: { libraryId }, skip: !libraryId, fetchPolicy: 'cache-and-network' });
  const info = useQuery<any>(APP_INFO);
  const [picked, setPicked] = useState<string | null>(null);

  const concepts: Concept[] = data?.conceptMap.concepts ?? [];
  const links: Link[] = data?.conceptMap.links ?? [];
  const nextId: string | null = data?.conceptMap.nextId ?? null;
  const due: number = data?.dueReviews.length ?? 0;
  useEffect(() => { setPicked(null); }, [libraryId]);

  if (props.failed || error) {
    return <main className="narrow"><div className="card stack"><h1>The app cannot reach its server</h1><p>{errorText(props.failed ?? error)}</p></div></main>;
  }
  if (!libraryId) {
    return (
      <main className="narrow">
        <div className="card pad-lg stack">
          <h1>{props.loading ? 'Loading' : 'Nothing to study yet'}</h1>
          {!props.loading && <p>Add your first set of docs on the Sources screen. The app turns them into a concept map, quizzes, and bug hunts.</p>}
          {!props.loading && <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go({ name: 'sources' })}>Add a source</button>}
        </div>
      </main>
    );
  }

  const library = props.libraries.find((l) => l.id === libraryId);
  const ready = props.libraries.filter((l) => l.conceptCount > 0);
  const selected = concepts.find((c) => c.id === (picked ?? nextId)) ?? concepts[0] ?? null;
  const next = concepts.find((c) => c.id === nextId) ?? null;
  const solid = concepts.filter((c) => c.status === 'solid').length;
  const learning = concepts.filter((c) => c.status === 'learning').length;

  return (
    <main className="wide">
      <header className="lib-head">
        <div className="lib-title">
          {ready.length > 1 ? (
            <h1>
              <select aria-label="Library" className="title-select" value={libraryId} onChange={(e) => setLibraryId(e.target.value)}>
                {ready.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </h1>
          ) : (
            <h1>{library?.name}</h1>
          )}
          <div className="progress-line">
            <span><b>{solid} of {concepts.length}</b> concepts solid{learning > 0 ? `, ${learning} in progress` : ''}{!next && concepts.length > 0 ? '. Daily reviews keep them that way.' : ''}</span>
          </div>
          <div className="strip" aria-hidden="true">
            {concepts.map((c) => <i key={c.id} className={c.status} />)}
          </div>
        </div>
        {due > 0 && (
          <button type="button" className="btn second" onClick={() => go({ name: 'review' })}>
            {due === 1 ? 'Review 1 due card' : `Review ${due} due cards`}
          </button>
        )}
      </header>

      <div className="study">
        {selected && (
          <ConceptPanel
            key={selected.id}
            concept={selected}
            isNext={selected.id === nextId}
            next={selected.id === nextId ? null : next}
            onBackToNext={() => setPicked(null)}
            links={links}
            concepts={concepts}
            canTopUp={!!info.data?.appInfo.hasApiKey}
          />
        )}
        <section className="card map-card" aria-label="Concept map">
          <div className="map-head">
            <h2>Concept map</h2>
            <div className="legend">
              <span><i className="solid" />Solid</span>
              <span><i className="learning" />Learning</span>
              <span><i />Not started</span>
              <span><i className="locked" />Locked</span>
            </div>
          </div>
          <div className="map-box">
            {/* Wait for the concepts, so the first fit is made on the real map. */}
            {concepts.length > 0 && <ConceptMap key={libraryId} concepts={concepts} links={links} nextId={nextId} pickedId={selected?.id ?? null} onPick={setPicked} />}
          </div>
          <div className="map-foot">An arrow means “learn this first.” The bars inside a box show its quiz, then its hands-on exercise. Drag to move around.</div>
        </section>
      </div>
    </main>
  );
}

function ConceptPanel(props: { concept: Concept; isNext: boolean; next: Concept | null; onBackToNext: () => void; links: Link[]; concepts: Concept[]; canTopUp: boolean }) {
  const { concept: c, isNext } = props;
  const { go, libraryId } = useNav();
  const refetch = { refetchQueries: [{ query: CONCEPT_MAP, variables: { libraryId } }] };
  const [flag] = useMutation(FLAG, refetch);
  const [topUp, topUpState] = useMutation<any>(TOP_UP, refetch);
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const status = STATUS[c.status];
  const locked = c.status === 'locked';
  const needs = props.links.filter((l) => l.thenId === c.id).map((l) => ({ link: l, concept: props.concepts.find((x) => x.id === l.firstId) })).filter((n) => n.concept);

  // The exercise types that fit this concept. With only one, the button writes it straight away.
  const kinds = c.fits.filter((k): k is ExerciseKind => k in EXERCISES);
  const more = (what: 'QUESTIONS' | 'EXERCISE', kind?: ExerciseKind) => {
    setChoosing(false);
    setMessage('');
    return topUp({ variables: { conceptId: c.id, what, kind: kind ? CHOICE[kind] : null } })
      .then((r) => setMessage(r.data?.topUp.message ?? ''))
      .catch((err) => setMessage(errorText(err)))
      // The button you pressed has gone, so keyboard focus comes back to the one that opened the list, unless you moved on.
      .finally(() => { if (kind && document.activeElement === document.body) toggle.current?.focus(); });
  };

  const quiz = () => go({ name: 'quiz', conceptId: c.id });
  const exercise = exerciseOf(c.exerciseKind);
  const bug = () => go({ name: exercise.screen, conceptId: c.id });
  const passed = c.quizState === 'passed';
  const hasBug = c.bugState !== 'none';

  // The one thing to do next with this concept, if there is one.
  const primary = locked ? null
    : !passed ? { label: c.quizState === 'tried' ? 'Retake quiz' : 'Start quiz', run: quiz }
    : hasBug && !c.activeExerciseDone ? { label: exercise.start, run: bug }
    : c.status === 'learning' ? { label: 'Retake quiz', run: quiz }
    : null;

  return (
    <aside className="card panel" aria-label="Selected concept">
      {props.next && (
        <button type="button" className="btn quiet to-next" onClick={props.onBackToNext}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 8H3" /><path d="M7 4L3 8l4 4" /></svg>
          Suggested next: {props.next.name}
        </button>
      )}
      <div className="stack" style={{ gap: 10 }}>
        <div className={`chip ${isNext ? 'good' : status.chip}`} style={{ alignSelf: 'flex-start' }}>{isNext ? 'Suggested next' : status.label}</div>
        <h2>{c.name}</h2>
        <p className="summary">{c.summary}</p>
        <button type="button" className="btn quiet boxed small summary-btn" aria-haspopup="dialog" onClick={() => setReading(true)}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M8 3.5C6.5 2.5 4.5 2.2 2 2.5v10c2.5-.3 4.5 0 6 1 1.5-1 3.5-1.3 6-1v-10c-2.5-.3-4.5 0-6 1z" /><path d="M8 3.5v10" /></svg>
          Read the full summary
        </button>
      </div>
      {reading && <SummaryModal concept={c} canWrite={props.canTopUp} action={primary} onClose={() => setReading(false)} />}

      {locked ? (
        <p className="note">Unlocks when {c.needs.join(' and ')} {c.needs.length > 1 ? 'are' : 'is'} solid.</p>
      ) : (
        <ol className="path" aria-label="Steps to make this concept solid">
          <li className={passed ? 'done' : c.quizState === 'tried' ? 'tried current' : 'current'}>
            <span className="dot">{passed ? <Check /> : 1}</span>
            <span className="what">
              <b>Quiz</b>
              <span>{passed ? 'Passed' : c.quizState === 'tried' ? `Not passed yet. ${c.questionCount} questions.` : `${c.questionCount} questions`}</span>
            </span>
          </li>
          {hasBug && (
            <li className={c.activeExerciseDone ? 'done' : passed ? 'current' : ''}>
              <span className="dot">{c.activeExerciseDone ? <Check /> : 2}</span>
              <span className="what">
                <b>{exercise.name}</b>
                <span>{c.activeExerciseDone ? 'Fixed' : passed ? exercise.todo : 'Unlocks after the quiz'}</span>
              </span>
            </li>
          )}
        </ol>
      )}

      {!locked && (
        <div className="row">
          {primary && <button type="button" className="btn" onClick={primary.run}>{primary.label}</button>}
          {passed && primary?.run !== quiz && <button type="button" className="btn quiet boxed" onClick={quiz}>Retake quiz</button>}
          {c.activeExerciseDone && <button type="button" className="btn quiet boxed" onClick={bug}>{exercise.redo}</button>}
        </div>
      )}

      <div className="section">
        <dl className="facts">
          <dt>Learn first</dt>
          <dd>
            {needs.length === 0 ? 'Nothing. Start here.' : needs.map((n) => (
              <span key={n.link.id} className="row" style={{ gap: 4 }}>
                {n.concept!.name}
                <button type="button" className="btn quiet small" style={{ minHeight: 32, padding: '0 8px', fontSize: 13 }} title="Remove this arrow from the map" onClick={() => flag({ variables: { kind: 'LINK', id: n.link.id } })}>Not needed</button>
              </span>
            ))}
          </dd>
          <dt>Docs</dt>
          <dd><DocLink url={c.docUrl} title={c.docTitle} /></dd>
        </dl>
      </div>

      {props.canTopUp && !locked && (
        <div className="section">
          <div className="label">More practice. Each costs a few cents.</div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn quiet boxed small" disabled={topUpState.loading} onClick={() => more('QUESTIONS')}>Write 3 more questions</button>
            <button
              ref={toggle}
              type="button"
              className="btn quiet boxed small"
              disabled={topUpState.loading || kinds.length === 0}
              aria-expanded={kinds.length > 1 ? choosing : undefined}
              onClick={() => (kinds.length === 1 ? more('EXERCISE', kinds[0]) : setChoosing(!choosing))}
            >
              Write another exercise
            </button>
            {topUpState.loading && <span className="spinner" aria-label="Writing" />}
          </div>
          {choosing && (
            <div className="row" role="group" aria-label="Which kind of exercise?" style={{ gap: 6, marginTop: 6 }} onKeyDown={(e) => { if (e.key === 'Escape') { setChoosing(false); toggle.current?.focus(); } }}>
              {kinds.map((k, i) => (
                <button key={k} type="button" className="btn second small" autoFocus={i === 0} disabled={topUpState.loading} onClick={() => more('EXERCISE', k)}>{EXERCISES[k].name}</button>
              ))}
            </div>
          )}
          {message && <p className="note" role="status">{message}</p>}
        </div>
      )}
    </aside>
  );
}
