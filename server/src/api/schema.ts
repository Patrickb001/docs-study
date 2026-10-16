// The API between the screens and the server. A query reads data. A mutation changes it.
import { GraphQLError } from 'graphql';
import { config, hasApiKey } from '../config.ts';
import { all, get, run, today, type Row } from '../db.ts';
import { runTests } from '../generator/bugCheck.ts';
import { parseSubmitted, runChecks } from '../generator/designCheck.ts';
import { costUsd, estimateUsd } from '../generator/estimate.ts';
import { savedExplainer, writeExplainer } from '../generator/explain.ts';
import { checkApply, checkOrderAnswer } from '../grader/exerciseCheck.ts';
import { grade } from '../grader/grade.ts';
import type { ChosenFile } from '../importer/files.ts';
import { addFiles, approveUpdate, checkForChanges, confirmImport, pendingChanges, startImport, topUp } from '../importer/job.ts';
import { passMark, quizPassed } from '../rules/quiz.ts';
import { DAILY_CAP, nextGap } from '../rules/review.ts';
import { activeBug, activeQuestions, dueQuestions, mapFor, recordAttempt } from '../store.ts';

export const typeDefs = `#graphql
  type AppInfo {
    hasApiKey: Boolean!
    spendLimitUsd: Float!
    writerModel: String!
    graderModel: String!
  }
  type ImportJob {
    id: ID!
    libraryId: ID!
    kind: String!
    mode: String!
    status: String!
    message: String!
    words: Int!
    pageCount: Int!
    estimateBatchUsd: Float!
    estimateDirectUsd: Float!
    costUsd: Float!
  }
  type Change {
    pageId: ID!
    title: String!
    kind: String!
    questions: Int!
    bugs: Int!
    "What it costs to rewrite this page now, at full price."
    estimateUsd: Float!
  }
  "A markdown file you chose. The name is its path inside the folder you picked, or just its name."
  input FileInput {
    name: String!
    text: String!
  }
  type FileUpdate {
    message: String!
    changes: [Change!]!
  }
  type Library {
    id: ID!
    name: String!
    sourceUrl: String!
    wayIn: String!
    lastCheckedAt: String
    pageCount: Int!
    "How many of the pages came from markdown files you chose."
    fileCount: Int!
    conceptCount: Int!
    solidCount: Int!
    job: ImportJob
    changes: [Change!]!
    failedPages: [String!]!
  }
  type Concept {
    id: ID!
    libraryId: ID!
    name: String!
    summary: String!
    status: String!
    docTitle: String!
    docUrl: String!
    needs: [String!]!
    quizState: String!
    bugState: String!
    "Whether the exercise this concept shows now has been done. The concept can be solid without it."
    activeExerciseDone: Boolean!
    exerciseKind: String!
    "The exercise types that fit this concept, such as code, apply, order, design."
    fits: [String!]!
    questionCount: Int!
  }
  type Link {
    id: ID!
    firstId: ID!
    thenId: ID!
  }
  type ConceptMap {
    libraryId: ID!
    concepts: [Concept!]!
    links: [Link!]!
    nextId: ID
  }
  type Question {
    id: ID!
    conceptId: ID!
    conceptName: String!
    type: String!
    prompt: String!
    code: String!
    options: [String!]!
    gapDays: Int
  }
  type Bug {
    id: ID!
    conceptId: ID!
    conceptName: String!
    description: String!
    brokenCode: String!
    "'react' for a React component, 'js' for plain JavaScript functions."
    runtime: String!
    hints: [String!]!
    docTitle: String!
    docUrl: String!
  }
  type AnswerResult {
    attemptId: ID
    correct: Boolean!
    needsSelfGrade: Boolean!
    correctAnswer: String!
    explanation: String!
    feedback: String!
    gapDays: Int!
    docTitle: String!
    docUrl: String!
  }
  type QuizResult {
    passed: Boolean!
    right: Int!
    total: Int!
    passMark: Int!
  }
  type TestOutcome {
    name: String!
    pass: Boolean!
    message: String!
  }
  type BugCheck {
    ran: Boolean!
    solved: Boolean!
    "The code ran for too long and was stopped, which usually means a loop that never ends."
    timedOut: Boolean!
    error: String!
    tests: [TestOutcome!]!
  }
  type CodeExample {
    code: String!
    note: String!
  }
  type Term {
    term: String!
    meaning: String!
  }
  "A plain summary of one concept, for someone meeting it for the first time."
  type Explainer {
    gist: String!
    paragraphs: [String!]!
    example: CodeExample
    "A short worked example told as a story, for pages with no code. Summaries written before this existed have none."
    scenario: String
    watchOut: [String!]!
    terms: [Term!]!
  }
  type DesignPart {
    id: String!
    kind: String!
    label: String!
  }
  type DesignLink {
    from: String!
    to: String!
    style: String!
  }
  type PaletteItem {
    kind: String!
    label: String!
  }
  type DesignGraph {
    parts: [DesignPart!]!
    links: [DesignLink!]!
  }
  "A design fix: a small system design with one flaw. The checks and the answer are never sent until it is solved."
  type DesignFix {
    id: ID!
    conceptId: ID!
    conceptName: String!
    scenario: String!
    goals: [String!]!
    parts: [DesignPart!]!
    links: [DesignLink!]!
    palette: [PaletteItem!]!
    hints: [String!]!
    docTitle: String!
    docUrl: String!
  }
  type CheckOutcome {
    name: String!
    pass: Boolean!
    message: String!
  }
  type DesignCheckResult {
    solved: Boolean!
    checks: [CheckOutcome!]!
    "One working design, shown only once yours passes."
    solution: DesignGraph
  }
  type ApplyExercise {
    id: ID!
    conceptId: ID!
    conceptName: String!
    scenario: String!
    task: String!
    hints: [String!]!
    docTitle: String!
    docUrl: String!
  }
  type ApplyPoint {
    text: String!
    covered: Boolean!
    comment: String!
  }
  type ApplyResult {
    solved: Boolean!
    covered: Int!
    needed: Int!
    points: [ApplyPoint!]!
    summary: String!
    "A strong answer, shown only once yours passes."
    modelAnswer: String
  }
  "An id is the step's place in the shuffled list. It says nothing about the right order."
  type OrderStep {
    id: Int!
    text: String!
  }
  type OrderExercise {
    id: ID!
    conceptId: ID!
    conceptName: String!
    instruction: String!
    steps: [OrderStep!]!
    hints: [String!]!
    docTitle: String!
    docUrl: String!
  }
  type OrderResult {
    solved: Boolean!
    "For each place in your order, whether the step you put there is right."
    placed: [Boolean!]!
    correctCount: Int!
    total: Int!
    "Why the order matters, shown only once it is right."
    note: String
  }
  type TopUpResult {
    added: Int!
    message: String!
  }
  enum AnswerMode { QUIZ REVIEW }
  enum FlagKind { QUESTION BUG LINK }
  enum ImportMode { BATCH DIRECT }
  enum TopUpKind { QUESTIONS EXERCISE }
  "Which kind of exercise to write."
  enum ExerciseChoice { BUG DESIGN APPLY ORDER }

  type Query {
    appInfo: AppInfo!
    libraries: [Library!]!
    conceptMap(libraryId: ID!): ConceptMap!
    concept(id: ID!): Concept
    quiz(conceptId: ID!): [Question!]!
    bug(conceptId: ID!): Bug
    dueReviews: [Question!]!
    importJob(id: ID!): ImportJob
    "The saved plain summary, or null if none has been written yet."
    explainer(conceptId: ID!): Explainer
    designFix(conceptId: ID!): DesignFix
    applyIt(conceptId: ID!): ApplyExercise
    orderIt(conceptId: ID!): OrderExercise
  }
  type Mutation {
    answerQuestion(questionId: ID!, answer: String!, mode: AnswerMode!, selfGrade: Boolean): AnswerResult!
    finishQuiz(conceptId: ID!, attemptIds: [ID!]!): QuizResult!
    checkBugFix(bugId: ID!, code: String!, hintsUsed: Int!): BugCheck!
    flag(kind: FlagKind!, id: ID!): Boolean!
    startImport(urls: [String!]!, pageLimit: Int, name: String, files: [FileInput!]): ImportJob!
    confirmImport(jobId: ID!, mode: ImportMode!): ImportJob!
    checkForChanges(libraryId: ID!): [Change!]!
    addFiles(libraryId: ID!, files: [FileInput!]!): FileUpdate!
    approveUpdate(libraryId: ID!, pageIds: [ID!]!): ImportJob!
    topUp(conceptId: ID!, what: TopUpKind!, kind: ExerciseChoice): TopUpResult!
    "Asks Claude to write the plain summary, unless one is saved already."
    writeExplainer(conceptId: ID!, rewrite: Boolean): Explainer!
    checkDesign(designId: ID!, design: String!, hintsUsed: Int!): DesignCheckResult!
    checkApply(exerciseId: ID!, answer: String!, hintsUsed: Int!): ApplyResult!
    checkOrder(exerciseId: ID!, order: [Int!]!, hintsUsed: Int!): OrderResult!
    deleteLibrary(id: ID!): Boolean!
  }
`;

