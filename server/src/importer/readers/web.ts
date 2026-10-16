// Reads a docs website. It first looks for a ready-made text copy (llms.txt), then falls back to the web pages.
import { cleanHtml, cleanMarkdown, type RawPage } from '../clean.ts';
import { fetchText, pause, robotsFor } from '../fetching.ts';

const siteName = (url: URL) => url.hostname.replace(/^www\./, '') + (url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : '');

function sameArea(link: string, start: URL): URL | null {
  try {
    const u = new URL(link, start);
    u.hash = '';
    u.search = '';
    const base = start.pathname.endsWith('/') ? start.pathname : start.pathname.replace(/[^/]*$/, '');
    if (u.origin !== start.origin || !u.pathname.startsWith(base)) return null;
    if (/\.(png|jpe?g|gif|svg|pdf|zip|css|js|xml|ico|json)$/i.test(u.pathname)) return null;
    return u;
  } catch {
    return null;
  }
}

// A text copy: many docs sites publish llms.txt, a list of links to Markdown versions of their pages.
export async function readTextCopy(startUrl: string, limit: number, onProgress: (done: number, total: number) => void): Promise<{ name: string; pages: RawPage[]; failed: string[] } | null> {
  const start = new URL(startUrl);
  const index = await fetchText(start.origin + '/llms.txt');
  if (!index.ok || /<html/i.test(index.text.slice(0, 300))) return null;
  const seen = new Set<string>();
  let links: URL[] = [];
  for (const found of index.text.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g)) {
    const u = sameArea(found[1], start);
    if (u && /\.(md|mdx|txt)$/i.test(u.pathname) && !seen.has(u.href)) { seen.add(u.href); links.push(u); }
  }
  if (links.length < 2) return null;
  if (limit > 0) links = links.slice(0, limit);
  const allowed = await robotsFor(start.origin);
  const pages: RawPage[] = [];
  const failed: string[] = [];
  for (const [i, link] of links.entries()) {
    if (allowed(link.pathname)) {
      const res = await fetchText(link.href);
      if (res.ok) {
        const { title, text } = cleanMarkdown(res.text, link.pathname.split('/').pop() ?? 'Page');
        pages.push({ url: link.href.replace(/\.(md|mdx)$/i, ''), title, text });
      } else failed.push(link.href);
      await pause();
    } else failed.push(link.href + ' (blocked by robots.txt)');
    onProgress(i + 1, links.length);
  }
  return { name: siteName(start), pages, failed };
}

export async function readWeb(startUrl: string, limit: number, onProgress: (done: number, total: number) => void): Promise<{ name: string; pages: RawPage[]; failed: string[] }> {
  const start = new URL(startUrl);
  const allowed = await robotsFor(start.origin);
  const first = await fetchText(start.href);
  if (!first.ok) throw new Error('That page could not be opened. Check the link and try again.');

  // Find the pages: the sitemap if there is one, otherwise the links on the first page.
  const found = new Map<string, URL>([[start.href.replace(/#.*$/, ''), start]]);
  const sitemap = await fetchText(start.origin + '/sitemap.xml');
  const candidates = sitemap.ok ? [...sitemap.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]) : [];
  for (const link of [...candidates, ...cleanHtml(first.text, '').links]) {
    const u = sameArea(link, start);
    if (u && !found.has(u.href)) found.set(u.href, u);
  }
  let links = [...found.values()];
  if (limit > 0) links = links.slice(0, limit);

  const pages: RawPage[] = [];
  const failed: string[] = [];
  for (const [i, link] of links.entries()) {
    if (!allowed(link.pathname)) failed.push(link.href + ' (blocked by robots.txt)');
    else {
      const res = i === 0 ? first : await fetchText(link.href);
      if (res.ok && /html/i.test(res.type || 'html')) {
        const { title, text } = cleanHtml(res.text, link.pathname);
        pages.push({ url: link.href, title, text });
      } else failed.push(link.href);
      if (i > 0) await pause();
    }
    onProgress(i + 1, links.length);
  }
  return { name: siteName(start), pages, failed };
}

// A list of pages: fetch exactly these, in this order, with no crawling.
export async function readList(urls: string[], onProgress: (done: number, total: number) => void): Promise<{ name: string; pages: RawPage[]; failed: string[] }> {
  const robots = new Map<string, (path: string) => boolean>();
  const pages: RawPage[] = [];
  const failed: string[] = [];
  for (const [i, raw] of urls.entries()) {
    const url = new URL(raw);
    url.hash = '';
    if (!robots.has(url.origin)) robots.set(url.origin, await robotsFor(url.origin));
    if (!robots.get(url.origin)!(url.pathname)) failed.push(url.href + ' (blocked by robots.txt)');
    else {
      const res = await fetchText(url.href);
      if (res.ok && /html/i.test(res.type || 'html')) {
        const { title, text } = cleanHtml(res.text, url.pathname);
        pages.push({ url: url.href, title, text });
      } else failed.push(url.href + (res.status ? ` (error ${res.status})` : ' (could not be reached)'));
      if (i < urls.length - 1) await pause();
    }
    onProgress(i + 1, urls.length);
  }
  const hosts = new Set(urls.map((u) => new URL(u).hostname.replace(/^www\./, '')));
  const count = `${urls.length} ${urls.length === 1 ? 'page' : 'pages'}`;
  return { name: hosts.size === 1 ? `${[...hosts][0]}, ${count}` : count, pages, failed };
}
