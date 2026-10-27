import { describe, expect, it } from 'vitest';
import { BOSS, START, generateChart, nodeAt, passages, validateChart } from './chart';

describe('seeded branching chart', () => {
  it('satisfies every topology constraint for 100 seeds', () => {
    const layouts = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const chart = generateChart(seed); layouts.add(JSON.stringify(chart));
      expect(chart.fallback).toBe(false); expect(validateChart(chart)).toBe(true);
      expect(chart.nodes).toHaveLength(17);
      const port = chart.nodes.find(n => n.kind === 'port')!;
      expect(port.depth).toBe(3);
      for (const node of chart.nodes) {
        const outgoing = passages(chart, node.id);
        expect(outgoing.length).toBe(node.depth === 6 ? 0 : node.depth === 5 ? 1 : outgoing.length);
        if (node.depth < 5) { expect(outgoing.length).toBeGreaterThanOrEqual(2); expect(outgoing.length).toBeLessThanOrEqual(3); }
        expect(new Set(outgoing.map(e => e.to)).size).toBe(outgoing.length);
        if (node.depth < 6) expect(outgoing.some(e => e.jumpCost === 1)).toBe(true);
        if (node.depth === 2) { expect(node.kind).toBe('battle'); expect(outgoing.some(e => e.to === port.id)).toBe(true); expect(outgoing.some(e => e.to !== port.id)).toBe(true); }
        if (node.depth === 5) expect(outgoing[0].to).toBe(BOSS);
        for (const edge of outgoing) {
          const to = nodeAt(chart, edge.to)!;
          expect(to.depth).toBe(node.depth + 1);
          if (node.encounterId) expect(to.encounterId).not.toBe(node.encounterId);
        }
      }
      const seen = new Set([START]);
      for (let depth = 0; depth <= 5; depth++) for (const e of chart.edges) if (seen.has(e.from)) seen.add(e.to);
      expect(seen.size).toBe(17);
      const canFinish = new Set([BOSS]);
      for (let depth = 5; depth >= 0; depth--) for (const e of chart.edges) if (canFinish.has(e.to)) canFinish.add(e.from);
      expect(canFinish.size).toBe(17);
      expect(chart.nodes.filter(n => n.depth === 4 && n.kind === 'battle')).toHaveLength(1);
      expect(chart.nodes.filter(n => n.depth === 4 && n.kind === 'encounter')).toHaveLength(2);
    }
    expect(layouts.size).toBeGreaterThan(90);
  });
  it('regenerates deterministically without combat random state', () => {
    for (let seed = 0; seed < 100; seed++) expect(generateChart(seed)).toEqual(generateChart(seed));
  });
  it.each(['duplicate', 'orphan', 'backwards', 'invalid cost', 'unknown', 'repeat encounter', 'single choice', 'no normal'])('rejects %s edges', kind => {
    const c = generateChart(7);
    if (kind === 'duplicate') c.edges.push({...c.edges[0]});
    if (kind === 'orphan') c.edges = c.edges.filter(e => e.to !== 'sea-1-0');
    if (kind === 'backwards') c.edges[0].to = START;
    if (kind === 'unknown') c.edges[0].from = 'missing';
    if (kind === 'invalid cost') Object.assign(c.edges[0], {jumpCost:3});
    if (kind === 'single choice') c.edges = c.edges.filter(e => e.from !== START || e === c.edges[0]);
    if (kind === 'no normal') c.edges.filter(e=>e.from === START).forEach(e=>e.jumpCost=2);
    if (kind === 'repeat encounter') {
      const edge = c.edges.find(e=>nodeAt(c,e.from)?.depth === 3 && nodeAt(c,e.from)?.kind === 'encounter' && nodeAt(c,e.to)?.kind === 'encounter')!;
      nodeAt(c,edge.to)!.encounterId = nodeAt(c,edge.from)!.encounterId;
    }
    expect(validateChart(c)).toBe(false);
  });
  it('uses a known valid authored fallback on invalid or failed generation', () => {
    const fallback = generateChart(17, () => ({nodes:[],edges:[],fallback:false}));
    expect(fallback.fallback).toBe(true); expect(validateChart(fallback)).toBe(true);
    expect(generateChart(9,()=>{throw Error('generation failed');})).toEqual(fallback);
    expect(fallback.edges.every(e=>e.jumpCost === 1)).toBe(true);
  });
});
