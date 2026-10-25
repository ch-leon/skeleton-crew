import './style.css';
import { allocate, clamp, createCombat, makeShip, moveCrew, ROOM_NAMES, step, SYSTEMS, type Combat, type System } from './combat';
import { drawBattle, type Box } from './render';

const app = document.querySelector<HTMLDivElement>('#app')!;
const symbols: Record<System, string> = { cannons: '✹', ward: '◇', sails: '≋', pumps: '⚓' };
const labels: Record<System, string> = { cannons: 'Cannons', ward: 'Ward-witch', sails: 'Sails', pumps: 'Bilge pumps' };
const nodes = [
  { name: 'A debt to the deep', kind: 'encounter', subtitle: 'The Drowned Bell' },
  { name: 'Black sails ahead', kind: 'battle', subtitle: 'The Black Fin' },
  { name: 'A light in the fog', kind: 'encounter', subtitle: 'Lantern Cay' },
  { name: 'The ferryman’s price', kind: 'encounter', subtitle: 'Widow’s Passage' },
  { name: 'The dead keep sailing', kind: 'battle', subtitle: 'The Pale Sovereign' },
];
const encounters: Record<number, { icon: string; title: string; text: string; choices: { title: string; effect: string; gold: number; hull: number; morale: number; log: string }[] }> = {
  0: { icon: '♧', title: 'A debt to the deep', text: 'A bronze bell tolls beneath the waves. A soaked hand offers you a purse. “A little luck, captain. All it costs is a little courage.” The crew won’t meet your eye.', choices: [
    { title: 'Take the drowned gold', effect: '+25 gold · −12 crew morale', gold: 25, hull: 0, morale: -12, log: 'Took the drowned gold. The bell still rings in our dreams.' },
    { title: 'Give the dead their due', effect: '−10 gold · +15 crew morale', gold: -10, hull: 0, morale: 15, log: 'Paid our respects to the drowned. The crew stood a little taller.' },
  ] },
  2: { icon: '☼', title: 'A light in the fog', text: 'Lantern Cay. Warm stew, dry timber, and a shipwright who knows better than to ask about the green glow below deck. You can afford one good kindness.', choices: [
    { title: 'Patch the Wayward', effect: '−25 gold · +45 hull', gold: -25, hull: 45, morale: 0, log: 'Bought oak and pitch at Lantern Cay. The Wayward will hold.' },
    { title: 'A round for the living', effect: '−15 gold · +25 crew morale', gold: -15, hull: 0, morale: 25, log: 'Shared a round at Lantern Cay. Even Vesper laughed.' },
  ] },
  3: { icon: '☽', title: 'The ferryman’s price', text: 'A boatman with no face blocks Widow’s Passage. Beyond him, a spectral frigate waits. “Pay for safe water,” he whispers, “or let your keel pay for you.”', choices: [
    { title: 'Pay the ferryman', effect: '−20 gold · +20 hull · +8 morale', gold: -20, hull: 20, morale: 8, log: 'Paid the faceless ferryman. He guided us through the teeth of the reef.' },
    { title: 'Run the haunted reef', effect: '+20 gold · −18 hull · −10 morale', gold: 20, hull: -18, morale: -10, log: 'Ran the haunted reef and plundered a wreck. The sea took its share.' },
  ] },
};
let player = makeShip(), gold = 25, stop = 0, log: string[] = [], battle: Combat | null = null;
let screen: 'map' | 'battle' | 'end' = 'map', selected: number | null = null, aiming = false, modal = false;
let boxes: Box[] = [], accumulated = 0, previous = 0, uiClock = 0;
const html = (strings: TemplateStringsArray, ...values: unknown[]) => strings.reduce((s, part, i) => s + part + (values[i] ?? ''), '');

