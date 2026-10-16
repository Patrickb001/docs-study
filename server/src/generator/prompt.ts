// The requests the app sends to Claude, and the checks it runs on what comes back.
import { z } from 'zod';
import { config } from '../config.ts';
import type { ClaudeRequest } from './claude.ts';
import { wordCount } from '../importer/clean.ts';
import { PART_KINDS, verifyDesign, type NewDesign } from './designCheck.ts';
import { verifyApply, verifyOrder, type NewApply, type NewOrder } from './exercises.ts';

const RULES = `You write study material for a developer who is learning from documentation.
Write in plain, clear language. Use only what the page says. Never invent APIs or behaviour.
Reply with one JSON object and nothing else: no explanation, no Markdown fences.`;

const QUESTION_SHAPE = `Each question is one of:
- {"type":"choice","prompt":string,"code":string,"options":[3 or 4 strings],"answer":number,"explanation":string}
  "answer" is the position of the right option, starting at 0. Only one option is right. Vary which position is right.
- {"type":"output","prompt":string,"code":string,"answer":string,"explanation":string}
  Shows a short piece of code and asks what it prints or shows. "answer" is the exact short output, such as "6".
- {"type":"written","prompt":string,"code":string,"explanation":string}
  Asks for a one or two sentence answer in the learner's own words. "explanation" is a model answer.
"code" is "" when the question needs no code. "explanation" says why the answer is right, in one or two sentences.`;

const BUG_SHAPE = `A bug is {"runtime":"js" or "react","description":string,"workingCode":string,"brokenCode":string,"tests":string,"hints":[3 strings]}.
- "runtime" is "js" for a concept about plain JavaScript code, such as a function, an algorithm, or a data structure. It is "react" for a concept about React components. When the page shows its code in another language, such as Java or Python, write the bug in JavaScript and use "js".
- "brokenCode" is the same file as "workingCode" with exactly one mistake, of the kind this concept warns about.
- "description" says what the program should do and what it does wrong. Before you write it, follow the broken code by hand through one input from the tests, and say what really comes out for that input, such as "hasCycle on the list 1, 2, 3 returns true". Never guess, and write only the result, not your working. It must not give away the fix.
- "hints" has exactly 3 hints, from mild to direct. The last one states the fix. The hints must be true of what the broken code really does.
For "react":
- "workingCode" is one small React component file. It must have a default export and import only from 'react'.
- "tests" is one test file. Start it with exactly these two lines:
  import { render, screen, fireEvent } from '@testing-library/react';
  import App from './App';
  Then write 2 or 3 tests with test('name', () => { ... }) and expect(...). Test what the user sees, not how the code is written.
  Every test must pass with workingCode. At least one must fail with brokenCode. Do not use timers, network calls, or snapshots.
For "js":
- "workingCode" is one small plain JavaScript module with no imports. Put "export" in front of each function the tests call.
- "tests" is one test file. Start it with an import of what it needs, such as: import { reverseList } from './solution.js';
  Then write 2 to 4 tests with test('name', () => { ... }) and expect(...). The tests build their own test data, such as linked-list nodes written as { val: 1, next: null }, and compare plain values, such as arrays.
  Every test must pass with workingCode. At least one must fail with brokenCode. A mistake that makes the code loop forever is fine: it counts as a failing test. Do not use timers, network calls, or files.
Use null for the bug when the concept has no code that can be broken and tested this way.`;

