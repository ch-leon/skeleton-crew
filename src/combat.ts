export type System = 'cannons' | 'ward' | 'sails' | 'pumps';
export type Trait = 'Gunner' | 'Mender' | 'Witch-touched';
export const SYSTEMS: System[] = ['cannons', 'ward', 'sails', 'pumps'];
export const ROOM_NAMES = ['Cannons', 'Ward-witch', 'Sails', 'Bilge pumps', 'Cargo hold', 'Quarters'];
export interface Room { health: number; fire: number; water: number; breach: number }
export interface Pirate { name: string; trait: Trait; room: number; destination: number; travel: number; morale: number; health: number }
export interface Ship { hull: number; maxHull: number; ward: number; charge: number; hitAgo: number; power: Record<System, number>; rooms: Room[]; crew: Pirate[] }
export interface Combat { player: Ship; enemy: Ship; paused: boolean; elapsed: number; target: number; ghost: boolean; result: 'win' | 'lose' | null; events: string[]; effects: Effect[]; rng: () => number; spreadClock: number }
export interface Effect { fromEnemy: boolean; room: number; kind: 'hit' | 'ward' | 'dodge'; life: number }
export const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export function seeded(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function makeShip(hull = 180, withCrew = true): Ship {
  return { hull, maxHull: hull, ward: 12, charge: 0, hitAgo: 9, power: { cannons: 2, ward: 2, sails: 1, pumps: 1 }, rooms: Array.from({ length: 6 }, () => ({ health: 100, fire: 0, water: 0, breach: 0 })), crew: withCrew ? [
    { name: 'Rook', trait: 'Gunner', room: 0, destination: 0, travel: 0, morale: 75, health: 100 },
    { name: 'Nell', trait: 'Mender', room: 3, destination: 3, travel: 0, morale: 75, health: 100 },
    { name: 'Vesper', trait: 'Witch-touched', room: 1, destination: 1, travel: 0, morale: 75, health: 100 },
  ] : [] };
}
export function createCombat(player: Ship, ghost = false, rng = Math.random): Combat {
  const enemy = makeShip(ghost ? 170 : 130, false);
  enemy.power = { cannons: 2, ward: 1, sails: ghost ? 1 : 0, pumps: 1 };
  player.rooms = makeShip().rooms; player.ward = 12; player.charge = 0; player.hitAgo = 9;
  for (const p of player.crew) { p.travel = 0; p.destination = p.room; }
  return { player, enemy, paused: true, elapsed: 0, target: 0, ghost, result: null, events: ['All hands to stations. Choose a target, then resume.'], effects: [], rng, spreadClock: 0 };
}
export function allocate(ship: Ship, system: System, delta: number): boolean {
  const next = ship.power[system] + delta;
  if (next < 0 || next > 3 || Object.values(ship.power).reduce((a, b) => a + b, 0) + delta > 6) return false;
  ship.power[system] = next; return true;
}
export function moraleRate(p: Pirate) { return p.morale < 35 ? 0.6 : 1; }
export function moveCrew(ship: Ship, index: number, room: number) {
  const p = ship.crew[index];
  if (!p || p.health <= 0 || room < 0 || room >= 6) return;
  if (p.room === room) { p.destination = room; p.travel = 0; return; }
  const distance = Math.abs(p.room % 3 - room % 3) + Math.abs(Math.floor(p.room / 3) - Math.floor(room / 3));
  p.destination = room; p.travel = distance * 1.2;
}
export function efficiency(ship: Ship, index: number) { const r = ship.rooms[index]; return Math.max(.3, r.health / 100 * (1 - r.water * .65)); }
function traitBoost(ship: Ship, trait: Trait, room: number) { return ship.crew.some(p => p.trait === trait && p.room === room && p.travel === 0 && p.health > 0) ? (trait === 'Gunner' ? 1.25 : 1.5) : 1; }
export function impact(c: Combat, defender: Ship, roomIndex: number, damage: number, fromEnemy: boolean) {
  let kind: Effect['kind'] = 'hit';
  if (c.rng() < defender.power.sails * .05 * efficiency(defender, 2)) { kind = 'dodge'; }
  else {
    defender.hitAgo = 0;
    const absorbed = Math.min(defender.ward, damage); defender.ward -= absorbed; damage -= absorbed;
    if (damage <= 0) kind = 'ward';
    if (damage > 0) {
      const r = defender.rooms[roomIndex];
      defender.hull = Math.max(0, defender.hull - damage);
      r.health = Math.max(0, r.health - damage * 2);
      if (c.rng() < .3) r.fire = clamp(r.fire + .35);
      if (roomIndex >= 3 && c.rng() < .3) r.breach = clamp(r.breach + .4);
      for (const p of defender.crew.filter(p => p.room === roomIndex)) p.morale = Math.max(0, p.morale - 3);
    }
  }
  c.effects.push({ fromEnemy, room: roomIndex, kind, life: 1.1 });
  const side = fromEnemy ? 'Our' : 'Enemy';
  c.events.push(kind === 'dodge' ? `${side} ship evaded a broadside.` : kind === 'ward' ? `${side} ward caught the cannonball.` : `${side} ${ROOM_NAMES[roomIndex].toLowerCase()} hit!`);
  c.events = c.events.slice(-24);
}
function systems(ship: Ship, dt: number, enemy: boolean, reload = 16) {
  ship.hitAgo += dt;
  if (ship.hitAgo >= 5 && ship.power.ward > 0) ship.ward = Math.min(12, ship.ward + .18 * ship.power.ward * efficiency(ship, 1) * traitBoost(ship, 'Witch-touched', 1) * dt);
  ship.charge = Math.min(1, ship.charge + dt / reload * ship.power.cannons / 2 * efficiency(ship, 0) * traitBoost(ship, 'Gunner', 0));
  for (let i = 0; i < 6; i++) {
    const r = ship.rooms[i];
    r.water = clamp(r.water + (r.breach * .10 - ship.power.pumps * .035 * efficiency(ship, 3)) * dt);
    if (r.fire > 0) {
      r.fire = clamp(r.fire + .008 * dt - r.water * .03 * dt);
      r.health = Math.max(0, r.health - r.fire * .9 * dt);
      ship.hull = Math.max(0, ship.hull - r.fire * .045 * dt);
    }
    if (r.water > .4) r.health = Math.max(0, r.health - r.water * .35 * dt);
    if (r.water > .85) ship.hull = Math.max(0, ship.hull - .08 * dt);
    if (enemy) { r.fire = Math.max(0, r.fire - .012 * dt); r.breach = Math.max(0, r.breach - .008 * dt); r.health = Math.min(100, r.health + .45 * dt); }
  }
  for (const p of ship.crew) {
    if (p.health <= 0) continue;
    const r = ship.rooms[p.room];
    const rate = moraleRate(p) * (1 - r.water * .55);
    if (p.travel > 0) {
      p.travel = Math.max(0, p.travel - dt * rate);
      if (p.travel === 0) p.room = p.destination;
    } else {
      const repair = dt * rate * (p.trait === 'Mender' ? 1.8 : 1);
      if (r.fire > 0) r.fire = Math.max(0, r.fire - .20 * repair);
      else if (r.breach > 0) r.breach = Math.max(0, r.breach - .12 * repair);
      else r.health = Math.min(100, r.health + 3 * repair);
    }
    p.health = clamp(p.health + (r.fire > .05 ? -r.fire * 2.5 : r.water > .7 ? -.3 : .15) * dt, 0, 100);
    p.morale = clamp(p.morale - (r.fire > .1 || r.water > .6 ? .25 : 0) * dt, 0, 100);
  }
}
export function step(c: Combat, dt: number) {
  if (c.paused || c.result || dt <= 0) return;
  c.elapsed += dt;
  systems(c.player, dt, false);
  // Enemy reload differs from the player; system damage still matters.
  systems(c.enemy, dt, true, c.ghost ? 16.5 : 19);
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
  if (c.player.charge >= 1) { c.player.charge = 0; impact(c, c.enemy, c.target, 10, false); }
  if (c.enemy.charge >= 1) { c.enemy.charge = 0; impact(c, c.player, Math.floor(c.rng() * 6), c.ghost ? 10 : 8, true); }
  c.effects = c.effects.filter(e => (e.life -= dt) > 0);
  // Losing takes precedence for a simultaneous sinking.
  if (c.player.hull <= 0) c.result = 'lose';
  else if (c.enemy.hull <= 0) c.result = 'win';
  if (c.result) c.paused = true;
}
