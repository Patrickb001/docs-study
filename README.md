# Docs Study

Docs Study turns documentation into a concept map, quizzes, and hands-on exercises. It runs only on your computer.

It comes with a small sample library about React, so you can try every screen before you import anything.

## What you need

- **Node.js 22.13 or newer.** Version 24 is a good choice. Check yours with `node -v`.
- **A Claude API key.** This is optional at first. You need it only to import your own docs and to have written answers graded for you.

## Set up

1. Unzip the folder and open a terminal inside it.
2. Install the packages:
   ```
   npm install
   ```
3. Make your settings file by copying the example.
   - macOS or Linux: `cp .env.example .env`
   - Windows: `copy .env.example .env`
4. Optional: open `.env` in a text editor and paste your Claude API key after `ANTHROPIC_API_KEY=`.
5. Start the app:
   ```
   npm run dev
   ```

Your browser opens the app at http://127.0.0.1:5173. If it does not, open that address yourself.

To stop the app, press `Ctrl + C` in the terminal.

## Your first ten minutes

1. The home screen shows the sample library, "React basics". The **Next up** card tells you what to do.
2. Press **Start quiz** and answer the five questions.
3. Pass with 4 of 5, then press **Start the bug hunt**. Concepts about other topics get a different exercise, described below.
4. Fix the code and press **Check my fix**. When the tests pass, the concept turns solid on the map and the next one unlocks.
5. Come back tomorrow. The questions you answered will be waiting on the **Review** screen.

Without an API key, written answers are not graded for you. The app shows a model answer and you mark yourself right or wrong.

With a key, an answer to a "what happens?" question about a flow in words, such as a step in a routine, can be right in different words. If it does not match the saved answer exactly, Claude judges it for a fraction of a cent. An answer about real code must match exactly, so those are never judged by Claude.

### Summaries

Press **Read the full summary** on a concept to get a plain-words explanation of it. Claude writes it the first time you ask, from the page and from the quiz questions for that concept, so a reader who studies it can answer every question. It has a one-sentence gist, three to six paragraphs, a worked example from the page, the mistakes to avoid, and up to eight key terms. It costs about 3 cents for a long page and less for a short one, and it is saved.

If you add questions later, or want a fresh version, press **Rewrite the summary**. It replaces the saved one, and the old one is kept if the rewrite fails.

## Design fixes

Some concepts are about how parts of a system connect, such as services, queues, and databases, rather than code. Instead of a bug hunt, these get a design fix: a small diagram with one flaw, and goals it must meet. Change the parts and arrows, then press **Check my design**. Each check says what still fails. An arrow either waits for a reply (solid line) or sends an event and moves on (dashed line). Everything on the screen also works from the keyboard through the Connections list. Checking a design is instant and free.


## Apply it, and ordering the steps

A **bug hunt** is one of two kinds. A React concept gets a small app with a live preview. A concept about plain JavaScript, such as reversing a linked list, gets a few functions checked by tests. That kind has no preview. If your code never finishes, the check stops it after about 12 seconds and says so.

Not every document is about code or systems. For a method, a habit, or a principle, a concept gets an **Apply it** exercise. For a process with a clear sequence, it gets an **Order the steps** exercise. When you import, Claude picks the one exercise that fits each concept, or none.

**Apply it** gives you a new situation and a task, such as "your commute doubled; redesign your study routine so it works on your worst day". You write an answer and press **Check my answer**. Claude marks it against a hidden checklist of 3 to 5 points, with a short comment on each, and you pass when you cover at least two thirds of them. You can revise and check again, and once you pass you see a strong answer to compare with. It needs your Claude key, and each check costs a fraction of a cent.

**Order the steps** shows the steps of a process in a shuffled order. Use **Up** and **Down** on each step, then press **Check my order**. Each step is marked as in the right place or not, and checking is free. When the order is right you see why it matters.

