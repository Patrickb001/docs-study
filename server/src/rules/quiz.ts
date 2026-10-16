// You pass a quiz with 80% right, rounded up. With 5 questions that is 4.
export function passMark(questionCount: number): number {
  return Math.ceil(questionCount * 0.8);
}

export function quizPassed(rightCount: number, questionCount: number): boolean {
  return questionCount > 0 && rightCount >= passMark(questionCount);
}

// Grades the two kinds of question that do not need an AI model.
export function gradeSimple(type: string, savedAnswer: string, given: string): boolean {
  const clean = (text: string) => text.trim().replace(/\s+/g, ' ').replace(/^["'`]|["'`]$/g, '').toLowerCase();
  if (type === 'choice') return Number(given) === Number(savedAnswer);
  return clean(given) === clean(savedAnswer);
}
