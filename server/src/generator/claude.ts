// Everything that talks to Claude goes through this file.
import Anthropic from '@anthropic-ai/sdk';
import { config, hasApiKey } from '../config.ts';

export interface ClaudeRequest {
  id: string; // used to match batch replies to requests: letters, digits, _ and - only
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  effort?: string;
}
export interface ClaudeReply {
  id: string;
  ok: boolean;
  text: string;
  tokensIn: number;
  tokensOut: number;
  error: string;
}
export interface Claude {
  send(request: ClaudeRequest): Promise<ClaudeReply>;
  createBatch(requests: ClaudeRequest[]): Promise<string>;
  batchDone(batchId: string): Promise<boolean>;
  batchResults(batchId: string): Promise<ClaudeReply[]>;
}

function params(request: ClaudeRequest) {
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    system: request.system,
    messages: [{ role: 'user' as const, content: request.user }],
    ...(request.effort ? { output_config: { effort: request.effort } } : {}),
  } as any;
}

// A reply can hold thinking blocks as well as text. Only the text is the answer.
function replyFrom(id: string, message: any): ClaudeReply {
  const text = (message.content ?? []).filter((block: any) => block.type === 'text').map((block: any) => block.text).join('');
  return { id, ok: true, text, tokensIn: message.usage?.input_tokens ?? 0, tokensOut: message.usage?.output_tokens ?? 0, error: '' };
}

function realClaude(): Claude {
  const client = new Anthropic({ apiKey: config.apiKey });
  return {
    async send(request) {
      try {
        return replyFrom(request.id, await client.messages.create(params(request)));
      } catch (err: any) {
        return { id: request.id, ok: false, text: '', tokensIn: 0, tokensOut: 0, error: String(err?.message ?? err).slice(0, 300) };
      }
    },
    async createBatch(requests) {
      const batch = await client.messages.batches.create({ requests: requests.map((r) => ({ custom_id: r.id, params: params(r) })) });
      return batch.id;
    },
    async batchDone(batchId) {
      return (await client.messages.batches.retrieve(batchId)).processing_status === 'ended';
    },
    async batchResults(batchId) {
      const replies: ClaudeReply[] = [];
      for await (const item of await client.messages.batches.results(batchId)) {
        if (item.result.type === 'succeeded') replies.push(replyFrom(item.custom_id, item.result.message));
        else replies.push({ id: item.custom_id, ok: false, text: '', tokensIn: 0, tokensOut: 0, error: 'Claude did not finish this request (' + item.result.type + ').' });
      }
      return replies;
    },
  };
}

let current: Claude | null = null;
export function claude(): Claude {
  if (!current) {
    if (!hasApiKey()) throw new Error('No Claude API key is set. Add ANTHROPIC_API_KEY to your .env file and restart.');
    current = realClaude();
  }
  return current;
}
// Tests swap in a stand-in so they never call the real API.
export function useClaude(standIn: Claude | null) {
  current = standIn;
}
export const claudeReady = () => current !== null || hasApiKey();
