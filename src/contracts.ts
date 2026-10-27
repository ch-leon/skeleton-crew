import { moveCrew, type Combat, type Ship } from './combat';
import type { Chart } from './chart';

// C owns concrete equipment identifiers/definitions. These structural slots allow
// the handoff to compile before C exists; no shop/equipment logic lives here.
export interface Equipment { weapon: 'roundshot' | 'chainshot'; charms: string[] }
export type CommandMode = 'inspect' | 'move' | 'aim' | 'board' | 'retreat';
export type Screen = 'map' | 'encounter' | 'battle' | 'port' | 'end';
export interface Visit { id: string; nodeId: string; stock?: unknown }
export interface RunState {
  seed: number; player: Ship; gold: number; equipment: Equipment; chart: Chart;
  currentNode: string; activeVisit: Visit | null; clearedNodeIds: string[];
  journal: string[]; terminalOutcome: 'win' | 'lose' | null; terminalReason: string;
  fogFront: number; fogContacts: number; screen: Screen; arrival: number;
  pendingTransition: boolean;
}
export interface MountedView { dispose(): void }
export type CommandResult = { ok: true } | { ok: false; reason: string };
export interface BoardingAdapter {
  queueBoard(combat: Combat, crewId: string, enemyRoom: number): CommandResult;
  queueRetreat(combat: Combat, crewId: string): CommandResult;
  moveCrewById(combat: Combat, crewId: string, shipId: 'player' | 'enemy', room: number): CommandResult;
  stepBoarding(combat: Combat, dt: number): void;
  finalizeBoarding(combat: Combat): void;
  mount(root: HTMLElement, read: () => { combat: Combat; selectedCrewId: string | null; mode: CommandMode }, commands: { selectCrew(id: string): void; board(): void; retreat(): void }): MountedView;
}
export interface PortAdapter {
  createPortStock(seed: number, nodeId: string): unknown;
  quotePurchase(run: RunState, stock: unknown, itemId: string): unknown;
  purchase(run: RunState, stock: unknown, itemId: string): CommandResult;
  mount(root: HTMLElement, read: () => RunState, commands: { buy(itemId: string): CommandResult; leave(): void }): MountedView;
}
export interface FeatureAdapters {
  boarding?: BoardingAdapter;
  port?: PortAdapter;
  // Supplied together by B/C when their implementations are ready.
  createBattle?: (run: RunState, boss: boolean) => Combat;
}
// Incomplete features deliberately have no interactive entry points.
export const unavailableFeatures: FeatureAdapters = {};

export function ownedCrewId(ship: Ship, index: number): string {
  // Baseline crews lack B's additive IDs. Initial roster order is fixed until
  // B/C land; recruited pirates must carry C's stable generated ID.
  return (ship.crew[index] as Ship['crew'][number] & { id?: string }).id || `initial-${index}`;
}
export function routeRoomOrder(combat: Combat, mode: CommandMode, selectedCrewId: string | null, shipId: 'player' | 'enemy', room: number, features: FeatureAdapters): CommandResult {
  if (combat.result || room < 0 || room >= 6 || !Number.isInteger(room)) return { ok: false, reason: 'Order unavailable' };
  if (!combat.paused) { combat.paused = true; return { ok: false, reason: 'Paused. Give an order now.' }; }
  if (mode === 'aim' && shipId === 'enemy') { combat.target = room; return { ok: true }; }
  if (!selectedCrewId) return { ok: false, reason: 'Select a pirate first' };
  if (mode === 'board' && shipId === 'enemy') return features.boarding?.queueBoard(combat, selectedCrewId, room) || { ok: false, reason: 'Boarding unavailable' };
  if (mode === 'move' && features.boarding) return features.boarding.moveCrewById(combat, selectedCrewId, shipId, room);
  if (mode === 'move' && shipId === 'player') {
    const index = combat.player.crew.findIndex((_, i) => ownedCrewId(combat.player, i) === selectedCrewId);
    if (index < 0 || combat.player.crew[index].health <= 0) return { ok: false, reason: 'Crew unavailable' };
    moveCrew(combat.player, index, room); return { ok: true };
  }
  return { ok: false, reason: 'Choose an explicit command' };
}