const DESIGN_SHAPE = `A design is a small system design puzzle with one flaw, for a concept about how parts of a system connect.
{"scenario":string,"goals":[1 to 3 strings],"broken":{"parts":[parts],"links":[links]},"palette":[{"kind":kind,"label":string}],"working":{"parts":[parts],"links":[links]},"checks":[{"name":string,"rule":rule}],"hints":[3 strings]}
- A part is {"id":string,"kind":kind,"label":string}. kind is one of: ${PART_KINDS.join(', ')}.
- A link is {"from":part id,"to":part id,"style":"call" or "event"}. "call" means the sender waits for a reply. "event" means it sends a message and moves on.
- "broken" has 2 to 8 parts and exactly one flaw of the kind this concept warns about.
- "palette" has 2 to 5 parts the learner can add. It must offer every kind that "working" needs and "broken" lacks, plus at least one part that does not help.
- "working" is one correct design. Parts it shares with "broken" keep the same id. New parts use kinds from "palette".
- "checks" has 2 to 4 checks. "name" is a plain statement of what must be true, such as "Order service never waits on Inventory service". Every check must pass on "working", and at least one must fail on "broken".
- A target is {"id":part id from "broken"} or {"kind":kind}. A rule is one of:
  {"type":"path","from":target,"to":target,"via":kind (optional)}: something connects from to to, through a part of kind via if given.
  {"type":"neverWaits","from":target,"to":target}: no chain of "call" links runs from from to to.
  {"type":"noLink","from":target,"to":target}: no direct link from from to to.
  {"type":"count","kind":kind,"min":number}: at least min parts of this kind.
  {"type":"allLinkTo","fromKind":kind,"toKind":kind}: every part of fromKind links directly to a part of toKind.
- "scenario" says what the system does in 1 to 3 plain sentences. "goals" are the requirements, in plain words. Do not give away the fix.
- "hints" has exactly 3 hints, from mild to direct. The last one states the fix.`;

const APPLY_SHAPE = `An apply exercise has the learner use the concept in a new situation. It is {"scenario":string,"task":string,"rubric":[3 to 5 strings],"modelAnswer":string,"hints":[3 strings]}.
- "scenario" is a realistic situation of 2 to 4 sentences that is not in the page, where the concept would help.
- "task" is one sentence that says what the learner should produce, such as a plan, a decision, or a short explanation.
- "rubric" lists what a good answer must do, one short sentence each. Every point comes from the page, and a reader can check it against an answer.
- "modelAnswer" is a strong answer of 3 to 6 sentences.
- "hints" has exactly 3 hints, from mild to direct. The last one says what a good answer must do.`;

const ORDER_SHAPE = `An order exercise has the learner put the steps of a process from the page into the right order. It is {"instruction":string,"steps":[3 to 7 strings],"note":string,"hints":[3 strings]}.
- "instruction" is one sentence, such as "Put the four steps of a failure audit in order."
- "steps" lists the steps in the RIGHT order, each a short phrase in the page's own words. The app shuffles them.
- "note" is one or two sentences on why the order matters.
- "hints" has exactly 3 hints, from mild to direct. The last one names the first step.`;

// Which exercise fits which concept. The same rule is used when a page is first read and when one is asked for later.
const EXERCISE_KINDS = `- a "bug", when the concept has code that can be broken and tested: plain JavaScript (a function, an algorithm, a data structure) or a React component. Prefer a "bug" over an "apply" or an "order" exercise for a concept with code like this. If the page shows the code in another language, write the bug in JavaScript;
- a "design", only when the concept is about how parts of a system connect, such as services, queues, caches, and databases;
- an "order", only when the page gives a clear sequence of 3 to 7 steps for the concept, such as the steps of a process;
- an "apply", when the concept is a method, habit, or principle that a person could use in a real situation.
Pick the one that fits best. Use null for the exercises you do not write, or for all of them.`;

// Most pages teach 1 to 3 concepts. A long page, such as a whole markdown file, teaches more, up to this many.
// A page's concepts use ten place numbers on the map, so this must stay under ten.
export const MAX_CONCEPTS = 8;

// How many concepts to ask for: about one for every 500 words, and never fewer than the usual 1 to 3.
export function conceptRange(words: number): { fewest: number; most: number } {
  const most = Math.min(MAX_CONCEPTS, Math.max(3, Math.round(words / 500)));
  return { fewest: Math.max(1, most - 3), most };
}

