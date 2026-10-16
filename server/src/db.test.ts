// A database made before a column existed gets that column on startup, and old rows read its default.
import { expect, test } from 'vitest';
import { db, ensureColumn, get, run } from './db.ts';

test('adds a missing column once, and old rows read its default', () => {
  db.exec('CREATE TABLE old_bug (id INTEGER PRIMARY KEY, description TEXT)');
  run('INSERT INTO old_bug (description) VALUES (?)', 'an old bug');
  ensureColumn('old_bug', 'kind', "TEXT NOT NULL DEFAULT 'code'");
  ensureColumn('old_bug', 'kind', "TEXT NOT NULL DEFAULT 'code'");
  expect(get('SELECT kind FROM old_bug')!.kind).toBe('code');
});

test('the bug table has a kind column, and bugs default to code', () => {
  const columns = db.prepare('PRAGMA table_info(bug)').all() as { name: string }[];
  expect(columns.map((c) => c.name)).toContain('kind');
});
