// Reads Markdown files straight from a public GitHub repository.
import { config } from '../../config.ts';
import { cleanMarkdown, type RawPage } from '../clean.ts';
import { fetchText } from '../fetching.ts';
import { tarEntries } from './tar.ts';

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

// Accepts links such as https://github.com/reactjs/react.dev or .../tree/main/src/content/learn
export function parseGithubUrl(url: string): RepoRef | null {
  const found = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/(?:tree|blob)\/([^/]+)\/?(.*))?/i.exec(url.trim());
  if (!found) return null;
  return { owner: found[1], repo: found[2].replace(/\.git$/, ''), branch: found[3] ?? '', path: (found[4] ?? '').replace(/\/$/, '') };
}

const apiHeaders = (): Record<string, string> => ({
  accept: 'application/vnd.github+json',
  ...(config.githubToken ? { authorization: `Bearer ${config.githubToken}` } : {}),
});

function pickFiles(paths: string[], ref: RepoRef, limit: number): string[] {
  const prefix = ref.path ? ref.path + '/' : '';
  let files = paths
    .filter((p) => /\.mdx?$/i.test(p) && p.startsWith(prefix))
    .filter((p) => !/(^|\/)(node_modules|\.github|\.claude|changelog|license|contributing|code_of_conduct)/i.test(p))
    .sort();
  // With no folder given, prefer the folders that usually hold docs.
  if (!ref.path) {
    const docs = files.filter((p) => /(^|\/)(docs?|content|documentation|website|learn|guide|handbook)\//i.test(p));
    if (docs.length >= 3) files = docs;
  }
  return limit > 0 ? files.slice(0, limit) : files;
}

function toPage(ref: RepoRef, path: string, raw: string): RawPage {
  const fallback = path.split('/').pop()!.replace(/\.mdx?$/i, '').replace(/[-_]/g, ' ');
  const { title, text } = cleanMarkdown(raw, fallback);
  return { url: `https://github.com/${ref.owner}/${ref.repo}/blob/${ref.branch}/${path}`, title, text };
}

// First choice: ask GitHub for the file list and fetch only the files needed.
async function viaApi(ref: RepoRef, limit: number, onProgress: (done: number, total: number) => void): Promise<{ pages: RawPage[]; failed: string[] } | null> {
  if (!ref.branch) {
    const info = await fetchText(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, apiHeaders());
    if (!info.ok) return null;
    ref.branch = JSON.parse(info.text).default_branch;
  }
  const tree = await fetchText(`https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${ref.branch}?recursive=1`, apiHeaders());
  if (!tree.ok) return null;
  const all = (JSON.parse(tree.text).tree as { path: string; type: string }[]).filter((f) => f.type === 'blob').map((f) => f.path);
  const files = pickFiles(all, ref, limit);
  const pages: RawPage[] = [];
  const failed: string[] = [];
  for (const [i, path] of files.entries()) {
    const raw = await fetchText(`https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${ref.branch}/${path}`);
    if (raw.ok) pages.push(toPage(ref, path, raw.text));
    else failed.push(path);
    onProgress(i + 1, files.length);
  }
  return { pages, failed };
}

// Second choice, used when GitHub is limiting requests: download the whole repository as one archive.
async function viaArchive(ref: RepoRef, limit: number, onProgress: (done: number, total: number) => void): Promise<{ pages: RawPage[]; failed: string[] }> {
  const branch = ref.branch || 'HEAD';
  const res = await fetch(`https://codeload.github.com/${ref.owner}/${ref.repo}/tar.gz/${branch}`, { signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!res || !res.ok) throw new Error('That GitHub repository could not be read. Check that the link is right and the repository is public.');
  const archive = Buffer.from(await res.arrayBuffer());
  ref.branch = branch;
  const contents = new Map<string, string>();
  for (const entry of tarEntries(archive)) {
    if (/\.mdx?$/i.test(entry.path)) contents.set(entry.path.split('/').slice(1).join('/'), entry.data.toString('utf8'));
  }
  const files = pickFiles([...contents.keys()], ref, limit);
  onProgress(files.length, files.length);
  return { pages: files.map((path) => toPage(ref, path, contents.get(path)!)), failed: [] };
}

export async function readGithub(url: string, limit: number, onProgress: (done: number, total: number) => void): Promise<{ name: string; pages: RawPage[]; failed: string[] }> {
  const ref = parseGithubUrl(url);
  if (!ref) throw new Error('That does not look like a GitHub repository link.');
  const result = (await viaApi(ref, limit, onProgress)) ?? (await viaArchive(ref, limit, onProgress));
  return { name: ref.repo, ...result };
}
