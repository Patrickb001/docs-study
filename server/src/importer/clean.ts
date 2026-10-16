// Turns raw docs (Markdown, MDX, or HTML) into clean text, and makes fingerprints.
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { findJavaScript, readCodeGroups } from './codeTabs.ts';

export interface RawPage {
  url: string;
  title: string;
  text: string;
}

export const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex');
export const wordCount = (text: string) => (text.trim() === '' ? 0 : text.trim().split(/\s+/).length);
export const MIN_WORDS = 150;
// Raise this whenever cleanHtml changes what it keeps. Crawled sites cleaned by an older version are
// re-baselined once on their next check, so the change is not mistaken for every page changing.
// 2: drops content before the first h1, and lists made mostly of links.
// 3: shows the JavaScript tab of a code group when the page offers one.
export const CLEANER_VERSION = 3;

// Markdown and MDX: drop the front matter, imports, and component tags, but keep their inner text and all code.
export function cleanMarkdown(raw: string, fallbackTitle: string): { title: string; text: string } {
  let text = raw.replace(/\r\n/g, '\n');
  let title = '';
  const front = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (front) {
    const found = /^title:\s*(.+)$/m.exec(front[1]);
    if (found) title = found[1].trim().replace(/^["']|["']$/g, '');
    text = text.slice(front[0].length);
  }
  // Leave code fences alone while stripping tags from everything else.
  const parts = text.split(/(```[\s\S]*?```)/g);
  text = parts
    .map((part) => {
      if (part.startsWith('```')) return part;
      return part
        .replace(/^(import|export)\s.+$/gm, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/<\/?[A-Za-z][^>\n]*>/g, '');
    })
    .join('');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  if (!title) {
    const heading = /^#\s+(.+)$/m.exec(text);
    // Some exports shift every heading down a level, so a file that opens with ### has that heading as its title.
    const opening = /^#{1,6}[ \t]+(.+)/.exec(text);
    title = heading ? heading[1].trim() : opening ? opening[1].trim() : fallbackTitle;
  }
  return { title, text };
}

// HTML: keep the main content as headings, paragraphs, lists, and code.
export function cleanHtml(html: string, fallbackTitle: string): { title: string; text: string; links: string[] } {
  const $ = cheerio.load(html);
  const links: string[] = [];
  // Some sites show one language per code block and send the rest as data. This is read before the page is cut down.
  const groups = readCodeGroups(html);
  let carryOn = 0;
  $('a[href]').each((_, el) => { links.push($(el).attr('href') ?? ''); });
  const title = ($('h1').first().text() || $('title').first().text() || fallbackTitle).trim().replace(/\s+/g, ' ');
  $('script, style, noscript, nav, header, footer, aside, form, iframe, svg, button, [role=navigation], [aria-hidden=true]').remove();
  const root = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body');
  // Site menus often sit before the article's title. When there is an h1, start the page there.
  let node = root.find('h1').first();
  while (node.length && node[0] !== root[0]) {
    node.prevAll().remove();
    node = node.parent();
  }
  // Lists made mostly of links are menus or "related articles", not content. An item is link-like
  // when its link text is at least half of its text; a list goes when 80% of its items are.
  root.find('ul, ol').each((_, el) => {
    const items = $(el).children('li');
    if (items.length < 2) return;
    const linkLike = items.filter((_, li) => {
      const all = $(li).text().replace(/\s+/g, '').length;
      const linked = $(li).find('a').text().replace(/\s+/g, '').length;
      return all > 0 && linked / all >= 0.5;
    }).length;
    if (linkLike / items.length >= 0.8) $(el).remove();
  });
  const lines: string[] = [];
  root.find('h1, h2, h3, h4, p, li, pre, td, th, blockquote').each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase() ?? '';
    const node = $(el);
    if (tag !== 'pre' && node.parents('pre, li, td, th, blockquote').length > 0 && tag !== 'li') return;
    if (tag === 'pre') {
      const code = node.text().replace(/\n+$/, '');
      if (code.trim()) {
        const found = findJavaScript(groups, code, carryOn);
        if (found) carryOn = found.next;
        lines.push(found?.javascript ? '```js\n' + found.javascript.replace(/\n+$/, '') + '\n```' : '```\n' + code + '\n```');
      }
      return;
    }
    if (node.find('pre').length > 0) return;
    const text = node.text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (tag === 'h1') lines.push('# ' + text);
    else if (tag === 'h2') lines.push('## ' + text);
    else if (tag === 'h3' || tag === 'h4') lines.push('### ' + text);
    else if (tag === 'li') lines.push('- ' + text);
    else lines.push(text);
  });
  return { title, text: lines.join('\n\n').trim(), links };
}
