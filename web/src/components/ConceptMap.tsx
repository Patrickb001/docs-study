// The concept map: boxes for concepts, arrows for "learn this first".
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps, type Viewport } from '@xyflow/react';
import type { Concept, Link } from '../graphql';
import { exerciseOf } from '../exercises';

const WIDTH = 176;
const HEIGHT = 60;
const X_STEP = 216;
const Y_STEP = 116;

// What a concept's box says under its name: the one thing that matters about it right now.
export function stateText(c: Concept): string {
  if (c.status === 'solid') return 'Solid';
  if (c.status === 'locked') return c.needs.length ? `After ${c.needs[0]}${c.needs.length > 1 ? ` +${c.needs.length - 1}` : ''}` : 'Locked';
  if (c.status === 'fresh') return 'Not started';
  if (c.quizState !== 'passed') return 'Quiz not passed yet';
  if (c.bugState === 'open') return exerciseOf(c.exerciseKind).open;
  return 'Needs a refresher';
}

type ConceptNode = Node<{ concept: Concept; next: boolean; picked: boolean }, 'concept'>;

function ConceptBox({ data }: NodeProps<ConceptNode>) {
  const { concept: c, next, picked } = data;
  const quiz = c.quizState === 'passed' ? 'done' : c.quizState === 'tried' ? 'tried' : '';
  return (
    <div className={`node ${c.status}${next ? ' next' : ''}${picked ? ' picked' : ''}`} title={c.name}>
      <Handle type="target" position={Position.Top} />
      <span className="node-name">{c.name}</span>
      <span className="node-state">{next ? 'Suggested next' : stateText(c)}</span>
      {/* Progress inside the concept: the quiz, then the bug hunt if it has one. */}
      {c.status !== 'locked' && (
        <span className="node-pips" aria-hidden="true">
          <i className={quiz} />
          {c.bugState !== 'none' && <i className={c.bugState === 'fixed' ? 'done' : ''} />}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { concept: ConceptBox };

// Places each concept on a row below everything it depends on.
export function layout(concepts: Concept[], links: Link[]): Map<string, { x: number; y: number }> {
  const ids = new Set(concepts.map((c) => c.id));
  const real = links.filter((l) => ids.has(l.firstId) && ids.has(l.thenId));
  const rowOf = new Map<string, number>();
  const row = (id: string, seen: Set<string> = new Set()): number => {
    if (rowOf.has(id)) return rowOf.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = real.filter((l) => l.thenId === id).map((l) => row(l.firstId, seen));
    const value = parents.length ? Math.max(...parents) + 1 : 0;
    rowOf.set(id, value);
    return value;
  };
  concepts.forEach((c) => row(c.id));
  const rows = new Map<number, Concept[]>();
  for (const c of concepts) rows.set(rowOf.get(c.id)!, [...(rows.get(rowOf.get(c.id)!) ?? []), c]);
  // Rows with many unlinked concepts wrap, so the map never grows wider than six boxes.
  const places = new Map<string, { x: number; y: number }>();
  let y = 0;
  for (const key of [...rows.keys()].sort((a, b) => a - b)) {
    const items = rows.get(key)!;
    for (let start = 0; start < items.length; start += 6) {
      const slice = items.slice(start, start + 6);
      slice.forEach((c, i) => places.set(c.id, { x: (i - (slice.length - 1) / 2) * X_STEP - WIDTH / 2, y }));
      y += Y_STEP;
    }
  }
  return places;
}

// Where the map opens. The whole map shows when it is readable. A big map would shrink past
// reading size, so it opens on your suggested next concept instead, and the zoom buttons show the rest.
export function startView(places: Map<string, { x: number; y: number }>, focus: { x: number; y: number } | null, width: number, height: number): Viewport {
  const all = [...places.values()];
  const minX = Math.min(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const w = Math.max(...all.map((p) => p.x)) - minX + WIDTH;
  const h = Math.max(...all.map((p) => p.y)) - minY + HEIGHT;
  const fit = Math.min(width / (w * 1.24), height / (h * 1.24), 1);
  const [zoom, cx, cy] = fit >= 0.6 || !focus ? [fit, minX + w / 2, minY + h / 2] : [0.9, focus.x + WIDTH / 2, focus.y + HEIGHT * 2];
  return { x: width / 2 - cx * zoom, y: height / 2 - cy * zoom, zoom };
}

export function ConceptMap(props: { concepts: Concept[]; links: Link[]; nextId: string | null; pickedId: string | null; onPick: (id: string) => void }) {
  const { concepts, links, nextId, pickedId } = props;
  const places = useMemo(() => layout(concepts, links), [concepts, links]);
  const statusOf = useMemo(() => new Map(concepts.map((c) => [c.id, c.status])), [concepts]);
  // The box is measured before the first paint, so the map opens in the right place with no jump.
  const box = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<Viewport | null>(null);
  useLayoutEffect(() => {
    const r = box.current!.getBoundingClientRect();
    setStart(startView(places, nextId ? places.get(nextId) ?? null : null, r.width, r.height));
    // Only on first open. Later changes, such as a concept turning solid, keep your view.
  }, []);

  const nodes: ConceptNode[] = concepts.map((c) => ({
    id: c.id,
    type: 'concept',
    position: places.get(c.id)!,
    data: { concept: c, next: c.id === nextId, picked: c.id === pickedId },
    draggable: false,
    connectable: false,
    ariaLabel: `${c.name}, ${c.id === nextId ? 'suggested next, ' : ''}${stateText(c)}`,
  }));
  const edges: Edge[] = links.map((l) => {
    // Arrows into a locked concept are dashed, so the open paths stand out.
    const locked = statusOf.get(l.thenId) === 'locked';
    return {
      id: l.id,
      source: l.firstId,
      target: l.thenId,
      type: 'smoothstep',
      style: locked ? { strokeDasharray: '5 5' } : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--edge)', width: 16, height: 16 },
      focusable: false,
      selectable: false,
    };
  });
  return (
    <div ref={box} style={{ width: '100%', height: '100%' }}>
      {start && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultViewport={start}
          onNodeClick={(_, node) => props.onPick(node.id)}
          // Keyboard users select a box with Enter, which arrives here rather than as a click.
          onSelectionChange={({ nodes: chosen }) => { if (chosen.length === 1 && chosen[0].id !== pickedId) props.onPick(chosen[0].id); }}
          fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
          minZoom={0.25}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          zoomOnScroll={false}
          preventScrolling={false}
        >
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      )}
    </div>
  );
}
