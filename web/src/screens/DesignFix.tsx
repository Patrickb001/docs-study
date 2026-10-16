// The design fix: a small system design with one flaw. You change the parts and arrows until every check passes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { CHECK_DESIGN, CONCEPT_MAP, DESIGN_FIX, FLAG, type Design, type DesignCheckResult, type DesignFixData, type DesignLink, type DesignPart, type LinkStyle, type PartKind } from '../graphql';
import { errorText, useNav } from '../nav';
import { DesignCanvas, type Selection } from '../components/DesignCanvas';
import { DocLink } from '../components/DocLink';
import { KIND_NAMES, PartIcon } from '../components/PartIcon';
import { Cross, Tick } from '../components/QuestionCard';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const STYLE_NAMES: Record<LinkStyle, string> = { call: 'Waits for a reply', event: 'Sends an event, moves on' };
// The same choice, short enough for the connection dropdowns.
const STYLE_SHORT: Record<LinkStyle, string> = { call: 'Waits for a reply', event: 'Sends an event' };
const Close = () => <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>;

// Only the fields the checker reads. Apollo adds __typename, which is not part of a design.
const plain = (d: Design): Design => ({
  parts: d.parts.map(({ id, kind, label }) => ({ id, kind, label })),
  links: d.links.map(({ from, to, style }) => ({ from, to, style })),
});
const hasLink = (d: Design, from: string, to: string) => d.links.some((l) => l.from === from && l.to === to);

export function DesignFix(props: { conceptId: string }) {
  const { go } = useNav();
  const { data, loading, error } = useQuery<{ concept: { id: string; name: string } | null; designFix: DesignFixData | null }>(DESIGN_FIX, { variables: { conceptId: props.conceptId }, fetchPolicy: 'network-only' });
  if (error) return <main className="narrow"><p className="note miss">{errorText(error)}</p></main>;
  if (loading || !data) return <main className="narrow"><p className="muted">Loading the design fix</p></main>;
  if (!data.designFix) {
    return (
      <main className="narrow">
        <div className="card stack">
          <h1>No design fix for {data.concept?.name ?? 'this concept'}</h1>
          <p>This concept has no design to fix, or its puzzle was flagged. Passing the quiz is enough to make it solid.</p>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go({ name: 'home' })}>Back to the map</button>
        </div>
      </main>
    );
  }
  return <Fix key={data.designFix.id} fix={data.designFix} />;
}

