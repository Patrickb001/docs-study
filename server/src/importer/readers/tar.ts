// A small reader for .tar.gz archives, used to read a whole GitHub repository in one download.
import { gunzipSync } from 'node:zlib';

export function* tarEntries(gz: Buffer): Generator<{ path: string; data: Buffer }> {
  const buf = gunzipSync(gz);
  const text = (from: number, to: number) => {
    const slice = buf.subarray(from, to);
    const end = slice.indexOf(0);
    return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8');
  };
  let offset = 0;
  let longName = '';
  while (offset + 512 <= buf.length) {
    const name = text(offset, offset + 100);
    if (name === '' && buf[offset] === 0) break;
    const size = parseInt(text(offset + 124, offset + 136).trim() || '0', 8);
    const type = String.fromCharCode(buf[offset + 156] || 48);
    const prefix = text(offset + 345, offset + 500);
    const data = buf.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = data.toString('utf8').replace(/\0+$/, ''); continue; }
    if (type === 'x') {
      const found = /\d+ path=([^\n]+)\n/.exec(data.toString('utf8'));
      if (found) longName = found[1];
      continue;
    }
    if (type === 'g') continue;
    const path = longName || (prefix ? prefix + '/' + name : name);
    longName = '';
    if (type === '0') yield { path, data };
  }
}
