// Reads and writes study content, and gathers the facts the rules need.
import { all, get, now, run, today, type Row } from './db.ts';
import { runtimeOf } from './generator/bugCheck.ts';
import type { NewDesign } from './generator/designCheck.ts';
import type { NewApply, NewOrder } from './generator/exercises.ts';
import type { NewBug, NewQuestion } from './generator/prompt.ts';
import { nextConcept, statuses, type ConceptFacts, type Link, type Status } from './rules/status.ts';

export function addQuestion(conceptId: number, q: NewQuestion): number {
  const options = q.type === 'choice' ? JSON.stringify(q.options) : '[]';
  const answer = q.type === 'written' ? '' : String(q.answer);
  return run('INSERT INTO question (concept_id, type, prompt, code, options, answer, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)', conceptId, q.type, q.prompt, q.code ?? '', options, answer, q.explanation);
}

export function addBug(conceptId: number, b: NewBug): number {
  return run('INSERT INTO bug (concept_id, runtime, description, broken_code, working_code, tests, hints) VALUES (?, ?, ?, ?, ?, ?, ?)', conceptId, runtimeOf(b), b.description, b.brokenCode, b.workingCode, b.tests, JSON.stringify(b.hints));
}

// A design fix lives in the bug table with kind 'design'. The columns hold its parts as JSON.
export function addDesign(conceptId: number, d: NewDesign): number {
  return run(
    "INSERT INTO bug (concept_id, kind, description, broken_code, working_code, tests, hints) VALUES (?, 'design', ?, ?, ?, ?, ?)",
    conceptId, d.scenario, JSON.stringify({ goals: d.goals, parts: d.broken.parts, links: d.broken.links, palette: d.palette }),
    JSON.stringify(d.working), JSON.stringify(d.checks), JSON.stringify(d.hints),
  );
}

// An apply exercise and an ordering exercise live in the bug table too, with kind 'apply' and 'order'.
// Apply keeps its checklist in "tests". An ordering is saved shuffled, with the right sequence kept apart from what the screen is sent.
export function addApply(conceptId: number, a: NewApply): number {
  return run(
    "INSERT INTO bug (concept_id, kind, description, broken_code, working_code, tests, hints) VALUES (?, 'apply', ?, ?, ?, ?, ?)",
    conceptId, a.scenario, JSON.stringify({ task: a.task }), JSON.stringify({ modelAnswer: a.modelAnswer }), JSON.stringify(a.rubric), JSON.stringify(a.hints),
  );
}

export function addOrder(conceptId: number, o: NewOrder): number {
  return run(
    "INSERT INTO bug (concept_id, kind, description, broken_code, working_code, tests, hints) VALUES (?, 'order', ?, ?, ?, '[]', ?)",
    conceptId, o.instruction, JSON.stringify({ steps: o.steps }), JSON.stringify({ order: o.order, note: o.note }), JSON.stringify(o.hints),
  );
}

// ---------- which exercise types fit a concept

// The order they are listed in on screen.
const KIND_ORDER = ['code', 'apply', 'order', 'design'];
// Claude says "bug". The saved name for a bug hunt is "code".
const SAVED_NAME: Record<string, string> = { bug: 'code', design: 'design', apply: 'apply', order: 'order' };

// What is saved on a concept: the types Claude said fit, plus the one it wrote. Empty when Claude did not say.
export function storedFits(said: string[] | undefined, kept: string | null): string {
  const kinds = new Set((said ?? []).map((k) => SAVED_NAME[k]).filter((k): k is string => !!k));
  if (kinds.size === 0) return '';
  if (kept) kinds.add(kept);
  return KIND_ORDER.filter((k) => kinds.has(k)).join(',');
}

// What the screen offers. A concept saved before Claude was asked has no list, so it gets the types that usually fit:
// apply and order, a bug hunt when the page has code, and whatever kind the concept already has.
export function fitsOf(concept: { fits: string; exerciseKind: string; hasCode: boolean }): string[] {
  if (concept.fits !== '') return concept.fits.split(',').filter((k) => KIND_ORDER.includes(k));
  const kinds = new Set(['apply', 'order']);
  if (concept.hasCode) kinds.add('code');
  if (KIND_ORDER.includes(concept.exerciseKind)) kinds.add(concept.exerciseKind);
  return KIND_ORDER.filter((k) => kinds.has(k));
}

export const activeQuestions = (conceptId: number): Row[] => all('SELECT * FROM question WHERE concept_id = ? AND flagged = 0 AND retired = 0 ORDER BY id', conceptId);
export const activeBug = (conceptId: number): Row | undefined => get('SELECT * FROM bug WHERE concept_id = ? AND flagged = 0 AND retired = 0 ORDER BY id DESC LIMIT 1', conceptId);

