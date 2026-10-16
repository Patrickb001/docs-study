// Markdown files you choose in the browser. They are read into pages the same way as docs from the web.
import { cleanMarkdown, MIN_WORDS, wordCount, type RawPage } from './clean.ts';

export interface ChosenFile {
  name: string; // the path inside the folder you picked, or just the file's name
  text: string;
}

export const MAX_FILES = 300;
// Counted in bytes. With this and the file limit, the biggest request stays under the server's 50 MB limit.
export const MAX_FILE_BYTES = 150_000;

// A page that came from a file has this in front of its path, where a web page has https://.
export const fileUrl = (name: string) => 'file:' + name.trim();
export const isFileUrl = (url: string) => url.startsWith('file:');

// Markdown only, and nothing inside node_modules or a hidden folder such as .git or .github.
export function isStudyFile(name: string): boolean {
  if (!/\.(md|markdown|mdx)$/i.test(name)) return false;
  return !name.split('/').some((part) => part === 'node_modules' || part.startsWith('.'));
}

export function checkFiles(files: ChosenFile[]): void {
  if (files.length > MAX_FILES) throw new Error(`You can add at most ${MAX_FILES} files at a time. Add the rest in a second batch.`);
  for (const file of files) {
    if (Buffer.byteLength(file.text) > MAX_FILE_BYTES) {
      throw new Error(`"${file.name}" is larger than ${MAX_FILE_BYTES / 1000} KB, which is too much for one page. Split it into smaller files.`);
    }
  }
}

// When every file came from one folder, the source is named after it. A single file chosen on its own is named by its title.
// Otherwise it is named by how many files it has.
function nameFor(kept: { path: string; title: string }[]): string {
  if (kept.length === 0) return '';
  const folders = new Set(kept.map((k) => k.path.split('/')[0]));
  if (kept.every((k) => k.path.includes('/')) && folders.size === 1) return [...folders][0];
  if (kept.length === 1) return kept[0].title;
  return `${kept.length} markdown files`;
}

export function readFiles(files: ChosenFile[]): { name: string; pages: RawPage[]; skipped: number; leftOut: number } {
  const seen = new Set<string>();
  const kept: { path: string; title: string }[] = [];
  const pages: RawPage[] = [];
  let skipped = 0; // too short to be worth studying
  let leftOut = 0; // not markdown, or in a folder that is skipped
  for (const file of files) {
    const path = file.name.trim();
    if (!isStudyFile(path)) { leftOut++; continue; }
    if (seen.has(path)) continue;
    seen.add(path);
    const fallback = path.split('/').pop()!.replace(/\.(md|markdown|mdx)$/i, '').replace(/[-_]/g, ' ');
    const { title, text } = cleanMarkdown(file.text, fallback);
    if (wordCount(text) < MIN_WORDS) { skipped++; continue; }
    kept.push({ path, title });
    pages.push({ url: fileUrl(path), title, text });
  }
  return { name: nameFor(kept), pages, skipped, leftOut };
}