Both count like a bug hunt: pass the quiz, then finish the exercise, and the concept turns solid. **Write another exercise** lists the types that fit the concept, such as bug hunt, Apply it, or Order the steps, and writes the one you pick. If only one fits, it writes that one. If Claude cannot make the type you pick, it says so and saves nothing.

## Importing your own docs

Start small. A five-page trial shows you the real cost before you commit to a whole library.

1. Add your API key to `.env` and restart the app.
2. Open **Sources**.
3. Paste a link. A GitHub link to a docs folder works best, for example:
   `https://github.com/reactjs/react.dev/tree/main/src/content/learn`
4. Leave **How many pages to import** at 5 and press **Read the pages**. Reading is free.
5. The app shows a cost estimate with two choices:
   - **Send as a batch** is half price. It usually finishes within an hour and can take up to a day. Leave the app running, or open it again later, and it picks up the results.
   - **Write it now** is full price and takes a few minutes.
6. When the import is ready, press **Study this**.

After an import, the Sources screen shows what it cost. Use that to judge a full import. To import every page, set the page count to 0.

The app refuses any import or update whose estimate is above `SPEND_LIMIT_USD` in your `.env` file.

### Importing a list of pages

To study a hand-picked set of pages, paste them into the links box, one per line. With two or more links, the app reads exactly those pages and nothing else, and they become one library. Give it a name if you like, such as "System design". Everything after that works the same: a cost estimate first, then batch or right away.

A GitHub folder link imports a whole folder, so add it on its own rather than in a list. A list can have up to 100 links.

### Importing markdown files

You can also add markdown files from your computer, on their own or together with links.

1. Open **Sources**. Under the links box, press **Choose files**, or **Choose a folder** to take every markdown file inside it.
2. Leave the links box empty to make a source from the files alone. Or paste links as well, and the files are read after the pages from the links.
3. Press **Read the pages**. Reading is free, and you see a cost estimate before anything is sent to Claude, just as with links.

The app keeps `.md`, `.markdown` and `.mdx` files. It leaves out other files, and anything inside `node_modules` or a hidden folder such as `.git`. Files under 150 words are skipped, as short web pages are. You can add up to 300 files at a time, and each can be up to 150 KB. Without a name, a source made of one folder is named after the folder.

One link still reads a whole site or GitHub folder, and the page count applies to that link only. Your files are always read in full.

A short page gets 1 to 3 concepts. A long page, such as one big markdown file, gets more: about one for every 500 words, up to 8. For finer coverage of a very long document, split it into several files.

The files are copied into the app. They go to Claude only when you approve an import or an update, and the app never reads them from your disk again by itself.

#### Changing files later

To pick up edits or add more files, press **Add or update files** on the source and choose the files, or the same folder, again. The app compares each file with what it has:

- A file it has not seen is a new page.
- A file whose text changed is a changed page.
- A file with the same text is left alone.

New and changed pages join the same "tick the pages to update" list that web changes use. Approving rewrites only the ticked pages, so your progress on the others is kept. The list shows what the ticked pages will cost, and the app refuses an update above `SPEND_LIMIT_USD`, as it does for imports.

A file is matched by its path inside the folder you chose, so choose a folder the same way each time. The app cannot tell that you deleted a file from your computer. Its pages stay until you delete the source.

New concepts from added files appear on the map with nothing to learn before them. A source made only of files has no **Check for changes** button, because there is nothing online to look up.

### Which links work

| Link | How the app reads it |
| --- | --- |
| A GitHub repository or folder | Reads the Markdown files directly. This is the cleanest way in. |
| A docs website that publishes `llms.txt` | Reads the ready-made text copies of its pages. |
| Any other docs website | Reads the web pages, one per second, and follows `robots.txt`. |

Some docs sites show one programming language in each code block and load the others with a script. When a page does that, the app reads the JavaScript version and uses it, so the questions, summaries and bug hunts show JavaScript. A block with no JavaScript version stays as the page shows it. When two of your links lead to the same article, it is read once and the import says so.

