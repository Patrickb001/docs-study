// One question, used by both the quiz and the daily review.
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@apollo/client/react';
import { ANSWER, FLAG, type AnswerResult, type Question } from '../graphql';
import { errorText } from '../nav';
import { DocLink } from './DocLink';

const KIND: Record<string, string> = { output: 'What does this code show?', written: 'Written answer' };
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// Options are either plain sentences or snippets of code. Code reads better in the code font.
// A snippet has code characters and no run of four plain words in a row.
const looksLikeCode = (text: string) => /[<>{}=()]/.test(text) && !/\b[A-Za-z]+ [A-Za-z]+ [A-Za-z]+ [A-Za-z]+\b/.test(text);

export const Tick = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5l3.2 3.2L14 5.5" /></svg>
);
export const Cross = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 5l8 8M13 5l-8 8" /></svg>
);

export type Outcome = 'right' | 'wrong' | 'skipped';

export function QuestionCard(props: {
  question: Question;
  mode: 'QUIZ' | 'REVIEW';
  heading: string; // such as "Question 2 of 5"
  steps: (Outcome | 'now' | 'todo')[];
  nextLabel: string;
  onDone: (outcome: Outcome, attemptId: string | null) => void;
}) {
  const { question: q, mode } = props;
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [sent, setSent] = useState('');
  const [problem, setProblem] = useState('');
  const [answer, answering] = useMutation<{ answerQuestion: AnswerResult }>(ANSWER);
  const [flag] = useMutation(FLAG);
  const form = useForm<{ text: string }>({ defaultValues: { text: '' } });
  const nextButton = useRef<HTMLButtonElement>(null);

  const send = (text: string, selfGrade?: boolean) => {
    setProblem('');
    setSent(text);
    return answer({ variables: { questionId: q.id, answer: text, mode, selfGrade } })
      .then((r) => setResult(r.data!.answerQuestion))
      .catch((err) => setProblem(errorText(err)));
  };

  const graded = result !== null && !result.needsSelfGrade;
  const waitingForYou = result !== null && result.needsSelfGrade;
  const locked = result !== null || answering.loading;
  const isChoice = q.type === 'choice';

  // Once graded, Enter goes straight on to the next question.
  useEffect(() => { if (graded) nextButton.current?.focus({ preventScroll: true }); }, [graded]);

  // Number or letter keys pick an answer, and Enter checks it, so a whole quiz works from the keyboard.
  useEffect(() => {
    if (!isChoice || locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const n = q.options.length;
      const digit = Number(e.key);
      const letter = LETTERS.indexOf(e.key.toUpperCase());
      if (Number.isInteger(digit) && digit >= 1 && digit <= n) { e.preventDefault(); setPicked(digit - 1); return; }
      if (e.key.length === 1 && letter >= 0 && letter < n) { e.preventDefault(); setPicked(letter); return; }
      if (e.key === 'Enter' && picked !== null && (!target.closest('button') || target.closest('.option'))) {
        e.preventDefault();
        send(String(picked));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The progress bar shows how this question went as soon as it is graded.
  const steps = props.steps.map((s) => (s === 'now' && graded ? (result!.correct ? 'right' : 'wrong') : s));

  return (
    <section className="card pad-lg question" aria-label="Question">
      <div className="stack" style={{ gap: 10 }}>
        <div className="meta">
          <span className="concept">{q.conceptName}</span>
          <span className="nums">{props.heading}</span>
        </div>
        <div className="steps" aria-hidden="true">{steps.map((s, i) => <div key={i} className={s === 'todo' ? '' : s} />)}</div>
      </div>
      <div className="stack" style={{ gap: 14 }}>
        {KIND[q.type] && <div className="eyebrow">{KIND[q.type]}</div>}
        <h1>{q.prompt}</h1>
      </div>
      {q.code && <pre className="code">{q.code}</pre>}

      {isChoice && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="options" role="group" aria-label="Answer choices">
            {q.options.map((text, i) => {
              const isAnswer = graded && text === result!.correctAnswer;
              const isMiss = graded && picked === i && !isAnswer;
              const state = isAnswer ? ' answer' : isMiss ? ' miss' : graded ? ' dim' : picked === i ? ' on' : '';
              return (
                <button key={i} type="button" disabled={locked} aria-pressed={picked === i} onClick={() => setPicked(i)} className={`option${state}`}>
                  <span className="letter" aria-hidden="true">{LETTERS[i]}</span>
                  <span className={`text${looksLikeCode(text) ? ' code' : ''}`}>{text}</span>
                  <span className="mark">{isAnswer ? <><Tick />Correct answer</> : isMiss ? <><Cross />Your pick</> : ''}</span>
                </button>
              );
            })}
          </div>
          {!locked && (
            <p className="keys"><kbd>1</kbd>–<kbd>{q.options.length}</kbd> to choose, <kbd>Enter</kbd> to check</p>
          )}
        </div>
      )}

      {!isChoice && (
        <form id={`answer-${q.id}`} className="field" onSubmit={form.handleSubmit((values) => send(values.text.trim()))}>
          <label htmlFor={`text-${q.id}`}>{q.type === 'output' ? 'Your answer' : 'Your answer, in a sentence or two'}</label>
          {q.type === 'output' ? (
            <input id={`text-${q.id}`} className="input short" autoComplete="off" spellCheck={false} disabled={locked} {...form.register('text', { validate: (v) => v.trim() !== '' || 'Type your answer first.' })} />
          ) : (
            <textarea
              id={`text-${q.id}`}
              className="input"
              rows={4}
              disabled={locked}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
              {...form.register('text', { validate: (v) => v.trim().length >= 20 || 'Write at least a full sentence.' })}
            />
          )}
          {form.formState.errors.text && <div className="error" role="alert">{form.formState.errors.text.message}</div>}
          {!locked && <p className="keys">{q.type === 'output' ? <><kbd>Enter</kbd> to check</> : <><kbd>Ctrl</kbd>+<kbd>Enter</kbd> to check</>}</p>}
        </form>
      )}

      {waitingForYou && (
        <div className="feedback plain" role="status">
          <div className="title display">Compare your answer with this one</div>
          <div>{result!.explanation}</div>
          <div className="small muted">The AI grader is not available right now, so you decide.</div>
          <div className="row" style={{ paddingTop: 6 }}>
            <button type="button" className="btn" disabled={answering.loading} onClick={() => send(sent, true)}>I got it right</button>
            <button type="button" className="btn second" disabled={answering.loading} onClick={() => send(sent, false)}>I missed it</button>
          </div>
        </div>
      )}

      {graded && (
        <div className={`feedback${result!.correct ? '' : ' miss'}`} role="status">
          <div className="title display">{result!.correct ? <><Tick />Correct</> : <><Cross />Not quite</>}</div>
          {result!.feedback && <div>{result!.feedback}</div>}
          {q.type === 'output' && !result!.correct && <div>The answer is <span className="mono">{result!.correctAnswer}</span>.</div>}
          <div>{result!.explanation}</div>
          {mode === 'REVIEW' && <div className="next-review">{result!.correct ? `Next review in ${result!.gapDays} ${result!.gapDays === 1 ? 'day' : 'days'}.` : 'Back tomorrow. The gap resets to 1 day.'}</div>}
          <DocLink url={result!.docUrl} title={result!.docTitle} prefix="Read this in the docs: " style={{ alignSelf: 'flex-start', minHeight: 32, display: 'inline-flex', alignItems: 'center' }} />
        </div>
      )}

      {problem && <p className="note miss" role="alert">{problem}</p>}

      <div className="row between">
        <button type="button" className="btn quiet small" onClick={() => flag({ variables: { kind: 'QUESTION', id: q.id } }).then(() => props.onDone('skipped', null))}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14V2.5" /><path d="M3 3h9l-2 3 2 3H3" /></svg>
          This question is bad
        </button>
        {graded ? (
          <button ref={nextButton} type="button" className="btn" onClick={() => props.onDone(result!.correct ? 'right' : 'wrong', result!.attemptId)}>{props.nextLabel}</button>
        ) : isChoice ? (
          <button type="button" className="btn" disabled={picked === null || locked} onClick={() => send(String(picked))}>{answering.loading ? 'Checking' : 'Check answer'}</button>
        ) : (
          !waitingForYou && <button type="submit" form={`answer-${q.id}`} className="btn" disabled={locked}>{answering.loading ? 'Checking' : 'Check answer'}</button>
        )}
      </div>
    </section>
  );
}