function Fix({ fix }: { fix: DesignFixData }) {
  const { go, libraryId } = useNav();
  const refetch = { refetchQueries: [{ query: CONCEPT_MAP, variables: { libraryId } }] };
  const [check, checking] = useMutation<{ checkDesign: DesignCheckResult }>(CHECK_DESIGN, refetch);
  const [flag] = useMutation(FLAG, refetch);
  const start = useMemo(() => plain(fix), [fix]);
  const [design, setDesign] = useState<Design>(start);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<DesignCheckResult | null>(null);
  const [checkedJson, setCheckedJson] = useState('');
  const [problem, setProblem] = useState('');
  const verdict = useRef<HTMLElement>(null);

  const json = JSON.stringify(design);
  // A result only counts for the design it was run on. Any edit clears it.
  const shown = result && checkedJson === json ? result : null;
  const label = (id: string) => design.parts.find((p) => p.id === id)?.label ?? id;
  const selectedLink = selected?.type === 'link' ? design.links.find((l) => l.from === selected.from && l.to === selected.to) ?? null : null;
  const selectedPart = selected?.type === 'part' ? design.parts.find((p) => p.id === selected.id) ?? null : null;

  useEffect(() => {
    if (result) verdict.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [result]);

  const connect = (from: string, to: string, style: LinkStyle = 'call') => {
    if (from === to || hasLink(design, from, to)) return;
    setDesign((d) => ({ ...d, links: [...d.links, { from, to, style }] }));
    setSelected({ type: 'link', from, to });
  };
  const setStyle = (from: string, to: string, style: LinkStyle) =>
    setDesign((d) => ({ ...d, links: d.links.map((l) => (l.from === from && l.to === to ? { ...l, style } : l)) }));
  const moveLink = (l: DesignLink, from: string, to: string) => {
    if (from === to || hasLink(design, from, to)) return;
    setDesign((d) => ({ ...d, links: d.links.map((x) => (x === l ? { ...x, from, to } : x)) }));
    setSelected({ type: 'link', from, to });
  };
  const removeLink = (from: string, to: string) => {
    setDesign((d) => ({ ...d, links: d.links.filter((l) => !(l.from === from && l.to === to)) }));
    setSelected(null);
  };
  const addPart = (kind: PartKind, partLabel: string) => {
    let n = 1;
    while (design.parts.some((p) => p.id === `${kind}-${n}`)) n++;
    const id = `${kind}-${n}`;
    setDesign((d) => ({ ...d, parts: [...d.parts, { id, kind, label: partLabel }] }));
    setSelected({ type: 'part', id });
  };
  const removePart = (id: string) => {
    setDesign((d) => ({ parts: d.parts.filter((p) => p.id !== id), links: d.links.filter((l) => l.from !== id && l.to !== id) }));
    setSelected(null);
  };
  const reset = () => { setDesign(start); setSelected(null); setResult(null); setCanvasKey((k) => k + 1); };
  const run = () => {
    if (checking.loading) return;
    setProblem('');
    setResult(null);
    setCheckedJson(json);
    check({ variables: { designId: fix.id, design: json, hintsUsed: hints } })
      .then((r) => setResult(r.data!.checkDesign))
      .catch((err) => setProblem(errorText(err)));
  };

  return (
    <main
      className="wide"
      // Ctrl+Enter (or Cmd+Enter) checks the design from anywhere on the screen.
      onKeyDownCapture={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); run(); } }}
    >
      <div className="stack" style={{ gap: 6 }}>
        <div className="eyebrow">{fix.conceptName}</div>
        <h1>Fix the design</h1>
        <p style={{ maxWidth: 720 }}>{fix.scenario}</p>
      </div>
      <div className="split design-split">
        <div className="main-col stack">
          <section className="card editor-card" aria-label="Design">
            <div className="editor-head">
              <span className="small" style={{ fontWeight: 700 }}>Design</span>
              <button type="button" className="btn quiet small" onClick={reset}>Reset design</button>
            </div>
            <DesignCanvas key={canvasKey} design={design} label="The design to fix" editable selected={selected} onSelect={setSelected} onConnect={connect} />
            <div className="editor-foot">
              <button type="button" className="btn quiet small" onClick={() => flag({ variables: { kind: 'BUG', id: fix.id } }).then(() => go({ name: 'home' }))}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14V2.5" /><path d="M3 3h9l-2 3 2 3H3" /></svg>
                This puzzle is bad
              </button>
              <span className="keys"><kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>+<kbd>Enter</kbd></span>
              <button type="button" className="btn" disabled={checking.loading} onClick={run}>{checking.loading ? 'Checking the design' : 'Check my design'}</button>
            </div>
          </section>

          {problem && <p className="note miss" role="alert">{problem}</p>}

          {shown && (
            <section ref={verdict} className={`feedback verdict${shown.solved ? '' : ' miss'}`} role="status" aria-label="Check results">
              <h2 className="title">{shown.solved ? <><Tick />Fixed. Every check passes.</> : <><Cross />Not fixed yet</>}</h2>
              <ul className="tests">
                {shown.checks.map((c) => (
                  <li key={c.name} className={c.pass ? 'pass' : 'fail'}>
                    <span className="mark">{c.pass ? <Tick /> : <Cross />}</span>
                    <span>
                      {c.name}<span className="sr-only">{c.pass ? ': passes' : ': fails'}</span>
                      {!c.pass && <span className="msg">{c.message}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {shown.solved && shown.solution && (
                <div className="after">
                  <p><b>What was wrong:</b> {fix.hints[fix.hints.length - 1]}</p>
                  <p className="small muted">{hints === 0 ? 'Solved with no hints.' : `Solved with ${hints} ${hints === 1 ? 'hint' : 'hints'}.`}</p>
                  <h3 className="small" style={{ fontWeight: 700 }}>One way to fix it</h3>
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <DesignCanvas design={shown.solution} label="One way to fix it" height={260} />
                  </div>
                  <div className="row" style={{ gap: '8px 20px' }}>
                    <button type="button" className="btn" onClick={() => go({ name: 'home' })}>See it on the map</button>
                    <DocLink url={fix.docUrl} title={fix.docTitle} prefix="Read this in the docs: " />
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="side-col stack">
          <section className="card stack side-card" aria-label="Goals">
            <h2>Goals</h2>
            <ul className="goals">{fix.goals.map((g) => <li key={g}>{g}</li>)}</ul>
          </section>

          <section className="card stack side-card" aria-label="Selected">
            <h2>Selected</h2>
            {selectedLink ? (
              <>
                <p><b>{label(selectedLink.from)} → {label(selectedLink.to)}</b></p>
                <fieldset className="choice">
                  <legend className="sr-only">Arrow type</legend>
                  {(['call', 'event'] as const).map((s) => (
                    <label key={s}>
                      <input type="radio" name="arrow-style" checked={selectedLink.style === s} onChange={() => setStyle(selectedLink.from, selectedLink.to, s)} />
                      {STYLE_NAMES[s]}
                    </label>
                  ))}
                </fieldset>
                <button type="button" className="btn quiet boxed small" style={{ alignSelf: 'flex-start' }} onClick={() => removeLink(selectedLink.from, selectedLink.to)}>Remove arrow</button>
              </>
            ) : selectedPart ? (
              <>
                <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                  <span className="part-icon"><PartIcon kind={selectedPart.kind} /></span>
                  <span><span className="small muted">{KIND_NAMES[selectedPart.kind]}</span><br /><b>{selectedPart.label}</b></span>
                </div>
                <button type="button" className="btn quiet boxed small" style={{ alignSelf: 'flex-start' }} onClick={() => removePart(selectedPart.id)}>Remove part</button>
              </>
            ) : (
              <p className="small muted">Click a box or an arrow to change it.</p>
            )}
          </section>

          <section className="card stack side-card" aria-label="Connections">
            <h2>Connections</h2>
            {design.links.length === 0 ? <p className="small muted">No arrows yet.</p> : (
              <ul className="conns">
                {design.links.map((l) => (
                  <li key={`${l.from}->${l.to}`} className={`conn${selectedLink === l ? ' on' : ''}`}>
                    <select className="input tight from" aria-label="Arrow from" value={l.from} onChange={(e) => moveLink(l, e.target.value, l.to)}><PartOptions parts={design.parts} /></select>
                    <span className="arrow" aria-hidden="true">→</span>
                    <select className="input tight to" aria-label="Arrow to" value={l.to} onChange={(e) => moveLink(l, l.from, e.target.value)}><PartOptions parts={design.parts} /></select>
                    <select className="input tight type" aria-label="Arrow type" value={l.style} onChange={(e) => setStyle(l.from, l.to, e.target.value as LinkStyle)}>
                      <option value="call">{STYLE_SHORT.call}</option>
                      <option value="event">{STYLE_SHORT.event}</option>
                    </select>
                    <button type="button" className="icon-btn remove" aria-label={`Remove the arrow from ${label(l.from)} to ${label(l.to)}`} onClick={() => removeLink(l.from, l.to)}><Close /></button>
                  </li>
                ))}
              </ul>
            )}
            <AddConnection parts={design.parts} exists={(f, t) => hasLink(design, f, t)} onAdd={connect} />
          </section>

          <section className="card stack side-card" aria-label="Add a part">
            <h2>Add a part</h2>
            <div className="palette">
              {fix.palette.map((p) => (
                <button key={p.kind + p.label} type="button" className="chip-btn" onClick={() => addPart(p.kind, p.label)}>
                  <PartIcon kind={p.kind} />{p.label}
                </button>
              ))}
            </div>
            <p className="small muted">Drag from the dot on a box's right edge to another box to connect them.</p>
          </section>

          <section className="card stack side-card" aria-label="Hints">
            <div className="row between">
              <h2>Hints</h2>
              <span className="small muted nums">{hints} of {fix.hints.length} used</span>
            </div>
            {hints > 0 && <ol className="hints">{fix.hints.slice(0, hints).map((h) => <li key={h}>{h}</li>)}</ol>}
            <button type="button" className="btn second small" style={{ alignSelf: 'flex-start' }} disabled={hints >= fix.hints.length} onClick={() => setHints(hints + 1)}>
              {hints >= fix.hints.length ? 'No hints left' : hints === 0 ? 'Show a hint' : 'Show the next hint'}
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}

const PartOptions = ({ parts }: { parts: DesignPart[] }) => <>{parts.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</>;

// The keyboard way to draw an arrow: pick both ends and the type, then add it.
function AddConnection(props: { parts: DesignPart[]; exists: (from: string, to: string) => boolean; onAdd: (from: string, to: string, style: LinkStyle) => void }) {
  const ids = props.parts.map((p) => p.id);
  const [from, setFrom] = useState(ids[0] ?? '');
  const [to, setTo] = useState(ids[1] ?? '');
  const [style, setStyle] = useState<LinkStyle>('call');
  // When a part is removed, fall back to parts that still exist.
  const f = ids.includes(from) ? from : ids[0] ?? '';
  const t = ids.includes(to) ? to : ids[1] ?? '';
  const why = f === t ? 'Pick two different parts.' : props.exists(f, t) ? 'That arrow is already there.' : '';
  return (
    <div className="conn add" role="group" aria-label="Add a connection">
      <select className="input tight from" aria-label="New arrow from" value={f} onChange={(e) => setFrom(e.target.value)}><PartOptions parts={props.parts} /></select>
      <span className="arrow" aria-hidden="true">→</span>
      <select className="input tight to" aria-label="New arrow to" value={t} onChange={(e) => setTo(e.target.value)}><PartOptions parts={props.parts} /></select>
      <select className="input tight type" aria-label="New arrow type" value={style} onChange={(e) => setStyle(e.target.value as LinkStyle)}>
        <option value="call">{STYLE_SHORT.call}</option>
        <option value="event">{STYLE_SHORT.event}</option>
      </select>
      <button type="button" className="btn second small add-btn" disabled={!!why} title={why || undefined} onClick={() => props.onAdd(f, t, style)}>Add</button>
    </div>
  );
}
