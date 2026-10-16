// The full summary of one concept, in plain words. It opens over the map, so you keep your place.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { EXPLAINER, WRITE_EXPLAINER, type Concept, type Explainer } from '../graphql';
import { errorText } from '../nav';
import { DocLink } from './DocLink';

// Summaries mark code with backticks, such as `useState`. Those parts are shown in the code font.
export function Prose({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/g);
  return <>{parts.map((part, i) => (i % 2 ? <code key={i} className="inline-code">{part}</code> : part))}</>;
}

export function SummaryModal(props: { concept: Concept; canWrite: boolean; action: { label: string; run: () => void } | null; onClose: () => void }) {
  const { concept: c } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedOutside = useRef(false);
  const { data, loading } = useQuery<{ explainer: Explainer | null }>(EXPLAINER, { variables: { conceptId: c.id } });
  const [problem, setProblem] = useState('');
  const [write, writing] = useMutation<{ writeExplainer: Explainer }>(WRITE_EXPLAINER, {
    // Keep the new summary, so opening it again is instant.
    update(cache, { data: written }) {
      if (written) cache.writeQuery({ query: EXPLAINER, variables: { conceptId: c.id }, data: { explainer: written.writeExplainer } });
    },
  });

  // A modal dialog keeps keyboard focus inside, closes with Escape, and hands focus back to the button that opened it.
  useEffect(() => {
    if (!dialog.current!.open) dialog.current!.showModal();
  }, []);

  const close = () => dialog.current?.close();
  const explainer = data?.explainer ?? null;
  const writeIt = (rewrite = false) => {
    setProblem('');
    write({ variables: { conceptId: c.id, rewrite } }).catch((err) => setProblem(errorText(err)));
  };

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="summary-title"
      onClose={props.onClose}
      // A click on the dimmed area closes it, but not a text selection that ends there.
      onMouseDown={(e) => { pressedOutside.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (pressedOutside.current && e.target === e.currentTarget) close(); }}
    >
      <header className="modal-head">
        <div className="stack" style={{ gap: 2 }}>
          <h2 id="summary-title">{c.name}</h2>
          <span className="small muted">The full summary, in plain words</span>
        </div>
        <button type="button" className="icon-btn" aria-label="Close the summary" title="Close (Esc)" onClick={close}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9" /></svg>
        </button>
      </header>

      <div className="modal-body">
        {loading ? (
          <p className="muted">Loading the summary</p>
        ) : explainer ? (
          <>
            <Summary explainer={explainer} />
            {writing.loading ? (
              <div className="note row" role="status" style={{ flexWrap: 'nowrap' }}>
                <span className="spinner" aria-hidden="true" />
                <span style={{ minWidth: 0 }}>Rewriting the summary from “{c.docTitle}”. This takes a few seconds.</span>
              </div>
            ) : props.canWrite && (
              <div className="note stack" style={{ gap: 10, padding: '14px 16px' }}>
                <p className="small">Added questions since, or want a fuller version? Claude can rewrite this summary so it teaches everything the quiz asks as it stands now. It costs a few cents and replaces this one.</p>
                <button type="button" className="btn quiet boxed small" style={{ alignSelf: 'flex-start' }} onClick={() => writeIt(true)}>Rewrite the summary</button>
              </div>
            )}
            {problem && <p className="note miss" role="alert">{problem}</p>}
          </>
        ) : (
          <>
            <p className="gist">{c.summary}</p>
            {writing.loading ? (
              <div className="note row" role="status" style={{ flexWrap: 'nowrap' }}>
                <span className="spinner" aria-hidden="true" />
                <span style={{ minWidth: 0 }}>Writing the summary from “{c.docTitle}”. This takes a few seconds.</span>
              </div>
            ) : props.canWrite ? (
              <div className="note stack" style={{ gap: 12, padding: '16px 18px' }}>
                <p>Claude can write a fuller summary from the docs page, with an example, the mistakes to avoid, and everything the quiz asks. It costs a few cents and is saved, so you only pay once.</p>
                <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => writeIt()}>Write the summary</button>
              </div>
            ) : (
              <p className="note">To have a fuller summary written, add your Claude API key to the <span className="mono">.env</span> file and restart the app.</p>
            )}
            {problem && <p className="note miss" role="alert">{problem}</p>}
          </>
        )}
      </div>

      <footer className="modal-foot">
        <span className="small muted"><DocLink url={c.docUrl} title={c.docTitle} lead="From the docs: " /></span>
        {props.action && (
          <button type="button" className="btn small" onClick={() => { close(); props.action!.run(); }}>{props.action.label}</button>
        )}
      </footer>
    </dialog>
  );
}

function Summary({ explainer: e }: { explainer: Explainer }) {
  return (
    <>
      <p className="gist"><Prose text={e.gist} /></p>
      <section className="explain">
        <h3>How it works</h3>
        {e.paragraphs.map((p, i) => <p key={i}><Prose text={p} /></p>)}
      </section>
      {e.scenario && (
        <section className="explain">
          <h3>A worked example</h3>
          <p><Prose text={e.scenario} /></p>
        </section>
      )}
      {e.example && (
        <section className="explain">
          <h3>Example</h3>
          <pre className="code">{e.example.code}</pre>
          <p className="small muted"><Prose text={e.example.note} /></p>
        </section>
      )}
      {e.watchOut.length > 0 && (
        <section className="explain">
          <h3>Watch out for</h3>
          <ul className="watch">{e.watchOut.map((w, i) => <li key={i}><Prose text={w} /></li>)}</ul>
        </section>
      )}
      {e.terms.length > 0 && (
        <section className="explain">
          <h3>Words to know</h3>
          <dl className="terms">
            {e.terms.map((t) => (
              <div key={t.term}>
                <dt>{t.term}</dt>
                <dd><Prose text={t.meaning} /></dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}
