// Plain summaries of concepts. Claude writes one the first time you ask, and it is saved, so you pay for it once.
// You can ask for a rewrite, which replaces the saved one. Until then the saved one is kept, even if a rewrite fails.
import { get, now, run } from '../db.ts';
import { claude, claudeReady } from './claude.ts';
import { activeQuestions } from '../store.ts';
import { explainerRequest, readExplainerReply, type Explainer } from './prompt.ts';

export function savedExplainer(conceptId: number): Explainer | null {
  const row = get('SELECT body FROM concept_explainer WHERE concept_id = ?', conceptId);
  return row ? (JSON.parse(row.body) as Explainer) : null;
}

export function saveExplainer(conceptId: number, explainer: Explainer) {
  run('INSERT INTO concept_explainer (concept_id, body, created_at) VALUES (?, ?, ?) ON CONFLICT(concept_id) DO NOTHING', conceptId, JSON.stringify(explainer), now());
}

function replaceExplainer(conceptId: number, explainer: Explainer) {
  run('INSERT INTO concept_explainer (concept_id, body, created_at) VALUES (?, ?, ?) ON CONFLICT(concept_id) DO UPDATE SET body = excluded.body, created_at = excluded.created_at', conceptId, JSON.stringify(explainer), now());
}

export async function writeExplainer(conceptId: number, rewrite = false): Promise<Explainer> {
  const saved = savedExplainer(conceptId);
  if (saved && !rewrite) return saved;
  const concept = get('SELECT c.name, c.summary, p.title, p.text FROM concept c JOIN page p ON p.id = c.page_id WHERE c.id = ?', conceptId);
  if (!concept) throw new Error('That concept could not be found.');
  if (!claudeReady()) throw new Error('No Claude API key is set. Add ANTHROPIC_API_KEY to your .env file and restart the app.');
  // The summary is written knowing the questions you will be asked, so that it teaches what the quiz tests.
  const questions = activeQuestions(conceptId).map((q) => ({ type: q.type, prompt: q.prompt, code: q.code, options: JSON.parse(q.options) as string[], answer: q.answer, explanation: q.explanation }));
  const reply = await claude().send(explainerRequest(conceptId, { title: concept.title, text: concept.text }, { name: concept.name, summary: concept.summary }, questions));
  const read = reply.ok ? readExplainerReply(reply.text) : null;
  if (!read || !read.ok) throw new Error('Claude’s reply could not be used. Try again.');
  replaceExplainer(conceptId, read.value);
  return read.value;
}
