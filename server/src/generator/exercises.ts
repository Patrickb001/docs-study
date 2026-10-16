// The two exercises for general topics: Apply it, and ordering the steps of a process.
// Both are checked here after Claude writes them, and again whenever you hand in an answer.
import { z } from 'zod';

const text = z.string().trim().min(1);
const hints = z.array(text).length(3);
type Verified<K extends string, T> = ({ ok: true } & { [P in K]: T }) | { ok: false; reason: string };

const why = (error: z.ZodError) => {
  const issue = error.issues[0];
  return `${issue.path.join('.') || 'the exercise'}: ${issue.message}`;
};

// ---------- Apply it: a new situation, a task, and a hidden checklist of what a good answer does

const applySchema = z.object({
  scenario: text,
  task: text,
  rubric: z.array(text).min(3).max(5),
  modelAnswer: text,
  hints,
});
export type NewApply = z.infer<typeof applySchema>;

export function verifyApply(raw: unknown): Verified<'apply', NewApply> {
  const read = applySchema.safeParse(raw);
  return read.success ? { ok: true, apply: read.data } : { ok: false, reason: why(read.error) };
}

// It passes when at least two thirds of the checklist is covered. Claude marks each point. The app decides the result.
export function applyOutcome(points: boolean[]): { covered: number; needed: number; solved: boolean } {
  const covered = points.filter(Boolean).length;
  const needed = Math.ceil((points.length * 2) / 3);
  return { covered, needed, solved: covered >= needed };
}

// ---------- Order the steps

const orderSchema = z.object({
  instruction: text,
  steps: z.array(text).min(3).max(7),
  note: text,
  hints,
}).refine((o) => new Set(o.steps.map((s) => s.toLowerCase())).size === o.steps.length, { message: 'the steps must all be different' });

// What is saved. The steps are shuffled. "order" lists their positions in the right sequence,
// so reading the shuffled steps in that order gives the right answer.
export interface NewOrder {
  instruction: string;
  steps: string[];
  order: number[];
  note: string;
  hints: string[];
}

// Which of the right steps goes in each shuffled place. It is never the identity, so the steps never arrive already solved.
function shuffled(n: number, rng: () => number): number[] {
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  if (perm.every((p, j) => p === j)) perm.push(perm.shift()!);
  return perm;
}

export function verifyOrder(raw: unknown, rng: () => number = Math.random): Verified<'order', NewOrder> {
  const read = orderSchema.safeParse(raw);
  if (!read.success) return { ok: false, reason: why(read.error) };
  const { instruction, steps, note, hints } = read.data;
  const perm = shuffled(steps.length, rng);
  const order: number[] = [];
  perm.forEach((right, place) => { order[right] = place; });
  return { ok: true, order: { instruction, steps: perm.map((right) => steps[right]), order, note, hints } };
}

// Compares your order with the right one. It returns null when what you sent is not an order of these steps at all.
export function checkOrder(order: number[], submitted: number[]): { placed: boolean[]; correctCount: number; solved: boolean } | null {
  const n = order.length;
  const valid = submitted.length === n && submitted.every((i) => Number.isInteger(i) && i >= 0 && i < n) && new Set(submitted).size === n;
  if (!valid) return null;
  const placed = submitted.map((step, i) => step === order[i]);
  const correctCount = placed.filter(Boolean).length;
  return { placed, correctCount, solved: correctCount === n };
}
