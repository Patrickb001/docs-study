// Picks the best way to read a source: GitHub files, a ready-made text copy, or the web pages.
import { MIN_WORDS, wordCount, type RawPage } from './clean.ts';
import { parseGithubUrl, readGithub } from './readers/github.ts';
import { readList, readTextCopy, readWeb } from './readers/web.ts';

export type WayIn = 'github' | 'textCopy' | 'web' | 'list' | 'sample';
export interface ReadResult {
  name: string;
  wayIn: WayIn;
  pages: RawPage[];
  skipped: number; // pages too short to be worth studying
  failed: string[];
}

export function looksLikeUrl(url: string): boolean {
  return /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url.trim());
}

// The same page written two ways, such as with and without a trailing slash, counts once.
const sameKey = (u: string) => {
  const url = new URL(u);
  return url.origin + url.pathname.replace(/\/+$/, '') + url.search;
};

// Checks what was pasted into the links box. One link reads a site; several read only those pages.
export function checkLinkList(urls: string[]): string[] {
  const given = urls.map((u) => u.trim()).filter(Boolean);
  if (given.length === 0) throw new Error('Paste a link first.');
  const list: string[] = [];
  const seen = new Set<string>();
  for (const [i, u] of given.entries()) {
    if (!looksLikeUrl(u)) {
      throw new Error(given.length === 1
        ? 'That does not look like a link. A link starts with https:// and has a site name.'
        : `Link ${i + 1} does not look like a link. A link starts with https:// and has a site name.`);
    }
    const key = sameKey(u);
    if (!seen.has(key)) { seen.add(key); list.push(u); }
  }
  if (list.length > 100) throw new Error('A list can have at most 100 links. Split it into two sources.');
  if (given.length > 1 && list.some((u) => parseGithubUrl(u))) throw new Error('GitHub links import a whole folder, so add that one on its own.');
  return list;
}

export async function readPages(urls: string[], onProgress: (done: number, total: number) => void): Promise<ReadResult> {
  const result = await readList(urls, onProgress);
  const long = result.pages.filter((p) => wordCount(p.text) >= MIN_WORDS);
  return { name: result.name, wayIn: 'list', pages: long, skipped: result.pages.length - long.length, failed: result.failed };
}

export async function readSource(url: string, limit: number, onProgress: (done: number, total: number) => void): Promise<ReadResult> {
  const clean = url.trim();
  if (!looksLikeUrl(clean)) throw new Error('That does not look like a link. A link starts with https:// and has a site name.');
  // Read a few extra pages so that skipping the short ones still leaves about as many as asked for.
  const ask = limit > 0 ? limit * 3 : 0;
  let wayIn: WayIn;
  let result: { name: string; pages: RawPage[]; failed: string[] };
  if (parseGithubUrl(clean)) {
    wayIn = 'github';
    result = await readGithub(clean, ask, onProgress);
  } else {
    const copy = await readTextCopy(clean, ask, onProgress);
    if (copy && copy.pages.length > 0) {
      wayIn = 'textCopy';
      result = copy;
    } else {
      wayIn = 'web';
      result = await readWeb(clean, ask, onProgress);
    }
  }
  const long = result.pages.filter((p) => wordCount(p.text) >= MIN_WORDS);
  const pages = limit > 0 ? long.slice(0, limit) : long;
  return { name: result.name, wayIn, pages, skipped: result.pages.length - long.length, failed: result.failed };
}
