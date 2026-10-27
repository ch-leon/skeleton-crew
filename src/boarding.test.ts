import { describe, expect, it } from 'vitest';
import { allocate, createCombat, impact, makeShip, step, type Combat, type Pirate } from './combat';
import { allCrew, cancelBoard, finalizeBoarding, moveCrewById, occupants, queueBoard, queueRetreat, stepBoarding } from './boarding';
const advance = (c: Combat, seconds: number) => { for (let i = 0; i < Math.round(seconds * 10); i++) step(c, .1); };
function fixture() {
  const c = createCombat(makeShip(), false, () => .99); c.paused = false; c.boarding.aiEnabled = false;
  c.player.power.cannons = c.enemy.power.cannons = 0; return c;
}
function locate(p: Pirate, ship: 'player' | 'enemy', room: number) { p.shipId = ship; p.room = p.destination = room; p.travel = 0; p.transit = null; }
function invader(c: Combat, room: number) { const p = c.player.crew[0]; locate(p, 'enemy', room); c.enemy.crew = []; return p; }
function snapshot(c: Combat) { return JSON.stringify(c); }
describe('grapple lifecycle and occupancy', () => {
  it('makes the hook available after exactly twelve active seconds', () => {
    const c = fixture(), p = c.player.crew[0]; c.enemy.crew = [];
    locate(p, 'player', 4); queueBoard(c, p.id, 4); advance(c, 5.1);
    expect(c.boarding.hooks.player.cooldown).toBe(12);
    queueRetreat(c, p.id); advance(c, 12);
    expect(p.shipId).toBe('player');
    expect(c.boarding.hooks.player.cooldown).toBe(0);
    expect(queueBoard(c, p.id, 5)).toEqual({ ok: true });
  });
  it('freezes nonzero capture, movement, cooldown and an imminent AI decision together', () => {
    const c = fixture(), p = c.player.crew[0]; locate(p, 'enemy', 5);
    moveCrewById(c, c.player.crew[1].id, 'player', 4);
    c.boarding.aiEnabled = true; c.boarding.aiClock = 1.9;
    c.boarding.hooks.player.cooldown = 7; c.boarding.capture.enemy[5].progress = 2.9;
    c.paused = true; const before = snapshot(c);
    advance(c, 30); stepBoarding(c, 30); expect(snapshot(c)).toBe(before);
    c.paused = false; advance(c, .1);
    expect(c.boarding.capture.enemy[5].captured).toBe(true);
    expect(c.boarding.hooks.player.cooldown).toBeCloseTo(6.9);
    expect(c.enemy.crew.some(p => p.destination === 5)).toBe(true);
  });
  it.each(['player', 'enemy'] as const)('boards and retreats with timed phases for %s', faction => {
    const c = fixture(), p = c[faction].crew[0], destination = faction === 'player' ? 'enemy' : 'player';
    locate(p, faction, 4);
    expect(queueBoard(c, p.id, 5)).toEqual({ ok: true });
    expect(occupants(c, faction)).toContain(p);
    advance(c, .1); expect(p.transit?.phase).toBe('attachment');
    advance(c, 1.9); expect(p.transit?.phase).toBe('attachment'); expect(occupants(c, faction)).toContain(p);
    advance(c, .1); expect(p.transit?.phase).toBe('crossing');
    expect(occupants(c, faction)).not.toContain(p); expect(occupants(c, destination)).not.toContain(p);
    const health = p.health; c[faction].rooms[4].fire = 1; advance(c, 2.9); expect(p.health).toBe(health);
    advance(c, .1); expect(p.shipId).toBe(destination); expect(p.room).toBe(5); expect(p.transit).toBeNull();
    expect(c[faction].crew).toContain(p); expect(c[destination].crew).not.toContain(p);
    expect(c.boarding.hooks[faction].cooldown).toBe(12);
    expect(queueRetreat(c, p.id).ok).toBe(true); expect(p.shipId).toBe(destination);
    advance(c, 4.2); expect(p.transit?.phase).toBe('crossing');
    advance(c, .2); expect(p.shipId).toBe(faction); expect(p.room).toBe(4);
    expect(c.boarding.hooks[faction].cooldown).toBeGreaterThan(0);
  });
  it('stages using origin occupancy, morale and flooding movement timing', () => {
    const c = fixture(), p = c.player.crew[0]; p.morale = 20; c.player.rooms[0].water = .8; c.player.power.pumps = 0;
    queueBoard(c, p.id, 5); advance(c, 2);
    expect(p.room).toBe(0); expect(p.transit?.phase).toBe('staging'); expect(occupants(c, 'player', 0)).toContain(p);
    expect(p.travel).toBeGreaterThan(1); advance(c, 6); expect(p.room).toBe(4);
  });
  it('replaces and cancels pending orders; rejects invalid orders without mutation', () => {
    const c = fixture(), p = c.player.crew[0]; queueBoard(c, p.id, 0); advance(c, .1);
    expect(queueBoard(c, p.id, 1).ok).toBe(true); expect(p.transit?.destinationRoom).toBe(1);
    expect(cancelBoard(c, p.id).ok).toBe(true); expect(p.transit).toBeNull(); expect(c.boarding.hooks.player.active).toBeNull();
    c.boarding.hooks.player.cooldown = 5; const before = snapshot(c);
    expect(queueBoard(c, p.id, 1)).toEqual({ ok: false, reason: 'Hook cooling down' }); expect(snapshot(c)).toBe(before);
    c.boarding.hooks.player.cooldown = 0; p.health = 0; const dead = snapshot(c);
    expect(queueBoard(c, p.id, 1)).toEqual({ ok: false, reason: 'Crew incapacitated' }); expect(snapshot(c)).toBe(dead);
    p.health = 100; locate(p, 'player', 4); queueBoard(c, p.id, 5); advance(c, 2.1); const crossing = snapshot(c);
    expect(queueBoard(c, p.id, 1)).toEqual({ ok: false, reason: 'Already crossing' }); expect(cancelBoard(c, p.id).ok).toBe(false);
    expect(moveCrewById(c, p.id, 'player', 0).ok).toBe(false); expect(snapshot(c)).toBe(crossing);
  });
  it('prioritizes FIFO retreats over outbound requests; slots release until the following tick', () => {
    const c = fixture(), [a, b, d] = c.player.crew; c.enemy.crew = [];
    locate(a, 'player', 4); locate(b, 'enemy', 4); locate(d, 'enemy', 4);
    queueBoard(c, a.id, 5); advance(c, 2.1); queueRetreat(c, b.id); queueRetreat(c, d.id);
    advance(c, 3); expect(c.boarding.hooks.player.active).toBeNull(); expect(b.transit?.phase).toBe('queued');
    advance(c, .1); expect(c.boarding.hooks.player.active).toBe(b.id); expect(d.transit?.phase).toBe('queued');
    advance(c, 3); expect(c.boarding.hooks.player.active).toBeNull(); advance(c, .1); expect(c.boarding.hooks.player.active).toBe(d.id);
    for (const p of allCrew(c)) expect(Number(occupants(c, 'player').includes(p)) + Number(occupants(c, 'enemy').includes(p)) + Number(p.transit?.phase === 'crossing')).toBe(1);
  });
  it('incapacitation during attachment cancels and releases the hook', () => {
    const c = fixture(), p = c.player.crew[0]; locate(p, 'player', 4); p.health = .01; c.player.rooms[4].fire = 1;
    queueBoard(c, p.id, 5); advance(c, .1); expect(p.health).toBe(0); expect(p.transit).toBeNull(); expect(c.boarding.hooks.player.active).toBeNull();
    advance(c, 10); expect(p.health).toBe(0);
  });
  it('pauses every field during stages, crossing, cooldown, capture and AI decisions', () => {
    const c = fixture(), p = c.player.crew[0]; locate(p, 'player', 4); queueBoard(c, p.id, 5);
    for (const duration of [.1, 2, 3, 1]) {
      c.paused = false; advance(c, duration); c.paused = true; const before = snapshot(c);
      advance(c, 30); stepBoarding(c, 30); expect(snapshot(c)).toBe(before);
    }
  });
});
describe('melee, physical hazards and crew work', () => {
  it('selects the lowest stable ID and applies simultaneous damage with morale', () => {
    const c = fixture(), p = c.player.crew[0]; locate(p, 'enemy', 0);
    const [a,b] = c.enemy.crew; locate(a, 'enemy', 0); locate(b, 'enemy', 0); a.id = 'z'; b.id = 'a'; p.morale = 20;
    advance(c, .1); expect(p.health).toBe(99); expect(b.health).toBeCloseTo(99.7); expect(a.health).toBe(100);
    a.health = 0; p.health = b.health = .3; advance(c, .1); expect(p.health).toBe(0); expect(b.health).toBe(0);
    advance(c, 10); expect(p.health).toBe(0); expect(b.health).toBe(0);
  });
  it('moving crew can be attacked at origin but cannot attack or work', () => {
    const c = fixture(), p = c.player.crew[0]; locate(p, 'enemy', 0); const enemy = c.enemy.crew[0]; locate(enemy, 'enemy', 0); c.enemy.crew = [enemy];
    moveCrewById(c, p.id, 'enemy', 1); advance(c, .1);
    expect(p.room).toBe(0); expect(p.health).toBe(99.5); expect(enemy.health).toBe(100);
    advance(c, 1.1); expect(p.room).toBe(1); const health = p.health; advance(c, .1); expect(p.health).toBeGreaterThan(health);
  });
  it('uses abroad hazards once and prevents invader work or home trait bonuses', () => {
    const c = fixture(), p = invader(c, 0); c.enemy.rooms[0].fire = .4; c.player.rooms[0].fire = 1;
    advance(c, .1); expect(p.health).toBeCloseTo(99.9); expect(c.enemy.rooms[0].fire).toBeGreaterThan(.4);
    c.player.rooms[0].fire = 0; c.player.power.cannons = 2; const charge = c.player.charge;
    advance(c, .1); expect(c.player.charge - charge).toBeCloseTo(.1 / 16);
    const witch = c.player.crew[2]; locate(witch, 'enemy', 1); c.player.ward = 0; c.player.hitAgo = 10;
    advance(c, .1); expect(c.player.ward).toBeCloseTo(.036);
  });
  it('engagement suppresses work, healing and station traits; safe defenders still work', () => {
    const c = fixture(), p = c.player.crew[0], enemy = c.enemy.crew[0]; locate(enemy, 'player', 0); c.enemy.crew = [enemy];
    c.player.rooms[0].health = 50; c.player.power.cannons = 2; c.player.rooms[3].health = 50;
    advance(c, .1); expect(p.health).toBe(99.5); expect(c.player.rooms[0].health).toBe(50); expect(c.player.rooms[3].health).toBeGreaterThan(50);
    expect(c.player.charge).toBeCloseTo(.1 / 16 * .5);
  });
  it('impact morale follows physical occupancy and excludes a crossing pirate', () => {
    const c = fixture(), p = invader(c, 5); c.enemy.ward = 0; impact(c, c.enemy, 5, 1, false); expect(p.morale).toBe(72);
    queueRetreat(c, p.id); advance(c, 1.5); expect(p.transit?.phase).toBe('crossing'); const morale = p.morale;
    impact(c, c.enemy, 4, 1, false); expect(p.morale).toBe(morale);
  });
});
describe('capture and system restoration', () => {
  it.each([0,1,2,3,4,5])('requires three uninterrupted seconds in room %s and releases immediately', room => {
    const c = fixture(), p = invader(c, room); advance(c, 2.9); expect(c.boarding.capture.enemy[room].captured).toBe(false);
    advance(c, .1); expect(c.boarding.capture.enemy[room].captured).toBe(true); expect(c.enemy.hull).toBe(130); expect(c.result).toBeNull();
    moveCrewById(c, p.id, 'enemy', room === 0 ? 1 : 0); advance(c, .1); expect(c.boarding.capture.enemy[room].captured).toBe(true);
    advance(c, 4); expect(c.boarding.capture.enemy[room].captured).toBe(false);
  });
  it('resets progress on contest and releases when the final invader falls', () => {
    const c = fixture(), p = c.player.crew[0]; locate(p, 'enemy', 5); advance(c, 2);
    locate(c.enemy.crew[0], 'enemy', 5); advance(c, .1); expect(c.boarding.capture.enemy[5].progress).toBe(0);
    c.enemy.crew = []; advance(c, 3); expect(c.boarding.capture.enemy[5].captured).toBe(true);
    p.health = 0; advance(c, .1); expect(c.boarding.capture.enemy[5].captured).toBe(false);
  });
  it.each([0,1,2,3])('disables only captured system %s without deleting charge, ward or power', room => {
    const c = fixture(), p = invader(c, room); c.enemy.power = { cannons: 2, ward: 1, sails: 1, pumps: 1 };
    advance(c, 3); const power = { ...c.enemy.power }; c.enemy.charge = .5; c.enemy.ward = 5; c.enemy.hitAgo = 10; c.enemy.rooms[5].water = .5;
    const ward = c.enemy.ward; advance(c, .1);
    if (room === 0) expect(c.enemy.charge).toBe(.5); else expect(c.enemy.charge).toBeGreaterThan(.5);
    if (room === 1) expect(c.enemy.ward).toBe(ward); else expect(c.enemy.ward).toBeGreaterThan(ward);
    if (room === 3) expect(c.enemy.rooms[5].water).toBe(.5); else expect(c.enemy.rooms[5].water).toBeLessThan(.5);
    c.rng = () => 0; impact(c, c.enemy, 5, 1, false); expect(c.effects.at(-1)?.kind).toBe(room === 2 ? 'ward' : 'dodge');
    expect(c.enemy.power).toEqual(power); expect(allocate(c.enemy, 'cannons', 2)).toBe(false);
    p.health = 0; advance(c, .1); expect(c.boarding.capture.enemy[room].captured).toBe(false);
  });
  it('stalls even a full cannon charge; does not clear it', () => {
    const c = fixture(); invader(c, 0); advance(c, 3); c.enemy.power.cannons = 2; c.enemy.charge = 1;
    advance(c, .1); expect(c.enemy.charge).toBe(1); expect(c.effects).toHaveLength(0);
    c.player.crew[0].health = 0; advance(c, .1); expect(c.enemy.charge).toBe(0); expect(c.effects).toHaveLength(1);
  });
});
describe('enemy decisions and terminal cleanup', () => {
  it('boards on its deterministic clock and keeps a home defender', () => {
    const c = fixture(); c.boarding.aiEnabled = true; advance(c, 1.9); expect(c.enemy.crew.some(p => p.transit)).toBe(false);
    advance(c, .1); expect(c.enemy.crew[0].transit?.destinationRoom).toBe(0); advance(c, 6);
    expect(c.enemy.crew.some(p => p.shipId === 'player')).toBe(true);
    expect(occupants(c, 'enemy').filter(p => p.faction === 'enemy' && p.health > 0)).toHaveLength(1);
    expect(c.events.some(e => e.includes('hook attaching'))).toBe(true);
  });
  it('defends home and orders a wounded boarder to retreat without teleporting', () => {
    const c = fixture(); c.boarding.aiEnabled = true; const enemy = c.enemy.crew[0]; locate(c.player.crew[0], 'enemy', 5);
    advance(c, 2); expect(c.enemy.crew.some(p => p.destination === 5)).toBe(true);
    locate(enemy, 'player', 5); enemy.health = 20; advance(c, 2); expect(enemy.transit?.retreat).toBe(true); expect(enemy.shipId).toBe('player');
    advance(c, 5); expect(enemy.shipId).toBe('enemy');
  });
  it('does not voluntarily send the last conscious defender', () => {
    const c = fixture(); c.boarding.aiEnabled = true; c.enemy.crew[1].health = 0; advance(c, 10);
    expect(c.enemy.crew[0].shipId).toBe('enemy'); expect(c.enemy.crew[0].transit).toBeNull();
  });
  it('rescues every owned pirate exactly once, leaving recovery and rewards to A', () => {
    const c = fixture(), [a,b,d] = c.player.crew; locate(a, 'enemy', 0); a.health = 0; locate(b, 'player', 4); queueBoard(c, b.id, 5); advance(c, 2.1);
    locate(d, 'enemy', 4); queueRetreat(c, d.id); c.enemy.hull = 0; step(c, .1);
    expect(c.result).toBe('win'); expect(c.player.crew).toHaveLength(3);
    for (const p of c.player.crew) { expect(p.shipId).toBe('player'); expect(p.room).toBe(4); expect(p.transit).toBeNull(); }
    expect(a.health).toBe(0); expect(c.boarding.hooks.player.queue).toHaveLength(0); expect(c.boarding.hooks.player.active).toBeNull();
    const before = snapshot(c); expect(finalizeBoarding(c)).toBeNull(); advance(c, 30); expect(snapshot(c)).toBe(before);
  });
  it('defeat freezes crossings/orders, with no rescue or further AI', () => {
    const c = fixture(), p = c.player.crew[0]; locate(p, 'player', 4); queueBoard(c, p.id, 5); advance(c, 2.1);
    c.player.hull = c.enemy.hull = 0; step(c, .1); expect(c.result).toBe('lose'); expect(p.transit?.phase).toBe('crossing');
    const before = snapshot(c); expect(finalizeBoarding(c)).toBeNull(); advance(c, 30); expect(snapshot(c)).toBe(before);
  });
});

