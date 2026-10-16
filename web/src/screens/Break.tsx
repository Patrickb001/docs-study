import { useEffect, useState } from 'react';

// Five quiet minutes. The session clock keeps running so you can see your total time.
export function Break(props: { onDone: () => void }) {
  const [left, setLeft] = useState(300);
  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <main className="narrow rest">
      <div className="display time">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>
      <h1 style={{ fontSize: 'var(--t-xl)' }}>{left === 0 ? 'Break is over' : 'Rest your eyes'}</h1>
      <p className="muted" style={{ maxWidth: 460 }}>Look at something far away for 20 seconds. Stand up, stretch, and drink some water. Your place is saved.</p>
      <button type="button" className="btn" onClick={props.onDone}>Back to studying</button>
    </main>
  );
}