export function pageRequest(page: { id: number; title: string; text: string }, existing: string[] = []): ClaudeRequest {
  const { fewest, most } = conceptRange(wordCount(page.text));
  // A page that is written again keeps a concept's place on the map only when its name is the same, so Claude is asked to keep it.
  const known = existing.length === 0 ? '' : `\nThese concepts already exist for this page: ${existing.map((n) => JSON.stringify(n)).join(', ')}. When a concept you write is the same idea as one of these, use exactly the same name, so that the learner's progress is kept. Add a new concept only for an idea that none of them covers.`;
  const user = `Here is one page of documentation.

<page title=${JSON.stringify(page.title)}>
${page.text}
</page>

Find the ${fewest} to ${most} main concepts this page teaches.${known}
For each concept write a short name (1 to 4 words), a summary of two sentences, 5 questions, and at most one hands-on exercise:
${EXERCISE_KINDS}${most > 3 ? '\nA long page has many concepts, so give a bug or a design to at most 5 of them. An order or an apply exercise is short, so it can go on any concept.' : ''}
The 5 questions are 3 of type "choice", 1 of type "output", and 1 of type "written". When the page has no code, an "output" question can show a short flow, such as "Order service sends an event to the queue", and ask what happens next. When a question shows code, write it in the language the page uses for its code.
Also list in "fits" every kind of exercise that would suit the concept ("bug", "design", "apply", "order"), so the learner can ask for another of any of them later. It always includes the one you wrote.

${QUESTION_SHAPE}

${BUG_SHAPE}

${DESIGN_SHAPE}

${APPLY_SHAPE}

${ORDER_SHAPE}

Reply with JSON in this shape:
{"concepts":[{"name":string,"summary":string,"questions":[5 questions],"bug":bug or null,"design":design or null,"apply":apply or null,"order":order or null,"fits":[kinds that fit]}]}`;
  return { id: 'page-' + page.id, model: config.writerModel, system: RULES, user, maxTokens: 16000, effort: config.writerEffort || undefined };
}

export function bugRequest(page: { id: number; title: string; text: string }, concept: { name: string; summary: string }, avoid: string[]): ClaudeRequest {
  const user = `Here is one page of documentation.

<page title=${JSON.stringify(page.title)}>
${page.text}
</page>

Write one bug hunt for this concept from the page: ${concept.name}. ${concept.summary}
${avoid.length ? 'Do not repeat these earlier bugs:\n' + avoid.map((d) => '- ' + d).join('\n') : ''}

${BUG_SHAPE}

Reply with JSON in this shape: {"bug":bug or null}`;
  return { id: 'bug-' + page.id, model: config.writerModel, system: RULES, user, maxTokens: 8000, effort: config.writerEffort || undefined };
}

// The words around a bug are written again from what the broken code really does when it is tested.
// Claude is good at writing the bug, but its description of the failure is sometimes wrong, and a learner would trust it.
export function bugWordsRequest(pageId: number, bug: { workingCode: string; brokenCode: string; tests: string }, broken: { timedOut: boolean; tests: { name: string; pass: boolean; message: string }[] }): ClaudeRequest {
  const results = broken.timedOut
    ? 'The broken code never finishes. The check was stopped after 12 seconds.'
    : broken.tests.map((t) => (t.pass ? `- "${t.name}" passes` : `- "${t.name}" fails: ${t.message}`)).join('\n');
  const user = `Here is a bug hunt for a learner. The learner sees the broken code, a description and hints, and must fix the code.

<working-code>
${bug.workingCode}
</working-code>

<broken-code>
${bug.brokenCode}
</broken-code>

<tests>
${bug.tests}
</tests>

When the broken code is tested, this really happens:
${results}

Write the "description" and the 3 "hints" again, so that everything in them is true of what really happens above.
- "description" is 2 to 4 sentences. It says what the code should do, and what it does wrong now. Use the real result of one failing test as the example. It must not give away the fix.
- "hints" has exactly 3 hints, from mild to direct. Each hint is one or two sentences. Hint 1 only points at where to look and does not name the cause. Hint 2 names the idea without writing the code. Hint 3 states the fix. None may say anything that the results above contradict.
Write each one in its final form. Leave out corrections and second thoughts.

Reply with JSON in this shape: {"description":string,"hints":[3 strings]}`;
  return { id: 'bugwords-' + pageId, model: config.writerModel, system: RULES, user, maxTokens: 1500, effort: 'low' };
}

