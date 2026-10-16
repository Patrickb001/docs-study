// A design fix used by the tests: an event-driven shop where Order service waits on Inventory.
import type { NewDesign } from './designCheck.ts';

export const SHOP_DESIGN: NewDesign = {
  scenario: 'A shop takes orders on the web. Each order must reserve stock in Inventory. Inventory sometimes goes down for a few minutes during deploys.',
  goals: ['Orders are accepted while Inventory is down', 'Every order still reserves stock later'],
  broken: {
    parts: [
      { id: 'web', kind: 'user', label: 'Web shop' },
      { id: 'orders', kind: 'service', label: 'Order service' },
      { id: 'inventory', kind: 'service', label: 'Inventory service' },
      { id: 'ordersDb', kind: 'database', label: 'Orders DB' },
    ],
    links: [
      { from: 'web', to: 'orders', style: 'call' },
      { from: 'orders', to: 'inventory', style: 'call' },
      { from: 'orders', to: 'ordersDb', style: 'call' },
    ],
  },
  palette: [
    { kind: 'queue', label: 'Order events queue' },
    { kind: 'cache', label: 'Cache' },
    { kind: 'loadBalancer', label: 'Load balancer' },
  ],
  working: {
    parts: [
      { id: 'web', kind: 'user', label: 'Web shop' },
      { id: 'orders', kind: 'service', label: 'Order service' },
      { id: 'inventory', kind: 'service', label: 'Inventory service' },
      { id: 'ordersDb', kind: 'database', label: 'Orders DB' },
      { id: 'queue-1', kind: 'queue', label: 'Order events queue' },
    ],
    links: [
      { from: 'web', to: 'orders', style: 'call' },
      { from: 'orders', to: 'ordersDb', style: 'call' },
      { from: 'orders', to: 'queue-1', style: 'event' },
      { from: 'queue-1', to: 'inventory', style: 'event' },
    ],
  },
  checks: [
    { name: 'Order service never waits on Inventory service', rule: { type: 'neverWaits', from: { id: 'orders' }, to: { id: 'inventory' } } },
    { name: 'Orders reach Inventory service through a queue', rule: { type: 'path', from: { id: 'orders' }, to: { id: 'inventory' }, via: 'queue' } },
    { name: 'Orders are still saved in Orders DB', rule: { type: 'path', from: { id: 'orders' }, to: { id: 'ordersDb' } } },
  ],
  hints: [
    'Ask what Order service does when Inventory service does not answer.',
    'A part that holds messages until the receiver is ready lets the sender move on.',
    'Send orders to a message queue as events, and let Inventory service read them from the queue.',
  ],
};
