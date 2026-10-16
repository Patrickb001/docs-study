// Markdown files you choose are read into pages the same way as docs from the web.
import { describe, expect, test } from 'vitest';
import { checkFiles, readFiles } from './files.ts';

// Enough words to pass the 150-word minimum for a page.
const body = (words = 200) => 'study '.repeat(words).trim();

describe('readFiles', () => {
  test('cleans each file and titles it from its front matter, its first heading, or its name', () => {
    const { pages } = readFiles([
      { name: 'notes/queues.md', text: `---\ntitle: "Message queues"\n---\n\n${body()}` },
      { name: 'notes/pubsub.mdx', text: `import Diagram from './diagram'\n\n# Pub/Sub\n\n${body()}` },
      { name: 'notes/event-driven_design.markdown', text: body() },
    ]);
    expect(pages.map((p) => [p.url, p.title])).toEqual([
      ['file:notes/queues.md', 'Message queues'],
      ['file:notes/pubsub.mdx', 'Pub/Sub'],
      ['file:notes/event-driven_design.markdown', 'event driven design'],
    ]);
    expect(pages[0].text).not.toContain('title:');
    expect(pages[1].text.startsWith('# Pub/Sub')).toBe(true);
  });

  test('leaves out files that are not markdown, and anything in node_modules or a hidden folder, and counts them', () => {
    const result = readFiles([
      { name: 'docs/intro.md', text: body() },
      { name: 'docs/diagram.png', text: 'not text' },
      { name: 'docs/notes.txt', text: body() },
      { name: 'node_modules/left-pad/README.md', text: body() },
      { name: '.github/pull_request_template.md', text: body() },
      { name: 'docs/.drafts/idea.md', text: body() },
      { name: 'docs/.hidden.md', text: body() },
      { name: 'docs/UPPER.MD', text: body() },
    ]);
    expect(result.pages.map((p) => p.url)).toEqual(['file:docs/intro.md', 'file:docs/UPPER.MD']);
    expect(result.leftOut).toBe(6);
  });

  test('skips a file with fewer than 150 words, and counts it', () => {
    const result = readFiles([
      { name: 'just-enough.md', text: body(150) },
      { name: 'one-short.md', text: body(149) },
    ]);
    expect(result.pages.map((p) => p.url)).toEqual(['file:just-enough.md']);
    expect(result.skipped).toBe(1);
  });

  test('reads a path that appears twice only once, keeping the first', () => {
    const result = readFiles([
      { name: 'a.md', text: body() + ' first' },
      { name: 'a.md', text: body() + ' second' },
    ]);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].text.endsWith('first')).toBe(true);
    expect(result.skipped).toBe(0);
    expect(result.leftOut).toBe(0);
  });

  test.each([
    [['notes/a.md', 'notes/b.md'], 'notes'],
    [['notes/deep/a.md', 'notes/b.md'], 'notes'],
    [['notes/a.md', 'other/b.md'], '2 markdown files'],
    [['a.md', 'notes/b.md'], '2 markdown files'],
    [['a.md', 'b.md'], '2 markdown files'],
    [['notes/a.md'], 'notes'],
  ])('names a source made of %j "%s"', (names, expected) => {
    expect(readFiles(names.map((name) => ({ name, text: body() }))).name).toBe(expected);
  });
});

describe('naming a source made of one file', () => {
  test('a single file chosen on its own is named after its title', () => {
    const { name } = readFiles([{ name: 'goals.md', text: `### Goal systems: a framework\n\n${body()}` }]);
    expect(name).toBe('Goal systems: a framework');
  });
});

describe('checkFiles', () => {
  test('refuses more than 300 files at a time', () => {
    const files = Array.from({ length: 301 }, (_, i) => ({ name: `n${i}.md`, text: 'x' }));
    expect(() => checkFiles(files)).toThrow('You can add at most 300 files at a time. Add the rest in a second batch.');
    expect(() => checkFiles(files.slice(0, 300))).not.toThrow();
  });

  test('refuses a file over 150 KB, counting bytes and not characters, and names it', () => {
    expect(() => checkFiles([{ name: 'edge.md', text: 'a'.repeat(150_000) }])).not.toThrow();
    expect(() => checkFiles([{ name: 'big.md', text: 'a'.repeat(150_001) }])).toThrow('"big.md" is larger than 150 KB, which is too much for one page. Split it into smaller files.');
    // Each of these characters takes 3 bytes, so 50,001 of them are over the limit.
    expect(() => checkFiles([{ name: 'wide.md', text: '日'.repeat(50_001) }])).toThrow('"wide.md" is larger than 150 KB');
  });
});
