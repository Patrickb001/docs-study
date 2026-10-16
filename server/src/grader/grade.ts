// Grades one answer. A choice is compared with the saved answer. A written answer goes to Claude.
// An output answer is compared first. When it is about a flow in words and does not match, it goes to Claude, because it may be right in other words.
import { get } from '../db.ts';
import { claude, claudeReady } from '../generator/claude.ts';
import { gradeRequest, readGradeReply } from '../generator/prompt.ts';
import { gradeSimple } from '../rules/quiz.ts';

// Output from real code has to be exactly right, so it is never judged in other words. A short flow written in words,
// such as "Motivation -> Work -> ?", is not code, and its answer can be right in different words.
const looksLikeCode = (text: string) => /[;{}]|=>|\b(const|let|var|function|import|export|class)\b|\w\(/.test(text);

export interface Grade {
  correct: boolean;
  feedback: string;
  needsSelfGrade: boolean; // true when the AI grader could not be used
}

export async function grade(question: { id: number; type: string; prompt: string; code: string; answer: string; explanation: string; concept_id: number }, answer: string): Promise<Grade> {
  if (question.type === 'choice') return { correct: gradeSimple(question.type, question.answer, answer), feedback: '', needsSelfGrade: false };
  if (question.type === 'output' && (gradeSimple(question.type, question.answer, answer) || looksLikeCode(question.code))) {
    return { correct: gradeSimple(question.type, question.answer, answer), feedback: '', needsSelfGrade: false };
  }
  // With no way to judge it, a written answer is marked by you. An output answer that does not match is simply wrong, as it always was.
  if (!claudeReady()) return { correct: false, feedback: '', needsSelfGrade: question.type === 'written' };
  // The page only matters for a written answer. An output answer is judged against the model answer alone, which is much cheaper.
  const page = question.type === 'written' ? get('SELECT p.text FROM page p JOIN concept c ON c.page_id = p.id WHERE c.id = ?', question.concept_id) : undefined;
  const reply = await claude().send(gradeRequest(question, page?.text ?? '', answer));
  if (!reply.ok) return { correct: false, feedback: '', needsSelfGrade: true };
  const read = readGradeReply(reply.text);
  if (!read.ok) return { correct: false, feedback: '', needsSelfGrade: true };
  return { correct: read.value.correct, feedback: read.value.feedback, needsSelfGrade: false };
}