function header() { document.body.classList.toggle('in-battle', screen === 'battle'); return `<header><button class="brand" id="home" aria-label="View sea chart">☠ <span>SKELETON CREW<small>THE HOLLOW SEA</small></span></button><div class="voyage"><span class="live-dot"></span> VOYAGE 01 <i>/</i> ${screen === 'battle' ? 'HOSTILE WATERS' : 'THE HOLLOW SEA'}</div><div class="header-right"><span class="gold">◈ <b id="gold">${gold}</b><span class="gold-label"> GOLD</span></span><button id="help" class="icon-button" aria-label="How to play">?</button></div></header>`; }
function bindHeader() {
  document.querySelector('#help')!.addEventListener('click', showHelp);
  document.querySelector('#home')!.addEventListener('click', () => { if (screen === 'battle') { pause(); showHelp(); } else if (screen === 'map') showJournal(); });
}
function renderMap() {
  screen = 'map'; battle = null; modal = false;
  app.innerHTML = header() + html`<main class="chart-screen">
    <div class="chart-intro"><div><p class="eyebrow">A REAL-TIME-WITH-PAUSE PIRATE VOYAGE</p><h1>Fortune favors<br>the <em>damned.</em></h1><p class="intro-copy">Three souls. One cursed ship.<br>Keep her afloat. Bring them home.</p></div><div class="chart-meta"><span class="chart-number">I</span><p>THE HOLLOW SEA<br><span>5 STOPS · 2 BATTLES · NO SAFE PASSAGE</span></p></div></div>
    <section class="sea-chart" aria-label="Voyage chart, five sequential stops">
      <div class="chart-grid"></div><div class="map-coordinates">24° N &nbsp; 71° W</div><div class="map-land land-one"></div><div class="map-land land-two"></div><div class="map-island"></div>
      <div class="chart-compass"><span>N</span>✧<small>THE HOLLOW SEA</small></div>
      <svg class="route-line" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path d="M100 126 Q200 150 300 72 T500 112 T700 72 T900 105" /></svg>
      <div class="chart-nodes">${nodes.map((n, i) => `<button class="chart-node ${i < stop ? 'visited' : i === stop ? 'current' : 'locked'} node-${i}" data-stop="${i}" ${i !== stop ? 'disabled' : ''} aria-label="${i < stop ? 'Completed: ' : i > stop ? 'Locked: ' : 'Sail to '}${n.subtitle}"><span class="node-index">0${i + 1}</span><span class="node-circle">${i < stop ? '✓' : n.kind === 'battle' ? '☠' : '◇'}</span><span class="node-name">${n.subtitle}</span><small>${i < stop ? 'CHARTED' : n.kind === 'battle' ? i === 4 ? 'GHOST SHIP' : 'BATTLE' : 'ENCOUNTER'}</small></button>`).join('')}</div>
      <div class="chart-legend"><span>◇ ENCOUNTER</span><span>☠ BATTLE</span><span class="legend-current">● YOUR NEXT STOP</span></div>
    </section>
    <footer class="chart-footer"><div class="voyage-stats"><span><small>THE WAYWARD</small><b>${Math.ceil(player.hull)}<i> / 180 HULL</i></b></span><span><small>CREW MORALE</small><b>${Math.round(player.crew.reduce((n, p) => n + p.morale, 0) / 3)}<i> / 100</i></b></span><button class="text-button" id="journal">Ship’s log ↗</button></div><button class="primary sail-button" id="sail">${stop === 0 ? 'Weigh anchor' : 'Set sail'} <span>→</span></button></footer>
  </main>`;
  bindHeader();
  document.querySelector('#sail')!.addEventListener('click', visit);
  document.querySelectorAll<HTMLButtonElement>('[data-stop]').forEach(b => b.addEventListener('click', visit));
  document.querySelector('#journal')!.addEventListener('click', showJournal);
}
function visit() { if (nodes[stop].kind === 'battle') startBattle(); else showEncounter(); }
function overlay(content: string, className = '') {
  modal = true;
  const el = document.createElement('div'); el.className = `modal-backdrop ${className}`; el.id = 'modal'; el.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">${content}</section>`; app.appendChild(el);
  el.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
}
function closeModal() { document.querySelector('#modal')?.remove(); modal = false; }
function showEncounter() {
  if (modal) return;
  const e = encounters[stop];
  overlay(`<p class="eyebrow">CAPTAIN’S DECISION · STOP 0${stop + 1}</p><div class="encounter-icon">${e.icon}</div><h2 id="dialog-title">${e.title}</h2><p class="story">${e.text}</p><div class="choices">${e.choices.map((ch, i) => `<button data-choice="${i}" class="choice" ${gold + ch.gold < 0 ? 'disabled' : ''}><strong>${ch.title} <span>↗</span></strong><small>${ch.effect}${gold + ch.gold < 0 ? ' · Not enough gold' : ''}</small></button>`).join('')}</div><p class="modal-foot">THE SEA REMEMBERS EVERY CHOICE.</p>`);
  document.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(b => b.addEventListener('click', () => {
    const ch = e.choices[Number(b.dataset.choice)]; gold += ch.gold; player.hull = clamp(player.hull + ch.hull, 0, 180);
    for (const p of player.crew) p.morale = clamp(p.morale + ch.morale, 0, 100);
    log.push(ch.log); stop++; closeModal();
    if (player.hull <= 0) finish(false); else renderMap();
  }));
}
function showJournal() {
  if (modal) return;
  overlay(`<p class="eyebrow">THE WAYWARD · VOYAGE 01</p><h2 id="dialog-title">Ship’s log</h2><ol class="log">${log.length ? log.map(l => `<li>${l}</li>`).join('') : '<li>A fair wind and an ill omen. We sail for the Hollow Sea.</li>'}</ol><button class="primary" id="close">Back to the chart →</button>`);
  document.querySelector('#close')!.addEventListener('click', closeModal);
}
function showHelp() {
  if (modal) return;
  pause();
  overlay(`<p class="eyebrow">A CAPTAIN’S FIELD GUIDE</p><h2 id="dialog-title">Command the chaos.</h2><div class="help-grid"><div><b>01 / Pause & plan</b><p>Touch the battlefield to pause. Give orders, then tap Resume. Space also pauses on desktop.</p></div><div><b>02 / Give orders</b><p>Tap a pirate below, then a friendly room. Crew walk there and automatically fight fires, seal holes, and repair.</p></div><div><b>03 / Fire at will</b><p>Tap Cannons on the power rail, then an enemy room. Cannons repeat fire when charged. Ward absorbs hits.</p></div><div><b>04 / Mind the power</b><p>Six power total. Use − to free power, then + to assign it. Sails dodge; pumps drain water. Morale below 35 slows crew.</p></div></div><p class="story help-traits">Rook reloads faster at Cannons. Nell repairs faster. Vesper boosts the Ward-witch. Keep them out of fire; gold buys relief at encounters.</p><button id="close" class="primary">Aye, captain →</button>`);
  document.querySelector('#close')!.addEventListener('click', () => { closeModal(); if (battle) updateBattleUI(); });
}
function startBattle() {
  screen = 'battle'; selected = null; aiming = false;
  battle = createCombat(player, stop === 4); accumulated = 0;
  app.innerHTML = header() + `<main class="battle-screen"><div class="battle-status"><div class="ship-status"><span class="status-label">THE WAYWARD</span><span class="hull-bar"><i id="player-hull-bar"></i></span><b id="player-hull"></b><span class="ward-label" id="player-ward"></span></div><div class="time-label" id="battle-time">00:00</div><div class="ship-status enemy-status"><span class="status-label">${stop === 4 ? 'PALE SOVEREIGN' : 'BLACK FIN'}</span><span class="hull-bar"><i id="enemy-hull-bar"></i></span><b id="enemy-hull"></b><span class="ward-label" id="enemy-ward"></span></div></div>
    <div class="battlefield" id="battlefield"><canvas id="battle-canvas" aria-label="Side-on cutaway view of your ship on the left and the enemy ship on the right"></canvas><div id="room-controls"></div><div class="pause-banner" id="pause-banner"><span>Ⅱ TACTICAL PAUSE</span><small>Give your orders. Take your time.</small></div></div>
    <div class="command-strip"><span id="command-hint" aria-live="polite"></span><span class="charge-badge" id="charge-badge"></span><span class="last-event" id="last-event"></span><button class="resume" id="pause">Resume ▶</button></div>
    <div class="crew-roster">${player.crew.map((p, i) => `<button class="crew-card" data-crew="${i}" aria-label="Select ${p.name}, ${p.trait}"><span class="crew-avatar avatar-${i}">${['R', 'N', 'V'][i]}</span><span class="crew-info"><strong>${p.name} <small>${p.trait}</small></strong><span class="crew-location" id="crew-location-${i}"></span><span class="morale-track"><i id="morale-${i}"></i></span></span><span class="crew-vitals"><span id="crew-morale-${i}"></span><small id="crew-health-${i}"></small></span></button>`).join('')}</div>
    <div class="power-rail"><div class="power-budget"><small>POWER</small><strong id="power-free">0<span>/6</span></strong></div>${SYSTEMS.map(s => `<div class="system" data-system="${s}"><button class="system-label" data-select-system="${s}" aria-label="${s === 'cannons' ? 'Select cannons to target enemy room' : labels[s] + ' information'}"><span>${symbols[s]}</span><strong>${labels[s]}</strong><small id="system-detail-${s}"></small></button><div class="power-controls"><button data-power="${s}" data-delta="-1" aria-label="Remove power from ${labels[s]}">−</button><div class="power-pips" id="pips-${s}"></div><button data-power="${s}" data-delta="1" aria-label="Add power to ${labels[s]}">+</button></div></div>`).join('')}</div></main>`;
  bindHeader();
  document.querySelector('#pause')!.addEventListener('click', togglePause);
  document.querySelector('#battlefield')!.addEventListener('click', e => { if ((e.target as HTMLElement).tagName !== 'BUTTON') { pause(); updateBattleUI(); } });
  document.querySelectorAll<HTMLButtonElement>('[data-crew]').forEach(b => b.addEventListener('click', () => { pause(); const i = Number(b.dataset.crew); if (player.crew[i].health <= 0) return; selected = selected === i ? null : i; aiming = false; updateBattleUI(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-select-system]').forEach(b => b.addEventListener('click', () => {
    pause(); selected = null; aiming = b.dataset.selectSystem === 'cannons';
    updateBattleUI();
    if (!aiming) document.querySelector('#command-hint')!.textContent = { ward: 'Ward: absorbs hits; recharges after 5 seconds of safety.', sails: 'Sails: each power gives 5% dodge chance.', pumps: 'Bilge pumps: each power drains water from every room.' }[b.dataset.selectSystem as 'ward' | 'sails' | 'pumps'];
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-power]').forEach(b => b.addEventListener('click', () => { pause(); allocate(player, b.dataset.power as System, Number(b.dataset.delta)); updateBattleUI(); }));
  draw(); updateBattleUI();
}
function pause() { if (battle && !battle.result) { battle.paused = true; accumulated = 0; updateBattleUI(); } }
function togglePause() { if (!battle || battle.result || modal || matchMedia('(orientation: portrait)').matches) return; battle.paused = !battle.paused; accumulated = 0; updateBattleUI(); }
function roomClick(enemy: boolean, index: number) {
  if (!battle || modal || battle.result) return;
  if (!battle.paused) { pause(); return; }
  if (enemy) { battle.target = index; aiming = false; selected = null; }
  else if (selected !== null) { moveCrew(player, selected, index); }
  else { const i = player.crew.findIndex(p => p.room === index && p.health > 0); if (i >= 0) selected = i; }
  updateBattleUI();
}
let lastLayout = '';
function draw() {
  if (!battle || screen !== 'battle') return;
  const canvas = document.querySelector<HTMLCanvasElement>('#battle-canvas')!;
  boxes = drawBattle(canvas, battle, selected, aiming, battle.elapsed);
  const key = `${canvas.width}:${canvas.height}`;
  if (key !== lastLayout || !document.querySelector('.room-hit')) {
    lastLayout = key;
    document.querySelector('#room-controls')!.innerHTML = boxes.map(b => `<button class="room-hit" data-room="${b.index}" data-enemy="${b.enemy}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px" aria-label="${b.enemy ? 'Target enemy' : 'Move selected pirate to'} ${ROOM_NAMES[b.index]}"></button>`).join('');
    document.querySelectorAll<HTMLButtonElement>('.room-hit').forEach(b => b.addEventListener('click', () => roomClick(b.dataset.enemy === 'true', Number(b.dataset.room))));
  }
}
function updateBattleUI() {
  if (!battle || screen !== 'battle') return;
  const c = battle;
  const set = (id: string, text: string) => { const e = document.getElementById(id); if (e && e.textContent !== text) e.textContent = text; };
  for (const [side, ship] of [['player', c.player], ['enemy', c.enemy]] as const) {
    set(`${side}-hull`, `${Math.ceil(ship.hull)}/${ship.maxHull}`);
    (document.getElementById(`${side}-hull-bar`)! as HTMLElement).style.width = `${ship.hull / ship.maxHull * 100}%`;
    set(`${side}-ward`, `◇ ${Math.floor(ship.ward)}`);
  }
  set('battle-time', `${Math.floor(c.elapsed / 60).toString().padStart(2, '0')}:${Math.floor(c.elapsed % 60).toString().padStart(2, '0')}`);
  set('pause', c.paused ? 'Resume ▶' : 'Pause Ⅱ');
  document.querySelector('#pause')!.classList.toggle('running', !c.paused);
  document.querySelector('#pause-banner')!.classList.toggle('hidden', !c.paused);
  set('command-hint', selected !== null ? `${player.crew[selected].name} selected → tap a friendly room` : aiming ? 'Cannons selected → tap an enemy room' : c.paused ? `Orders ready · target: ${ROOM_NAMES[c.target]}` : 'Touch the battlefield to pause & command');
  set('last-event', c.events.at(-1) || '');
  set('charge-badge', `✹ ${Math.floor(player.charge * 100)}%`);
  player.crew.forEach((p, i) => {
    set(`crew-location-${i}`, p.health <= 0 ? 'Incapacitated' : p.travel > 0 ? `→ ${ROOM_NAMES[p.destination]}` : ROOM_NAMES[p.room]);
    set(`crew-morale-${i}`, `${Math.round(p.morale)} MRL`); set(`crew-health-${i}`, `${Math.ceil(p.health)} HP`);
    const bar = document.getElementById(`morale-${i}`)! as HTMLElement; bar.style.width = `${p.morale}%`; bar.style.background = p.morale < 35 ? '#ee936e' : ['#e3b474', '#91d6af', '#82b8cf'][i];
    document.querySelector(`[data-crew="${i}"]`)!.classList.toggle('selected', selected === i);
  });
  const used = Object.values(player.power).reduce((a, b) => a + b, 0); set('power-free', `${6 - used}/6`);
  for (const s of SYSTEMS) {
    const n = player.power[s];
    const el = document.getElementById(`pips-${s}`)!;
    const markup = [0, 1, 2].map(i => `<i class="${i < n ? 'filled' : ''}"></i>`).join(''); if (el.innerHTML !== markup) el.innerHTML = markup;
    document.querySelector<HTMLButtonElement>(`[data-power="${s}"][data-delta="-1"]`)!.disabled = n === 0;
    document.querySelector<HTMLButtonElement>(`[data-power="${s}"][data-delta="1"]`)!.disabled = n === 3 || used === 6;
    document.querySelector(`[data-system="${s}"]`)!.classList.toggle('aiming', s === 'cannons' && aiming);
    set(`system-detail-${s}`, s === 'cannons' ? `${Math.floor(player.charge * 100)}% CHARGED` : s === 'ward' ? `${Math.floor(player.ward)}/12 WARD` : s === 'sails' ? `${n * 5}% BASE DODGE` : n === 0 ? 'OFFLINE' : 'DRAINING');
  }
}
function resolveBattle() {
  if (!battle || modal) return;
  const c = battle;
  if (c.result === 'lose') { log.push(`The Wayward sank to ${c.ghost ? 'the Pale Sovereign' : 'the Black Fin'} after ${Math.floor(c.elapsed / 60)}m ${Math.floor(c.elapsed % 60)}s.`); finish(false); return; }
  const reward = c.ghost ? 65 : 35; gold += reward;
  log.push(`Sank ${c.ghost ? 'the Pale Sovereign' : 'the Black Fin'} in ${Math.floor(c.elapsed / 60)}m ${Math.floor(c.elapsed % 60)}s. Plundered ${reward} gold.`);
  for (const p of player.crew) { p.health = 100; p.morale = Math.min(100, p.morale + 8); }
  stop++;
  if (stop >= 5) { finish(true); return; }
  overlay(`<p class="eyebrow">THE SEA IS YOURS. FOR NOW.</p><div class="encounter-icon">⚓</div><h2 id="dialog-title">A fine broadside.</h2><p class="story">The Black Fin slips beneath the waves. Your crew hauls aboard a chest and catches their breath.</p><div class="reward"><span>+${reward} GOLD</span><span>+8 CREW MORALE</span></div><p class="story">Hull remaining: ${Math.ceil(player.hull)}/180. Crew recover; room damage and hazards clear between battles.</p><button class="primary" id="continue">Back to the sea chart →</button>`);
  document.querySelector('#continue')!.addEventListener('click', () => { closeModal(); renderMap(); });
}
function finish(victory: boolean) {
  screen = 'end'; battle = null; modal = false;
  app.innerHTML = header() + `<main class="end-screen"><p class="eyebrow">VOYAGE 01 · ${victory ? 'THE CURSE BREAKS' : 'LOST TO THE HOLLOW SEA'}</p><div class="end-skull">☠</div><h1>${victory ? 'The living<br><em>have the last word.</em>' : 'The sea keeps<br><em>her secrets.</em>'}</h1><p class="intro-copy">${victory ? 'The Pale Sovereign is gone. Dawn belongs to your crew.' : 'Another bell rings beneath the waves. Another captain answers.'}</p><div class="end-stats"><span><b>${gold}</b> GOLD</span><span><b>${Math.ceil(player.hull)}</b> HULL</span><span><b>${player.crew.filter(p => p.health > 0).length}/3</b> CREW</span></div><h3>THE SHIP’S LOG</h3><ol class="log">${log.map(l => `<li>${l}</li>`).join('')}</ol><button id="restart" class="primary">Sail another day ↻</button></main>`;
  bindHeader(); document.querySelector('#restart')!.addEventListener('click', () => { player = makeShip(); gold = 25; stop = 0; log = []; renderMap(); });
}
// Trap focus inside modal dialogs, preserving keyboard use alongside touch.
document.addEventListener('keydown', e => {
  if (modal && e.key === 'Tab') {
    const focusable = [...document.querySelectorAll<HTMLButtonElement>('#modal button:not(:disabled)')];
    if (!focusable.length) return;
    const i = focusable.indexOf(document.activeElement as HTMLButtonElement);
    if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === focusable.length - 1)) { e.preventDefault(); focusable[e.shiftKey ? focusable.length - 1 : 0].focus(); }
  }
  if (e.code === 'Space' && screen === 'battle' && !modal && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); togglePause(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('resize', () => { if (matchMedia('(orientation: portrait)').matches) pause(); lastLayout = ''; draw(); });
const rotate = document.createElement('div'); rotate.className = 'rotate-overlay'; rotate.innerHTML = '<span>↻</span><h2>Turn the tide.</h2><p>Rotate your phone to landscape<br>to captain the Wayward.</p><small>YOUR VOYAGE IS PAUSED</small>'; document.body.appendChild(rotate);
function frame(timestamp: number) {
  const dt = previous ? Math.min((timestamp - previous) / 1000, .25) : 0; previous = timestamp;
  if (battle && screen === 'battle') {
    if (!battle.paused && !document.hidden && !matchMedia('(orientation: portrait)').matches) {
      accumulated += dt;
      while (accumulated >= .1 && !battle.result) { step(battle, .1); accumulated -= .1; }
    }
    draw(); uiClock += dt;
    if (uiClock > .1) { updateBattleUI(); uiClock = 0; }
    if (battle.result && !modal) resolveBattle();
  }
  requestAnimationFrame(frame);
}
renderMap(); requestAnimationFrame(frame);
// Deliberately no persistent save: this slice is one short, replayable voyage.
