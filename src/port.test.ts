import { describe, expect, it } from 'vitest';
import { createRun, completeVisit, initializePort } from './run';
import { createPortStock, purchase, quotePurchase, type ItemId } from './port';

function atPort(seed = 42) {
  const run = createRun(seed), node = run.chart.nodes.find(n => n.kind === 'port')!;
  run.currentNode = node.id; run.screen = 'port'; run.activeVisit = { id: `visit:${seed}`, nodeId: node.id };
  const stock = createPortStock(seed, node.id); run.activeVisit.stock = stock;
  return { run, stock };
}
const prices: [ItemId, number][] = [['repair', 15], ['recruit-gunner', 40], ['recruit-mender', 40], ['chainshot', 45], ['shipwrights-knot', 25], ['witchglass', 30]];
describe('Lantern Cay transactions', () => {
  it.each(prices)('%s debits exact funds and applies only its intended benefit', (id, price) => {
    const { run, stock } = atPort(); run.gold = price; run.player.hull = 100;
    const before = structuredClone(run);
    expect(quotePurchase(run, stock, id)).toMatchObject({ ok: true, price });
    expect(purchase(run, stock, id)).toEqual({ ok: true }); expect(run.gold).toBe(0);
    expect(run.player.hull).toBe(id === 'repair' ? 130 : 100);
    expect(run.player.ward).toBe(before.player.ward); expect(run.player.power).toEqual(before.player.power);
    expect(run.player.crew).toHaveLength(id.startsWith('recruit-') ? 4 : 3);
    if (id.startsWith('recruit-')) {
      const recruit = run.player.crew.at(-1)!;
      expect(recruit).toMatchObject({ health: 100, morale: 75, room: 5, destination: 5, travel: 0, faction: 'player', shipId: 'player', transit: null });
      expect(recruit.trait).toBe(id === 'recruit-gunner' ? 'Gunner' : 'Mender');
      expect(new Set(run.player.crew.map(p => p.id)).size).toBe(4);
    }
    expect(run.equipment.weapon).toBe(id === 'chainshot' ? 'chainshot' : 'roundshot');
    expect(run.equipment.charms).toEqual(id === 'shipwrights-knot' || id === 'witchglass' ? [id] : []);
    expect(stock.sold).toEqual(id === 'repair' ? [] : [id]); expect(run.journal).toHaveLength(1);
  });
  it.each(prices)('%s rejects one gold short without any mutation', (id, price) => {
    const { run, stock } = atPort(); run.gold = price - 1; run.player.hull = 100;
    const before = structuredClone(run);
    expect(purchase(run, stock, id)).toEqual({ ok: false, reason: 'Need 1 more gold' });
    expect(run).toEqual(before);
  });
  it('quotes partial repairs without mutation and allows deliberate repeats until full', () => {
    const { run, stock } = atPort(); run.gold = 60; run.player.hull = 140;
    const before = structuredClone(run);
    expect(quotePurchase(run, stock, 'repair')).toMatchObject({ ok: true, hullGain: 30 }); expect(run).toEqual(before);
    expect(purchase(run, stock, 'repair').ok).toBe(true);
    expect(quotePurchase(run, stock, 'repair')).toMatchObject({ ok: true, hullGain: 10, price: 15 });
    expect(purchase(run, stock, 'repair').ok).toBe(true); expect(run.player.hull).toBe(180); expect(run.gold).toBe(30);
    const full = structuredClone(run);
    expect(purchase(run, stock, 'repair')).toEqual({ ok: false, reason: 'Hull full' }); expect(run).toEqual(full);
    run.player.maxHull = 200;
    expect(quotePurchase(run, stock, 'repair')).toMatchObject({ ok: true, hullGain: 20 });
  });
  it('sells each recruit once and counts incapacitated crew at capacity', () => {
    const { run, stock } = atPort(); run.gold = 200;
    expect(purchase(run, stock, 'recruit-gunner').ok).toBe(true);
    const before = structuredClone(run);
    expect(purchase(run, stock, 'recruit-gunner')).toMatchObject({ ok: false, reason: 'Sold out' }); expect(run).toEqual(before);
    expect(purchase(run, stock, 'recruit-mender').ok).toBe(true); expect(run.player.crew).toHaveLength(5);
    run.player.crew[0].health = 0; stock.sold = [];
    const full = structuredClone(run);
    expect(purchase(run, stock, 'recruit-gunner')).toMatchObject({ ok: false, reason: 'Crew full' }); expect(run).toEqual(full);
  });
  it.each(['chainshot', 'shipwrights-knot', 'witchglass'] as const)('prevents duplicate %s even if the stock sold marker is absent', id => {
    const { run, stock } = atPort(); run.gold = 200;
    expect(purchase(run, stock, id).ok).toBe(true);
    const sold = structuredClone(run); expect(purchase(run, stock, id).ok).toBe(false); expect(run).toEqual(sold);
    stock.sold = []; const before = structuredClone(run);
    expect(purchase(run, stock, id)).toEqual({ ok: false, reason: 'Already owned' }); expect(run).toEqual(before);
  });
  it('rejects stale visits, foreign stock, terminal commands and unknown items atomically', () => {
    for (const invalidate of [
      ({ run }: ReturnType<typeof atPort>) => { run.screen = 'map'; },
      ({ run }: ReturnType<typeof atPort>) => { run.activeVisit = null; },
      ({ run }: ReturnType<typeof atPort>) => { run.terminalOutcome = 'lose'; },
      ({ run }: ReturnType<typeof atPort>) => { run.pendingTransition = true; },
      ({ run, stock }: ReturnType<typeof atPort>) => { run.activeVisit!.stock = structuredClone(stock); },
      ({ run }: ReturnType<typeof atPort>) => { run.currentNode = 'boss'; },
    ]) {
      const fixture = atPort(); fixture.run.gold = 100; invalidate(fixture); const before = structuredClone(fixture.run);
      expect(purchase(fixture.run, fixture.stock, 'chainshot').ok).toBe(false); expect(fixture.run).toEqual(before);
    }
    const { run, stock } = atPort(); const before = structuredClone(run);
    expect(purchase(run, stock, 'missing').ok).toBe(false); expect(purchase(run, null, 'repair').ok).toBe(false); expect(run).toEqual(before);
  });
  it('holds deterministic stock for the visit, departs with zero gold once, and resets the run', () => {
    const { run, stock } = atPort(); run.gold = 100;
    const adapter = { port: { createPortStock, quotePurchase, purchase, mount: () => ({ dispose() {} }) } };
    expect(createPortStock(run.seed, run.currentNode)).toEqual(stock);
    expect(createPortStock(run.seed + 1, run.currentNode).items[1].recruit!.id).not.toBe(stock.items[1].recruit!.id);
    purchase(run, stock, 'chainshot'); purchase(run, stock, 'witchglass');
    for (let i = 0; i < 5; i++) { expect(initializePort(run, adapter)).toBe(true); expect(run.activeVisit!.stock).toBe(stock); }
    expect(run.equipment).toEqual({ weapon: 'chainshot', charms: ['witchglass'] });
    const id = run.activeVisit!.id, front = run.fogFront; run.gold = 0;
    expect(completeVisit(run, id, { kind: 'port' })).toBe(true); expect(run.fogFront).toBe(front);
    expect(completeVisit(run, id, { kind: 'port' })).toBe(false);
    const before = structuredClone(run); expect(purchase(run, stock, 'repair').ok).toBe(false); expect(run).toEqual(before);
    const fresh = createRun(run.seed); expect(fresh).toMatchObject({ gold: 25, equipment: { weapon: 'roundshot', charms: [] }, activeVisit: null });
    expect(fresh.player.crew).toHaveLength(3); expect(fresh.player.hull).toBe(180);
  });
  it('matches the 60-gold economy choices', () => {
    for (const [ids, left] of [[['recruit-gunner', 'repair'], 5], [['chainshot', 'repair'], 0], [['shipwrights-knot', 'witchglass'], 5]] as const) {
      const { run, stock } = atPort(); run.gold = 60; run.player.hull = 140;
      for (const id of ids) expect(purchase(run, stock, id).ok).toBe(true);
      expect(run.gold).toBe(left);
    }
  });
});
