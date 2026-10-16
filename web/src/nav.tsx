// Tiny navigation: the app has six screens and no web addresses to keep track of.
import { createContext, useContext } from 'react';

export type Screen =
  | { name: 'home' }
  | { name: 'quiz'; conceptId: string }
  | { name: 'bug'; conceptId: string }
  | { name: 'design'; conceptId: string }
  | { name: 'apply'; conceptId: string }
  | { name: 'order'; conceptId: string }
  | { name: 'review' }
  | { name: 'sources' }
  | { name: 'break' };

export interface Nav {
  screen: Screen;
  go: (screen: Screen) => void;
  libraryId: string | null;
  setLibraryId: (id: string) => void;
}

export const NavContext = createContext<Nav>({ screen: { name: 'home' }, go: () => {}, libraryId: null, setLibraryId: () => {} });
export const useNav = () => useContext(NavContext);

// Remembers small things, such as the theme, between visits. Works even if the browser blocks storage.
export function remember(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem('docs-study:' + key, value);
    return localStorage.getItem('docs-study:' + key);
  } catch {
    return value ?? null;
  }
}

export const errorText = (err: unknown): string => {
  const message = (err as any)?.message ? String((err as any).message) : 'Something went wrong.';
  return /fetch|network/i.test(message) ? 'The local server is not answering. Check that "npm run dev" is still running.' : message;
};
