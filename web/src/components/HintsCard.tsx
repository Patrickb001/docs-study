// Hints, shown one at a time from mild to direct. The same card is used by the hands-on exercises.
export function HintsCard(props: { hints: string[]; used: number; onUse: () => void }) {
  const { hints, used } = props;
  return (
    <section className="card stack side-card" aria-label="Hints">
      <div className="row between">
        <h2>Hints</h2>
        <span className="small muted nums">{used} of {hints.length} used</span>
      </div>
      {used > 0 && <ol className="hints">{hints.slice(0, used).map((h) => <li key={h}>{h}</li>)}</ol>}
      <button type="button" className="btn second small" style={{ alignSelf: 'flex-start' }} disabled={used >= hints.length} onClick={props.onUse}>
        {used >= hints.length ? 'No hints left' : used === 0 ? 'Show a hint' : 'Show the next hint'}
      </button>
    </section>
  );
}
