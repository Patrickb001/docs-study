// Runs a bug hunt's tests against a piece of code, in a separate process with a time limit.
// Used twice: to check new bugs during an import, and to check your fix in the app.
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ROOT_DIR, SERVER_DIR } from '../config.ts';

// 'react' is a React component with React tests. 'js' is plain JavaScript functions with plain tests.
export type Runtime = 'react' | 'js';

// A bug saved before there were two kinds is React. A new one says which it is, and otherwise the tests give it away.
export const runtimeOf = (bug: { runtime?: Runtime; tests: string }): Runtime =>
  bug.runtime ?? (bug.tests.includes('@testing-library/react') ? 'react' : 'js');

export interface TestOutcome {
  name: string;
  pass: boolean;
  message: string;
}
export interface RunResult {
  ran: boolean; // false when the code could not be run at all
  allPass: boolean;
  tests: TestOutcome[];
  error: string;
  timedOut: boolean; // the code ran for too long and was stopped
}

const SANDBOX_ROOT = join(SERVER_DIR, '.sandbox');
// Plain code that loops forever is a likely mistake, so it is stopped sooner.
const PROCESS_LIMIT_MS: Record<Runtime, number> = { react: 30_000, js: 12_000 };

const REACT_CONFIG = `
export default {
  esbuild: { jsx: 'automatic' },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['App.test.jsx'],
    setupFiles: ['./setup.js'],
    testTimeout: 10000,
    watch: false,
  },
};
`;
const JS_CONFIG = `
export default {
  test: {
    environment: 'node',
    globals: true,
    include: ['solution.test.js'],
    testTimeout: 5000,
    watch: false,
  },
};
`;
const SETUP = `
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => cleanup());
`;

function firstLine(text: string): string {
  const clean = text.replace(/\u001b\[[0-9;]*m/g, '').trim();
  const lines = clean.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  const first = lines[0] ?? '';
  // "Transform failed with 1 error:" is only useful with the line after it.
  const message = first.endsWith(':') && lines[1] ? first + ' ' + lines[1] : first;
  return message.split('. This could be')[0].replace(/^[A-Za-z]*Error: /, '').slice(0, 240);
}

const failed = (error: string, timedOut = false): RunResult => ({ ran: false, allPass: false, tests: [], error, timedOut });

export async function runTests(code: string, tests: string, runtime: Runtime = 'react'): Promise<RunResult> {
  const dir = join(SANDBOX_ROOT, randomUUID());
  await mkdir(dir, { recursive: true });
  try {
    const names = runtime === 'js' ? { code: 'solution.js', tests: 'solution.test.js' } : { code: 'App.jsx', tests: 'App.test.jsx' };
    await writeFile(join(dir, names.code), code);
    await writeFile(join(dir, names.tests), tests);
    await writeFile(join(dir, 'vitest.config.mjs'), runtime === 'js' ? JS_CONFIG : REACT_CONFIG);
    if (runtime === 'react') await writeFile(join(dir, 'setup.js'), SETUP);
    const out = join(dir, 'result.json');

    const exit = await new Promise<{ stderr: string; timedOut: boolean }>((done) => {
      // Its own process group, so that stopping it also stops the worker that vitest starts. A loop that never ends
      // would otherwise keep running in that worker after the check was over.
      const child = spawn(
        process.execPath,
        [join(ROOT_DIR, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--root', dir, '--config', join(dir, 'vitest.config.mjs'), '--reporter=json', `--outputFile=${out}`],
        { cwd: dir, env: { ...process.env, CI: '1', NODE_ENV: 'test' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true },
      );
      let stderr = '';
      let timedOut = false;
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }, PROCESS_LIMIT_MS[runtime]);
      child.on('close', () => { clearTimeout(timer); done({ stderr, timedOut }); });
      child.on('error', (err) => { clearTimeout(timer); done({ stderr: String(err), timedOut }); });
    });

    if (exit.timedOut) {
      return failed(runtime === 'js' ? 'Your code ran for too long. It may be stuck in an endless loop.' : 'The code ran for too long and was stopped.', true);
    }

    let report: any;
    try {
      report = JSON.parse(await readFile(out, 'utf8'));
    } catch {
      return failed(firstLine(exit.stderr) || 'The tests could not be run.');
    }

    const outcomes: TestOutcome[] = [];
    let fileError = '';
    for (const file of report.testResults ?? []) {
      if ((file.assertionResults ?? []).length === 0 && file.message) fileError = firstLine(file.message);
      for (const t of file.assertionResults ?? []) {
        const pass = t.status === 'passed';
        outcomes.push({ name: t.title ?? t.fullName ?? 'test', pass, message: pass ? '' : firstLine((t.failureMessages ?? []).join('\n')) });
      }
    }
    if (outcomes.length === 0) {
      return failed(fileError || firstLine(exit.stderr) || 'No tests were found.');
    }
    return { ran: true, allPass: outcomes.every((t) => t.pass), tests: outcomes, error: '', timedOut: false };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// A bug is good when its working code passes every test and its broken code fails at least one.
// Plain JavaScript is held to a little more: broken code must run and fail, or run for ever. Code that cannot start,
// such as a typo, is not a bug a learner can reason about.
// It also hands back what the broken code really did, so that the words around the bug can be written from facts.
export async function verifyBug(bug: { runtime?: Runtime; workingCode: string; brokenCode: string; tests: string }): Promise<{ ok: boolean; reason: string; broken?: RunResult }> {
  const runtime = runtimeOf(bug);
  if (bug.workingCode.trim() === bug.brokenCode.trim()) return { ok: false, reason: 'The broken code is the same as the working code.' };
  const working = await runTests(bug.workingCode, bug.tests, runtime);
  if (!working.ran) return { ok: false, reason: 'Working code could not run: ' + working.error };
  if (!working.allPass) return { ok: false, reason: 'The working code fails its own tests.' };
  const broken = await runTests(bug.brokenCode, bug.tests, runtime);
  if (runtime === 'js' && !broken.ran && !broken.timedOut) return { ok: false, reason: 'The broken code could not run: ' + broken.error };
  if (broken.ran && broken.allPass) return { ok: false, reason: 'The broken code passes every test.' };
  return { ok: true, reason: '', broken };
}
