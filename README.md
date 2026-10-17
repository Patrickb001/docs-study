# Docs Study

Docs Study turns documentation into a map of concepts, quizzes, and hands-on exercises, so you learn the docs instead of just reading them. It runs only on your computer.

It comes with a small React sample library, so you can try everything before you import anything.

## What you need

- **Node.js 22.13 or newer.** Check yours with `node -v`.
- **A Claude API key.** This is optional at first. You need one to import your own docs and to get some answers marked. Get one at https://console.anthropic.com/.

## Set up

1. Get the project (clone the repository or download the ZIP) and open a terminal in its folder.
2. Install the packages:
   ```
   npm install
   ```
3. Copy the example settings file:
   - macOS or Linux: `cp .env.example .env`
   - Windows: `copy .env.example .env`
4. Optional: open `.env` and paste your Claude API key after `ANTHROPIC_API_KEY=`.
5. Start the app:
   ```
   npm run dev
   ```

The app opens at http://127.0.0.1:5173. If it does not, open that address yourself. To stop it, press `Ctrl + C` in the terminal.

`.env.example` also lists the other settings, such as a spending limit, each with a short note. You can ignore them at first.

## Try it

1. Open the sample library. The panel on the left suggests a concept to start with.
2. Press **Start quiz** and answer the questions. You pass with 80% right, which is 4 of 5.
3. Do the exercise that unlocks, such as **Start bug hunt**. When it passes, the concept turns solid on the map and the next one opens.
4. Come back tomorrow. Your questions return on the **Review** screen after 1, 3, 7, 14, and then 30 days. A wrong answer starts that question over.

## What each concept gives you

Every concept has a **quiz**, a **summary**, and one **exercise**.

- **Summary.** Press **Read the full summary** for a plain-words explanation. Claude writes it the first time you ask, for about 3 cents, and it is saved. **Rewrite the summary** makes a fresh one.
- **Exercise.** Claude picks the kind that fits the concept:

| Exercise | For | What you do |
| --- | --- | --- |
| **Bug hunt** | Code | Fix one bug, then press **Check my fix**. React concepts get a small app with a live preview. Plain JavaScript concepts, such as reversing a linked list, get a few functions checked by tests, with no preview. If your code never finishes, the check stops it after about 12 seconds and tells you. |
| **Design fix** | How parts of a system connect, such as services, queues, and databases | Change the parts and arrows of a small diagram, then press **Check my design**. It also works from the keyboard. |
| **Apply it** | Methods, habits, and principles | Write an answer to a new situation, then press **Check my answer**. Claude marks it against a hidden checklist, and you pass with two thirds. Of the four exercises, this is the only one that needs your key to check. |
| **Order the steps** | Processes | Put shuffled steps in order with **Up** and **Down**, then press **Check my order**. |

Pass the quiz, then finish the exercise, and the concept turns solid.

**Write another exercise** shows the kinds that fit the concept and writes the one you pick. **Write 3 more questions** adds questions. Each costs a few cents. If Claude cannot make what you picked, it says so and saves nothing.

**About marking.** Without a key, you mark your own written answers against a model answer. With a key, Claude can accept an answer to an ideas question that is worded differently, for a fraction of a cent. Answers about real code must match exactly.

## Add your own docs

Start small. A five-page trial shows you the real cost.

1. Put your API key in `.env` and restart the app.
2. Open **Sources**.
3. Paste a link. A GitHub link to a docs folder works best, for example `https://github.com/reactjs/react.dev/tree/main/src/content/learn`.
4. Leave **How many pages to import** at 5 and press **Read the pages**. Reading is free.
5. Choose how to write it. **Send as a batch** is half price and usually done within an hour, but can take a day. Leave the app running, or open it again later. **Write it now** is full price and takes a few minutes.
6. When it is ready, press **Study this**.

Sources then shows what the import cost. To import every page, set the page count to 0. The app refuses anything whose estimate is above your spending limit, `SPEND_LIMIT_USD`, which is $10 unless you change it.

**What you can add**

