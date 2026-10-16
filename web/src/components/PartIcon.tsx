// One small icon per kind of part, so a design reads at a glance.
import type { ReactNode } from 'react';
import type { PartKind } from '../graphql';

export const KIND_NAMES: Record<PartKind, string> = {
  user: 'User', service: 'Service', database: 'Database', queue: 'Message queue', topic: 'Pub/sub topic',
  cache: 'Cache', loadBalancer: 'Load balancer', gateway: 'API gateway', sessionStore: 'Session store', function: 'Serverless function',
};

const SHAPES: Record<PartKind, ReactNode> = {
  user: <><circle cx="9" cy="6" r="3" /><path d="M3.5 15.5c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /></>,
  service: <><rect x="2.5" y="3.5" width="13" height="11" rx="2" /><path d="M5.5 7.5h7M5.5 10.5h4" /></>,
  database: <><ellipse cx="9" cy="4.5" rx="5.5" ry="2" /><path d="M3.5 4.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9" /><path d="M3.5 9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" /></>,
  queue: <><rect x="2" y="5.5" width="4" height="7" rx="1" /><rect x="7" y="5.5" width="4" height="7" rx="1" /><rect x="12" y="5.5" width="4" height="7" rx="1" /></>,
  topic: <><circle cx="9" cy="9" r="1.8" /><path d="M5.5 5.5a5 5 0 0 0 0 7M12.5 5.5a5 5 0 0 1 0 7M3.3 3.3a8 8 0 0 0 0 11.4M14.7 3.3a8 8 0 0 1 0 11.4" /></>,
  cache: <path d="M10 2.5 4.5 10H9l-1 5.5L13.5 8H9l1-5.5z" />,
  loadBalancer: <><circle cx="4" cy="9" r="1.8" /><path d="M5.8 9h3M8.8 9l5-4.5M8.8 9h5M8.8 9l5 4.5" /></>,
  gateway: <><path d="M3.5 15.5V7a5.5 5.5 0 0 1 11 0v8.5" /><path d="M2.5 15.5h13M9 9.5v6" /></>,
  sessionStore: <><circle cx="6" cy="9" r="3" /><path d="M9 9h6.5M13 9v2.5M15.5 9v2" /></>,
  function: <path d="M5 3.5h2l5 11h2M9.5 8.5l-4 6" />,
};

export function PartIcon({ kind }: { kind: PartKind }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {SHAPES[kind]}
    </svg>
  );
}
