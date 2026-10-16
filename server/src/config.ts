// Reads settings from the .env file in the project root.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SERVER_DIR = resolve(here, '..');
export const ROOT_DIR = resolve(SERVER_DIR, '..');

const envFile = resolve(ROOT_DIR, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  port: num('PORT', 4000),
  dbFile: process.env.DB_FILE === ':memory:' ? ':memory:' : resolve(ROOT_DIR, process.env.DB_FILE || 'data/docs-study.db'),
  apiKey: (process.env.ANTHROPIC_API_KEY || '').trim(),
  spendLimitUsd: num('SPEND_LIMIT_USD', 10),
  writerModel: process.env.WRITER_MODEL || 'claude-sonnet-5-5',
  graderModel: process.env.GRADER_MODEL || 'claude-haiku-4-5-20251001',
  // How hard the writer model thinks. Lower is cheaper. Leave empty to use the model's default.
  writerEffort: process.env.WRITER_EFFORT === undefined ? 'medium' : process.env.WRITER_EFFORT.trim(),
  // Prices in US dollars per million tokens, used only to show what an import cost.
  writerPriceIn: num('WRITER_PRICE_IN', 2),
  writerPriceOut: num('WRITER_PRICE_OUT', 10),
  fetchDelayMs: num('FETCH_DELAY_MS', 1000),
  githubToken: (process.env.GITHUB_TOKEN || '').trim(),
  batchPollSeconds: num('BATCH_POLL_SECONDS', 60),
};

export const hasApiKey = () => config.apiKey !== '';