When a page changes and you approve the update, the page is written again. Claude is told the names of the concepts the page already has and keeps them, so your progress on them stays. A concept the new text no longer covers is removed, because it would have nothing left to study and could hold back the concepts that wait for it.

For websites that are not open source, read their terms of use before you import.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the app |
| `npm test` | Runs the tests. It takes about a minute, because it checks every sample bug for real. |
| `npm run typecheck` | Checks the TypeScript types in the server and the screens |
| `npm run build` | Builds the screens for production into `web/dist` |
| `npm run reset` | Deletes your database, so the app starts fresh with only the sample library |

## Where things are

```text
docs-study/
  web/                 the screens (React, Apollo Client, react-hook-form)
    src/screens/       Home, Quiz, BugHunt, DesignFix, Review, Sources, Break
    src/components/    ConceptMap, DesignCanvas, QuestionCard, LivePreview, TopBar
    src/graphql.ts     every query and mutation the screens use
  server/              the local server (Node.js, Apollo Server, GraphQL)
    src/api/           the GraphQL schema and resolvers
    src/importer/      reads docs, runs imports and updates
    src/generator/     builds Claude requests, checks replies, tests bugs
    src/rules/         review dates, concept status, quiz pass mark
    src/grader/        grades answers
    src/seed/          the built-in sample library
  data/                your database (created on first run)
  .env                 your settings and API key
```

Good places to start reading the code:

- `server/src/rules/` has no database or network code. Its tests in `rules.test.ts` show what each rule does.
- `server/src/api/schema.ts` is the whole API in one file.
- `web/src/graphql.ts` shows what each screen asks the server for.

While the app is running, http://127.0.0.1:4000 opens a page where you can try GraphQL queries by hand.

## How this differs from the low-level design

Four things changed while building, each for a practical reason.

- **The database uses Node's built-in SQLite, not Prisma.** There is nothing extra to install, and the SQL is in plain view in `server/src/db.ts`.
- **Bug hunt tests run on the local server, not in the browser.** The same checker that tests new bugs during an import also tests your fix, so there is one checker to trust.
- **The editor is CodeMirror and the live preview is built in, instead of Sandpack.** Sandpack loads its code runner from the internet, and its preview stayed stuck on loading. The built-in preview runs your code right in the page and works offline.
- **Quiz passes are saved.** A small `quiz_pass` table records each pass, and a `finishQuiz` call was added to the API.

## What has been tested

- The rules, the sample library, and a full import and update run are covered by `npm test`. The import tests use a stand-in for Claude, so they cost nothing.
- Every screen was clicked through in a real browser with the sample library.
- Reading docs from GitHub was tested against the React docs.

Choosing markdown files, adding and updating them, and the screens that show them were also clicked through in a real browser. One real import of a 3,800-word markdown file was run with a Claude key and cost about 7 cents. Adding and updating files after an import is covered by the tests, which use a stand-in for Claude.

Real imports need your API key, so they are not part of the automated tests. Do the five-page trial before a full import.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| "The app cannot reach its server" | Check that `npm run dev` is still running in the terminal. The page retries by itself. |
| An error mentioning `node:sqlite` | Your Node.js is too old. Install version 22.13 or newer. |
| "No Claude API key is set" | Add the key to `.env` and restart the app. |
| An import stays on "Sent to Claude" | Batches can take up to a day. Keep the app open or open it again later. |
| The port is already in use | Another copy of the app is running. Close it, or set `PORT=4001` in `.env` and `VITE_API_URL=http://127.0.0.1:4001/` in `web/.env`. |
| The live preview shows an error | The code has a mistake that stops it from running. Fix it, or press **Reset code**. |

## Good to know

- Your API key stays on your computer. Only the local server reads it, and the browser never sees it.
- Markdown files you choose are copied into the database on your computer. They go to Claude only after you approve.
- Checking a bug runs code on your computer in a separate process with a time limit. During an import, that code was written by Claude. Do not run the app with administrator rights.
- Checking bugs is the slow part of an import, at a few seconds per bug.
