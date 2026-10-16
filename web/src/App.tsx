import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { CONCEPT_MAP, LIBRARIES, type Library } from './graphql';
import { NavContext, remember, type Screen } from './nav';
import { TopBar } from './components/TopBar';
import { Home } from './screens/Home';
import { Quiz } from './screens/Quiz';
import { BugHunt } from './screens/BugHunt';
import { ApplyIt } from './screens/ApplyIt';
import { DesignFix } from './screens/DesignFix';
import { OrderSteps } from './screens/OrderSteps';
import { Review } from './screens/Review';
import { Sources } from './screens/Sources';
import { Break } from './screens/Break';

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [before, setBefore] = useState<Screen>({ name: 'home' });
  const [theme, setTheme] = useState<'night' | 'day'>(() => (remember('theme') === 'day' ? 'day' : 'night'));
  const [chosenLibrary, setChosenLibrary] = useState<string | null>(() => remember('library'));
  const [seconds, setSeconds] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    remember('theme', theme);
  }, [theme]);

  // The session clock starts with your first action and keeps running while the app is open.
  useEffect(() => {
    const timer = setInterval(() => { if (started.current) setSeconds((s) => s + 1); }, 1000);
    return () => clearInterval(timer);
  }, []);

  const libraries = useQuery<{ libraries: Library[] }>(LIBRARIES);
  // The page can open a moment before the local server is ready, so keep trying until it answers.
  useEffect(() => {
    if (!libraries.error) return;
    const timer = setInterval(() => { libraries.refetch().catch(() => {}); }, 2000);
    return () => clearInterval(timer);
  }, [libraries.error]);
  const ready = (libraries.data?.libraries ?? []).filter((l) => l.conceptCount > 0);
  const libraryId = ready.find((l) => l.id === chosenLibrary)?.id ?? ready[0]?.id ?? null;
  const map = useQuery<any>(CONCEPT_MAP, { variables: { libraryId }, skip: !libraryId });

  const nav = useMemo(
    () => ({
      screen,
      libraryId,
      go: (next: Screen) => {
        started.current = true;
        if (next.name === 'break') setBefore(screen);
        setScreen(next);
        window.scrollTo(0, 0);
      },
      setLibraryId: (id: string) => {
        remember('library', id);
        setChosenLibrary(id);
      },
    }),
    [screen, libraryId],
  );

  const shown = screen.name === 'break' ? before : screen;

  return (
    <NavContext.Provider value={nav}>
      <TopBar
        seconds={seconds}
        theme={theme}
        onTheme={() => setTheme(theme === 'night' ? 'day' : 'night')}
        dueCount={map.data?.dueReviews.length ?? 0}
        libraryName={ready.find((l) => l.id === libraryId)?.name ?? ''}
        onLeaveBreak={() => nav.go(before)}
      />
      {/* During a break the screen you were on stays alive underneath, so your place is kept. */}
      <div hidden={screen.name === 'break'}>
        {shown.name === 'home' && <Home libraries={libraries.data?.libraries ?? []} loading={libraries.loading} failed={libraries.error} />}
        {shown.name === 'quiz' && <Quiz key={shown.conceptId} conceptId={shown.conceptId} />}
        {shown.name === 'bug' && <BugHunt key={shown.conceptId} conceptId={shown.conceptId} />}
        {shown.name === 'design' && <DesignFix key={shown.conceptId} conceptId={shown.conceptId} />}
        {shown.name === 'apply' && <ApplyIt key={shown.conceptId} conceptId={shown.conceptId} />}
        {shown.name === 'order' && <OrderSteps key={shown.conceptId} conceptId={shown.conceptId} />}
        {shown.name === 'review' && <Review />}
        {shown.name === 'sources' && <Sources />}
      </div>
      {screen.name === 'break' && <Break onDone={() => nav.go(before)} />}
    </NavContext.Provider>
  );
}
