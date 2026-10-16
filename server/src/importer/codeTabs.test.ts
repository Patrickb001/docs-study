// Reads the hidden language tabs that some Next.js docs sites send as data.
import { describe, expect, test } from 'vitest';
import { findJavaScript, readCodeGroups } from './codeTabs.ts';

const piece = (text: string) => `<script>self.__next_f.push([1,${JSON.stringify(text)}])</script>`;
const html = (...stream: string[]) => `<html><body><main><h1>Lists</h1></main>${stream.map(piece).join('')}</body></html>`;
const tabs = (list: object[]) => `0:["$","div",null,{"tabs":${JSON.stringify(list)}}]\n`;

describe('readCodeGroups', () => {
  test('reads each language of a code group', () => {
    const groups = readCodeGroups(html(tabs([{ meta: '', value: 'int a;', lang: 'java' }, { meta: '', value: 'let a;', lang: 'javascript' }])));
    expect(groups).toEqual([[{ lang: 'java', code: 'int a;' }, { lang: 'javascript', code: 'let a;' }]]);
  });

  test('joins data that arrives in several pieces', () => {
    const whole = tabs([{ value: 'let b;', lang: 'js' }]);
    const cut = Math.floor(whole.length / 2);
    expect(readCodeGroups(html(whole.slice(0, cut), whole.slice(cut)))).toEqual([[{ lang: 'js', code: 'let b;' }]]);
  });

  test('follows a $ reference to its text row, counting bytes and not letters', () => {
    const text = 'let café = 1;\nlet b = 2;';
    const row = `e5:T${Buffer.byteLength(text).toString(16)},${text}`;
    // The next row follows straight after the text, as it does on a real page.
    const groups = readCodeGroups(html(row + tabs([{ value: '$e5', lang: 'javascript' }, { value: 'int a;', lang: 'java' }])));
    expect(groups).toEqual([[{ lang: 'javascript', code: text }, { lang: 'java', code: 'int a;' }]]);
  });

  test('a value that starts with $$ is a plain $', () => {
    expect(readCodeGroups(html(tabs([{ value: '$$price', lang: 'javascript' }])))).toEqual([[{ lang: 'javascript', code: '$price' }]]);
  });

  test('leaves out a tab whose reference points nowhere, and a tab with no language or code', () => {
    const groups = readCodeGroups(html(tabs([{ value: '$ff', lang: 'java' }, { value: 'x', lang: 7 }, { lang: 'go' }, { value: 'let c;', lang: 'javascript' }])));
    expect(groups).toEqual([[{ lang: 'javascript', code: 'let c;' }]]);
  });

  test("drops the site's diagram notes from the code, on a line of their own or in the middle of one", () => {
    const own = 'while (a) {\n    a = a.next;\n}\n/**<extend down -200>![](/images/algo/x/1.gif) */\nreturn a;';
    const inline = 'if (a == b) break; /**<extend up -100>![](/images/algo/x/2.jpeg) */ }';
    const groups = readCodeGroups(html(tabs([{ value: own, lang: 'javascript' }, { value: inline, lang: 'java' }])));
    expect(groups).toEqual([[{ lang: 'javascript', code: 'while (a) {\n    a = a.next;\n}\nreturn a;' }, { lang: 'java', code: 'if (a == b) break; }' }]]);
  });

  test('gives nothing for a page with no such data, and for data it cannot read', () => {
    expect(readCodeGroups('<html><body><p>Plain page</p></body></html>')).toEqual([]);
    expect(readCodeGroups('<script>self.__next_f.push([1,"{\\u00"])</script>')).toEqual([]);
    expect(readCodeGroups(html('0:["$","div",null,{"tabs":[{"value":'))).toEqual([]);
  });
});

describe('findJavaScript', () => {
  const groups = [
    [{ lang: 'java', code: 'int a;\nint b;' }, { lang: 'javascript', code: 'let a;\nlet b;' }],
    [{ lang: 'java', code: 'int c;' }, { lang: 'python', code: 'c = 1' }],
    [{ lang: 'java', code: 'int d;' }, { lang: 'JS', code: 'let d;' }],
  ];

  test('finds the group that holds the code as shown, and returns its JavaScript', () => {
    expect(findJavaScript(groups, 'int a;\nint b;\n', 0)).toEqual({ next: 1, javascript: 'let a;\nlet b;' });
  });

  test('ignores differences in spacing', () => {
    expect(findJavaScript(groups, '  int   a;  int b;', 0)?.javascript).toBe('let a;\nlet b;');
  });

  test('keeps the order: a group already passed is not matched again', () => {
    expect(findJavaScript(groups, 'int a;\nint b;', 1)).toBeNull();
    expect(findJavaScript(groups, 'int d;', 1)).toEqual({ next: 3, javascript: 'let d;' });
  });

  test('moves past a group with no JavaScript, and says there is none', () => {
    expect(findJavaScript(groups, 'int c;', 0)).toEqual({ next: 2, javascript: null });
  });

  test('gives null for a block that is in no group', () => {
    expect(findJavaScript(groups, 'npm install', 0)).toBeNull();
  });
});
