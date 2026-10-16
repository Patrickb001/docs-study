// The design fix checker. A design is boxes (parts) and arrows (links). Checks are small rules about the arrows.
// Everything here is pure and instant: no network, no AI, so checking a design is free.
import { z } from 'zod';

export const PART_KINDS = ['user', 'service', 'database', 'queue', 'topic', 'cache', 'loadBalancer', 'gateway', 'sessionStore', 'function'] as const;
export type PartKind = (typeof PART_KINDS)[number];

// How a kind reads in a sentence: "a message queue", "2 message queues".
const ONE: Record<PartKind, string> = {
  user: 'a user', service: 'a service', database: 'a database', queue: 'a message queue', topic: 'a pub/sub topic',
  cache: 'a cache', loadBalancer: 'a load balancer', gateway: 'an API gateway', sessionStore: 'a session store', function: 'a serverless function',
};
const MANY: Record<PartKind, string> = {
  user: 'users', service: 'services', database: 'databases', queue: 'message queues', topic: 'pub/sub topics',
  cache: 'caches', loadBalancer: 'load balancers', gateway: 'API gateways', sessionStore: 'session stores', function: 'serverless functions',
};

const text = z.string().trim().min(1);
const kind = z.enum(PART_KINDS);
const part = z.object({ id: text, kind, label: text });
const link = z.object({ from: text, to: text, style: z.enum(['call', 'event']) });
const target = z.union([z.object({ id: text }), z.object({ kind })]);
const ruleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('path'), from: target, to: target, via: kind.optional() }),
  z.object({ type: z.literal('neverWaits'), from: target, to: target }),
  z.object({ type: z.literal('noLink'), from: target, to: target }),
  z.object({ type: z.literal('count'), kind, min: z.number().int().min(1) }),
  z.object({ type: z.literal('allLinkTo'), fromKind: kind, toKind: kind }),
]);
const checkSchema = z.object({ name: text, rule: ruleSchema });
// What the screen sends back: no more than 40 parts and 120 links.
const submittedSchema = z.object({ parts: z.array(part).min(1).max(40), links: z.array(link).max(120) });

export const designSchema = z.object({
  scenario: text,
  goals: z.array(text).min(1).max(3),
  broken: z.object({ parts: z.array(part).min(2).max(8), links: z.array(link).max(20) }),
  palette: z.array(z.object({ kind, label: text })).min(2).max(5),
  working: z.object({ parts: z.array(part).min(2).max(12), links: z.array(link).max(30) }),
  checks: z.array(checkSchema).min(2).max(4),
  hints: z.array(text).length(3),
});

export type DesignPart = z.infer<typeof part>;
export type DesignLink = z.infer<typeof link>;
export type DesignGraph = { parts: DesignPart[]; links: DesignLink[] };
export type Target = z.infer<typeof target>;
export type Rule = z.infer<typeof ruleSchema>;
export type DesignCheck = z.infer<typeof checkSchema>;
export type NewDesign = z.infer<typeof designSchema>;
export interface CheckOutcome {
  name: string;
  pass: boolean;
  message: string; // empty when the check passes
}

const isId = (t: Target): t is { id: string } => 'id' in t;
const matches = (t: Target, p: DesignPart) => (isId(t) ? p.id === t.id : p.kind === t.kind);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const BOTH: DesignLink['style'][] = ['call', 'event'];

// Every part reachable from `from` along one or more links, each mapped to the part it was reached from.
function reach(g: DesignGraph, from: string, styles: DesignLink['style'][]): Map<string, string> {
  const came = new Map<string, string>();
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    for (const l of g.links) {
      if (l.from !== at || !styles.includes(l.style) || came.has(l.to)) continue;
      came.set(l.to, at);
      queue.push(l.to);
    }
  }
  return came;
}

// The part right after `start` on the way to `end`.
function firstStep(came: Map<string, string>, start: string, end: string): string {
  let at = end;
  while (came.get(at) !== start) at = came.get(at)!;
  return at;
}