export function questionsRequest(page: { id: number; title: string; text: string }, concept: { name: string; summary: string }, avoid: string[]): ClaudeRequest {
  const user = `Here is one page of documentation.

<page title=${JSON.stringify(page.title)}>
${page.text}
</page>

Write 3 new questions for this concept from the page: ${concept.name}. ${concept.summary}
Write 2 of type "choice" and 1 of type "output".
Do not repeat these earlier questions:
${avoid.map((p) => '- ' + p).join('\n')}

${QUESTION_SHAPE}

Reply with JSON in this shape: {"questions":[3 questions]}`;
  return { id: 'more-' + page.id, model: config.writerModel, system: RULES, user, maxTokens: 6000, effort: config.writerEffort || undefined };
}

export function designRequest(page: { id: number; title: string; text: string }, concept: { name: string; summary: string }, avoid: string[], problem = ''): ClaudeRequest {
  const user = `Here is one page of documentation.

<page title=${JSON.stringify(page.title)}>
${page.text}
</page>

Write one design fix puzzle for this concept from the page: ${concept.name}. ${concept.summary}
${problem ? `Your last puzzle was rejected: ${problem} Write a new one that avoids this.\n` : ''}${avoid.length ? 'Do not repeat these earlier scenarios:\n' + avoid.map((d) => '- ' + d).join('\n') + '\n' : ''}
${DESIGN_SHAPE}

Reply with JSON in this shape: {"design":design or null}`;
  return { id: 'design-' + page.id, model: config.writerModel, system: RULES, user, maxTokens: 8000, effort: config.writerEffort || undefined };
}

type PageRef = { id: number; title: string; text: string };
type ConceptRef = { name: string; summary: string };
const pageBlock = (page: PageRef) => `Here is one page of documentation.

<page title=${JSON.stringify(page.title)}>
${page.text}
</page>`;
const earlier = (what: string, avoid: string[]) => (avoid.length ? `Do not repeat these earlier ${what}:\n${avoid.map((d) => '- ' + d).join('\n')}\n` : '');

export function applyRequest(page: PageRef, concept: ConceptRef, avoid: string[], problem = ''): ClaudeRequest {
  const user = `${pageBlock(page)}

Write one apply exercise for this concept from the page: ${concept.name}. ${concept.summary}
${problem ? `Your last exercise was rejected: ${problem} Write a new one that avoids this.\n` : ''}${earlier('scenarios', avoid)}
${APPLY_SHAPE}

Reply with JSON in this shape: {"apply":apply or null}`;
  return { id: 'apply-' + page.id, model: config.writerModel, system: RULES, user, maxTokens: 4000, effort: config.writerEffort || undefined };
}

export function orderRequest(page: PageRef, concept: ConceptRef, avoid: string[], problem = ''): ClaudeRequest {
  const user = `${pageBlock(page)}

Write one order exercise for this concept from the page: ${concept.name}. ${concept.summary}
${problem ? `Your last exercise was rejected: ${problem} Write a new one that avoids this.\n` : ''}${earlier('orderings', avoid)}
${ORDER_SHAPE}

Reply with JSON in this shape: {"order":order or null}`;
  return { id: 'order-' + page.id, model: config.writerModel, system: RULES, user, maxTokens: 4000, effort: config.writerEffort || undefined };
}

// For a concept that has no exercise yet: one request asks for whichever kind fits.
export function exerciseRequest(page: PageRef, concept: ConceptRef): ClaudeRequest {
  const user = `${pageBlock(page)}

Write at most one hands-on exercise for this concept from the page: ${concept.name}. ${concept.summary}
${EXERCISE_KINDS}

${BUG_SHAPE}

${DESIGN_SHAPE}

${APPLY_SHAPE}

${ORDER_SHAPE}

Reply with JSON in this shape: {"bug":bug or null,"design":design or null,"apply":apply or null,"order":order or null}`;
  return { id: 'exercise-' + page.id, model: config.writerModel, system: RULES, user, maxTokens: 8000, effort: config.writerEffort || undefined };
}

