// A small built-in library, so the app has something to study before your first import.
// The summaries and questions are written for this app. The links point to the React docs they are based on.
import { all, get, now, run } from '../db.ts';
import { saveExplainer } from '../generator/explain.ts';
import type { Explainer, NewBug, NewQuestion } from '../generator/prompt.ts';
import { fingerprint } from '../importer/clean.ts';
import { addBug, addQuestion } from '../store.ts';

interface SampleConcept {
  name: string;
  summary: string;
  // The plain summary, written for this app so the sample works without an API key.
  explainer: Explainer;
  page: { title: string; url: string; text: string };
  needs: string[];
  questions: NewQuestion[];
  bug: NewBug;
}

const tests = (body: string) => `import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

${body}
`;

export const SAMPLE: SampleConcept[] = [
  {
    name: 'JSX',
    summary: 'JSX lets you write HTML-like markup inside JavaScript. It is stricter than HTML: one root element, every tag closed, and camelCase attribute names.',
    explainer: {
      gist: "JSX lets you write HTML-like tags inside JavaScript, so a component's code and the markup it shows live in one place.",
      paragraphs: [
        'JSX looks like HTML, but it is not HTML. Before your code runs, it is turned into plain JavaScript. Because of that, it has a few rules that HTML does not.',
        'There are three rules. A component returns one root element, so wrap several elements in one parent, such as a `<div>` or an empty fragment `<>...</>`. Every tag must be closed, even tags like `<img />`. And most attributes are written in camelCase, so `class` becomes `className`.',
        'Curly braces let JavaScript in. Text you type in JSX shows exactly as written, but anything inside `{ }` is run as JavaScript and its result is shown. This works between tags and in attribute values.',
      ],
      example: {
        code: `export default function Greeting() {
  const name = 'Ada';
  return (
    <>
      <h1 className="title">Hello, {name}!</h1>
      <img src="ada.png" alt={name} />
    </>
  );
}`,
        note: 'One root (the empty fragment), every tag closed, `className` instead of `class`, and `{name}` to show a JavaScript value.',
      },
      watchOut: [
        'Writing `class` instead of `className`. `class` is a reserved word in JavaScript.',
        'Returning two elements side by side with no parent around them.',
        'Leaving a tag like `<img>` open. In JSX it must be closed: `<img />`.',
      ],
      terms: [
        { term: 'markup', meaning: 'The tags that describe what appears on screen.' },
        { term: 'fragment', meaning: 'An empty tag, `<>...</>`, that groups elements without adding anything to the page.' },
        { term: 'camelCase', meaning: 'Joining words with each new word capitalized, such as `className`.' },
      ],
    },
    page: {
      title: 'Writing markup with JSX',
      url: 'https://react.dev/learn/writing-markup-with-jsx',
      text: `# JSX

JSX is a way to write markup inside a JavaScript file. It looks like HTML, but it is turned into JavaScript before it runs.

JSX has three rules. A component must return a single root element, so several elements need one parent such as a div or an empty fragment. Every tag must be closed, including tags like img. Most attributes are written in camelCase, so class becomes className, because class is a reserved word in JavaScript.

Curly braces open a window into JavaScript. Text inside JSX is shown exactly as written, but anything inside curly braces is run as JavaScript and its result is shown. You can use curly braces for text between tags and for attribute values.`,
    },
    needs: [],
    questions: [
      { type: 'choice', prompt: 'Which line sets a CSS class in JSX?', code: '', options: ['<div class="card">', '<div className="card">', '<div cssClass="card">'], answer: 1, explanation: 'JSX uses className, because class is a reserved word in JavaScript.' },
      { type: 'choice', prompt: 'A component needs to return a heading and a paragraph side by side. What must you do?', code: '', options: ['Wrap them in one parent, such as a div or an empty fragment', 'Write two return statements', 'Nothing. JSX allows any number of top-level elements'], answer: 0, explanation: 'A component returns a single root element, so several elements need one parent around them.' },
      { type: 'choice', prompt: 'Which image tag is valid JSX?', code: '', options: ['<img src="cat.png">', '<image src="cat.png">', '<img src="cat.png" />'], answer: 2, explanation: 'Every JSX tag must be closed. A tag with no children closes itself with />.' },
      { type: 'output', prompt: 'What text does the heading show?', code: "const name = 'Ada';\nconst element = <h1>Hello, {name}!</h1>;", answer: 'Hello, Ada!', explanation: 'Curly braces run JavaScript, so {name} is replaced with the value of the variable.' },
      { type: 'written', prompt: 'In your own words, why does JSX use className instead of class?', code: '', explanation: 'JSX is turned into JavaScript, and class is a reserved word in JavaScript, so the attribute is named className.' },
    ],
    bug: {
      description: 'The greeting should say "Hello, Ada!". Right now it shows the word "name" where the name should be.',
      workingCode: `export default function Greeting() {
  const name = 'Ada';
  const tasks = 3;

  return (
    <div>
      <h1>Hello, {name}!</h1>
      <p>You have {tasks} tasks left.</p>
    </div>
  );
}
`,
      brokenCode: `export default function Greeting() {
  const name = 'Ada';
  const tasks = 3;

  return (
    <div>
      <h1>Hello, name!</h1>
      <p>You have {tasks} tasks left.</p>
    </div>
  );
}
`,
      tests: tests(`test('greets Ada by name', () => {
  render(<App />);
  expect(screen.getByText('Hello, Ada!')).toBeInTheDocument();
});

test('shows how many tasks are left', () => {
  render(<App />);
  expect(screen.getByText('You have 3 tasks left.')).toBeInTheDocument();
});`),
      hints: ['Compare the heading on screen with the line that shows the task count. One of them works.', 'Text inside JSX is shown exactly as written. Something has to mark name as JavaScript.', 'Wrap the variable in curly braces: <h1>Hello, {name}!</h1>'],
    },
  },
  {
    name: 'Components',
    summary: 'A component is a JavaScript function that returns markup. Its name starts with a capital letter, and components can be used inside each other.',
    explainer: {
      gist: 'A component is a JavaScript function that returns markup. Components are the building blocks you combine into a whole app.',
      paragraphs: [
        'Think of components as building blocks. You write small pieces, such as a profile photo, and put them together into bigger pieces, such as a page.',
        'You use a component by writing it like a tag: `<Profile />`. One component can show another, and you can show the same one as many times as you like.',
        'The name must start with a capital letter. React treats lowercase tags like `<div>` as HTML and capitalized tags like `<Profile>` as your own components. With a lowercase name, React looks for an HTML tag that does not exist.',
      ],
      example: {
        code: `function Profile() {
  return <img src="ada.png" alt="Ada" />;
}

export default function Gallery() {
  return (
    <section>
      <Profile />
      <Profile />
    </section>
  );
}`,
        note: '`Profile` is defined once, at the top level of the file, then shown twice inside `Gallery`.',
      },
      watchOut: [
        'Starting a component name with a lowercase letter.',
        'Defining one component inside another. Keep each one at the top level of the file, or it becomes slow and causes bugs.',
      ],
      terms: [
        { term: 'component', meaning: 'A reusable piece of the screen, written as a function that returns markup.' },
        { term: 'top level', meaning: 'Directly in the file, not inside another function.' },
      ],
    },
    page: {
      title: 'Your first component',
      url: 'https://react.dev/learn/your-first-component',
      text: `# Components

A React component is a JavaScript function that returns markup. Components are the building blocks of a React app: you write small ones and combine them into bigger ones.

A component's name must start with a capital letter. React reads lowercase tags as HTML tags and capitalized tags as your own components. A component written with a lowercase name is treated as an unknown HTML tag and shows nothing useful.

You use a component by writing it like a tag. One component can show another, and you can show the same component many times. Define each component at the top level of a file. Do not define a component inside another component, because that makes it slow and causes bugs.`,
    },
    needs: ['JSX'],
    questions: [
      { type: 'choice', prompt: "What must a React component's name start with?", code: '', options: ['A lowercase letter', 'A capital letter', 'The word "use"'], answer: 1, explanation: 'React reads capitalized tags as components and lowercase tags as HTML.' },
      { type: 'choice', prompt: 'What does a component return?', code: '', options: ['Markup that describes what to show', 'A CSS file', 'Nothing. It changes the page directly'], answer: 0, explanation: 'A component is a function that returns markup. React takes care of putting it on the page.' },
      { type: 'choice', prompt: 'Where should you define a component?', code: '', options: ['Inside the component that uses it', 'Inside an event handler', 'At the top level of a file'], answer: 2, explanation: 'Components are defined at the top level. Defining one inside another is slow and causes bugs.' },
      { type: 'output', prompt: 'How many list items appear on screen? Answer with a number.', code: 'function Item() {\n  return <li>Tea</li>;\n}\n\nexport default function List() {\n  return (\n    <ul>\n      <Item />\n      <Item />\n      <Item />\n    </ul>\n  );\n}', answer: '3', explanation: 'Each <Item /> tag shows the Item component once, so three tags show three list items.' },
      { type: 'written', prompt: "In your own words, why does a component's name need a capital letter?", code: '', explanation: 'React treats lowercase tags as HTML tags and capitalized tags as your components, so a lowercase name would be read as an unknown HTML tag.' },
    ],
    bug: {
      description: 'The gallery should show the name "Katherine Johnson" twice under its heading. Right now the heading appears but the names do not.',
      workingCode: `function Profile() {
  return <p>Katherine Johnson</p>;
}

export default function Gallery() {
  return (
    <section>
      <h1>Amazing scientists</h1>
      <Profile />
      <Profile />
    </section>
  );
}
`,
      brokenCode: `function profile() {
  return <p>Katherine Johnson</p>;
}

export default function Gallery() {
  return (
    <section>
      <h1>Amazing scientists</h1>
      <profile />
      <profile />
    </section>
  );
}
`,
      tests: tests(`test('shows the heading', () => {
  render(<App />);
  expect(screen.getByText('Amazing scientists')).toBeInTheDocument();
});

test('shows the name twice', () => {
  render(<App />);
  expect(screen.getAllByText('Katherine Johnson')).toHaveLength(2);
});`),
      hints: ['The function that returns the name looks fine. Look at how it is named and how it is used.', 'React reads a lowercase tag as an HTML tag, not as your component.', 'Rename profile to Profile, both where it is defined and in the two tags.'],
    },
  },
  {
    name: 'Props',
    summary: 'Props are the inputs a parent passes to a child component. They are read-only: a component never changes its own props.',
    explainer: {
      gist: 'Props are the information a parent component passes to a child, so the same component can show different things.',
      paragraphs: [
        'Props are how components talk to each other. A parent gives a child props by writing them like HTML attributes: `<Avatar size={100} />`.',
        'The child receives all its props as one object. Most components unpack it right in the parentheses with curly braces, such as `function Avatar({ person, size })`. You can give a prop a default with an equals sign, `size = 100`, which is used when the parent leaves that prop out.',
        'Props are read-only. A component never changes its own props. When something needs to change over time, the parent keeps it in state and passes the new value down.',
      ],
      example: {
        code: `function Avatar({ person, size = 100 }) {
  return <img src={person.photo} alt={person.name} width={size} />;
}

export default function Profile() {
  return <Avatar person={{ name: 'Ada', photo: 'ada.png' }} size={80} />;
}`,
        note: '`Profile` passes `person` and `size` down. `Avatar` unpacks them, and would use `100` if `size` were missing.',
      },
      watchOut: [
        'Changing a prop inside the component that receives it. Props are read-only.',
        'Writing `function Avatar(size)` instead of `function Avatar({ size })`. Without the curly braces, `size` is the whole props object.',
      ],
      terms: [
        { term: 'prop', meaning: 'A piece of information passed into a component, like an argument passed to a function.' },
        { term: 'destructuring', meaning: 'Unpacking values from an object by name, as in `{ person, size }`.' },
        { term: 'default value', meaning: 'The value a prop gets when the parent does not pass one.' },
      ],
    },
    page: {
      title: 'Passing props to a component',
      url: 'https://react.dev/learn/passing-props-to-a-component',
      text: `# Props

Props are how components talk to each other. A parent component passes information to a child by giving it props, written like HTML attributes.

A component receives all its props as one object. Most components read them with destructuring: curly braces inside the function's parentheses, such as function Avatar({ person, size }). You can give a prop a default value with an equals sign, such as size = 100. The default is used when the prop is missing.

Props are read-only. A component must never change its own props. When a value needs to change over time, the parent keeps it in state and passes a new prop down.`,
    },
    needs: ['Components'],
    questions: [
      { type: 'choice', prompt: 'Can a component change its own props?', code: '', options: ['Yes, by assigning a new value to the prop', 'Only inside an event handler', 'No. Props are read-only'], answer: 2, explanation: 'Props are read-only. A value that changes over time belongs in state.' },
      { type: 'choice', prompt: 'How does a parent pass a size of 100 to an Avatar component?', code: '', options: ['<Avatar size={100} />', 'Avatar.size = 100', '<Avatar>{size = 100}</Avatar>'], answer: 0, explanation: 'Props are written like attributes on the tag, with JavaScript values in curly braces.' },
      { type: 'choice', prompt: 'How do you give the size prop a default value of 100?', code: '', options: ['function Avatar(size: 100)', 'function Avatar({ size = 100 })', 'Avatar.default(size, 100)'], answer: 1, explanation: 'A default value goes after an equals sign in the destructuring.' },
      { type: 'output', prompt: 'What text is shown?', code: "function Hello({ name = 'friend' }) {\n  return <p>Hi, {name}</p>;\n}\n\n<Hello />", answer: 'Hi, friend', explanation: 'No name prop was passed, so the default value is used.' },
      { type: 'written', prompt: 'A value passed as a prop needs to change over time. In your own words, what should you do?', code: '', explanation: 'Props are read-only, so the parent should hold the value in state and pass the new value down as a prop. The child never changes its own props.' },
    ],
    bug: {
      description: 'The page should show two badges that say "New" and "Sale". Right now it crashes instead of showing them.',
      workingCode: `function Badge({ label }) {
  return <span>{label}</span>;
}

export default function App() {
  return (
    <div>
      <Badge label="New" />
      <Badge label="Sale" />
    </div>
  );
}
`,
      brokenCode: `function Badge(label) {
  return <span>{label}</span>;
}

export default function App() {
  return (
    <div>
      <Badge label="New" />
      <Badge label="Sale" />
    </div>
  );
}
`,
      tests: tests(`test('shows the New badge', () => {
  render(<App />);
  expect(screen.getByText('New')).toBeInTheDocument();
});

test('shows the Sale badge', () => {
  render(<App />);
  expect(screen.getByText('Sale')).toBeInTheDocument();
});`),
      hints: ['The parent passes the label correctly. Look at how Badge receives it.', 'A component receives one object that holds all its props. Badge is treating that whole object as the label.', 'Add curly braces to read the prop out of the object: function Badge({ label })'],
    },
  },
  {
    name: 'State',
    summary: "State is a component's memory. Calling a state setter asks React to render the component again with the new value.",
    explainer: {
      gist: "State is a component's memory: a value React keeps between renders, and changing it updates the screen.",
      paragraphs: [
        'Screens change after clicks and typing. A regular variable cannot handle this, for two reasons: it is forgotten each time the component renders, and changing it does not tell React to update the screen.',
        'The `useState` Hook fixes both. It gives you a pair: the current value and a setter function. Calling the setter tells React to render the component again with the new value. Call `useState` only at the top level of a component, never inside an `if` or a loop.',
        'Each copy of a component has its own state, so two copies on the page keep separate values. State also works like a snapshot: setting it does not change the variable in code that is already running. The new value shows up in the next render.',
      ],
      example: {
        code: `import { useState } from 'react';

export default function LikeButton() {
  const [likes, setLikes] = useState(0);
  return (
    <button onClick={() => setLikes(likes + 1)}>
      Likes: {likes}
    </button>
  );
}`,
        note: '`useState(0)` starts `likes` at `0`. Each click calls `setLikes`, and React renders the button again with the new number.',
      },
      watchOut: [
        'Using a regular variable for something that changes on screen.',
        'Calling `useState` inside an `if` or a loop.',
        'Expecting the variable to change right after you call the setter. The new value arrives in the next render.',
      ],
      terms: [
        { term: 'render', meaning: 'When React calls your component to work out what to show.' },
        { term: 'Hook', meaning: 'A special React function, such as `useState`, that you call at the top level of a component.' },
        { term: 'setter', meaning: 'The function `useState` gives you for changing the value, such as `setLikes`.' },
      ],
    },
    page: {
      title: "State: a component's memory",
      url: 'https://react.dev/learn/state-a-components-memory',
      text: `# State

Components often need to change what is on screen after an interaction. A regular variable cannot do this, for two reasons: it is not kept between renders, and changing it does not make React render again.

The useState Hook gives a component memory. It returns a pair: the current value, and a setter function. Calling the setter asks React to render the component again with the new value. Hooks such as useState can only be called at the top level of a component, never inside conditions or loops.

State is private to each copy of a component. If you show the same component twice, each copy has its own state.

State works like a snapshot. Setting state does not change the variable in the code that is already running. It asks for a new render, and the new value appears in that next render.`,
    },
    needs: ['Components'],
    questions: [
      { type: 'choice', prompt: 'Why does a regular variable not work for data that changes on screen?', code: '', options: ['Regular variables are read-only', 'Changing it does not make React render again', 'React deletes regular variables'], answer: 1, explanation: 'React only renders again when state is set. A regular variable also loses its value between renders.' },
      { type: 'choice', prompt: 'Where can you call useState?', code: '', options: ['At the top level of a component', 'Inside a condition', 'Inside a loop'], answer: 0, explanation: 'Hooks are called at the top level of a component, never inside conditions or loops.' },
      { type: 'choice', prompt: 'The same component is shown twice on a page. What is true of their state?', code: '', options: ['They share one state', 'Only the first copy has state', 'Each copy has its own state'], answer: 2, explanation: 'State is private to each copy of a component.' },
      { type: 'output', prompt: 'count is 0 and the button is clicked once. What does console.log print?', code: 'const [count, setCount] = useState(0);\n\nfunction handleClick() {\n  setCount(count + 1);\n  console.log(count);\n}', answer: '0', explanation: 'Setting state asks for a new render. The code that is already running keeps its snapshot, where count is still 0.' },
      { type: 'written', prompt: 'In your own words, what does calling a state setter function do?', code: '', explanation: 'It asks React to render the component again with the new value. The variable in the code that is already running keeps its old value.' },
    ],
    bug: {
      description: 'The button should switch between "Like" and "Liked" each time you click it. Right now it always says "Like".',
      workingCode: `import { useState } from 'react';

export default function LikeButton() {
  const [liked, setLiked] = useState(false);

  return (
    <button onClick={() => setLiked(!liked)}>
      {liked ? 'Liked' : 'Like'}
    </button>
  );
}
`,
      brokenCode: `export default function LikeButton() {
  let liked = false;

  return (
    <button onClick={() => { liked = !liked; }}>
      {liked ? 'Liked' : 'Like'}
    </button>
  );
}
`,
      tests: tests(`test('starts as Like', () => {
  render(<App />);
  expect(screen.getByRole('button')).toHaveTextContent('Like');
});

test('says Liked after one click', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button')).toHaveTextContent('Liked');
});

test('goes back to Like after two clicks', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button'));
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button').textContent).toBe('Like');
});`),
      hints: ['The click handler does run. Ask what React does after liked changes.', 'Changing a regular variable does not make React render again, and the variable resets on every render.', "Keep liked in state: import useState, then use const [liked, setLiked] = useState(false) and call setLiked(!liked)."],
    },
  },
  {
    name: 'State updates',
    summary: 'React waits until an event handler finishes before it processes state updates. To base an update on the previous one, pass a function to the setter.',
    explainer: {
      gist: 'React holds your state updates until an event handler finishes, then applies them together. To build on the previous value, pass a function to the setter.',
      paragraphs: [
        'React waits until all the code in an event handler has run, then processes your state updates in one go. This is called batching. It avoids extra renders, and you never see a half-finished screen.',
        'During one render, a state variable has one fixed value. So calling `setNumber(number + 1)` three times in a row uses the same number each time. The result is `number + 1`, not `number + 3`.',
        'To build on the update before, pass a function instead: `setNumber(n => n + 1)`. React queues these updater functions and runs them in order, handing each one the result of the one before.',
      ],
      example: {
        code: `function handleClick() {
  setNumber(n => n + 1);
  setNumber(n => n + 1);
  setNumber(n => n + 1);
}`,
        note: 'Each updater gets the result of the one before, so one click adds 3.',
      },
      watchOut: [
        'Calling `setNumber(number + 1)` several times and expecting the updates to add up.',
        'Passing a plain value, such as `setNumber(5)`, replaces whatever was queued before it.',
      ],
      terms: [
        { term: 'batching', meaning: 'Collecting several state updates and applying them together after the event handler finishes.' },
        { term: 'updater function', meaning: 'A function you pass to a setter, such as `n => n + 1`. It gets the previous value and returns the next one.' },
        { term: 'event handler', meaning: 'A function that runs when something happens, such as a click.' },
      ],
    },
    page: {
      title: 'Queueing a series of state updates',
      url: 'https://react.dev/learn/queueing-a-series-of-state-updates',
      text: `# State updates

React waits until all the code in an event handler has run before it processes your state updates. This is called batching. It lets you update several state variables without causing too many renders, and it means you never see a half-finished screen.

Inside one render, a state variable has one fixed value. Calling setNumber(number + 1) three times in a row uses the same number each time, so the result is number + 1, not number + 3.

To base an update on the previous one, pass a function to the setter, such as setNumber(n => n + 1). This is called an updater function. React queues it and runs the queued updates in order, giving each one the result of the one before.

Passing a plain value, such as setNumber(5), replaces whatever is queued so far. An updater function after it then builds on that value.`,
    },
    needs: ['State'],
    questions: [
      { type: 'choice', prompt: 'The state variable number starts at 0. A click handler runs the three lines below. What is number on the next render?', code: 'setNumber(number + 1);\nsetNumber(number + 1);\nsetNumber(number + 1);', options: ['3', '1', '0', 'It throws an error'], answer: 1, explanation: 'All three lines read the same number from this render, which is 0, so each one asks React to set it to 1.' },
      { type: 'choice', prompt: 'What do you pass to a setter to base the new value on the previous one?', code: '', options: ['A function, such as n => n + 1', 'The text "previous"', 'A second useState call'], answer: 0, explanation: 'An updater function receives the latest queued value and returns the next one.' },
      { type: 'choice', prompt: 'When does React process the state updates you queue in an event handler?', code: '', options: ['Immediately, line by line', 'Only when the page reloads', 'After the event handler finishes'], answer: 2, explanation: 'React waits for the handler to finish, then processes the queued updates and renders once.' },
      { type: 'output', prompt: 'The state variable number starts at 0. One click runs the two lines below. What number does the screen show afterward?', code: 'setNumber(number + 5);\nsetNumber(n => n + 1);', answer: '6', explanation: 'The first line replaces the queued value with 0 + 5. The second line is an updater function, so it takes that 5 and returns 6.' },
      { type: 'written', prompt: 'In your own words, why does React wait until the event handler finishes before it processes your state updates?', code: '', explanation: 'React batches the updates. Waiting lets it apply every update from the handler together and render once, so you never see a half-finished screen.' },
    ],
    bug: {
      description: 'The button should add 3 to the count each time you click it. Right now it adds 1.',
      workingCode: `import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(c => c + 1);
    setCount(c => c + 1);
    setCount(c => c + 1);
  }

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={handleClick}>+3</button>
    </div>
  );
}
`,
      brokenCode: `import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
  }

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={handleClick}>+3</button>
    </div>
  );
}
`,
      tests: tests(`test('the count is 3 after one click', () => {
  render(<App />);
  fireEvent.click(screen.getByText('+3'));
  expect(screen.getByText('Count: 3')).toBeInTheDocument();
});

test('the count is 6 after two clicks', () => {
  render(<App />);
  fireEvent.click(screen.getByText('+3'));
  fireEvent.click(screen.getByText('+3'));
  expect(screen.getByText('Count: 6')).toBeInTheDocument();
});`),
      hints: ['Each setCount(count + 1) reads count from this render. During one click, count is the same number on all three lines.', 'React runs the queued updates after handleClick finishes. Three requests to set count to the same number leave it at that number.', 'Pass a function to the setter so each update builds on the one before it: setCount(c => c + 1).'],
    },
  },
];

