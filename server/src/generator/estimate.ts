// Rough cost of an import, shown before anything is sent to Claude.
import { config } from '../config.ts';

// Measured on the React docs: about 2.3 tokens per word of documentation.
const TOKENS_PER_WORD = 2.3;
// Each page is read once. Retries, instructions, and the linking request add most of the rest.
const READ_FACTOR = 1.8;
// Claude writes about 1.4 tokens for every token of docs it reads on this plan.
const WRITE_FACTOR = 1.37;

export function estimateUsd(words: number, mode: 'batch' | 'direct'): number {
  const docTokens = words * TOKENS_PER_WORD;
  const full = (docTokens * READ_FACTOR * config.writerPriceIn + docTokens * WRITE_FACTOR * config.writerPriceOut) / 1_000_000;
  return Math.round((mode === 'batch' ? full / 2 : full) * 100) / 100;
}

export function costUsd(tokensIn: number, tokensOut: number, mode: string): number {
  const full = (tokensIn * config.writerPriceIn + tokensOut * config.writerPriceOut) / 1_000_000;
  return Math.round((mode === 'batch' ? full / 2 : full) * 100) / 100;
}
