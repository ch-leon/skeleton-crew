import type { Combat, Pirate, Ship } from './combat';
export type Faction = 'player' | 'enemy';
export type ShipId = Faction;
export type CommandMode = 'inspect' | 'move' | 'aim' | 'board' | 'retreat';
export interface Transit { originShip: ShipId; originRoom: number; destinationShip: ShipId; destinationRoom: number; phase: 'queued' | 'staging' | 'attachment' | 'crossing'; remaining: number; retreat: boolean }
export interface Hook { active: string | null; cooldown: number; queue: string[] }
export interface Capture { progress: number; captured: boolean }
export interface BoardingState { hooks: Record<Faction, Hook>; capture: Record<ShipId, Capture[]>; aiClock: number; aiEnabled: boolean; finalized: boolean }
export const BOARDING = { attach: 2, cross: 3, cooldown: 12, capture: 3, melee: 5, aiInterval: 2, retreatHealth: 25, defenders: 2, bossDefenders: 3, defenderHealth: 100, defenderMorale: 75 } as const;
export type OrderResult = { ok: true } | { ok: false; reason: string };
const yes: OrderResult = { ok: true };
const no = (reason: string): OrderResult => ({ ok: false, reason });
export const allCrew = (c: Combat) => [...c.player.crew, ...c.enemy.crew];
export const occupants = (c: Combat, shipId: ShipId, room?: number) => allCrew(c).filter(p => p.shipId === shipId && p.transit?.phase !== 'crossing' && (room === undefined || p.room === room));
export const conscious = (p: Pirate) => p.health > 0;
export const stationary = (p: Pirate) => p.travel === 0 && p.transit?.phase !== 'crossing';
export function createBoarding(): BoardingState {
  const hook = (): Hook => ({ active: null, cooldown: 0, queue: [] });
  const rooms = () => Array.from({ length: 6 }, () => ({ progress: 0, captured: false }));
  return { hooks: { player: hook(), enemy: hook() }, capture: { player: rooms(), enemy: rooms() }, aiClock: 0, aiEnabled: true, finalized: false };
}
function find(c: Combat, id: string) { return allCrew(c).find(p => p.id === id); }
function validate(c: Combat, p?: Pirate): OrderResult {
  if (c.result) return no('Battle finished');
  if (!p) return no('Unknown crew');
  if (!conscious(p)) return no('Crew incapacitated');
  if (p.transit?.phase === 'crossing') return no('Already crossing');
  return yes;
}
function release(c: Combat, p: Pirate) {
  const hook = c.boarding.hooks[p.faction];
  if (hook.active === p.id) hook.active = null;
  hook.queue = hook.queue.filter(id => id !== p.id);
  p.transit = null;
}
export function cancelBoard(c: Combat, id: string): OrderResult {
  const p = find(c, id), result = validate(c, p); if (!result.ok || !p) return result;
  release(c, p); p.destination = p.room; p.travel = 0; return yes;
}
function travel(p: Pirate, room: number) {
  const distance = Math.abs(p.room % 3 - room % 3) + Math.abs(Math.floor(p.room / 3) - Math.floor(room / 3));
  p.destination = room; p.travel = distance * 1.2;
}
export function moveCrewById(c: Combat, id: string, shipId: ShipId, room: number): OrderResult {
  const p = find(c, id), result = validate(c, p); if (!result.ok || !p) return result;
  if (!Number.isInteger(room) || room < 0 || room > 5 || p.shipId !== shipId) return no('Room unavailable');
  release(c, p); travel(p, room); return yes;
}
function queue(c: Combat, p: Pirate, room: number, retreat: boolean): OrderResult {
  release(c, p);
  p.destination = p.room; p.travel = 0;
  p.transit = { originShip: p.shipId, originRoom: 4, destinationShip: retreat ? p.faction : p.faction === 'player' ? 'enemy' : 'player', destinationRoom: room, phase: 'queued', remaining: 0, retreat };
  c.boarding.hooks[p.faction].queue.push(p.id);
  c.events.push(`${p.name}: ${retreat ? 'retreat queued' : `boarding ${roomName(room)}`}.`);
  return yes;
}
const roomName = (room: number) => ['Cannons', 'Ward', 'Sails', 'Pumps', 'Cargo hold', 'Quarters'][room];
export function queueBoard(c: Combat, id: string, enemyRoom: number): OrderResult {
  const p = find(c, id), result = validate(c, p); if (!result.ok || !p) return result;
  if (!Number.isInteger(enemyRoom) || enemyRoom < 0 || enemyRoom > 5 || p.shipId !== p.faction) return no('Room unavailable');
  if (c.boarding.hooks[p.faction].cooldown > 0) return no('Hook cooling down');
  return queue(c, p, enemyRoom, false);
}
export function queueRetreat(c: Combat, id: string): OrderResult {
  const p = find(c, id), result = validate(c, p); if (!result.ok || !p) return result;
  if (p.shipId === p.faction) return no('Already home');
  return queue(c, p, 4, true);
}
function ai(c: Combat) {
  const home = occupants(c, 'enemy').filter(p => p.faction === 'enemy' && conscious(p));
  const invader = occupants(c, 'enemy').find(p => p.faction === 'player' && conscious(p));
  if (invader) {
    const defender = home.find(p => !p.transit && p.destination === invader.room) ?? home.find(p => p.transit?.phase !== 'crossing');
    if (defender && (defender.transit || defender.destination !== invader.room)) moveCrewById(c, defender.id, 'enemy', invader.room);
  }
  for (const p of c.enemy.crew) if (p.shipId === 'player' && conscious(p) && p.health < BOARDING.retreatHealth && !p.transit) queueRetreat(c, p.id);
  if (invader || home.length < 2 || c.boarding.hooks.enemy.cooldown > 0 || c.enemy.crew.some(p => p.shipId === 'player' || p.transit)) return;
  const p = home.find(p => !p.transit);
  if (p) queueBoard(c, p.id, occupants(c, 'player', 0).some(q => q.faction === 'enemy') ? 1 : 0);
}
/** Movement/crossings only; combat owns the subsequent melee/work/capture/system passes. */
export function stepBoarding(c: Combat, dt: number) {
  if (c.paused || c.result || dt <= 0) return;
  for (const faction of ['player', 'enemy'] as const) {
    const hook = c.boarding.hooks[faction]; hook.cooldown = Math.max(0, hook.cooldown - dt);
    // Take the next request only on a tick that starts with a free slot.
    if (!hook.active) {
      hook.queue = hook.queue.filter(id => { const p = find(c, id); return !!p?.transit && conscious(p); });
      const id = hook.queue.find(id => find(c, id)!.transit!.retreat) ?? (hook.cooldown === 0 ? hook.queue[0] : undefined);
      if (id) { const p = find(c, id)!; hook.queue = hook.queue.filter(q => q !== id); hook.active = id; p.transit!.phase = 'staging'; travel(p, 4); }
    }
  }
  for (const p of allCrew(c)) {
    const t = p.transit;
    if (!conscious(p)) { if (t && t.phase !== 'crossing') release(c, p); continue; }
    if (t?.phase === 'crossing') {
      t.remaining = Math.max(0, t.remaining - dt);
      if (t.remaining < 1e-8) {
        p.shipId = t.destinationShip; p.room = p.destination = t.destinationRoom; p.travel = 0;
        if (!t.retreat) c.boarding.hooks[p.faction].cooldown = BOARDING.cooldown;
        c.events.push(`${p.name} arrived at ${p.shipId} ${roomName(p.room)}.`); release(c, p);
      }
      continue;
    }
    if (p.travel > 0) {
      const water = c[p.shipId].rooms[p.room].water;
      p.travel = Math.max(0, p.travel - dt * (p.morale < 35 ? .6 : 1) * (1 - water * .55));
      if (p.travel < 1e-8) { p.travel = 0; p.room = p.destination; }
      continue;
    }
    if (t && !t.retreat && p.faction === 'enemy' && !occupants(c, 'enemy').some(q => q !== p && q.faction === 'enemy' && conscious(q) && !q.transit)) { release(c, p); p.travel = 0; p.destination = p.room; continue; }
    if (t?.phase === 'staging') {
      t.phase = t.retreat ? 'crossing' : 'attachment'; t.remaining = t.retreat ? BOARDING.cross : BOARDING.attach;
      c.events.push(`${p.name}: ${t.retreat ? 'return crossing' : `hook attaching to ${roomName(t.destinationRoom)} (2s)`}.`);
    } else if (t?.phase === 'attachment') {
      t.remaining = Math.max(0, t.remaining - dt);
      if (t.remaining < 1e-8) { t.phase = 'crossing'; t.remaining = BOARDING.cross; }
    }
  }
  if (c.boarding.aiEnabled) { c.boarding.aiClock += dt; if (c.boarding.aiClock + 1e-8 >= BOARDING.aiInterval) { c.boarding.aiClock -= BOARDING.aiInterval; ai(c); } }
}
export function engaged(c: Combat, p: Pirate) { return occupants(c, p.shipId, p.room).some(q => conscious(q) && q.faction !== p.faction); }
export function melee(c: Combat, dt: number) {
  if (c.paused || c.result || dt <= 0) return;
  const damage = new Map<Pirate, number>();
  for (const p of allCrew(c)) {
    if (!conscious(p) || !stationary(p)) continue;
    const target = occupants(c, p.shipId, p.room).filter(q => conscious(q) && q.faction !== p.faction).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
    if (target) damage.set(target, (damage.get(target) ?? 0) + BOARDING.melee * (p.morale < 35 ? .6 : 1) * dt);
  }
  for (const [p, value] of damage) {
    p.health = Math.max(0, p.health - value);
    if (p.health === 0 && p.transit) { release(c, p); p.travel = 0; p.destination = p.room; }
  }
}
export function updateCapture(c: Combat, dt: number) {
  if (c.paused || c.result || dt <= 0) return;
  for (const ship of ['player', 'enemy'] as const) c.boarding.capture[ship].forEach((capture, room) => {
    const crew = occupants(c, ship, room).filter(conscious);
    const invaders = crew.filter(p => p.faction !== ship);
    if (!invaders.length) { capture.progress = 0; capture.captured = false; }
    else if (crew.some(p => p.faction === ship) || !invaders.some(stationary)) { capture.progress = 0; }
    else { capture.progress = Math.min(BOARDING.capture, capture.progress + dt); if (capture.progress + 1e-8 >= BOARDING.capture) capture.captured = true; }
  });
}
export function finalizeBoarding(c: Combat): string | null {
  if (c.result !== 'win' || c.boarding.finalized) return null;
  for (const p of allCrew(c)) { p.transit = null; p.travel = 0; p.shipId = p.faction; p.room = p.destination = 4; }
  const enabled = c.boarding.aiEnabled; c.boarding = createBoarding(); c.boarding.aiEnabled = enabled; c.boarding.finalized = true;
  const summary = 'Victory rescue: all owned pirates returned to player Cargo hold.';
  c.events.push(summary); return summary;
}
export function shipId(c: Combat, ship: Ship): ShipId { return ship === c.player ? 'player' : 'enemy'; }
/** Optional room-router seam for A: a running tap only pauses, and board never aims. */
export function commandRoom(c: Combat, crewId: string | null, mode: CommandMode, ship: ShipId, room: number): OrderResult {
  if (c.result) return no('Battle finished');
  if (!c.paused) { c.paused = true; return yes; }
  if (!Number.isInteger(room) || room < 0 || room > 5) return no('Room unavailable');
  if (mode === 'inspect') return yes;
  if (mode === 'aim') { if (ship !== 'enemy') return no('Choose an enemy room'); c.target = room; return yes; }
  if (!crewId) return no('Select crew');
  const p = c.player.crew.find(p => p.id === crewId);
  if (!p) return no('Select owned crew');
  if (mode === 'board') return ship === 'enemy' ? queueBoard(c, crewId, room) : no('Choose an enemy room');
  if (mode === 'retreat') return queueRetreat(c, crewId);
  return moveCrewById(c, crewId, ship, room);
}