// Adds the sample library the first time the app starts with an empty database.
export function seedSample(): boolean {
  if (get('SELECT COUNT(*) AS n FROM library')!.n > 0) return false;
  const libraryId = run('INSERT INTO library (name, source_url, way_in, last_checked_at, created_at) VALUES (?, ?, ?, ?, ?)', 'React basics (sample)', 'https://react.dev/learn', 'sample', now(), now());
  const ids = new Map<string, number>();
  SAMPLE.forEach((c, i) => {
    const pageId = run('INSERT INTO page (library_id, url, title, text, fingerprint, position, generated) VALUES (?, ?, ?, ?, ?, ?, 1)', libraryId, c.page.url, c.page.title, c.page.text, fingerprint(c.page.text), i);
    const conceptId = run('INSERT INTO concept (library_id, page_id, name, summary, position) VALUES (?, ?, ?, ?, ?)', libraryId, pageId, c.name, c.summary, i * 10);
    ids.set(c.name, conceptId);
    for (const q of c.questions) addQuestion(conceptId, q);
    addBug(conceptId, c.bug);
  });
  for (const c of SAMPLE) for (const need of c.needs) run('INSERT INTO concept_link (library_id, first_id, then_id) VALUES (?, ?, ?)', libraryId, ids.get(need)!, ids.get(c.name)!);
  run('INSERT INTO import_job (library_id, status, message, created_at) VALUES (?, ?, ?, ?)', libraryId, 'ready', 'Built-in sample.', now());
  addSampleExplainers();
  return true;
}

// Gives the sample library its plain summaries. Also fills them in for a database made before summaries existed.
export function addSampleExplainers() {
  for (const c of SAMPLE) {
    const rows = all("SELECT c.id FROM concept c JOIN library l ON l.id = c.library_id WHERE l.way_in = 'sample' AND c.name = ?", c.name);
    for (const row of rows) saveExplainer(row.id, c.explainer);
  }
}