// Marks an apply answer against its checklist. The grader never sees the page, which keeps a check cheap.
export function applyGradeRequest(exercise: { id: number; scenario: string; task: string; rubric: string[] }, answer: string): ClaudeRequest {
  const user = `You are marking one answer from a learner against a checklist.

Situation: ${exercise.scenario}
Task: ${exercise.task}

Checklist:
${exercise.rubric.map((point, i) => `${i + 1}. ${point}`).join('\n')}

<answer>
${answer}
</answer>

For each checklist point, say whether the answer covers it. Mark a point covered when the answer clearly does what the point says, even in different words. Mark it missed when the answer leaves it out, is vague about it, or goes against it.
Reply with JSON in this shape: {"points":[{"covered":boolean,"comment":string}],"summary":string}
"points" has exactly ${exercise.rubric.length} entries, in checklist order. Each "comment" is one short sentence that speaks to the learner as "you". "summary" is one friendly sentence about the answer as a whole.`;
  return { id: 'apply-grade-' + exercise.id, model: config.graderModel, system: 'Reply with one JSON object and nothing else.', user, maxTokens: 800 };
}

const EXPLAINER_SHAPE = `{"gist":string,"paragraphs":[strings],"example":{"code":string,"note":string} or null,"scenario":string or null,"watchOut":[strings],"terms":[{"term":string,"meaning":string}]}`;

// One quiz question as the summary is told about it: what it asks, and what the right answer is.
export interface QuizQuestion {
  type: string;
  prompt: string;
  code: string;
  options: string[];
  answer: string;
  explanation: string;
}

// The right answer in words. A choice stores the number of the right option. A written question keeps its answer in "explanation".
const answerText = (q: QuizQuestion) => (q.type === 'choice' ? q.options[Number(q.answer)] ?? '' : q.answer || q.explanation);

// A plain summary of one concept, for someone meeting it for the first time. It is written knowing the quiz,
// so that a reader who studies it can answer every question.
export function explainerRequest(conceptId: number, page: { title: string; text: string }, concept: { name: string; summary: string }, questions: QuizQuestion[] = []): ClaudeRequest {
  const quiz = questions.length === 0 ? '' : `The reader will be quizzed on this concept with the questions below. Your explanation must teach everything needed to answer every one of them, in your own words. Cover each idea the questions test, and explain any special phrase they use. Do not list the questions, and do not write the answers out as a quiz.

<quiz>
${questions.map((q, i) => `${i + 1}. ${q.prompt}${q.code ? `\n   Code: ${q.code.replace(/\n/g, ' / ')}` : ''}\n   Answer: ${answerText(q)}${q.type !== 'written' && q.explanation ? `\n   Why: ${q.explanation}` : ''}`).join('\n')}
</quiz>

`;
  const user = `Here is one page of documentation.

<page title=${JSON.stringify(page.title)}>
${page.text}
</page>

Explain this concept from the page to someone who is new to it: ${concept.name}. ${concept.summary}
Write so a beginner understands it on the first read. Use short sentences and everyday words. When you must use a special word or phrase, say what it means.
${quiz}In every field except "code", wrap code, tag names and function names in backticks, such as \`className\` or \`useState\`.
- "gist" is one sentence that says what the concept is and why it matters.
- "paragraphs" has 3 to 6 short paragraphs that explain how it works, in the order a beginner needs. Together they cover every idea the quiz tests.
- "example" is a short code example from the page, at most 12 lines, with a one-sentence "note" that says what to look at. Use null if the page has no code for this concept.
- "scenario" is a short worked example from the page, told in 2 to 4 sentences, that makes the idea concrete. Use null if the page has none.
- "watchOut" lists 1 to 5 mistakes or surprises the page warns about.
- "terms" lists up to 8 words or named phrases from the page that a reader needs, each with a plain meaning. Include any special phrase the quiz uses. Use [] if there are none.

Reply with JSON in this shape: ${EXPLAINER_SHAPE}`;
  // Low effort keeps it quick, because you are waiting for it on screen.
  return { id: 'explain-' + conceptId, model: config.writerModel, system: RULES, user, maxTokens: 6000, effort: 'low' };
}

