import { describe, expect, it } from 'vitest';
import { allocate, createCombat, impact, makeShip, moraleRate, moveCrew, seeded, step } from './combat';

const advance = (c: ReturnType<typeof createCombat>, seconds: number) => { for (let i = 0; i < seconds * 10; i++) step(c, .1); };
describe('combat rules', () => {
  it('freezes every simulation field during tactical pause', () => {
    const c = createCombat(makeShip(), false, seeded(1));
    c.player.rooms[0].fire = .7; c.player.rooms[3].breach = .8; moveCrew(c.player, 0, 4);
    const snapshot = JSON.stringify(c); advance(c, 30); expect(JSON.stringify(c)).toBe(snapshot);
  });
  it('enforces six total power and system caps', () => {
    const s = makeShip(); expect(allocate(s, 'cannons', 1)).toBe(false);
    expect(allocate(s, 'sails', -1)).toBe(true); expect(allocate(s, 'cannons', 1)).toBe(true);
    expect(allocate(s, 'cannons', 1)).toBe(false); expect(allocate(s, 'sails', -1)).toBe(false);
  });
  it('wards absorb hits before hull and sails can evade', () => {
    const c = createCombat(makeShip(), false, () => .99); impact(c, c.player, 0, 10, true);
    expect(c.player.hull).toBe(180); expect(c.player.ward).toBe(2);
    impact(c, c.player, 0, 10, true); expect(c.player.hull).toBe(172);
    c.rng = () => 0; impact(c, c.player, 0, 10, true); expect(c.player.hull).toBe(172); expect(c.effects.at(-1)?.kind).toBe('dodge');
  });
  it('executes movement after resume; low morale slows movement and work', () => {
    const c = createCombat(makeShip()); const p = c.player.crew[0]; p.morale = 20;
    expect(moraleRate(p)).toBe(.6); moveCrew(c.player, 0, 1); c.paused = false;
    advance(c, 1.3); expect(p.room).toBe(0); advance(c, 1); expect(p.room).toBe(1);
  });
  it('gunner reloads faster at cannons; unpowered cannons stall', () => {
    const c = createCombat(makeShip(), false, seeded(1)); c.paused = false; advance(c, 4);
    expect(c.player.charge).toBeCloseTo(4 / 16 * 1.25);
    c.player.power.cannons = 0; const charge = c.player.charge; advance(c, 4); expect(c.player.charge).toBe(charge);
  });
  it('witch-touched boosts powered ward regeneration after impact cooldown', () => {
    const c = createCombat(makeShip()); c.player.ward = 0; c.player.hitAgo = 0; c.paused = false;
    advance(c, 4); expect(c.player.ward).toBe(0); advance(c, 3); expect(c.player.ward).toBeGreaterThan(1);
  });
  it('breaches flood rooms without pumps; pumps drain flood water', () => {
    const c = createCombat(makeShip()); c.player.power.pumps = 0; c.player.rooms[5].breach = 1; c.paused = false;
    advance(c, 5); expect(c.player.rooms[5].water).toBeGreaterThan(.15);
    c.player.rooms[5].breach = 0; c.player.power.pumps = 3; advance(c, 6); expect(c.player.rooms[5].water).toBe(0);
  });
  it('flooding impairs movement and damages rooms; fires damage and spread', () => {
    const c = createCombat(makeShip(), false, () => 0); c.player.crew = []; c.player.power.pumps = 0;
    c.player.rooms[3].water = 1; c.player.rooms[0].fire = .8; c.paused = false; advance(c, 8);
    expect(c.player.rooms[3].health).toBeLessThan(100); expect(c.player.hull).toBeLessThan(180);
    expect(c.player.rooms.some((r, i) => i !== 0 && r.fire > 0)).toBe(true);
  });
  it('crew extinguish, seal and repair; mender works faster', () => {
    const c = createCombat(makeShip()); c.paused = false;
    c.player.rooms[0].fire = .3; c.player.rooms[3].breach = .3;
    advance(c, 4); expect(c.player.rooms[0].fire).toBe(0); expect(c.player.rooms[3].breach).toBe(0);
    c.player.rooms[0].health = 40; c.player.rooms[3].health = 40; advance(c, 2);
    expect(c.player.rooms[3].health).toBeGreaterThan(c.player.rooms[0].health);
  });
  it('AI fires at random rooms and battle ends with a hull at zero', () => {
    const c = createCombat(makeShip(), false, seeded(42)); c.paused = false; advance(c, 500);
    expect(c.result).not.toBeNull(); expect(c.paused).toBe(true);
    expect(Math.min(c.player.hull, c.enemy.hull)).toBe(0); expect(c.events.some(e => /Our/.test(e))).toBe(true);
  });
  it('enemy reload reaches a full charge on schedule', () => {
    const c = createCombat(makeShip(), false, () => .99); c.player.power.cannons = 0; c.paused = false;
    advance(c, 18); expect(c.effects.length).toBe(0); advance(c, 1.2);
    expect(c.events.some(e => e.startsWith('Our'))).toBe(true); expect(c.enemy.charge).toBeLessThan(.02);
  });
  it('checks defeat before victory on a simultaneous sinking', () => {
    const c = createCombat(makeShip()); c.player.hull = 0; c.enemy.hull = 0; c.paused = false; step(c, .1); expect(c.result).toBe('lose');
  });
  // No balance constants were retuned for boarding: retain the original 180–300s gate
  // independently for unmoving defenders and for the deterministic boarding AI.
  it.each([false, true])('normal station management stays near 3–5 minutes (AI boarding=%s)', aiEnabled => {
    const timings: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const c = createCombat(makeShip(), false, seeded(seed)); c.paused = false; c.target = 4; c.boarding.aiEnabled = aiEnabled;
      advance(c, 600); expect(c.result).toBe('win'); timings.push(c.elapsed);
    }
    const average = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log(`AI boarding=${aiEnabled}, baseline average: ${average.toFixed(1)}s, range ${Math.min(...timings).toFixed(1)}–${Math.max(...timings).toFixed(1)}s`);
    expect(average).toBeGreaterThanOrEqual(180); expect(average).toBeLessThanOrEqual(300);
  });
});

