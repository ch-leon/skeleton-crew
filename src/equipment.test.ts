import { describe, expect, it } from 'vitest';
import { createCombat, impact, makeShip, step } from './combat';
import { defaultEquipment, deriveModifiers } from './equipment';

describe('equipment definitions and combat consumption', () => {
  it('derives fresh defaults and never stacks or shares mutable snapshots', () => {
    expect(deriveModifiers(defaultEquipment())).toEqual({ weapon: { damage: 10, reload: 16, roomMultiplier: 2 }, damageControlMultiplier: 1, wardCapacity: 12 });
    const equipment = { weapon: 'chainshot' as const, charms: ['shipwrights-knot', 'witchglass', 'witchglass'] };
    const before = structuredClone(equipment);
    for (let i = 0; i < 5; i++) {
      const modifiers = deriveModifiers(equipment); expect(modifiers).toEqual({ weapon: { damage: 6, reload: 14, roomMultiplier: 3 }, damageControlMultiplier: 1.2, wardCapacity: 16 });
      const c = createCombat(makeShip(), false, () => .99, modifiers);
      expect(c.player.ward).toBe(16); c.modifiers.weapon.damage = 999;
    }
    expect(equipment).toEqual(before); const first = defaultEquipment(); first.charms.push('witchglass'); expect(defaultEquipment().charms).toEqual([]);
  });
  it('uses 14-second chainshot reload at power 2 and preserves the Gunner bonus', () => {
    for (const gunner of [false, true]) {
      const c = createCombat(makeShip(), false, () => .99, deriveModifiers({ weapon: 'chainshot', charms: [] }));
      c.boarding.aiEnabled = false; c.enemy.power.cannons = 0; c.enemy.power.ward = 0; c.enemy.ward = 0;
      c.player.crew[0].trait = gunner ? 'Gunner' : 'None'; c.paused = false;
      const ticks = gunner ? 112 : 140;
      for (let i = 0; i < ticks - 1; i++) step(c, .1);
      expect(c.enemy.hull).toBe(130); step(c, .1);
      // Floating-point charge accumulation may settle on the next fixed tick.
      if (c.enemy.hull === 130) { expect(c.player.charge).toBeCloseTo(1, 12); step(c, .1); }
      expect(c.enemy.hull).toBe(124); expect(c.enemy.rooms[0].health).toBe(82);
    }
  });
  it.each([[0, 6, 18], [2, 4, 12], [6, 0, 0], [12, 0, 0]])('chainshot with %s ward causes %s hull and %s room damage', (ward, hull, room) => {
    const c = createCombat(makeShip(), false, () => .99, deriveModifiers({ weapon: 'chainshot', charms: [] }));
    c.enemy.ward = ward; const w = c.modifiers.weapon; impact(c, c.enemy, 0, w.damage, false, w.roomMultiplier);
    expect(c.enemy.hull).toBe(130 - hull); expect(c.enemy.rooms[0].health).toBe(100 - room); expect(c.enemy.ward).toBe(Math.max(0, ward - 6));
  });
  it('a dodged chainshot does no damage', () => {
    const c = createCombat(makeShip(), false, () => 0, deriveModifiers({ weapon: 'chainshot', charms: [] }));
    c.enemy.power.sails = 1; c.enemy.ward = 0; const w = c.modifiers.weapon;
    impact(c, c.enemy, 0, w.damage, false, w.roomMultiplier); expect(c.enemy.hull).toBe(130); expect(c.enemy.rooms[0].health).toBe(100);
  });
  it.each(['fire', 'breach', 'health'] as const)('Knot boosts only home damage-control work on %s', field => {
    const results = [[], ['shipwrights-knot']].map(charms => {
      const c = createCombat(makeShip(), false, () => .99, deriveModifiers({ weapon: 'roundshot', charms }));
      c.boarding.aiEnabled = false; c.player.power.cannons = c.enemy.power.cannons = 0; c.player.power.pumps = c.enemy.power.pumps = 0;
      c.player.crew.forEach(p => { p.health = 0; });
      const p = c.player.crew[0]; p.health = 80; p.trait = 'None'; p.room = p.destination = 4;
      const room = c.player.rooms[4]; room[field] = field === 'health' ? 50 : .5;
      c.paused = false; step(c, .1); return { value: room[field], health: p.health, hull: c.player.hull };
    });
    const delta = field === 'health' ? results[1].value - results[0].value : results[0].value - results[1].value;
    expect(delta).toBeCloseTo((field === 'health' ? 3 : field === 'fire' ? .2 : .12) * .1 * .2, 6);
    if (field === 'health') { expect(results[1].health).toBe(results[0].health); expect(results[1].hull).toBe(results[0].hull); }
  });
  it('Witchglass changes capacity alone and keeps recharge unchanged', () => {
    const values = [[], ['witchglass']].map(charms => {
      const c = createCombat(makeShip(), false, () => .99, deriveModifiers({ weapon: 'roundshot', charms }));
      c.boarding.aiEnabled = false; c.player.ward = 0; c.paused = false; step(c, .1); return c;
    });
    expect(values[1].player.ward).toBeCloseTo(values[0].player.ward);
    expect(values[1].modifiers.weapon).toEqual(values[0].modifiers.weapon);
    expect(values[1].modifiers.damageControlMultiplier).toBe(1); expect(values[1].modifiers.wardCapacity).toBe(16);
  });
  it('Knot neither boosts enemy crew nor lets invaders repair the hostile ship', () => {
    const values = [[], ['shipwrights-knot']].map(charms => {
      const c = createCombat(makeShip(), false, () => .99, deriveModifiers({ weapon: 'roundshot', charms }));
      c.boarding.aiEnabled = false; c.player.power.cannons = c.enemy.power.cannons = 0;
      const invader = c.player.crew[0]; invader.shipId = 'enemy'; invader.room = invader.destination = 5;
      c.enemy.rooms[5].health = 50; c.enemy.rooms[0].health = 50;
      c.paused = false; step(c, .1);
      return { invaded: c.enemy.rooms[5].health, defended: c.enemy.rooms[0].health, invaderHealth: invader.health };
    });
    expect(values[0].invaded).toBe(50); expect(values[0].defended).toBeCloseTo(50.3); expect(values[1]).toEqual(values[0]);
  });
});