export function linksRequest(libraryId: number, concepts: { id: number; name: string; summary: string }[]): ClaudeRequest {
  const user = `Here are the concepts from one set of documentation. Each line is: number, name, summary.

${concepts.map((c) => `${c.id}. ${c.name}: ${c.summary}`).join('\n')}

Say which concepts a learner needs before others. List only direct, important links: most concepts need 0 to 2 earlier ones.
Never create a loop.

Reply with JSON in this shape: {"links":[{"first":number,"then":number}]}
"first" is the number of the concept to learn first. "then" is the number of the concept that depends on it.`;
  return { id: 'links-' + libraryId, model: config.writerModel, system: RULES, user, maxTokens: 8000, effort: config.writerEffort || undefined };
}

// A written question keeps its model answer in "explanation". An output question has a short "answer", and "explanation" says why.
// The page is left out when it is not given, which is how an output answer is judged.
export function gradeRequest(question: { id: number; prompt: string; code: string; answer: string; explanation: string }, pageText: string, answer: string): ClaudeRequest {
  const user = `You are grading one short answer from a learner.

${pageText ? `<page>\n${pageText.slice(0, 24000)}\n</page>\n\n` : ''}Question: ${question.prompt}
${question.code ? 'Code:\n' + question.code + '\n' : ''}Model answer: ${question.answer || question.explanation}
${question.answer ? `Why: ${question.explanation}\n` : ''}
Learner's answer: ${answer}

Mark it right when it shows the same understanding as the model answer, even in different words. When the model answer is exact output from code, the learner's answer must give that same output, ignoring only capital letters, spacing, and quotes. Mark it wrong when it is off-topic, empty of meaning, says something different from the model answer${pageText ? ', or states something the page contradicts' : ''}.
Reply with JSON in this shape: {"correct":boolean,"feedback":string}
"feedback" is one friendly sentence that speaks to the learner as "you".`;
  return { id: 'grade-' + question.id, model: config.graderModel, system: 'Reply with one JSON object and nothing else.', user, maxTokens: 400 };
}

// ---------- checks on what comes back

const text = z.string().trim().min(1);
const questionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choice'), prompt: text, code: z.string().default(''), options: z.array(text).min(3).max(4), answer: z.number().int().min(0), explanation: text }),
  z.object({ type: z.literal('output'), prompt: text, code: z.string().default(''), answer: z.coerce.string().trim().min(1), explanation: text }),
  z.object({ type: z.literal('written'), prompt: text, code: z.string().default(''), explanation: text }),
]).refine((q) => q.type !== 'choice' || q.answer < q.options.length, { message: 'answer must point at a real option' });

const bugSchema = z.object({
  // A reply that leaves this out, or says anything else, is worked out from its tests (see runtimeOf).
  runtime: z.enum(['react', 'js']).optional().catch(undefined),
  description: text, workingCode: text, brokenCode: text, tests: text, hints: z.array(text).length(3),
})
  .refine((b) => b.workingCode.trim() !== b.brokenCode.trim(), { message: 'broken code must differ from working code' });

const pageSchema = z.object({
  concepts: z.array(z.object({
    name: text, summary: text, questions: z.array(questionSchema).min(3).max(8), bug: bugSchema.nullable().catch(null),
    // Checked later by verifyDesign, so a bad design can be retried instead of silently dropped.
    design: z.unknown().optional().transform((v) => v ?? null),
    apply: z.unknown().optional().transform((v) => v ?? null),
    order: z.unknown().optional().transform((v) => v ?? null),
    // Raw names, such as "bug" and "apply". A reply that leaves it out or gets it wrong has none.
    fits: z.array(z.string()).optional().catch(undefined),
  })).min(1).max(MAX_CONCEPTS),
});
const linksSchema = z.object({ links: z.array(z.object({ first: z.coerce.number().int(), then: z.coerce.number().int() })) });
const gradeSchema = z.object({ correct: z.boolean(), feedback: z.string() });
// The limits sit a little above what Claude is asked for, so a reply that is slightly over is still used.
const explainerSchema = z.object({
  gist: text,
  paragraphs: z.array(text).min(1).max(8),
  example: z.object({ code: text, note: text }).nullable(),
  // A worked example told as a story, for pages with no code. Summaries saved before this existed do not have it.
  scenario: text.nullable().optional().catch(null),
  watchOut: z.array(text).max(6),
  terms: z.array(z.object({ term: text, meaning: text })).max(10),
});

