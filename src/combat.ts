import { BOARDING, allCrew, createBoarding, occupants, engaged, stationary, stepBoarding, melee, updateCapture, finalizeBoarding, shipId, type Faction, type ShipId, type Transit, type BoardingState } from './boarding';
export { queueBoard, queueRetreat, moveCrewById, stepBoarding, finalizeBoarding, occupants } from './boarding';
export type System = 'cannons' | 'ward' | 'sails' | 'pumps';
export type Trait = 'Gunner' | 'Mender' | 'Witch-touched' | 'None';
export const SYSTEMS: System[] = ['cannons', 'ward', 'sails', 'pumps'];
export const ROOM_NAMES = ['Cannons', 'Ward-witch', 'Sails', 'Bilge pumps', 'Cargo hold', 'Quarters'];
export interface Room { health: number; fire: number; water: number; breach: number }
export interface Pirate { id: string; faction: Faction; shipId: ShipId; transit: Transit | null; name: string; trait: Trait; room: number; destination: number; travel: number; morale: number; health: number }
export interface Ship { hull: number; maxHull: number; ward: number; charge: number; hitAgo: number; power: Record<System, number>; rooms: Room[]; crew: Pirate[] }
/** Structural snapshot seam: C derives these values; no equipment catalog logic lives here. */
export interface CombatModifiers { weapon: { damage: number; reload: number; roomMultiplier: number }; damageControlMultiplier: number; wardCapacity: number }
export const DEFAULT_COMBAT_MODIFIERS: CombatModifiers = { weapon: { damage: 10, reload: 16, roomMultiplier: 2 }, damageControlMultiplier: 1, wardCapacity: 12 };
export interface Combat { boarding: BoardingState; modifiers: CombatModifiers; player: Ship; enemy: Ship; paused: boolean; elapsed: number; target: number; ghost: boolean; result: 'win' | 'lose' | null; events: string[]; effects: Effect[]; rng: () => number; spreadClock: number }
export interface Effect { fromEnemy: boolean; room: number; kind: 'hit' | 'ward' | 'dodge'; life: number }
export const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export function seeded(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function makeShip(hull = 180, withCrew = true): Ship {
  return { hull, maxHull: hull, ward: 12, charge: 0, hitAgo: 9, power: { cannons: 2, ward: 2, sails: 1, pumps: 1 }, rooms: Array.from({ length: 6 }, () => ({ health: 100, fire: 0, water: 0, breach: 0 })), crew: withCrew ? [
    { id: 'rook', faction: 'player', shipId: 'player', transit: null, name: 'Rook', trait: 'Gunner', room: 0, destination: 0, travel: 0, morale: 75, health: 100 },
    { id: 'nell', faction: 'player', shipId: 'player', transit: null, name: 'Nell', trait: 'Mender', room: 3, destination: 3, travel: 0, morale: 75, health: 100 },
    { id: 'vesper', faction: 'player', shipId: 'player', transit: null, name: 'Vesper', trait: 'Witch-touched', room: 1, destination: 1, travel: 0, morale: 75, health: 100 },
  ] : [] };
}
export function createCombat(player: Ship, ghost = false, rng = Math.random, modifiers: CombatModifiers = DEFAULT_COMBAT_MODIFIERS): Combat {
  const enemy = makeShip(ghost ? 170 : 130, false);
  enemy.crew = Array.from({ length: ghost ? BOARDING.bossDefenders : BOARDING.defenders }, (_, i) => ({ id: `enemy-${i}`, faction: 'enemy', shipId: 'enemy', transit: null, name: ['Brine', 'Keel', 'Wraith'][i], trait: 'None', room: i === 0 ? 4 : i - 1, destination: i === 0 ? 4 : i - 1, travel: 0, morale: BOARDING.defenderMorale, health: BOARDING.defenderHealth }));
  enemy.power = { cannons: 2, ward: 1, sails: ghost ? 1 : 0, pumps: 1 };
  player.rooms = makeShip().rooms; player.ward = modifiers.wardCapacity; player.charge = 0; player.hitAgo = 9;
  for (const p of player.crew) { p.travel = 0; p.destination = p.room; p.shipId = 'player'; p.faction = 'player'; p.transit = null; }
  return { boarding: createBoarding(), modifiers: { ...modifiers, weapon: { ...modifiers.weapon } }, player, enemy, paused: true, elapsed: 0, target: 0, ghost, result: null, events: ['All hands to stations. Choose a target, then resume.'], effects: [], rng, spreadClock: 0 };
}
export function allocate(ship: Ship, system: System, delta: number): boolean {
  const next = ship.power[system] + delta;
  if (next < 0 || next > 3 || Object.values(ship.power).reduce((a, b) => a + b, 0) + delta > 6) return false;
  ship.power[system] = next; return true;
}
export function moraleRate(p: Pirate) { return p.morale < 35 ? 0.6 : 1; }
export function moveCrew(ship: Ship, index: number, room: number) {
  const p = ship.crew[index];
  if (!p || p.health <= 0 || p.shipId !== p.faction || p.transit || !Number.isInteger(room) || room < 0 || room >= 6) return;
  if (p.room === room) { p.destination = room; p.travel = 0; return; }
  const distance = Math.abs(p.room % 3 - room % 3) + Math.abs(Math.floor(p.room / 3) - Math.floor(room / 3));
  p.destination = room; p.travel = distance * 1.2;
}
export function efficiency(ship: Ship, index: number) { const r = ship.rooms[index]; return Math.max(.3, r.health / 100 * (1 - r.water * .65)); }
function output(c: Combat, ship: Ship, room: number) { return c.boarding.capture[shipId(c, ship)][room].captured ? 0 : efficiency(ship, room); }
function traitBoost(c: Combat, ship: Ship, trait: Trait, room: number, fighting: Set<Pirate>) { const id = shipId(c, ship); return occupants(c, id, room).some(p => p.faction === id && p.trait === trait && stationary(p) && p.health > 0 && !fighting.has(p)) ? (trait === 'Gunner' ? 1.25 : 1.5) : 1; }
export function impact(c: Combat, defender: Ship, roomIndex: number, damage: number, fromEnemy: boolean, roomMultiplier = 2) {
  let kind: Effect['kind'] = 'hit';
  if (c.rng() < defender.power.sails * .05 * output(c, defender, 2)) { kind = 'dodge'; }
  else {
    defender.hitAgo = 0;
    const absorbed = Math.min(defender.ward, damage); defender.ward -= absorbed; damage -= absorbed;
    if (damage <= 0) kind = 'ward';
    if (damage > 0) {
      const r = defender.rooms[roomIndex];
      defender.hull = Math.max(0, defender.hull - damage);
      r.health = Math.max(0, r.health - damage * roomMultiplier);
      if (c.rng() < .3) r.fire = clamp(r.fire + .35);
      if (roomIndex >= 3 && c.rng() < .3) r.breach = clamp(r.breach + .4);
      for (const p of occupants(c, shipId(c, defender), roomIndex)) p.morale = Math.max(0, p.morale - 3);
    }
  }
  c.effects.push({ fromEnemy, room: roomIndex, kind, life: 1.1 });
  const side = fromEnemy ? 'Our' : 'Enemy';
  c.events.push(kind === 'dodge' ? `${side} ship evaded a broadside.` : kind === 'ward' ? `${side} ward caught the cannonball.` : `${side} ${ROOM_NAMES[roomIndex].toLowerCase()} hit!`);
  c.events = c.events.slice(-24);
}
function systems(c: Combat, ship: Ship, dt: number, enemy: boolean, reload: number, fighting: Set<Pirate>) {
  ship.hitAgo += dt;
  if (ship.hitAgo >= 5 && ship.power.ward > 0) ship.ward = Math.min(enemy ? 12 : c.modifiers.wardCapacity, ship.ward + .18 * ship.power.ward * output(c, ship, 1) * traitBoost(c, ship, 'Witch-touched', 1, fighting) * dt);
  ship.charge = Math.min(1, ship.charge + dt / reload * ship.power.cannons / 2 * output(c, ship, 0) * traitBoost(c, ship, 'Gunner', 0, fighting));
  for (let i = 0; i < 6; i++) {
    const r = ship.rooms[i];
    r.water = clamp(r.water + (r.breach * .10 - ship.power.pumps * .035 * output(c, ship, 3)) * dt);
    if (r.fire > 0) {
      r.fire = clamp(r.fire + .008 * dt - r.water * .03 * dt);
      r.health = Math.max(0, r.health - r.fire * .9 * dt);
      ship.hull = Math.max(0, ship.hull - r.fire * .045 * dt);
    }
    if (r.water > .4) r.health = Math.max(0, r.health - r.water * .35 * dt);
    if (r.water > .85) ship.hull = Math.max(0, ship.hull - .08 * dt);
    if (enemy && occupants(c, 'enemy', i).length === 0 && !c.boarding.capture.enemy[i].captured) { r.fire = Math.max(0, r.fire - .012 * dt); r.breach = Math.max(0, r.breach - .008 * dt); r.health = Math.min(100, r.health + .45 * dt); }
  }
}
function crewWork(c: Combat, dt: number, fightingCrew: Set<Pirate>) {
  for (const p of [...c.player.crew, ...c.enemy.crew]) {
    if (p.health <= 0 || p.transit?.phase === 'crossing') continue;
    const r = c[p.shipId].rooms[p.room];
    const fighting = fightingCrew.has(p);
    const rate = moraleRate(p) * (1 - r.water * .55);
    if (stationary(p) && !fighting && p.shipId === p.faction) {
      const repair = dt * rate * (p.trait === 'Mender' ? 1.8 : 1) * (p.faction === 'player' ? c.modifiers.damageControlMultiplier : 1);
      if (r.fire > 0) r.fire = Math.max(0, r.fire - .20 * repair);
      else if (r.breach > 0) r.breach = Math.max(0, r.breach - .12 * repair);
      else r.health = Math.min(100, r.health + 3 * repair);
    }
    const healthRate = r.fire > .05 ? -r.fire * 2.5 : r.water > .7 ? -.3 : fighting ? 0 : .15;
    p.health = clamp(p.health + healthRate * dt, 0, 100);
    p.morale = clamp(p.morale - (r.fire > .1 || r.water > .6 ? .25 : 0) * dt, 0, 100);
    if (p.health <= 0 && p.transit) {
      const hook = c.boarding.hooks[p.faction];
      if (hook.active === p.id) hook.active = null;
      hook.queue = hook.queue.filter(id => id !== p.id); p.transit = null; p.travel = 0; p.destination = p.room;
    }
  }
}
function settle(c: Combat) {
  if (c.player.hull <= 0) c.result = 'lose';
  else if (c.enemy.hull <= 0) c.result = 'win';
  if (c.result) { c.paused = true; if (c.result === 'win') finalizeBoarding(c); }
}
export function step(c: Combat, dt: number) {
  if (c.paused || c.result || dt <= 0) return;
  settle(c); if (c.result) return;
  c.elapsed += dt;
  stepBoarding(c, dt);
  const fighting = new Set(allCrew(c).filter(p => p.health > 0 && p.transit?.phase !== 'crossing' && engaged(c, p)));
  melee(c, dt);
  crewWork(c, dt, fighting);
  updateCapture(c, dt);
  systems(c, c.player, dt, false, c.modifiers.weapon.reload, fighting);
  // Enemy reload differs from the player; system damage still matters.
  systems(c, c.enemy, dt, true, c.ghost ? 16.5 : 19, fighting);
  c.spreadClock += dt;
  if (c.spreadClock >= 4) {
    c.spreadClock -= 4;
    for (const ship of [c.player, c.enemy]) {
      const fires = ship.rooms.map(r => r.fire);
      fires.forEach((fire, i) => {
        if (fire > .45 && c.rng() < fire * .25) {
          const adjacent = [i - 3, i + 3, ...(i % 3 > 0 ? [i - 1] : []), ...(i % 3 < 2 ? [i + 1] : [])].filter(n => n >= 0 && n < 6);
          const to = adjacent[Math.floor(c.rng() * adjacent.length)];
          ship.rooms[to].fire = clamp(ship.rooms[to].fire + .18);
        }
      });
    }
  }
  if (c.player.charge >= 1 && output(c, c.player, 0) > 0 && c.player.power.cannons > 0) { c.player.charge = 0; impact(c, c.enemy, c.target, c.modifiers.weapon.damage, false, c.modifiers.weapon.roomMultiplier); }
  if (c.enemy.charge >= 1 && output(c, c.enemy, 0) > 0 && c.enemy.power.cannons > 0) { c.enemy.charge = 0; impact(c, c.player, Math.floor(c.rng() * 6), c.ghost ? 10 : 8, true); }
  c.effects = c.effects.filter(e => (e.life -= dt) > 0);
  // Losing takes precedence for simultaneous sinking; defeat freezes the final snapshot.
  settle(c);
  c.events = c.events.slice(-24);
}