describe('resolved equipment snapshot integration (C adapter fixtures)', () => {
  const chainshot = { weapon: { damage: 6, reload: 14, roomMultiplier: 3 }, damageControlMultiplier: 1.2, wardCapacity: 16 };
  it('uses the resolved reload, ward cap and home damage control without stacking', () => {
    const player = makeShip();
    for (let repeat = 0; repeat < 2; repeat++) {
      const c = createCombat(player, false, () => .99, chainshot); c.boarding.aiEnabled = false; c.paused = false;
      expect(c.player.ward).toBe(16); c.player.rooms[3].health = 20; advance(c, 1);
      expect(c.player.charge).toBeCloseTo(1 / 14 * 1.25);
      expect(c.player.rooms[3].health).toBeCloseTo(20 + 3 * 1.8 * 1.2);
      expect(c.modifiers.weapon).not.toBe(chainshot.weapon);
    }
    expect(chainshot.damageControlMultiplier).toBe(1.2);
  });
  it('uses remaining unwarded damage and resolved room multiplier; keeps ward and dodge semantics', () => {
    const c = createCombat(makeShip(), false, () => .99, chainshot); c.boarding.aiEnabled = false;
    c.enemy.ward = 2; c.enemy.hitAgo = 0; c.player.charge = 1; c.paused = false; advance(c, .1);
    expect(c.enemy.hull).toBe(126); expect(c.enemy.rooms[0].health).toBe(88);
    c.enemy.ward = 12; const hull = c.enemy.hull, health = c.enemy.rooms[0].health;
    impact(c, c.enemy, 0, 6, false, 3); expect(c.enemy.hull).toBe(hull); expect(c.enemy.rooms[0].health).toBe(health);
    c.enemy.power.sails = 1; c.rng = () => 0; impact(c, c.enemy, 0, 6, false, 3);
    expect(c.enemy.hull).toBe(hull); expect(c.effects.at(-1)?.kind).toBe('dodge');
  });
});
