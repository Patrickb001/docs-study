// The hands-on exercises, and what the screens call them.
export type ExerciseKind = 'code' | 'design' | 'apply' | 'order';

export const EXERCISES: Record<ExerciseKind, {
  name: string; // the title
  screen: 'bug' | 'design' | 'apply' | 'order';
  start: string; // a button
  redo: string; // a button
  todo: string; // what it asks of you, in the concept panel
  plain: string; // inside a sentence
  doIt: string; // the sentence after a quiz is passed
  open: string; // a map box that is waiting for it
}> = {
  code: { name: 'Bug hunt', screen: 'bug', start: 'Start bug hunt', redo: 'Redo bug hunt', todo: 'Fix one bug in a small piece of code', plain: 'bug hunt', doIt: 'Fix one bug', open: 'Bug to fix' },
  design: { name: 'Design fix', screen: 'design', start: 'Start design fix', redo: 'Redo design fix', todo: 'Fix a small system design', plain: 'design fix', doIt: 'Fix the design', open: 'Design to fix' },
  apply: { name: 'Apply it', screen: 'apply', start: 'Start Apply it', redo: 'Redo Apply it', todo: 'Use the idea in a new situation', plain: 'apply-it exercise', doIt: 'Use the idea in a new situation', open: 'Exercise to do' },
  order: { name: 'Order the steps', screen: 'order', start: 'Start ordering', redo: 'Redo ordering', todo: 'Put the steps of a process in order', plain: 'ordering exercise', doIt: 'Put the steps in order', open: 'Steps to order' },
};

// A concept with no exercise yet is shown as a bug hunt, which is only ever used once a concept has an exercise.
export const exerciseOf = (kind: string): (typeof EXERCISES)[ExerciseKind] => EXERCISES[(kind in EXERCISES ? kind : 'code') as ExerciseKind];

// What the server calls each kind when you pick one to write.
export const CHOICE: Record<ExerciseKind, 'BUG' | 'DESIGN' | 'APPLY' | 'ORDER'> = { code: 'BUG', design: 'DESIGN', apply: 'APPLY', order: 'ORDER' };
