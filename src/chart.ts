import { seeded } from './combat';
export type NodeKind = 'start' | 'encounter' | 'battle' | 'port' | 'boss';
export type EncounterId = 'drowned-bell' | 'widows-passage';
export interface ChartNode { id: string; depth: number; lane: number; kind: NodeKind; name: string; shortName: string; encounterId?: EncounterId }
export interface Edge { from: string; to: string; jumpCost: 1 | 2 }
export interface Chart { nodes: ChartNode[]; edges: Edge[]; fallback: boolean }
export const START = 'anchorage', BOSS = 'pale-sovereign';
export const nodeAt = (chart: Chart, id: string) => chart.nodes.find(n => n.id === id);
export const passages = (chart: Chart, id: string) => chart.edges.filter(e => e.from === id);
function authored(seed: number, randomize: boolean): Chart {
  const rng = seeded(seed ^ 0x534541);
  const portLane = randomize ? Math.floor(rng() * 3) : 1;
  const battleLane = randomize ? Math.floor(rng() * 3) : 0;
  const firstBell = !randomize || rng() < .5;
  const nodes: ChartNode[] = [{ id: START, depth: 0, lane: 1, kind: 'start', name: 'Wayward anchorage', shortName: 'Anchor' }];
  for (let depth = 1; depth <= 5; depth++) for (let lane = 0; lane < 3; lane++) {
    const id = `sea-${depth}-${lane}`;
    const kind: NodeKind = depth === 2 || depth === 4 && lane === battleLane ? 'battle' : depth === 3 && lane === portLane ? 'port' : 'encounter';
    // Odd depths have the same encounter family, depth 4 the other: no
    // encounter-to-encounter edge repeats its predecessor's definition.
    const encounterId: EncounterId = (depth % 2 === 1) === firstBell ? 'drowned-bell' : 'widows-passage';
    const name = kind === 'battle' ? 'The Black Fin' : kind === 'port' ? 'Lantern Cay' : encounterId === 'drowned-bell' ? 'The Drowned Bell' : 'Widow’s Passage';
    nodes.push({ id, depth, lane, kind, name: `${name}${kind === 'encounter' ? ` · ${['Shallows', 'Reach', 'Sound'][lane]}` : ''}`, shortName: kind === 'battle' ? 'Black Fin' : kind === 'port' ? 'Lantern Cay' : encounterId === 'drowned-bell' ? 'Bell' : 'Widow', ...(kind === 'encounter' ? { encounterId } : {}) });
  }
  nodes.push({ id: BOSS, depth: 6, lane: 1, kind: 'boss', name: 'The Pale Sovereign', shortName: 'Sovereign' });
  const edges: Edge[] = [];
  for (const node of nodes.filter(n => n.depth < 6)) {
    let destinations = nodes.filter(n => n.depth === node.depth + 1);
    if (node.depth > 0 && node.depth < 5) {
      // Same-lane and next-lane cover every destination. Depth 2 always
      // includes Lantern Cay while retaining a distinct alternative.
      const lanes = new Set([node.lane, (node.lane + 1) % 3]);
      if (node.depth === 2) lanes.add(portLane);
      if (randomize && rng() < .3) lanes.add((node.lane + 2) % 3);
      destinations = destinations.filter(n => lanes.has(n.lane));
    }
    destinations.forEach((to, i) => edges.push({ from: node.id, to: to.id, jumpCost: i === 0 || !randomize ? 1 : rng() < .45 ? 2 : 1 }));
  }
  return { nodes, edges, fallback: !randomize };
}
export function validateChart(chart: Chart): boolean {
  const { nodes, edges } = chart;
  if (nodes.length !== 17 || new Set(nodes.map(n => n.id)).size !== nodes.length) return false;
  for (let d = 0; d <= 6; d++) if (nodes.filter(n => n.depth === d).length !== (d === 0 || d === 6 ? 1 : 3)) return false;
  if (nodeAt(chart, START)?.kind !== 'start' || nodeAt(chart, START)?.depth !== 0 || nodeAt(chart, BOSS)?.kind !== 'boss' || nodeAt(chart, BOSS)?.depth !== 6) return false;
  const ports = nodes.filter(n => n.kind === 'port');
  if (ports.length !== 1 || ports[0].depth !== 3) return false;
  if (nodes.filter(n => n.depth === 4 && n.kind === 'battle').length !== 1) return false;
  for (const n of nodes) {
    if (!Number.isInteger(n.lane) || n.lane < 0 || n.lane > 2) return false;
    if (n.depth > 0 && n.depth < 6 && (!Number.isInteger(n.lane) || n.lane < 0 || n.lane > 2 || nodes.filter(o => o.depth === n.depth && o.lane === n.lane).length !== 1)) return false;
    if (n.depth === 2 && n.kind !== 'battle') return false;
    if ([1, 5].includes(n.depth) && n.kind !== 'encounter') return false;
    if (n.depth === 3 && !['port', 'encounter'].includes(n.kind) || n.depth === 4 && !['battle', 'encounter'].includes(n.kind)) return false;
    if (n.kind === 'encounter' && !['drowned-bell', 'widows-passage'].includes(n.encounterId || '')) return false;
    const outgoing = passages(chart, n.id);
    if (new Set(outgoing.map(e => e.to)).size !== outgoing.length) return false;
    if (n.depth === 6 ? outgoing.length !== 0 : n.depth === 5 ? outgoing.length !== 1 || outgoing[0].to !== BOSS : outgoing.length < 2 || outgoing.length > 3) return false;
    if (n.depth < 6 && !outgoing.some(e => e.jumpCost === 1)) return false;
    if (n.depth === 2 && !outgoing.some(e => e.to === ports[0].id)) return false;
  }
  for (const e of edges) {
    const from = nodeAt(chart, e.from), to = nodeAt(chart, e.to);
    if (!from || !to || to.depth !== from.depth + 1 || ![1, 2].includes(e.jumpCost)) return false;
    if (from.encounterId && from.encounterId === to.encounterId) return false;
  }
  const reachable = new Set([START]);
  for (let d = 0; d < 6; d++) edges.filter(e => reachable.has(e.from)).forEach(e => reachable.add(e.to));
  const reachesBoss = new Set([BOSS]);
  for (let d = 5; d >= 0; d--) edges.filter(e => reachesBoss.has(e.to)).forEach(e => reachesBoss.add(e.from));
  return nodes.every(n => reachable.has(n.id) && reachesBoss.has(n.id));
}
export function generateChart(seed: number, candidate: (seed: number) => Chart = s => authored(s, true)): Chart {
  try { const chart = candidate(seed); if (validateChart(chart)) return chart; } catch { /* use known valid graph */ }
  return authored(0, false);
}