export type NewQuestion = z.infer<typeof questionSchema>;
export type NewBug = z.infer<typeof bugSchema>;
export type PageContent = z.infer<typeof pageSchema>;
export type Explainer = z.infer<typeof explainerSchema>;

// Claude is asked for bare JSON, but this also copes with a reply wrapped in a code fence or a sentence.
function jsonFrom(reply: string): unknown {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The reply had no JSON in it.');
  return JSON.parse(reply.slice(start, end + 1));
}
function check<T>(schema: z.ZodType<T>, reply: string): { ok: true; value: T } | { ok: false; reason: string } {
  try {
    const parsed = schema.safeParse(jsonFrom(reply));
    if (parsed.success) return { ok: true, value: parsed.data };
    const issue = parsed.error.issues[0];
    return { ok: false, reason: `${issue.path.join('.')}: ${issue.message}` };
  } catch (err: any) {
    return { ok: false, reason: String(err?.message ?? err) };
  }
}

export const readPageReply = (reply: string) => check(pageSchema, reply);
export const readBugReply = (reply: string) => check(z.object({ bug: bugSchema.nullable() }), reply);
export const readQuestionsReply = (reply: string) => check(z.object({ questions: z.array(questionSchema).min(1).max(5) }), reply);
export const readBugWordsReply = (reply: string) => check(z.object({ description: text, hints: z.array(text).length(3) }), reply);
export const readLinksReply = (reply: string) => check(linksSchema, reply);
export const readGradeReply = (reply: string) => check(gradeSchema, reply);
export const readExplainerReply = (reply: string) => check(explainerSchema, reply);

// A design reply is read, then checked by the same rules the app uses on your designs.
export function readDesignReply(reply: string): { ok: true; design: NewDesign | null } | { ok: false; reason: string } {
  const read = check(z.object({ design: z.unknown().nullable() }), reply);
  if (!read.ok) return read;
  if (read.value.design === null) return { ok: true, design: null };
  const verified = verifyDesign(read.value.design);
  return verified.ok ? { ok: true, design: verified.design } : verified;
}

export function readApplyReply(reply: string): { ok: true; apply: NewApply | null } | { ok: false; reason: string } {
  const read = check(z.object({ apply: z.unknown().nullable() }), reply);
  if (!read.ok) return read;
  if (read.value.apply === null) return { ok: true, apply: null };
  const verified = verifyApply(read.value.apply);
  return verified.ok ? { ok: true, apply: verified.apply } : verified;
}

export function readOrderReply(reply: string): { ok: true; order: NewOrder | null } | { ok: false; reason: string } {
  const read = check(z.object({ order: z.unknown().nullable() }), reply);
  if (!read.ok) return read;
  if (read.value.order === null) return { ok: true, order: null };
  const verified = verifyOrder(read.value.order);
  return verified.ok ? { ok: true, order: verified.order } : verified;
}

// The reply to "whichever exercise fits". A bug is checked here. The others are checked by the code that saves them.
export const readExerciseReply = (reply: string) => check(z.object({
  bug: bugSchema.nullable().catch(null),
  design: z.unknown().optional().transform((v) => v ?? null),
  apply: z.unknown().optional().transform((v) => v ?? null),
  order: z.unknown().optional().transform((v) => v ?? null),
}), reply);

export const readApplyGradeReply = (reply: string, points: number) => check(z.object({
  points: z.array(z.object({ covered: z.boolean(), comment: z.string() })).length(points),
  summary: z.string(),
}), reply);
