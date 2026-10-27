import { clamp, makeShip, type Combat } from './combat';
import { generateChart, nodeAt, START, type EncounterId } from './chart';
import type { FeatureAdapters, RunState } from './contracts';
export const FOG = { initialFront: -2, damage: 30, fatalContacts: 2 } as const;
export const REWARDS = { battle: 35, boss: 65, morale: 8 } as const;
export interface Choice { title: string; effect: string; gold: number; hull: number; morale: number; log: string }
export const encounters: Record<EncounterId, { title: string; text: string; choices: Choice[] }> = {
  'drowned-bell': { title: 'A debt to the deep', text: 'A bronze bell tolls beneath the waves. A soaked hand offers you a purse. “A little luck, captain. All it costs is a little courage.”', choices: [
    { title: 'Take the drowned gold', effect: '+25 gold · −12 morale', gold: 25, hull: 0, morale: -12, log: 'Took the drowned gold. The bell still rings in our dreams.' },
    { title: 'Give the dead their due', effect: '−10 gold · +15 morale', gold: -10, hull: 0, morale: 15, log: 'Paid our respects to the drowned. The crew stood a little taller.' },
  ] },
  'widows-passage': { title: 'The ferryman’s price', text: 'A boatman with no face blocks Widow’s Passage. “Pay for safe water,” he whispers, “or let your keel pay for you.”', choices: [
    { title: 'Pay the ferryman', effect: '−20 gold · +20 hull · +8 morale', gold: -20, hull: 20, morale: 8, log: 'Paid the faceless ferryman. He guided us through the teeth of the reef.' },
    { title: 'Run the haunted reef', effect: '+20 gold · −18 hull · −10 morale', gold: 20, hull: -18, morale: -10, log: 'Ran the haunted reef and plundered a wreck. The sea took its share.' },
  ] },
};
export function createRun(seed: number): RunState {
  return { seed, player: makeShip(), gold: 25, equipment: { weapon: 'roundshot', charms: [] }, chart: generateChart(seed), currentNode: START, activeVisit: null, clearedNodeIds: [START], journal: [], terminalOutcome: null, terminalReason: '', fogFront: FOG.initialFront, fogContacts: 0, screen: 'map', arrival: 0, pendingTransition: false };
}
export function endRun(run: RunState, outcome: 'win' | 'lose', reason: string) {
  run.terminalOutcome = outcome; run.terminalReason = reason; run.screen = 'end'; run.pendingTransition = false;
}
export type JumpPreview = { ok: false; reason: string } | { ok: true; nodeId: string; jumpCost: 1 | 2; nextFront: number; damage: number; contacts: number; fatal: boolean };
export function previewJump(run: RunState, nodeId: string): JumpPreview {
  if (run.screen !== 'map' || run.terminalOutcome || run.activeVisit || run.pendingTransition || !run.clearedNodeIds.includes(run.currentNode)) return { ok: false, reason: 'Resolve the current visit first.' };
  const edge = run.chart.edges.find(e => e.from === run.currentNode && e.to === nodeId);
  const node = nodeAt(run.chart, nodeId);
  if (!edge || !node || run.clearedNodeIds.includes(nodeId)) return { ok: false, reason: 'No passage from the current position.' };
  const nextFront = run.fogFront + edge.jumpCost;
  const damage = node.depth <= nextFront ? FOG.damage : 0;
  const contacts = run.fogContacts + (damage ? 1 : 0);
  return { ok: true, nodeId, jumpCost: edge.jumpCost, nextFront, damage, contacts, fatal: contacts >= FOG.fatalContacts || run.player.hull - damage <= 0 };
}
export function commitJump(run: RunState, nodeId: string) {
  const preview = previewJump(run, nodeId);
  if (!preview.ok) return preview;
  run.pendingTransition = true;
  run.activeVisit = { id: `${run.seed}:${++run.arrival}:${nodeId}`, nodeId };
  run.currentNode = nodeId; run.fogFront = preview.nextFront; run.fogContacts = preview.contacts;
  run.player.hull = Math.max(0, run.player.hull - preview.damage);
  run.journal.push(`Sailed to ${nodeAt(run.chart, nodeId)!.name}. Fog +${preview.jumpCost}, front ${preview.nextFront}.${preview.damage ? ' Ghost armada contact: −30 hull.' : ''}`);
  if (preview.fatal) endRun(run, 'lose', preview.contacts >= FOG.fatalContacts ? 'Overtaken by the ghost armada' : 'The ghost armada sank the Wayward');
  else { const kind = nodeAt(run.chart, nodeId)!.kind; run.screen = kind === 'boss' || kind === 'battle' ? 'battle' : kind === 'port' ? 'port' : 'encounter'; }
  run.pendingTransition = false;
  return preview;
}
export type VisitOutcome = { kind: 'encounter'; choice: number } | { kind: 'battle'; combat: Combat } | { kind: 'port' };
export function completeVisit(run: RunState, visitId: string, outcome: VisitOutcome, features: FeatureAdapters = {}): boolean {
  const visit = run.activeVisit;
  if (!visit || visit.id !== visitId || run.terminalOutcome || run.pendingTransition) return false;
  const node = nodeAt(run.chart, visit.nodeId)!;
  if (outcome.kind === 'encounter') {
    if (run.screen !== 'encounter' || !node.encounterId) return false;
    const choice = encounters[node.encounterId].choices[outcome.choice];
    if (!choice || run.gold + choice.gold < 0) return false;
    run.gold += choice.gold; run.player.hull = clamp(run.player.hull + choice.hull, 0, run.player.maxHull);
    run.player.crew.forEach(p => p.morale = clamp(p.morale + choice.morale, 0, 100)); run.journal.push(choice.log);
  } else if (outcome.kind === 'battle') {
    const combat = outcome.combat;
    if (run.screen !== 'battle' || !['battle', 'boss'].includes(node.kind) || combat.player !== run.player || !combat.result || combat.ghost !== (node.kind === 'boss')) return false;
    if (combat.result === 'lose' || run.player.hull <= 0) { endRun(run, 'lose', `The Wayward sank to ${node.name}`); run.journal.push(run.terminalReason); return true; }
    // B's rescue/cleanup must happen before the canonical award and recovery.
    run.pendingTransition = true;
    features.boarding?.finalizeBoarding(combat);
    const reward = node.kind === 'boss' ? REWARDS.boss : REWARDS.battle;
    run.gold += reward; run.player.crew.forEach(p => { p.health = 100; p.morale = clamp(p.morale + REWARDS.morale, 0, 100); });
    run.journal.push(`Sank ${node.name}. Plundered ${reward} gold.${features.boarding ? ' Rescued all owned crew to Cargo hold.' : ''}`);
  } else if (run.screen !== 'port' || node.kind !== 'port') return false;
  run.pendingTransition = false;
  run.clearedNodeIds.push(node.id); run.activeVisit = null; run.screen = 'map';
  if (run.player.hull <= 0) endRun(run, 'lose', 'The haunted reef claimed the Wayward');
  else if (node.kind === 'boss') endRun(run, 'win', 'The Pale Sovereign is gone. Dawn belongs to your crew.');
  return true;
}
export function initializePort(run: RunState, features: FeatureAdapters): boolean {
  if (run.screen !== 'port' || !run.activeVisit || !features.port) return false;
  if (run.activeVisit.stock === undefined) run.activeVisit.stock = features.port.createPortStock(run.seed, run.currentNode);
  return true;
}
