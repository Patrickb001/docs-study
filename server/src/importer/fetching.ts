// Polite fetching: a clear name, a time limit, and a pause between web pages.
import { config } from '../config.ts';

const USER_AGENT = 'docs-study/0.1 (personal study tool; runs on one computer)';

export const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export async function fetchText(url: string, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; text: string; type: string }> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(20_000), redirect: 'follow' });
    const text = res.ok ? await res.text() : '';
    return { ok: res.ok, status: res.status, text, type: res.headers.get('content-type') ?? '' };
  } catch {
    return { ok: false, status: 0, text: '', type: '' };
  }
}

// Reads a site's robots.txt and returns a function that says whether a path may be fetched.
export async function robotsFor(origin: string): Promise<(path: string) => boolean> {
  const res = await fetchText(origin + '/robots.txt');
  if (!res.ok) return () => true;
  const blocked: string[] = [];
  let applies = false;
  for (const raw of res.text.split('\n')) {
    const line = raw.split('#')[0].trim();
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(key)) applies = value === '*';
    else if (applies && /^disallow$/i.test(key) && value) blocked.push(value);
  }
  return (path: string) => !blocked.some((rule) => path.startsWith(rule.replace(/\*.*$/, '')));
}

export const pause = () => sleep(config.fetchDelayMs);
