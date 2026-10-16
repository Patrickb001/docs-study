// The design fix checker: rules about boxes and arrows, and the checks every generated puzzle must pass.
import { describe, expect, test } from 'vitest';
import { parseSubmitted, runChecks, verifyDesign, type DesignGraph, type Rule } from './designCheck.ts';
import { SHOP_DESIGN } from './design.fixture.ts';

const g = (parts: [string, string, string][], links: [string, string, ('call' | 'event')?][]): DesignGraph => ({
  parts: parts.map(([id, kind, label]) => ({ id, kind: kind as any, label })),
  links: links.map(([from, to, style]) => ({ from, to, style: style ?? 'call' })),
});
const one = (graph: DesignGraph, rule: Rule, known = new Map<string, string>()) => runChecks(graph, [{ name: 'check', rule }], known)[0];
const AB = [['a', 'service', 'A'], ['b', 'service', 'B']] as [string, string, string][];

describe('path', () => {
  test('passes when an arrow connects the two parts', () => {
    expect(one(g(AB, [['a', 'b']]), { type: 'path', from: { id: 'a' }, to: { id: 'b' } })).toEqual({ name: 'check', pass: true, message: '' });
  });
  test('fails with a plain message when nothing connects them', () => {
    expect(one(g(AB, []), { type: 'path', from: { id: 'a' }, to: { id: 'b' } }).message).toBe('Nothing connects A to B.');
  });
  test('with via, passes only through a part of that kind', () => {
    const through = g([...AB, ['q', 'queue', 'Q']], [['a', 'q', 'event'], ['q', 'b', 'event']]);
    expect(one(through, { type: 'path', from: { id: 'a' }, to: { id: 'b' }, via: 'queue' }).pass).toBe(true);
    expect(one(g(AB, [['a', 'b']]), { type: 'path', from: { id: 'a' }, to: { id: 'b' }, via: 'queue' }).message).toBe('A reaches B, but not through a message queue.');
  });
  test('a kind target matches a part the user added', () => {
    const added = g([...AB, ['database-1', 'database', 'Orders DB']], [['a', 'database-1']]);
    expect(one(added, { type: 'path', from: { id: 'a' }, to: { kind: 'database' } }).pass).toBe(true);
    expect(one(g(AB, []), { type: 'path', from: { id: 'a' }, to: { kind: 'database' } }).message).toBe('Nothing connects A to a database.');
  });
  test('a part the user removed is still named by its original label', () => {
    const removed = g([['a', 'service', 'A']], []);
    const r = one(removed, { type: 'path', from: { id: 'a' }, to: { id: 'b' } }, new Map([['b', 'Inventory service']]));
    expect(r).toEqual({ name: 'check', pass: false, message: 'Inventory service is missing from the design. Use Reset design to bring it back.' });
  });
});

describe('a part that a check names is removed', () => {
  // Without this, deleting the part a check is about would make "never waits" and "no direct arrow" pass.
  const removed = g([['a', 'service', 'A']], []);
  const known = new Map([['b', 'Inventory service']]);
  test('neverWaits fails instead of passing', () => {
    expect(one(removed, { type: 'neverWaits', from: { id: 'a' }, to: { id: 'b' } }, known)).toEqual({ name: 'check', pass: false, message: 'Inventory service is missing from the design. Use Reset design to bring it back.' });
  });
  test('noLink fails instead of passing', () => {
    expect(one(removed, { type: 'noLink', from: { id: 'a' }, to: { id: 'b' } }, known).pass).toBe(false);
  });
});

describe('neverWaits', () => {
  test('fails on a direct call', () => {
    expect(one(g(AB, [['a', 'b']]), { type: 'neverWaits', from: { id: 'a' }, to: { id: 'b' } }).message).toBe('A still waits on B.');
  });
  test('names the part in the middle of a chain of calls', () => {
    const chain = g([...AB, ['c', 'service', 'C']], [['a', 'c'], ['c', 'b']]);
    expect(one(chain, { type: 'neverWaits', from: { id: 'a' }, to: { id: 'b' } }).message).toBe('A still waits on B (through C).');
  });
  test('passes when the arrow sends an event, or when only a part further along waits', () => {
    expect(one(g(AB, [['a', 'b', 'event']]), { type: 'neverWaits', from: { id: 'a' }, to: { id: 'b' } }).pass).toBe(true);
    const mixed = g([...AB, ['c', 'queue', 'C']], [['a', 'c', 'event'], ['c', 'b', 'call']]);
    expect(one(mixed, { type: 'neverWaits', from: { id: 'a' }, to: { id: 'b' } }).pass).toBe(true);
  });
});