| Source | What happens |
| --- | --- |
| A GitHub repository or folder | Reads its Markdown files. This is the cleanest way in. |
| A docs website that publishes `llms.txt` | Reads the ready-made text copies of its pages. |
| Any other docs website | Reads the pages, one per second, and follows `robots.txt`. |
| Several links, one per line | Reads exactly those pages, up to 100, as one library. Two links to the same article are read once. Add a GitHub folder on its own. |
| Markdown files from your computer | Press **Choose files** or **Choose a folder**. It keeps `.md`, `.markdown` and `.mdx` files, up to 300 at a time and 150 KB each. They are copied into the app and go to Claude only after you approve the estimate. |

Pages under 150 words are skipped. A short page gets 1 to 3 concepts. A long page gets about one for every 500 words, up to 8, so split a very long document into several files. If a site shows one programming language per code block, the app uses the JavaScript version when the page offers it. For sites that are not open source, read their terms of use first.

**Keeping a source up to date**

- **Websites and GitHub:** press **Check for changes**. It is free. Tick the pages you want to rewrite and see what they will cost. Only the ticked pages are rewritten, and your progress on the others is kept. Rewritten pages keep their concept names. A concept the new text no longer covers is removed.
- **Files:** press **Add or update files** and choose the same files or folder again. New files become new pages, changed files become changed pages, and unchanged files are left alone. Choose the folder the same way each time, because files are matched by their path. The app cannot tell that you deleted a file, so its pages stay until you press **Delete this source**.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the app |
| `npm test` | Runs the tests. It takes under a minute and costs nothing. |
| `npm run typecheck` | Checks the code for type mistakes |
| `npm run build` | Builds the screens into `web/dist` |
| `npm run reset` | **Deletes your database and all your progress.** The app starts fresh with only the sample library. |

## If something goes wrong

| What you see | What to do |
| --- | --- |
| "The app cannot reach its server" | Check that `npm run dev` is still running. The page retries by itself. |
| An error mentioning `node:sqlite` | Your Node.js is too old. Install 22.13 or newer. |
| "No Claude API key is set" | Add the key to `.env` and restart the app. |
| An import stays on "Sent to Claude" | Batches can take up to a day. Keep the app open, or open it again later. |
| The port is already in use | Another copy of the app is running. Close it, or set `PORT=4001` in `.env` and `VITE_API_URL=http://127.0.0.1:4001/` in `web/.env`. |
| The live preview shows an error | The code has a mistake that stops it running. Fix it, or press **Reset code**. |

## Good to know

- Your API key stays on your computer. Only the local server reads it, and the browser never sees it.
- Your progress and imported pages are saved in the `data/` folder on your computer.
- A bug hunt check runs code on your computer, in a separate process with a time limit. During an import, Claude wrote that code. Do not run the app with administrator rights.
- Checking bugs is the slow part of an import, at a few seconds per bug.

## For developers

The screens are in `web/` (React, Apollo Client, CodeMirror). The local server is in `server/` (Node.js, Apollo Server, GraphQL). Your data is one SQLite file made with Node's built-in SQLite, so there is no database to install. Bug hunt tests run on the server, so the same checker tests new bugs during an import and tests your fix.

```text
web/src/screens/        the screens
web/src/graphql.ts      every query and mutation the screens use
server/src/api/         the GraphQL schema and resolvers
server/src/importer/    reads docs, runs imports and updates
server/src/generator/   builds Claude requests, checks replies, tests bugs
server/src/rules/       review dates, concept status, quiz pass mark
server/src/grader/      marks answers
server/src/seed/        the built-in sample library
```

Good places to start: `server/src/rules/` has no database or network code, and its tests show what each rule does. `server/src/api/schema.ts` is the whole API in one file. While the app runs, http://127.0.0.1:4000 opens a page where you can try GraphQL queries by hand.

`npm test` covers the rules, the sample library, and a full import and update using a pretend Claude, so it makes no real calls. Real imports need your key, so they are not automated. Do the five-page trial before a full import.
