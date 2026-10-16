// Web pages arrive wrapped in site menus and "related articles" lists. Only the article should be studied.
import { describe, expect, test } from 'vitest';
import { cleanHtml, cleanMarkdown } from './clean.ts';

const PAGE = `<html><head><title>Pub/Sub Architecture - Example</title></head><body>
<ul><li><a href="/courses">Courses</a></li><li><a href="/tutorials">Tutorials</a></li><li><a href="/dsa">DSA</a></li></ul>
<div class="article">
  <h1>Pub/Sub Architecture</h1>
  <p>The Publish/Subscribe model lets components talk without depending on each other.</p>
  <ul>
    <li><b>Publisher:</b> creates and sends messages to <a href="/topics">topics</a> without knowing who reads them.</li>
    <li><b>Subscriber:</b> receives messages from the topics it subscribes to.</li>
  </ul>
  <h2>Related articles</h2>
  <ul>
    <li><a href="/a">Design Dropbox</a><span>14 min read</span></li>
    <li><a href="/b">Designing Twitter</a><span>15+ min read</span></li>
    <li><a href="/c">Design BookMyShow</a><span>11 min read</span></li>
  </ul>
</div></body></html>`;

describe('cleanHtml', () => {
  const { title, text } = cleanHtml(PAGE, 'fallback');

  test('starts at the article title, dropping the site menu before it', () => {
    expect(title).toBe('Pub/Sub Architecture');
    expect(text.startsWith('# Pub/Sub Architecture')).toBe(true);
    expect(text).not.toContain('Courses');
  });

  test('drops lists that are mostly links, such as related articles', () => {
    expect(text).not.toContain('min read');
    expect(text).not.toContain('Design Dropbox');
  });

  test('keeps content lists, even when an item has a link in it', () => {
    expect(text).toContain('- Publisher: creates and sends messages to topics without knowing who reads them.');
    expect(text).toContain('- Subscriber: receives messages from the topics it subscribes to.');
  });

  test('leaves a page without an h1 alone', () => {
    const plain = cleanHtml('<html><body><p>Just a paragraph.</p></body></html>', 'fallback');
    expect(plain.text).toBe('Just a paragraph.');
  });
});

describe('cleanMarkdown titles', () => {
  const body = 'study '.repeat(200).trim();

  test('a file that opens with a lower heading, such as ###, takes that heading as its title', () => {
    const { title } = cleanMarkdown(`### Goal systems: a framework\n\n#### 1\\. Part one\n\n${body}`, 'fallback');
    expect(title).toBe('Goal systems: a framework');
  });

  test('a # heading further down still beats a lower heading at the top', () => {
    const { title } = cleanMarkdown(`## Overview\n\nSome words.\n\n# The real title\n\n${body}`, 'fallback');
    expect(title).toBe('The real title');
  });

  test('a file that does not open with a heading uses its file name', () => {
    const { title } = cleanMarkdown(`Some words first.\n\n## A later heading\n\n${body}`, 'fallback');
    expect(title).toBe('fallback');
  });

  test('a # with no text after it on its line is not a title', () => {
    const { title } = cleanMarkdown(`###\n\nText on the next line.\n\n${body}`, 'fallback');
    expect(title).toBe('fallback');
  });
});

describe('cleanHtml with language tabs', () => {
  const piece = (text: string) => `<script>self.__next_f.push([1,${JSON.stringify(text)}])</script>`;
  const stream = (...groups: object[][]) => groups.map((g) => `0:["$","div",null,{"tabs":${JSON.stringify(g)}}]\n`).join('');
  const shown = (code: string) => `<pre><code>${code}</code></pre>`;
  const page = (body: string, data: string) => `<html><body><main><h1>Lists</h1><p>Intro.</p>${body}</main>${piece(data)}</body></html>`;

  test('shows the JavaScript of a code block that offers it, labelled js, in page order', () => {
    const html = page(
      shown('int a = 1;') + '<p>Then:</p>' + shown('npm install') + '<p>And:</p>' + shown('int b = 2;'),
      stream([{ lang: 'java', value: 'int a = 1;' }, { lang: 'javascript', value: 'let a = 1;' }], [{ lang: 'java', value: 'int b = 2;' }, { lang: 'javascript', value: 'let b = 2;' }]),
    );
    const { text } = cleanHtml(html, 'x');
    expect(text).toContain('```js\nlet a = 1;\n```');
    expect(text).toContain('```js\nlet b = 2;\n```');
    // A block that is in no group is left as it is.
    expect(text).toContain('```\nnpm install\n```');
    expect(text).not.toContain('int a');
    expect(text.indexOf('let a')).toBeLessThan(text.indexOf('npm install'));
    expect(text.indexOf('npm install')).toBeLessThan(text.indexOf('let b'));
  });

  test('leaves a block as it is when its group has no JavaScript', () => {
    const html = page(shown('x = 1'), stream([{ lang: 'python', value: 'x = 1' }, { lang: 'go', value: 'x := 1' }]));
    expect(cleanHtml(html, 'x').text).toContain('```\nx = 1\n```');
  });

  test('is unchanged on a page with no such data', () => {
    expect(cleanHtml(`<html><body><main><h1>T</h1>${shown('int a = 1;')}</main></body></html>`, 'x').text).toContain('```\nint a = 1;\n```');
  });
});
