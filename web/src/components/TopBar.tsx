import { useNav } from '../nav';

const two = (n: number) => String(n).padStart(2, '0');
const clock = (total: number) => {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}:${two(m)}:${two(total % 60)}` : `${m}:${two(total % 60)}`;
};

const FOCUS_TITLES: Record<string, string> = { quiz: 'Quiz', bug: 'Bug hunt', design: 'Design fix', apply: 'Apply it', order: 'Order the steps', review: 'Daily review', break: 'Break' };

const Sun = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <circle cx="10" cy="10" r="3.5" />
    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M16.5 12.2A6.8 6.8 0 0 1 7.8 3.5a6.8 6.8 0 1 0 8.7 8.7z" />
  </svg>
);

export function TopBar(props: { seconds: number; theme: 'night' | 'day'; onTheme: () => void; dueCount: number; libraryName: string; onLeaveBreak: () => void }) {
  const { screen, go } = useNav();
  const focus = FOCUS_TITLES[screen.name];
  const themeLabel = props.theme === 'night' ? 'Switch to the day theme' : 'Switch to the night theme';
  return (
    <header className="topbar">
      <div className="brand display">
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" /><circle cx="20" cy="13" r="3" /><circle cx="6" cy="20" r="3" /><path d="M9 7.5l8 4" /><path d="M9 18.5l8-4" />
        </svg>
        <span className="brand-name">Docs Study</span>
      </div>
      {focus ? (
        // Focus mode: only a way out and a title, so nothing pulls you away from the question.
        <div className="focus-title">
          <button type="button" className="btn quiet boxed" onClick={() => (screen.name === 'break' ? props.onLeaveBreak() : go({ name: 'home' }))}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 8H3" /><path d="M7 4L3 8l4 4" /></svg>
            {screen.name === 'break' ? 'Back' : 'Exit to map'}
          </button>
          <b>{focus}</b>
        </div>
      ) : (
        <nav className="tabs" aria-label="Main">
          <button type="button" className="tab" aria-current={screen.name === 'home' ? 'page' : undefined} onClick={() => go({ name: 'home' })}>Map</button>
          <button type="button" className="tab" onClick={() => go({ name: 'review' })}>
            Review
            {props.dueCount > 0 && <span className="badge">{props.dueCount}<span className="sr-only"> due</span></span>}
          </button>
          <button type="button" className="tab" aria-current={screen.name === 'sources' ? 'page' : undefined} onClick={() => go({ name: 'sources' })}>Sources</button>
        </nav>
      )}
      <div className="tools">
        <div className="session" title="Time studied since you opened the app">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></svg>
          <span className="session-label">Session</span>
          <span className="time">{clock(props.seconds)}</span>
        </div>
        {screen.name !== 'break' && <button type="button" className="btn quiet boxed" onClick={() => go({ name: 'break' })}>Take a break</button>}
        <span className="divider" aria-hidden="true" />
        <button type="button" className="icon-btn" onClick={props.onTheme} aria-label={themeLabel} title={themeLabel}>
          {props.theme === 'night' ? <Sun /> : <Moon />}
        </button>
      </div>
    </header>
  );
}