describe('noLink', () => {
  test('fails on a direct arrow of either style, passes on an indirect one', () => {
    expect(one(g(AB, [['a', 'b', 'event']]), { type: 'noLink', from: { id: 'a' }, to: { id: 'b' } }).message).toBe('A still connects straight to B.');
    const indirect = g([...AB, ['c', 'queue', 'C']], [['a', 'c'], ['c', 'b']]);
    expect(one(indirect, { type: 'noLink', from: { id: 'a' }, to: { id: 'b' } }).pass).toBe(true);
  });
});

describe('count', () => {
  test('asks for the missing parts in plain words', () => {
    expect(one(g([['a', 'service', 'A']], []), { type: 'count', kind: 'service', min: 2 }).message).toBe('The design needs at least 2 services.');
    expect(one(g(AB, []), { type: 'count', kind: 'queue', min: 1 }).message).toBe('The design needs a message queue.');
    expect(one(g(AB, []), { type: 'count', kind: 'service', min: 2 }).pass).toBe(true);
  });
});

describe('allLinkTo', () => {
  const rule: Rule = { type: 'allLinkTo', fromKind: 'service', toKind: 'sessionStore' };
  test('names the part that is not connected', () => {
    const one2 = g([['s1', 'service', 'Server 1'], ['s2', 'service', 'Server 2'], ['st', 'sessionStore', 'Sessions']], [['s1', 'st']]);
    expect(one(one2, rule).message).toBe('Server 2 is not connected to a session store.');
  });
  test('fails when there are no parts of the kind at all', () => {
    expect(one(g([['st', 'sessionStore', 'Sessions']], []), rule).message).toBe('The design has no services.');
  });
  test('passes when every part of the kind is connected', () => {
    const all = g([['s1', 'service', 'Server 1'], ['s2', 'service', 'Server 2'], ['st', 'sessionStore', 'Sessions']], [['s1', 'st'], ['s2', 'st']]);
    expect(one(all, rule).pass).toBe(true);
  });
});

describe('verifyDesign', () => {
  test('accepts a puzzle whose working design passes and broken design fails', () => {
    expect(verifyDesign(SHOP_DESIGN)).toEqual({ ok: true, design: SHOP_DESIGN });
  });
  test('the shop puzzle fails the right checks on its broken design', () => {
    const results = runChecks(SHOP_DESIGN.broken, SHOP_DESIGN.checks, new Map());
    expect(results.map((r) => r.pass)).toEqual([false, false, true]);
    expect(results[0].message).toBe('Order service still waits on Inventory service.');
  });
  const broken = (change: (d: any) => void) => {
    const d = structuredClone(SHOP_DESIGN) as any;
    change(d);
    return verifyDesign(d);
  };
  test('rejects an unknown kind of part', () => {
    expect(broken((d) => { d.broken.parts[0].kind = 'robot'; })).toMatchObject({ ok: false });
  });
  test('rejects an arrow to a part that does not exist', () => {
    expect(broken((d) => { d.broken.links.push({ from: 'orders', to: 'ghost', style: 'call' }); })).toEqual({ ok: false, reason: 'A link in the broken design points at a part that does not exist: ghost.' });
  });
  test('rejects a check that names a part missing from the broken design', () => {
    expect(broken((d) => { d.checks[2].rule.to = { id: 'payments' }; })).toEqual({ ok: false, reason: 'The check "Orders are still saved in Orders DB" names a part that is not in the broken design: payments.' });
  });
  test('rejects a working design that needs a part the user cannot add', () => {
    expect(broken((d) => { d.palette = [{ kind: 'cache', label: 'Cache' }, { kind: 'loadBalancer', label: 'Load balancer' }]; })).toEqual({ ok: false, reason: 'The working design uses a message queue, which the user cannot add.' });
  });
  test('rejects a broken design that already passes', () => {
    expect(broken((d) => { d.checks = [d.checks[2], d.checks[2]]; })).toEqual({ ok: false, reason: 'The broken design already passes every check.' });
  });
  test('rejects a working design that fails a check', () => {
    expect(broken((d) => { d.working.links = d.working.links.filter((l: any) => l.to !== 'ordersDb'); })).toEqual({ ok: false, reason: 'The working design fails: Orders are still saved in Orders DB. Nothing connects Order service to Orders DB.' });
  });
});

describe('parseSubmitted', () => {
  test('reads a design sent from the screen', () => {
    expect(parseSubmitted(JSON.stringify(SHOP_DESIGN.working))).toEqual(SHOP_DESIGN.working);
  });
  test('refuses broken JSON, unknown kinds, and designs over the size limit', () => {
    expect(parseSubmitted('{not json')).toBeNull();
    expect(parseSubmitted(JSON.stringify({ parts: [{ id: 'a', kind: 'robot', label: 'A' }], links: [] }))).toBeNull();
    const huge = { parts: Array.from({ length: 41 }, (_, i) => ({ id: `s${i}`, kind: 'service', label: `S${i}` })), links: [] };
    expect(parseSubmitted(JSON.stringify(huge))).toBeNull();
  });
});
