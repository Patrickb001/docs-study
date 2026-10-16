// One apply exercise and one order exercise, in the shape Claude is asked to write them.
export const APPLY_FIXTURE = {
  scenario: 'Your commute just doubled, and the two hours you set aside to study each evening no longer fit.',
  task: 'Redesign your study routine so that it still works on your worst day.',
  rubric: ['Plans for the worst day, not the best day', 'Replaces a high-effort step with a low-effort one', 'Moves study to a time that avoids the new obstacle'],
  modelAnswer: 'Study for 30 minutes before work, when traffic cannot get in the way. On the worst day, do just one minute.',
  hints: ['Think about your lowest-energy day.', 'What step needs the most willpower?', 'Move the study block to a time the commute cannot touch.'],
};

// The steps are in the RIGHT order here. The app shuffles them.
export const ORDER_FIXTURE = {
  instruction: 'Put the four steps of a failure audit in order.',
  steps: ['List every past attempt you gave up on', 'Write down the outside obstacles you hit', 'Note how you reacted to each obstacle', 'Turn the patterns into rules the new system must follow'],
  note: 'Each step feeds the next: you cannot spot patterns before you have the list of failures and reactions.',
  hints: ['Start with the raw facts.', 'Obstacles come before reactions.', 'Rules come last.'],
};