export function runChecks(g: DesignGraph, checks: DesignCheck[], known: Map<string, string>): CheckOutcome[] {
  const labelOf = (id: string) => g.parts.find((p) => p.id === id)?.label ?? known.get(id) ?? id;
  const nameOf = (t: Target) => (isId(t) ? labelOf(t.id) : ONE[t.kind]);
  const partsFor = (t: Target) => g.parts.filter((p) => matches(t, p));
  const idsFor = (t: Target) => new Set(partsFor(t).map((p) => p.id));
  const reaches = (from: string, to: Set<string>, styles: DesignLink['style'][]) => [...reach(g, from, styles).keys()].some((id) => id !== from && to.has(id));

  // Returns the failure message, or '' when the rule holds.
  const judge = (rule: Rule): string => {
    // A check about a part that is no longer in the design cannot pass, or deleting that part would "solve" it.
    const missing = targetsOf(rule).find((t) => isId(t) && !g.parts.some((p) => p.id === t.id));
    if (missing && isId(missing)) return `${cap(labelOf(missing.id))} is missing from the design. Use Reset design to bring it back.`;
    switch (rule.type) {
      case 'path': {
        const to = idsFor(rule.to);
        const starts = partsFor(rule.from);
        const any = starts.some((s) => reaches(s.id, to, BOTH));
        if (!rule.via) return any ? '' : `Nothing connects ${nameOf(rule.from)} to ${nameOf(rule.to)}.`;
        const via = g.parts.filter((p) => p.kind === rule.via);
        const through = starts.some((s) => via.some((v) => v.id !== s.id && reach(g, s.id, BOTH).has(v.id) && reaches(v.id, to, BOTH)));
        if (through) return '';
        return any
          ? `${cap(nameOf(rule.from))} reaches ${nameOf(rule.to)}, but not through ${ONE[rule.via]}.`
          : `Nothing connects ${nameOf(rule.from)} to ${nameOf(rule.to)}.`;
      }
      case 'neverWaits': {
        const to = idsFor(rule.to);
        for (const s of partsFor(rule.from)) {
          const came = reach(g, s.id, ['call']);
          const hit = [...came.keys()].find((id) => id !== s.id && to.has(id));
          if (!hit) continue;
          const step = firstStep(came, s.id, hit);
          return `${cap(labelOf(s.id))} still waits on ${labelOf(hit)}${step !== hit ? ` (through ${labelOf(step)})` : ''}.`;
        }
        return '';
      }
      case 'noLink': {
        const found = g.links.find((l) => {
          const a = g.parts.find((p) => p.id === l.from);
          const b = g.parts.find((p) => p.id === l.to);
          return a && b && matches(rule.from, a) && matches(rule.to, b);
        });
        return found ? `${cap(labelOf(found.from))} still connects straight to ${labelOf(found.to)}.` : '';
      }
      case 'count': {
        const n = g.parts.filter((p) => p.kind === rule.kind).length;
        if (n >= rule.min) return '';
        return rule.min === 1 ? `The design needs ${ONE[rule.kind]}.` : `The design needs at least ${rule.min} ${MANY[rule.kind]}.`;
      }
      case 'allLinkTo': {
        const from = g.parts.filter((p) => p.kind === rule.fromKind);
        if (from.length === 0) return `The design has no ${MANY[rule.fromKind]}.`;
        const loose = from.find((p) => !g.links.some((l) => l.from === p.id && g.parts.find((q) => q.id === l.to)?.kind === rule.toKind));
        return loose ? `${cap(loose.label)} is not connected to ${ONE[rule.toKind]}.` : '';
      }
    }
  };

  return checks.map((c) => {
    const message = judge(c.rule);
    return { name: c.name, pass: message === '', message };
  });
}

const targetsOf = (r: Rule): Target[] => ('from' in r ? [r.from, r.to] : []);

// A generated puzzle is kept only if it makes sense: real parts, checks about them,
// a working design the user can build, which passes, and a broken design which fails.
export function verifyDesign(raw: unknown): { ok: true; design: NewDesign } | { ok: false; reason: string } {
  const parsed = designSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: `${issue.path.join('.')}: ${issue.message}` };
  }
  const d = parsed.data;
  for (const [name, graph] of [['broken', d.broken], ['working', d.working]] as const) {
    const ids = new Set<string>();
    for (const p of graph.parts) {
      if (ids.has(p.id)) return { ok: false, reason: `Two parts in the ${name} design share the id ${p.id}.` };
      ids.add(p.id);
    }
    const bad = graph.links.find((l) => !ids.has(l.from) || !ids.has(l.to));
    if (bad) return { ok: false, reason: `A link in the ${name} design points at a part that does not exist: ${ids.has(bad.from) ? bad.to : bad.from}.` };
  }
  const inBroken = new Map(d.broken.parts.map((p) => [p.id, p]));
  for (const c of d.checks) {
    for (const t of targetsOf(c.rule)) {
      if (isId(t) && !inBroken.has(t.id)) return { ok: false, reason: `The check "${c.name}" names a part that is not in the broken design: ${t.id}.` };
    }
  }
  const offered = new Set(d.palette.map((p) => p.kind));
  for (const p of d.working.parts) {
    const same = inBroken.get(p.id);
    if (same ? same.kind !== p.kind : !offered.has(p.kind)) return { ok: false, reason: `The working design uses ${ONE[p.kind]}, which the user cannot add.` };
  }
  const known = new Map(d.broken.parts.map((p) => [p.id, p.label]));
  const failing = runChecks(d.working, d.checks, known).find((r) => !r.pass);
  if (failing) return { ok: false, reason: `The working design fails: ${failing.name}. ${failing.message}` };
  if (runChecks(d.broken, d.checks, known).every((r) => r.pass)) return { ok: false, reason: 'The broken design already passes every check.' };
  return { ok: true, design: d };
}

// Reads a design sent from the screen. Anything malformed or too big is refused.
export function parseSubmitted(json: string): DesignGraph | null {
  try {
    const read = submittedSchema.safeParse(JSON.parse(json));
    return read.success ? read.data : null;
  } catch {
    return null;
  }
}