describe('command routing contract', () => {
  it('running room tap only pauses; board never changes artillery target', async () => {
    const { commandRoom } = await import('./boarding'); const c = fixture(); c.target = 3;
    expect(commandRoom(c, 'rook', 'board', 'enemy', 0).ok).toBe(true); expect(c.paused).toBe(true); expect(c.player.crew[0].transit).toBeNull();
    expect(commandRoom(c, 'rook', 'board', 'enemy', 0).ok).toBe(true); expect(c.target).toBe(3); expect(c.player.crew[0].transit?.destinationRoom).toBe(0);
    expect(commandRoom(c, null, 'aim', 'enemy', 1).ok).toBe(true); expect(c.target).toBe(1);
    const before = snapshot(c); expect(commandRoom(c, 'enemy-0', 'board', 'enemy', 4).ok).toBe(false); expect(snapshot(c)).toBe(before);
  });
});

describe('combat pass boundaries', () => {
  it('does not heal, work or grant a trait during the tick that kills the last opponent', () => {
    const c = fixture(), p = c.player.crew[0], e = c.enemy.crew[0]; c.enemy.crew = [e];
    locate(e, 'player', 0); p.health = 50; e.health = .1; c.player.rooms[0].health = 50; c.player.power.cannons = 2;
    advance(c, .1); expect(e.health).toBe(0); expect(p.health).toBe(49.5); expect(c.player.rooms[0].health).toBe(50);
    expect(c.player.charge).toBeCloseTo(.1 / 16 * .5);
    advance(c, .1); expect(p.health).toBeGreaterThan(49.5); expect(c.player.rooms[0].health).toBeGreaterThan(50);
  });
  it('cancels retreat when incapacitated before escape even through a contested Cargo', () => {
    const c = fixture(), p = c.player.crew[0], e = c.enemy.crew[0]; locate(p, 'enemy', 4); locate(e, 'enemy', 4); p.health = .1;
    expect(queueRetreat(c, p.id).ok).toBe(true); advance(c, .1);
    // Return starts immediately when already at Cargo; in transit it is immune.
    expect(p.transit?.phase).toBe('crossing'); expect(p.health).toBeGreaterThan(0);
    locate(p, 'enemy', 5); p.health = .1; locate(e, 'enemy', 5); cancelBoard(c, p.id); queueRetreat(c, p.id); advance(c, .1);
    expect(p.health).toBe(0); expect(p.transit).toBeNull(); expect(c.boarding.hooks.player.active).toBeNull();
  });
  it('cancels enemy departure if its final other defender falls while attaching', () => {
    const c = fixture(); c.boarding.aiEnabled = true; advance(c, 2.1); c.enemy.crew[1].health = 0;
    advance(c, 2.1); expect(c.enemy.crew[0].shipId).toBe('enemy'); expect(c.enemy.crew[0].transit).toBeNull();
  });
});

describe('attachment occupancy', () => {
  it('stationary crew still fight while attaching; crossing removes all room participation', () => {
    const c = fixture(), p = c.player.crew[0], e = c.enemy.crew[0]; c.enemy.crew = [e];
    locate(p, 'player', 4); locate(e, 'player', 4); queueBoard(c, p.id, 5);
    advance(c, .1); expect(p.transit?.phase).toBe('attachment'); expect(p.health).toBe(99.5); expect(e.health).toBe(99.5);
    advance(c, 2); expect(p.transit?.phase).toBe('crossing'); const hp = p.health; advance(c, 1); expect(p.health).toBe(hp);
  });
});
