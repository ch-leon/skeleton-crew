import { seeded, type Pirate } from './combat';
import { nodeAt } from './chart';
import type { RunState, CommandResult } from './contracts';
import { CHARMS, WEAPONS, type CharmId } from './equipment';

export const PORT = { repairPrice: 15, repairHull: 30, recruitPrice: 40, chainshotPrice: 45, knotPrice: 25, witchglassPrice: 30, capacity: 5, charmSlots: 2, recruitHealth: 100, recruitMorale: 75, recruitRoom: 5 } as const;
export type ItemId = 'repair' | 'recruit-gunner' | 'recruit-mender' | 'chainshot' | CharmId;
export interface PortItem { id: ItemId; name: string; price: number; description: string; recruit?: Pirate }
export interface PortStock { seed: number; nodeId: string; items: PortItem[]; sold: ItemId[] }
export type PurchaseQuote = { ok: false; reason: string } | { ok: true; item: PortItem; price: number; effect: string; hullGain: number };
function nameSeed(seed: number, nodeId: string) {
  let hash = seed | 0;
  for (const char of nodeId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function createPortStock(seed: number, nodeId: string): PortStock {
  const rng = seeded(nameSeed(seed, nodeId));
  const names = [['Flint', 'Ash', 'Reef', 'Pike'], ['Mara', 'Wren', 'Tansy', 'Briar']];
  const recruits: PortItem[] = (['Gunner', 'Mender'] as const).map((trait, i) => {
    const name = names[i][Math.floor(rng() * names[i].length)];
    return { id: i === 0 ? 'recruit-gunner' : 'recruit-mender', name: `Recruit ${name}`, price: PORT.recruitPrice,
      description: `${trait} · 100 HP / 75 morale. Joins your crew in home Quarters. Counts toward the five-pirate limit, including incapacitated crew.`,
      recruit: { id: `recruit:${seed}:${nodeId}:${trait}`, faction: 'player', shipId: 'player', transit: null, name, trait, room: PORT.recruitRoom, destination: PORT.recruitRoom, travel: 0, health: PORT.recruitHealth, morale: PORT.recruitMorale } };
  });
  return { seed, nodeId, sold: [], items: [
    { id: 'repair', name: 'Oak & pitch', price: PORT.repairPrice, description: 'Repair up to 30 hull, capped at maximum hull. Fixed price of 15 gold, including partial repairs. Unlimited stock.' },
    ...recruits,
    { id: 'chainshot', name: 'Chainshot cannon', price: PORT.chainshotPrice, description: `Replaces Roundshot for this voyage. Chainshot: ${WEAPONS.chainshot.damage} hull/ward damage, ${WEAPONS.chainshot.reload}s reload at power 2, ×${WEAPONS.chainshot.roomMultiplier} unabsorbed room damage (18 unwarded). Roundshot: ${WEAPONS.roundshot.damage} damage, ${WEAPONS.roundshot.reload}s reload, ×${WEAPONS.roundshot.roomMultiplier} room damage (20 unwarded). Dodge, ward absorption and Gunner bonus still apply. No extra power or weapon slot.` },
    { id: 'shipwrights-knot', name: CHARMS['shipwrights-knot'].name, price: PORT.knotPrice, description: 'Auto-equips in one of two charm slots. Friendly crew extinguish fires, seal breaches and repair rooms 20% faster on their home ship. No bonus to hull repair, movement or melee.' },
    { id: 'witchglass', name: CHARMS.witchglass.name, price: PORT.witchglassPrice, description: 'Auto-equips in one of two charm slots. Ward capacity 12 → 16; recharge rate unchanged. Does not refill ward now. Next combat starts at the new capacity.' },
  ] };
}
export function isPortStock(value: unknown): value is PortStock {
  return !!value && typeof value === 'object' && 'items' in value && Array.isArray(value.items) && 'sold' in value && Array.isArray(value.sold) && 'seed' in value && 'nodeId' in value;
}
export function quotePurchase(run: RunState, value: unknown, itemId: string): PurchaseQuote {
  if (!isPortStock(value) || run.screen !== 'port' || run.terminalOutcome || run.pendingTransition || !run.activeVisit || run.activeVisit.stock !== value || run.activeVisit.nodeId !== value.nodeId || run.currentNode !== value.nodeId || run.seed !== value.seed || nodeAt(run.chart, value.nodeId)?.kind !== 'port' || run.clearedNodeIds.includes(value.nodeId)) return { ok: false, reason: 'Port visit unavailable' };
  const item = value.items.find(item => item.id === itemId);
  if (!item) return { ok: false, reason: 'Item unavailable' };
  if (value.sold.includes(item.id)) return { ok: false, reason: 'Sold out' };
  const hullGain = item.id === 'repair' ? Math.min(PORT.repairHull, Math.max(0, run.player.maxHull - run.player.hull)) : 0;
  if (item.id === 'repair' && hullGain <= 0) return { ok: false, reason: 'Hull full' };
  if (item.recruit && run.player.crew.length >= PORT.capacity) return { ok: false, reason: 'Crew full' };
  if (item.recruit && run.player.crew.some(p => p.id === item.recruit!.id)) return { ok: false, reason: 'Already recruited' };
  if (item.id === 'chainshot' && run.equipment.weapon === 'chainshot') return { ok: false, reason: 'Already owned' };
  if (item.id === 'shipwrights-knot' || item.id === 'witchglass') {
    if (run.equipment.charms.includes(item.id)) return { ok: false, reason: 'Already owned' };
    if (run.equipment.charms.length >= PORT.charmSlots) return { ok: false, reason: 'Charm slots full' };
  }
  if (run.gold < item.price) return { ok: false, reason: `Need ${item.price - run.gold} more gold` };
  const effect = item.id === 'repair' ? `+${hullGain} hull (${run.player.hull} → ${run.player.hull + hullGain}/${run.player.maxHull}). Fixed price: ${item.price} gold.` : item.recruit ? `${item.recruit.name} joins as ${item.recruit.trait}. Crew ${run.player.crew.length} → ${run.player.crew.length + 1}/${PORT.capacity}.` : item.id === 'chainshot' ? 'Equip Chainshot in place of Roundshot.' : `Equip ${item.name}. Charm slots ${run.equipment.charms.length + 1}/2.`;
  return { ok: true, item, price: item.price, effect, hullGain };
}
export function purchase(run: RunState, value: unknown, itemId: string): CommandResult {
  const quote = quotePurchase(run, value, itemId);
  if (!quote.ok) return quote;
  const stock = value as PortStock, { item } = quote;
  // Revalidation above is synchronous: debit, benefit and discrete stock commit together.
  run.gold -= quote.price;
  if (item.id === 'repair') run.player.hull += quote.hullGain;
  else if (item.recruit) run.player.crew.push({ ...item.recruit });
  else if (item.id === 'chainshot') run.equipment.weapon = 'chainshot';
  else run.equipment.charms.push(item.id as CharmId);
  if (item.id !== 'repair') stock.sold.push(item.id);
  run.journal.push(`Lantern Cay: bought ${item.name} for ${quote.price} gold. ${quote.effect}`);
  return { ok: true };
}
