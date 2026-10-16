// The database: one SQLite file on your disk, opened with Node's built-in SQLite module.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.ts';

if (config.dbFile !== ':memory:') mkdirSync(dirname(config.dbFile), { recursive: true });
export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  way_in TEXT NOT NULL,
  last_checked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS page (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  position INTEGER NOT NULL,
  generated INTEGER NOT NULL DEFAULT 0,
  failed TEXT NOT NULL DEFAULT '',
  pending_text TEXT,
  pending_fingerprint TEXT,
  pending_kind TEXT
);
CREATE TABLE IF NOT EXISTS concept (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES page(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS concept_explainer (
  concept_id INTEGER PRIMARY KEY REFERENCES concept(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS concept_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
  first_id INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
  then_id INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
  flagged INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS question (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  options TEXT NOT NULL DEFAULT '[]',
  answer TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bug (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
  -- Holds every hands-on exercise: 'code' is a bug hunt, 'design' a design fix, 'apply' an apply-it exercise, 'order' an ordering exercise.
  kind TEXT NOT NULL DEFAULT 'code',
  description TEXT NOT NULL,
  broken_code TEXT NOT NULL,
  working_code TEXT NOT NULL,
  tests TEXT NOT NULL,
  hints TEXT NOT NULL DEFAULT '[]',
  flagged INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER REFERENCES question(id) ON DELETE CASCADE,
  bug_id INTEGER REFERENCES bug(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'quiz',
  answer TEXT NOT NULL,
  correct INTEGER NOT NULL,
  hints_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review (
  question_id INTEGER PRIMARY KEY REFERENCES question(id) ON DELETE CASCADE,
  gap_days INTEGER NOT NULL,
  due_on TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quiz_pass (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
  passed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS import_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'import',
  mode TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  page_limit INTEGER NOT NULL DEFAULT 0,
  words INTEGER NOT NULL DEFAULT 0,
  estimate_usd REAL NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_question_concept ON question(concept_id);
CREATE INDEX IF NOT EXISTS idx_attempt_question ON attempt(question_id);
CREATE INDEX IF NOT EXISTS idx_concept_library ON concept(library_id);
`);

// Adds a column to a table made before the column existed. Running it again does nothing.
export function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('bug', 'kind', "TEXT NOT NULL DEFAULT 'code'");
// 'react' for a React component, 'js' for plain JavaScript functions. Every bug made before this is React.
ensureColumn('bug', 'runtime', "TEXT NOT NULL DEFAULT 'react'");
// The exercise types that fit a concept, as a comma list such as "code,apply". Empty when Claude did not say.
ensureColumn('concept', 'fits', "TEXT NOT NULL DEFAULT ''");
// Which version of the web page cleaner made this library's fingerprints. Libraries from before it was tracked are version 1.
ensureColumn('library', 'cleaner', 'INTEGER NOT NULL DEFAULT 1');

type Value = string | number | null;
export type Row = Record<string, any>;

export const all = (sql: string, ...params: Value[]): Row[] => db.prepare(sql).all(...params) as Row[];
export const get = (sql: string, ...params: Value[]): Row | undefined => db.prepare(sql).get(...params) as Row | undefined;
export const run = (sql: string, ...params: Value[]): number => Number(db.prepare(sql).run(...params).lastInsertRowid);

export const now = () => new Date().toISOString();
// Dates without a time, in your local time zone, such as 2026-10-04.
export const today = (offsetDays = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