export interface ConceptView {
  id: number;
  libraryId: number;
  name: string;
  summary: string;
  position: number;
  status: Status;
  docTitle: string;
  docUrl: string;
  needs: string[];
  quizState: 'none' | 'tried' | 'passed';
  bugState: 'none' | 'open' | 'fixed';
  // Whether the exercise the concept shows now has a correct attempt. A concept stays solid once any exercise is solved,
  // so this can be false for a solid concept that was given a new exercise.
  activeExerciseDone: boolean;
  exerciseKind: 'code' | 'design' | 'apply' | 'order' | 'none';
  // The exercise types that fit this concept, in the order they are shown.
  fits: string[];
  questionCount: number;
}

// Everything the map needs for one library, with each concept's status worked out fresh.
export function mapFor(libraryId: number): { concepts: ConceptView[]; links: { id: number; firstId: number; thenId: number }[]; nextId: number | null } {
  const rows = all('SELECT c.*, p.title AS doc_title, p.url AS doc_url, instr(p.text, ?) > 0 AS has_code FROM concept c JOIN page p ON p.id = c.page_id WHERE c.library_id = ? ORDER BY c.position', '```', libraryId);
  const linkRows = all('SELECT id, first_id, then_id FROM concept_link WHERE library_id = ? AND flagged = 0', libraryId);
  const links: Link[] = linkRows.map((l) => ({ firstId: l.first_id, thenId: l.then_id }));

  const facts: ConceptFacts[] = rows.map((c) => {
    const tried = get('SELECT COUNT(*) AS n FROM attempt a JOIN question q ON q.id = a.question_id WHERE q.concept_id = ? AND a.mode = ?', c.id, 'quiz')!.n > 0;
    const passed = get('SELECT COUNT(*) AS n FROM quiz_pass WHERE concept_id = ?', c.id)!.n > 0;
    const hasBug = get('SELECT COUNT(*) AS n FROM bug WHERE concept_id = ? AND flagged = 0 AND retired = 0', c.id)!.n > 0;
    const fixed = get('SELECT COUNT(*) AS n FROM attempt a JOIN bug b ON b.id = a.bug_id WHERE b.concept_id = ? AND a.correct = 1', c.id)!.n > 0;
    const lastTwo = all('SELECT a.correct FROM attempt a JOIN question q ON q.id = a.question_id WHERE q.concept_id = ? AND a.mode = ? ORDER BY a.id DESC LIMIT 2', c.id, 'review');
    return { id: c.id, position: c.position, triedQuiz: tried, passedQuiz: passed, hasBug, fixedBug: fixed, slipping: lastTwo.length === 2 && lastTwo.every((a) => a.correct === 0) };
  });
  const status = statuses(facts, links);
  const names = new Map(rows.map((c) => [c.id, c.name as string]));
  const concepts: ConceptView[] = rows.map((c, i) => {
    const f = facts[i];
    const active = activeBug(c.id);
    return {
      id: c.id, libraryId, name: c.name, summary: c.summary, position: c.position, status: status.get(c.id)!,
      docTitle: c.doc_title, docUrl: c.doc_url,
      needs: links.filter((l) => l.thenId === c.id).map((l) => names.get(l.firstId)!).filter(Boolean),
      quizState: f.passedQuiz ? 'passed' : f.triedQuiz ? 'tried' : 'none',
      bugState: !f.hasBug ? 'none' : f.fixedBug ? 'fixed' : 'open',
      activeExerciseDone: !!active && get('SELECT COUNT(*) AS n FROM attempt WHERE bug_id = ? AND correct = 1', active.id)!.n > 0,
      exerciseKind: (active?.kind as 'code' | 'design' | 'apply' | 'order' | undefined) ?? 'none',
      fits: fitsOf({ fits: c.fits, exerciseKind: active?.kind ?? 'none', hasCode: c.has_code === 1 }),
      questionCount: get('SELECT COUNT(*) AS n FROM question WHERE concept_id = ? AND flagged = 0 AND retired = 0', c.id)!.n,
    };
  });
  return { concepts, links: linkRows.map((l) => ({ id: l.id, firstId: l.first_id, thenId: l.then_id })), nextId: nextConcept(facts, status) };
}

export function dueQuestions(limit: number): Row[] {
  return all(
    `SELECT q.*, r.gap_days, r.due_on, c.name AS concept_name FROM review r
     JOIN question q ON q.id = r.question_id JOIN concept c ON c.id = q.concept_id
     WHERE r.due_on <= ? AND q.flagged = 0 AND q.retired = 0 ORDER BY r.due_on, q.id LIMIT ?`,
    today(), limit,
  );
}

export function recordAttempt(input: { questionId?: number; bugId?: number; mode: string; answer: string; correct: boolean; hintsUsed?: number }): number {
  return run('INSERT INTO attempt (question_id, bug_id, mode, answer, correct, hints_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    input.questionId ?? null, input.bugId ?? null, input.mode, input.answer.slice(0, 4000), input.correct ? 1 : 0, input.hintsUsed ?? 0, now());
}