// Errors thrown here are shown to you on screen, so they are written as plain sentences.
const fail = (message: string): never => {
  throw new GraphQLError(message);
};
async function friendly<T>(work: () => Promise<T> | T): Promise<T> {
  try {
    return await work();
  } catch (err: any) {
    if (err instanceof GraphQLError) throw err;
    throw new GraphQLError(String(err?.message ?? err));
  }
}

const jobView = (j: Row | undefined) =>
  j && {
    id: j.id,
    libraryId: j.library_id,
    kind: j.kind,
    mode: j.mode,
    status: j.status,
    message: j.message,
    words: j.words,
    pageCount: get('SELECT COUNT(*) AS n FROM page WHERE library_id = ? AND text != ?', j.library_id, '')!.n,
    estimateBatchUsd: estimateUsd(j.words, 'batch'),
    estimateDirectUsd: estimateUsd(j.words, 'direct'),
    costUsd: costUsd(j.tokens_in, j.tokens_out, j.mode),
  };

const questionView = (q: Row) => ({
  id: q.id,
  conceptId: q.concept_id,
  conceptName: q.concept_name ?? get('SELECT name FROM concept WHERE id = ?', q.concept_id)?.name ?? '',
  type: q.type,
  prompt: q.prompt,
  code: q.code,
  options: JSON.parse(q.options),
  gapDays: q.gap_days ?? null,
});

