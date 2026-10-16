// The design fix diagram: boxes for parts, arrows for links. Editable on the design fix screen,
// read-only for "One way to fix it". Positions are only for reading; they never affect the checks.
import { memo, useEffect, useRef, useState } from 'react';
import { applyNodeChanges, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, useStore, type Edge, type Node, type NodeChange, type NodeProps } from '@xyflow/react';
import type { Design, DesignPart } from '../graphql';
import { KIND_NAMES, PartIcon } from './PartIcon';

export type Selection = { type: 'part'; id: string } | { type: 'link'; from: string; to: string };
type PartData = { part: DesignPart; picked: boolean; editable: boolean };
type PartNode = Node<PartData, 'part'>;

const COL = 330;
const ROW = 110;

// Each part goes one column to the right of everything that links into it, so the flow reads left to right.
export function autoLayout(design: Design): Map<string, { x: number; y: number }> {
  const colOf = new Map<string, number>();
  const col = (id: string, seen: Set<string> = new Set()): number => {
    if (colOf.has(id)) return colOf.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const before = design.links.filter((l) => l.to === id).map((l) => col(l.from, seen));
    const value = before.length ? Math.max(...before) + 1 : 0;
    colOf.set(id, value);
    return value;
  };
  design.parts.forEach((p) => col(p.id));
  const used = new Map<number, number>();
  const places = new Map<string, { x: number; y: number }>();
  for (const p of design.parts) {
    const c = colOf.get(p.id)!;
    const r = used.get(c) ?? 0;
    used.set(c, r + 1);
    places.set(p.id, { x: c * COL, y: r * ROW });
  }
  return places;
}

// A new part goes below everything else, at the left, where it is easy to find and drag.
function freeSpot(nodes: PartNode[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 0, y: 0 };
  return { x: Math.min(...nodes.map((n) => n.position.x)), y: Math.max(...nodes.map((n) => n.position.y)) + ROW };
}

const toNode = (part: DesignPart, position: { x: number; y: number }, picked: boolean, editable: boolean): PartNode => ({
  id: part.id, type: 'part', position, data: { part, picked, editable },
  draggable: editable, connectable: editable, ariaLabel: `${KIND_NAMES[part.kind]}: ${part.label}`,
});

const PartBox = memo(function PartBox({ data }: NodeProps<PartNode>) {
  const { part, picked, editable } = data;
  return (
    <div className={`part${picked ? ' picked' : ''}`}>
      <Handle type="target" position={Position.Left} isConnectable={editable} />
      <span className="part-icon"><PartIcon kind={part.kind} /></span>
      <span className="part-text"><small>{KIND_NAMES[part.kind]}</small><b>{part.label}</b></span>
      <Handle type="source" position={Position.Right} isConnectable={editable} />
    </div>
  );
});
const nodeTypes = { part: PartBox };

// Fits the whole design again when a part is added, or when the canvas changes size, such as a phone turned sideways.
function KeepInView({ count }: { count: number }) {
  const flow = useReactFlow();
  const width = useStore((s) => s.width);
  const last = useRef({ count, width });
  useEffect(() => {
    const was = last.current;
    last.current = { count, width };
    if (count > was.count || (was.width > 0 && width !== was.width)) {
      requestAnimationFrame(() => { flow.fitView({ padding: 0.08, maxZoom: 1, duration: 200 }); });
    }
  }, [count, width, flow]);
  return null;
}

export function DesignCanvas(props: {
  design: Design;
  label: string;
  editable?: boolean;
  selected?: Selection | null;
  onSelect?: (s: Selection | null) => void;
  onConnect?: (from: string, to: string) => void;
  height?: number;
}) {
  const { design, selected } = props;
  const editable = !!props.editable;
  const pickedPart = selected?.type === 'part' ? selected.id : null;
  const [nodes, setNodes] = useState<PartNode[]>(() => {
    const at = autoLayout(design);
    return design.parts.map((p) => toNode(p, at.get(p.id)!, false, editable));
  });

  // Keep the boxes in step with the parts: new parts get a free spot, removed ones go, moved ones stay put.
  useEffect(() => {
    setNodes((prev) => {
      const next: PartNode[] = [];
      for (const p of design.parts) {
        const old = prev.find((n) => n.id === p.id);
        next.push(toNode(p, old ? old.position : freeSpot([...prev, ...next]), p.id === pickedPart, editable));
      }
      return next;
    });
  }, [design.parts, pickedPart, editable]);

  const edges: Edge[] = design.links.map((l) => {
    const on = selected?.type === 'link' && selected.from === l.from && selected.to === l.to;
    const color = on ? 'var(--accent)' : 'var(--edge)';
    return {
      id: `${l.from}->${l.to}`,
      source: l.from,
      target: l.to,
      style: { stroke: color, strokeWidth: on ? 2.75 : 1.75, strokeDasharray: l.style === 'event' ? '7 6' : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      label: on ? (l.style === 'event' ? 'sends an event' : 'waits for a reply') : undefined,
      focusable: false,
      interactionWidth: 20,
    };
  });

  return (
    <div role="group" aria-label={props.label} className={`design-canvas${editable ? ' editable' : ''}`} style={props.height ? { height: props.height } : undefined}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes: NodeChange<PartNode>[]) => setNodes((n) => applyNodeChanges(changes.filter((c) => c.type === 'position' || c.type === 'dimensions'), n))}
        onNodeClick={(_, n) => props.onSelect?.({ type: 'part', id: n.id })}
        onEdgeClick={(_, e) => props.onSelect?.({ type: 'link', from: e.source, to: e.target })}
        onPaneClick={() => props.onSelect?.(null)}
        onConnect={(c) => { if (c.source && c.target) props.onConnect?.(c.source, c.target); }}
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable={editable}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
        minZoom={0.4}
        maxZoom={1.5}
        zoomOnScroll={false}
        preventScrolling={false}
      >
        <KeepInView count={design.parts.length} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
