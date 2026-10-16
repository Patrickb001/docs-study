// Checks an answer to Apply it, or an order of steps, and records the attempt.
import { get } from '../db.ts';
import { claude, claudeReady } from '../generator/claude.ts';
import { applyOutcome, checkOrder } from '../generator/exercises.ts';
import { applyGradeRequest, readApplyGradeReply } from '../generator/prompt.ts';
import { recordAttempt } from '../store.ts';

export interface ApplyResult {
  solved: boolean;
  covered: number;
  needed: number;
  points: { text: string; covered: boolean; comment: string }[];
  summary: string;
  modelAnswer: string | null; // shown only once the answer passes
}

export interface OrderResult {
  solved: boolean;
  placed: boolean[];
  correctCount: number;
  total: number;
  note: string | null; // shown only once the order is right
}

const exercise = (id: number, kind: 'apply' | 'order') => get('SELECT * FROM bug WHERE id = ? AND kind = ?', id, kind) ?? fail('That exercise could not be found.');
const fail = (message: string): never => {
  throw new Error(message);
};

// Claude marks each point on the hidden checklist. The app decides whether the answer passes.
export async function checkApply(exerciseId: number, answer: string, hintsUsed: number): Promise<ApplyResult> {
  const b = exercise(exerciseId, 'apply');
  const written = answer.trim();
  if (written.length < 20) throw new Error('Write a few sentences first, then check.');
  if (written.length > 4000) throw new Error('That answer is too long to check.');
  if (!claudeReady()) throw new Error('Only Claude can mark this exercise, and no API key is set. Add ANTHROPIC_API_KEY to your .env file and restart the app.');

  const rubric = JSON.parse(b.tests) as string[];
  const reply = await claude().send(applyGradeRequest({ id: b.id, scenario: b.description, task: JSON.parse(b.broken_code).task, rubric }, written));
  const read = reply.ok ? readApplyGradeReply(reply.text, rubric.length) : null;
  if (!read || !read.ok) throw new Error('The answer could not be marked just now. Try again.');

  const points = rubric.map((text, i) => ({ text, covered: read.value.points[i].covered, comment: read.value.points[i].comment }));
  const outcome = applyOutcome(points.map((p) => p.covered));
  recordAttempt({ bugId: b.id, mode: 'apply', answer: written, correct: outcome.solved, hintsUsed });
  return { ...outcome, points, summary: read.value.summary, modelAnswer: outcome.solved ? JSON.parse(b.working_code).modelAnswer : null };
}

// Free and instant. The steps are sent as their positions in the shuffled list, so the sequence itself is the answer.
export function checkOrderAnswer(exerciseId: number, submitted: number[], hintsUsed: number): OrderResult {
  const b = exercise(exerciseId, 'order');
  const { order, note } = JSON.parse(b.working_code) as { order: number[]; note: string };
  const result = checkOrder(order, submitted) ?? fail('That order could not be checked.');
  recordAttempt({ bugId: b.id, mode: 'order', answer: JSON.stringify(submitted), correct: result.solved, hintsUsed });
  return { ...result, total: order.length, note: result.solved ? note : null };
}
