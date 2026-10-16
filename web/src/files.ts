// Reads the markdown files you choose in the browser. The server checks the same rules again.

export interface ChosenFile {
  name: string; // the path inside the folder you picked, or just the file's name
  text: string;
}
export interface Picked {
  files: ChosenFile[];
  leftOut: string[]; // the paths of files that were chosen but are not markdown, or are in a folder that is skipped
}

export const MAX_FILES = 300;
export const MAX_FILE_BYTES = 150_000;

// Markdown only, and nothing inside node_modules or a hidden folder such as .git or .github.
export function isStudyFile(path: string): boolean {
  if (!/\.(md|markdown|mdx)$/i.test(path)) return false;
  return !path.split('/').some((part) => part === 'node_modules' || part.startsWith('.'));
}

// Reads what the file picker gave back. Files that will not be used are never opened.
export async function readPicked(list: File[]): Promise<Picked> {
  const pathOf = (file: File) => file.webkitRelativePath || file.name;
  const wanted = list.filter((file) => isStudyFile(pathOf(file)));
  const files = await Promise.all(wanted.map(async (file) => ({ name: pathOf(file), text: await file.text() })));
  return { files, leftOut: list.filter((file) => !isStudyFile(pathOf(file))).map(pathOf) };
}

// Adds new picks to the ones already chosen. The same path picked again replaces the earlier one.
export function mergePicked(have: ChosenFile[], more: ChosenFile[]): ChosenFile[] {
  const byName = new Map(have.map((f) => [f.name, f]));
  for (const file of more) byName.set(file.name, file);
  return [...byName.values()];
}

// The reason these files cannot be sent, in the same words the server uses. Empty when they are fine.
export function filesProblem(files: ChosenFile[]): string {
  if (files.length > MAX_FILES) return `You can add at most ${MAX_FILES} files at a time. Add the rest in a second batch.`;
  const encoder = new TextEncoder();
  const big = files.find((f) => encoder.encode(f.text).length > MAX_FILE_BYTES);
  return big ? `"${big.name}" is larger than ${MAX_FILE_BYTES / 1000} KB, which is too much for one page. Split it into smaller files.` : '';
}

// A page that came from a file has an address that starts with file:, and no web page to open.
export const isFileUrl = (url: string) => url.startsWith('file:');
export const filePath = (url: string) => url.slice('file:'.length);
