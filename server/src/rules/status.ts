// Concept status is never stored. It is worked out from what you have done.
export type Status = 'locked' | 'fresh' | 'learning' | 'solid';

export interface ConceptFacts {
  id: number;
  position: number;
  triedQuiz: boolean;
  passedQuiz: boolean;
  hasBug: boolean;
  fixedBug: boolean;
  // true when your two most recent review answers for this concept were both wrong
  slipping: boolean;
}
export interface Link {
  firstId: number;
  thenId: number;
}

function ownStatus(c: ConceptFacts): Exclude<Status, 'locked'> {
  const done = c.passedQuiz && (c.fixedBug || !c.hasBug);
  if (done && !c.slipping) return 'solid';
  if (c.triedQuiz || c.passedQuiz || c.fixedBug) return 'learning';
  return 'fresh';
}

// A concept is locked until every concept it depends on is solid.
// Something you have already started never locks again, so you do not lose your place.
export function statuses(concepts: ConceptFacts[], links: Link[]): Map<number, Status> {
  const own = new Map(concepts.map((c) => [c.id, ownStatus(c)]));
  const result = new Map<number, Status>();
  for (const c of concepts) {
    const mine = own.get(c.id)!;
    const needs = links.filter((l) => l.thenId === c.id && own.has(l.firstId));
    const blocked = needs.some((l) => own.get(l.firstId) !== 'solid');
    result.set(c.id, mine === 'fresh' && blocked ? 'locked' : mine);
  }
  return result;
}

// The suggested next concept: something you are learning comes first, then the first unlocked one in page order.
export function nextConcept(concepts: ConceptFacts[], status: Map<number, Status>): number | null {
  const ordered = [...concepts].sort((a, b) => a.position - b.position);
  const learning = ordered.find((c) => status.get(c.id) === 'learning');
  if (learning) return learning.id;
  const fresh = ordered.find((c) => status.get(c.id) === 'fresh');
  return fresh ? fresh.id : null;
}

// Removes any link that would make a loop, so "A before B before A" can never happen.
export function withoutLoops(links: Link[]): Link[] {
  const kept: Link[] = [];
  const reaches = (from: number, to: number, seen = new Set<number>()): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return kept.filter((l) => l.firstId === from).some((l) => reaches(l.thenId, to, seen));
  };
  for (const link of links) {
    if (link.firstId === link.thenId) continue;
    if (kept.some((l) => l.firstId === link.firstId && l.thenId === link.thenId)) continue;
    if (reaches(link.thenId, link.firstId)) continue;
    kept.push(link);
  }
  return kept;
}
