import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { CONCEPT_MAP, DUE_REVIEWS, type Question } from '../graphql';
import { errorText, useNav } from '../nav';
import { QuestionCard, type Outcome } from '../components/QuestionCard';

export function Review() {
  const { go } = useNav();
  const { data, loading, error, client } = useQuery<{ dueReviews: Question[] }>(DUE_REVIEWS, { fetchPolicy: 'network-only' });
  // The list is fixed when the session starts, so answering a card does not reshuffle the rest.
  const [cards, setCards] = useState<Question[] | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  if (data && cards === null) setCards(data.dueReviews);

  if (error) return <main className="narrow"><p className="note miss">{errorText(error)}</p></main>;
  if (loading || cards === null) return <main className="narrow"><p className="muted">Loading your reviews</p></main>;

  if (cards.length === 0) {
    return (
      <main className="narrow">
        <div className="card pad-lg stack">
          <h1>Nothing is due today</h1>
          <p>Questions join your reviews the day after you first answer them in a quiz. Right answers then come back after 3, 7, 14, and 30 days.</p>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go({ name: 'home' })}>Back to the map</button>
        </div>
      </main>
    );
  }

  const index = outcomes.length;
  if (index >= cards.length) {
    const right = outcomes.filter((o) => o === 'right').length;
    return (
      <main className="narrow">
        <section className="card pad-lg stack" style={{ gap: 22 }} aria-label="Review summary">
          <div className="row" style={{ gap: 20 }}>
            <div className="score display">{right}/{cards.length}</div>
            <div className="stack grow" style={{ gap: 4, flexBasis: 320 }}>
              <h1 style={{ fontSize: 'var(--t-xl)' }}>All caught up for today</h1>
              <p>Right answers move further out. Missed cards come back tomorrow.</p>
            </div>
          </div>
          <ul className="rows">
            {cards.map((q, i) => (
              <li key={q.id}>
                <div><b>{q.prompt.length > 90 ? q.prompt.slice(0, 90) + '…' : q.prompt}</b><span className="small muted">{q.conceptName}</span></div>
                <span className={`chip ${outcomes[i] === 'right' ? 'good' : outcomes[i] === 'wrong' ? 'miss' : ''}`}>{outcomes[i] === 'right' ? 'Right' : outcomes[i] === 'wrong' ? 'Missed' : 'Flagged'}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go({ name: 'home' })}>Back to the map</button>
        </section>
      </main>
    );
  }

  const q = cards[index];
  return (
    <main className="narrow">
      <QuestionCard
        key={q.id}
        question={q}
        mode="REVIEW"
        heading={`Card ${index + 1} of ${cards.length}`}
        steps={cards.map((_, i) => (i < outcomes.length ? outcomes[i] : i === index ? 'now' : 'todo'))}
        nextLabel={index + 1 === cards.length ? 'Finish' : 'Next card'}
        onDone={(outcome) => {
          setOutcomes([...outcomes, outcome]);
          // Keeps the badge in the top bar and the map up to date.
          client.refetchQueries({ include: [CONCEPT_MAP] });
        }}
      />
    </main>
  );
}
