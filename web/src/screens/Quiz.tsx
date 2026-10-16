import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { CONCEPT_MAP, FINISH_QUIZ, QUIZ, type Question } from '../graphql';
import { errorText, useNav } from '../nav';
import { exerciseOf } from '../exercises';
import { QuestionCard, type Outcome } from '../components/QuestionCard';

interface QuizResult { passed: boolean; right: number; total: number; passMark: number }

export function Quiz(props: { conceptId: string }) {
  const { go, libraryId } = useNav();
  const { data, loading, error, refetch } = useQuery<any>(QUIZ, { variables: { conceptId: props.conceptId }, fetchPolicy: 'network-only' });
  const [finish] = useMutation<{ finishQuiz: QuizResult }>(FINISH_QUIZ, { refetchQueries: [{ query: CONCEPT_MAP, variables: { libraryId } }] });
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [attempts, setAttempts] = useState<string[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [round, setRound] = useState(0);

  if (error) return <main className="narrow"><p className="note miss">{errorText(error)}</p></main>;
  if (loading || !data) return <main className="narrow"><p className="muted">Loading the quiz</p></main>;
  const questions: Question[] = data.quiz;
  const concept = data.concept;
  if (questions.length === 0) {
    return (
      <main className="narrow">
        <div className="card stack">
          <h1>No questions left for {concept?.name ?? 'this concept'}</h1>
          <p>Every question was flagged or retired. Write new ones from the concept's panel on the map.</p>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go({ name: 'home' })}>Back to the map</button>
        </div>
      </main>
    );
  }

  const done = (outcome: Outcome, attemptId: string | null) => {
    const nextOutcomes = [...outcomes, outcome];
    const nextAttempts = attemptId ? [...attempts, attemptId] : attempts;
    setOutcomes(nextOutcomes);
    setAttempts(nextAttempts);
    if (index + 1 < questions.length) setIndex(index + 1);
    else finish({ variables: { conceptId: props.conceptId, attemptIds: nextAttempts } }).then((r) => setResult(r.data!.finishQuiz));
  };
  const restart = () => {
    setIndex(0); setOutcomes([]); setAttempts([]); setResult(null); setRound(round + 1);
    refetch();
  };

  if (result) {
    const canHunt = result.passed && concept.bugState !== 'none';
    const exercise = exerciseOf(concept.exerciseKind);
    const exerciseName = exercise.plain;
    return (
      <main className="narrow">
        <section className="card pad-lg stack" style={{ gap: 22 }} aria-label="Results">
          <div className="row" style={{ gap: 20 }}>
            <div className={`score display${result.passed ? '' : ' miss'}`}>{result.right}/{result.total}</div>
            <div className="stack grow" style={{ gap: 4, flexBasis: 320 }}>
              <h1 style={{ fontSize: 'var(--t-xl)' }}>{result.total === 0 ? 'Nothing was graded' : result.passed ? 'Quiz passed' : 'Not passed yet'}</h1>
              <p>
                {result.total === 0
                  ? 'You flagged every question, so they were all removed.'
                  : result.passed
                  ? canHunt ? `The ${exerciseName} for ${concept.name} is now unlocked. ${exercise.doIt} and this concept turns solid on the map.` : `${concept.name} is now solid on your map.`
                  : `You need ${result.passMark} right answers to pass. Read the docs section again, then retake the quiz.`}
              </p>
            </div>
          </div>
          <ul className="rows">
            {questions.map((q, i) => (
              <li key={q.id}>
                <div>
                  <b>{q.prompt.length > 90 ? q.prompt.slice(0, 90) + '…' : q.prompt}</b>
                  <span className="small muted">{outcomes[i] === 'right' ? 'Comes back for review tomorrow' : outcomes[i] === 'wrong' ? 'Added to tomorrow\u2019s review list' : 'Removed. It will not come back in reviews.'}</span>
                </div>
                <span className={`chip ${outcomes[i] === 'right' ? 'good' : outcomes[i] === 'wrong' ? 'miss' : ''}`}>{outcomes[i] === 'right' ? 'Right' : outcomes[i] === 'wrong' ? 'Missed' : 'Flagged'}</span>
              </li>
            ))}
          </ul>
          <div className="row">
            {canHunt && <button type="button" className="btn" onClick={() => go({ name: exercise.screen, conceptId: props.conceptId })}>Start the {exerciseName}</button>}
            <button type="button" className={canHunt ? 'btn second' : 'btn'} onClick={restart}>Take the quiz again</button>
            <button type="button" className="btn quiet boxed" style={{ minHeight: 48 }} onClick={() => go({ name: 'home' })}>Back to the map</button>
          </div>
        </section>
      </main>
    );
  }

  const q = questions[index];
  return (
    <main className="narrow">
      <QuestionCard
        key={`${round}-${q.id}`}
        question={q}
        mode="QUIZ"
        heading={`Question ${index + 1} of ${questions.length}`}
        steps={questions.map((_, i) => (i < outcomes.length ? outcomes[i] : i === index ? 'now' : 'todo'))}
        nextLabel={index + 1 === questions.length ? 'See results' : 'Next question'}
        onDone={done}
      />
    </main>
  );
}