function findConcept(id: number) {
  const row = get('SELECT library_id FROM concept WHERE id = ?', id);
  return row ? mapFor(row.library_id).concepts.find((c) => c.id === id) ?? null : null;
}

export const resolvers = {
  Query: {
    appInfo: () => ({ hasApiKey: hasApiKey(), spendLimitUsd: config.spendLimitUsd, writerModel: config.writerModel, graderModel: config.graderModel }),

    libraries: () =>
      all('SELECT * FROM library ORDER BY id').map((l) => {
        const map = mapFor(l.id);
        return {
          id: l.id,
          name: l.name,
          sourceUrl: l.source_url,
          wayIn: l.way_in,
          lastCheckedAt: l.last_checked_at,
          pageCount: get('SELECT COUNT(*) AS n FROM page WHERE library_id = ? AND text != ?', l.id, '')!.n,
          fileCount: get('SELECT COUNT(*) AS n FROM page WHERE library_id = ? AND url LIKE ? AND text != ?', l.id, 'file:%', '')!.n,
          conceptCount: map.concepts.length,
          solidCount: map.concepts.filter((c) => c.status === 'solid').length,
          job: jobView(get('SELECT * FROM import_job WHERE library_id = ? ORDER BY id DESC LIMIT 1', l.id)),
          changes: pendingChanges(l.id),
          failedPages: all('SELECT title, failed FROM page WHERE library_id = ? AND failed != ?', l.id, '').map((p) => `${p.title}: ${p.failed}`),
        };
      }),

    conceptMap: (_: unknown, args: { libraryId: string }) => ({ libraryId: args.libraryId, ...mapFor(Number(args.libraryId)) }),
    concept: (_: unknown, args: { id: string }) => findConcept(Number(args.id)),
    quiz: (_: unknown, args: { conceptId: string }) => activeQuestions(Number(args.conceptId)).map(questionView),

    bug: (_: unknown, args: { conceptId: string }) => {
      const b = activeBug(Number(args.conceptId));
      if (!b || b.kind !== 'code') return null;
      const c = get('SELECT c.name, p.title, p.url FROM concept c JOIN page p ON p.id = c.page_id WHERE c.id = ?', b.concept_id)!;
      return { id: b.id, conceptId: b.concept_id, conceptName: c.name, description: b.description, brokenCode: b.broken_code, runtime: b.runtime, hints: JSON.parse(b.hints), docTitle: c.title, docUrl: c.url };
    },

    designFix: (_: unknown, args: { conceptId: string }) => {
      const b = activeBug(Number(args.conceptId));
      if (!b || b.kind !== 'design') return null;
      const c = get('SELECT c.name, p.title, p.url FROM concept c JOIN page p ON p.id = c.page_id WHERE c.id = ?', b.concept_id)!;
      const start = JSON.parse(b.broken_code);
      return {
        id: b.id, conceptId: b.concept_id, conceptName: c.name, scenario: b.description,
        goals: start.goals, parts: start.parts, links: start.links, palette: start.palette,
        hints: JSON.parse(b.hints), docTitle: c.title, docUrl: c.url,
      };
    },

    applyIt: (_: unknown, args: { conceptId: string }) => {
      const b = activeBug(Number(args.conceptId));
      if (!b || b.kind !== 'apply') return null;
      const c = get('SELECT c.name, p.title, p.url FROM concept c JOIN page p ON p.id = c.page_id WHERE c.id = ?', b.concept_id)!;
      return { id: b.id, conceptId: b.concept_id, conceptName: c.name, scenario: b.description, task: JSON.parse(b.broken_code).task, hints: JSON.parse(b.hints), docTitle: c.title, docUrl: c.url };
    },

    orderIt: (_: unknown, args: { conceptId: string }) => {
      const b = activeBug(Number(args.conceptId));
      if (!b || b.kind !== 'order') return null;
      const c = get('SELECT c.name, p.title, p.url FROM concept c JOIN page p ON p.id = c.page_id WHERE c.id = ?', b.concept_id)!;
      const steps = (JSON.parse(b.broken_code).steps as string[]).map((text, id) => ({ id, text }));
      return { id: b.id, conceptId: b.concept_id, conceptName: c.name, instruction: b.description, steps, hints: JSON.parse(b.hints), docTitle: c.title, docUrl: c.url };
    },

    dueReviews: () => dueQuestions(DAILY_CAP).map(questionView),
    importJob: (_: unknown, args: { id: string }) => jobView(get('SELECT * FROM import_job WHERE id = ?', Number(args.id))),
    explainer: (_: unknown, args: { conceptId: string }) => savedExplainer(Number(args.conceptId)),
  },

  Mutation: {
    answerQuestion: (_: unknown, args: { questionId: string; answer: string; mode: 'QUIZ' | 'REVIEW'; selfGrade?: boolean | null }) =>
      friendly(async () => {
        const q = get('SELECT * FROM question WHERE id = ?', Number(args.questionId)) ?? fail('That question could not be found.');
        const doc = get('SELECT p.title, p.url FROM concept c JOIN page p ON p.id = c.page_id WHERE c.id = ?', q.concept_id)!;
        const result = args.selfGrade === null || args.selfGrade === undefined ? await grade(q as any, args.answer) : { correct: args.selfGrade, feedback: '', needsSelfGrade: false };
        const correctAnswer = q.type === 'choice' ? JSON.parse(q.options)[Number(q.answer)] ?? '' : q.answer;
        const base = { correctAnswer, explanation: q.explanation, docTitle: doc.title, docUrl: doc.url };
        // The AI grader was not available: show the model answer and let you mark yourself.
        if (result.needsSelfGrade) return { ...base, attemptId: null, correct: false, needsSelfGrade: true, feedback: '', gapDays: 0 };

        const mode = args.mode === 'REVIEW' ? 'review' : 'quiz';
        const attemptId = recordAttempt({ questionId: q.id, mode, answer: args.answer, correct: result.correct });
        const review = get('SELECT gap_days FROM review WHERE question_id = ?', q.id);
        // In a quiz, a question joins your reviews at 1 day and a miss resets it. In a review, a right answer climbs the ladder.
        const gap = mode === 'review' ? nextGap(review?.gap_days ?? null, result.correct) : result.correct && review ? review.gap_days : 1;
        run('INSERT INTO review (question_id, gap_days, due_on) VALUES (?, ?, ?) ON CONFLICT(question_id) DO UPDATE SET gap_days = excluded.gap_days, due_on = excluded.due_on', q.id, gap, today(gap));
        return { ...base, attemptId, correct: result.correct, needsSelfGrade: false, feedback: result.feedback, gapDays: gap };
      }),

    finishQuiz: (_: unknown, args: { conceptId: string; attemptIds: string[] }) => {
      const conceptId = Number(args.conceptId);
      const ids = args.attemptIds.map(Number).filter(Number.isFinite);
      const rows = ids.length
        ? all(`SELECT a.correct FROM attempt a JOIN question q ON q.id = a.question_id WHERE q.concept_id = ? AND a.mode = 'quiz' AND a.id IN (${ids.map(() => '?').join(',')})`, conceptId, ...ids)
        : [];
      const right = rows.filter((a) => a.correct === 1).length;
      const passed = quizPassed(right, rows.length);
      if (passed) run('INSERT INTO quiz_pass (concept_id, passed_at) VALUES (?, ?)', conceptId, new Date().toISOString());
      return { passed, right, total: rows.length, passMark: passMark(rows.length) };
    },

    checkBugFix: (_: unknown, args: { bugId: string; code: string; hintsUsed: number }) =>
      friendly(async () => {
        const b = get('SELECT * FROM bug WHERE id = ?', Number(args.bugId)) ?? fail('That bug hunt could not be found.');
        if (args.code.length > 20000) fail('That code is too long to check.');
        const result = await runTests(args.code, b.tests, b.runtime === 'js' ? 'js' : 'react');
        const solved = result.ran && result.allPass;
        recordAttempt({ bugId: b.id, mode: 'bug', answer: args.code, correct: solved, hintsUsed: args.hintsUsed });
        return { ran: result.ran, solved, timedOut: result.timedOut, error: result.error, tests: result.tests };
      }),

    flag: (_: unknown, args: { kind: 'QUESTION' | 'BUG' | 'LINK'; id: string }) => {
      const id = Number(args.id);
      if (args.kind === 'QUESTION') {
        run('UPDATE question SET flagged = 1 WHERE id = ?', id);
        run('DELETE FROM review WHERE question_id = ?', id);
      } else if (args.kind === 'BUG') run('UPDATE bug SET flagged = 1 WHERE id = ?', id);
      else run('UPDATE concept_link SET flagged = 1 WHERE id = ?', id);
      return true;
    },

    startImport: (_: unknown, args: { urls: string[]; pageLimit?: number | null; name?: string | null; files?: ChosenFile[] | null }) =>
      friendly(() => jobView(startImport(args.urls, args.pageLimit ?? 0, args.name ?? '', args.files ?? []))),
    confirmImport: (_: unknown, args: { jobId: string; mode: 'BATCH' | 'DIRECT' }) => friendly(async () => jobView(await confirmImport(Number(args.jobId), args.mode === 'BATCH' ? 'batch' : 'direct'))),
    checkForChanges: (_: unknown, args: { libraryId: string }) => friendly(() => checkForChanges(Number(args.libraryId))),
    addFiles: (_: unknown, args: { libraryId: string; files: ChosenFile[] }) => friendly(() => addFiles(Number(args.libraryId), args.files)),
    approveUpdate: (_: unknown, args: { libraryId: string; pageIds: string[] }) => friendly(() => jobView(approveUpdate(Number(args.libraryId), args.pageIds.map(Number)))),
    topUp: (_: unknown, args: { conceptId: string; what: 'QUESTIONS' | 'EXERCISE'; kind?: 'BUG' | 'DESIGN' | 'APPLY' | 'ORDER' | null }) =>
      friendly(() => topUp(Number(args.conceptId), args.what === 'EXERCISE' ? 'exercise' : 'questions', args.kind ? ({ BUG: 'code', DESIGN: 'design', APPLY: 'apply', ORDER: 'order' } as const)[args.kind] : undefined)),

    checkDesign: (_: unknown, args: { designId: string; design: string; hintsUsed: number }) =>
      friendly(() => {
        const b = get("SELECT * FROM bug WHERE id = ? AND kind = 'design'", Number(args.designId)) ?? fail('That design fix could not be found.');
        const graph = parseSubmitted(args.design) ?? fail('That design could not be checked.');
        const start = JSON.parse(b.broken_code);
        const known = new Map<string, string>(start.parts.map((p: { id: string; label: string }) => [p.id, p.label]));
        const checks = runChecks(graph, JSON.parse(b.tests), known);
        const solved = checks.every((c) => c.pass);
        recordAttempt({ bugId: b.id, mode: 'design', answer: args.design, correct: solved, hintsUsed: args.hintsUsed });
        return { solved, checks, solution: solved ? JSON.parse(b.working_code) : null };
      }),

    checkApply: (_: unknown, args: { exerciseId: string; answer: string; hintsUsed: number }) => friendly(() => checkApply(Number(args.exerciseId), args.answer, args.hintsUsed)),
    checkOrder: (_: unknown, args: { exerciseId: string; order: number[]; hintsUsed: number }) => friendly(() => checkOrderAnswer(Number(args.exerciseId), args.order, args.hintsUsed)),

    writeExplainer: (_: unknown, args: { conceptId: string; rewrite?: boolean | null }) => friendly(() => writeExplainer(Number(args.conceptId), args.rewrite === true)),

    deleteLibrary: (_: unknown, args: { id: string }) => {
      run('DELETE FROM library WHERE id = ?', Number(args.id));
      return true;
    },
  },
};
