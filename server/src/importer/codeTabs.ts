// Some docs sites built with Next.js show one language in each code block. The other languages are not in the page.
// They are sent as data for the browser to switch between. This reads that data, so that the study material
// can use the JavaScript version of a code block.

export interface CodeTab {
  lang: string;
  code: string;
}
export type CodeGroup = CodeTab[];

// The data arrives in pieces, self.__next_f.push([1,"..."]). Joined, they make one stream of rows.
const PIECE = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

function streamOf(html: string): string {
  let stream = '';
  for (const piece of html.matchAll(PIECE)) {
    try {
      stream += JSON.parse(piece[1]);
    } catch {
      // A piece that is not text is left out.
    }
  }
  return stream;
}

// A long text is sent as its own row, "e5:T442,<442 bytes of text>", and used elsewhere as "$e5".
// The length counts bytes, so the stream is read with one character per byte and each text is decoded afterwards.
function textRows(stream: string): Map<string, string> {
  const bytes = Buffer.from(stream, 'utf8').toString('latin1');
  const rows = new Map<string, string>();
  const head = /([0-9a-f]+):(?:T([0-9a-f]+),)?/y;
  let at = 0;
  while (at < bytes.length) {
    head.lastIndex = at;
    const found = head.exec(bytes);
    if (!found) {
      at++;
      continue;
    }
    if (found[2] === undefined) {
      // Not a text row: go to the end of its line.
      const end = bytes.indexOf('\n', head.lastIndex);
      at = end === -1 ? bytes.length : end + 1;
      continue;
    }
    const start = head.lastIndex;
    const length = parseInt(found[2], 16);
    rows.set(found[1], Buffer.from(bytes.slice(start, start + length), 'latin1').toString('utf8'));
    at = start + length;
  }
  return rows;
}

// The text of the [...] list that opens at `open`, skipping over brackets inside strings.
function listAt(text: string, open: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return text.slice(open, i + 1);
  }
  return null;
}

// The site marks places where its pages show a diagram next to the code with a comment such as
// /**<extend down -200>![](/images/algo/x/1.gif) */. The page leaves it out, and it is no use to a learner.
function withoutDiagramNotes(code: string): string {
  return code
    .replace(/^[ \t]*\/\*\*<extend [^>]*>[\s\S]*?\*\/[ \t]*\n/gm, '')
    .replace(/[ \t]*\/\*\*<extend [^>]*>[\s\S]*?\*\/[ \t]?/g, ' ')
    .replace(/ +$/gm, '');
}

export function readCodeGroups(html: string): CodeGroup[] {
  try {
    const stream = streamOf(html);
    if (!stream.includes('"tabs":[')) return [];
    const rows = textRows(stream);
    // "$e5" is a reference to a text row. A text that really starts with $ is sent as "$$...".
    const codeOf = (value: string): string | null => {
      if (value.startsWith('$$')) return value.slice(1);
      if (/^\$[0-9a-f]+$/.test(value)) return rows.get(value.slice(1)) ?? null;
      return value;
    };
    const groups: CodeGroup[] = [];
    for (const found of stream.matchAll(/"tabs":\[/g)) {
      const text = listAt(stream, found.index! + found[0].length - 1);
      if (!text) continue;
      let list: unknown;
      try {
        list = JSON.parse(text);
      } catch {
        continue;
      }
      if (!Array.isArray(list)) continue;
      const group: CodeGroup = [];
      for (const tab of list) {
        if (!tab || typeof tab !== 'object') continue;
        const { lang, value } = tab as { lang?: unknown; value?: unknown };
        if (typeof lang !== 'string' || typeof value !== 'string') continue;
        const code = codeOf(value);
        if (code !== null) group.push({ lang, code: withoutDiagramNotes(code) });
      }
      if (group.length > 0) groups.push(group);
    }
    return groups;
  } catch {
    return [];
  }
}

const squash = (code: string) => code.replace(/\s+/g, ' ').trim();
const isJavaScript = (lang: string) => /^(javascript|js)$/i.test(lang);

// Finds the group that holds a code block as the page shows it, looking from group number `from` on.
// Blocks come in page order, so `next` is where to carry on for the block after this one.
// `javascript` is null when the group has no JavaScript tab.
export function findJavaScript(groups: CodeGroup[], shown: string, from: number): { next: number; javascript: string | null } | null {
  const want = squash(shown);
  for (let i = from; i < groups.length; i++) {
    if (!groups[i].some((tab) => squash(tab.code) === want)) continue;
    return { next: i + 1, javascript: groups[i].find((tab) => isJavaScript(tab.lang))?.code ?? null };
  }
  return null;
}
