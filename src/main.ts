import './style.css';
import { allocate, createCombat, ROOM_NAMES, step, SYSTEMS, type Combat, type System } from './combat';
import { drawBattle, type Box } from './render';
import { mountChart } from './chart-view';
import { nodeAt } from './chart';
import { completeVisit, createRun, commitJump, encounters, initializePort } from './run';
import { ownedCrewId, routeRoomOrder, type MountedView, type CommandMode, type FeatureAdapters } from './contracts';

import { queueBoard, queueRetreat, moveCrewById, stepBoarding, finalizeBoarding, cancelBoard } from './boarding';
import { mountBoarding, locationLabel, roomActionLabel } from './boarding-view';
import { createPortStock, quotePurchase, purchase } from './port';
import { mountPort } from './port-view';
import { deriveModifiers } from './equipment';

// Inline icon avoids a host-root favicon request under the Pages base path.
const icon = document.createElement('link'); icon.rel = 'icon';
icon.href = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="26" font-size="28">⚓</text></svg>')}`;
document.head.appendChild(icon);
const app = document.querySelector<HTMLDivElement>('#app')!;
const symbols: Record<System, string> = { cannons: '✹', ward: '◇', sails: '≋', pumps: '⚓' };
const labels: Record<System, string> = { cannons: 'Cannons', ward: 'Ward-witch', sails: 'Sails', pumps: 'Bilge pumps' };
let run = createRun(crypto.getRandomValues(new Uint32Array(1))[0]);
const features: FeatureAdapters = {
  boarding: {
    queueBoard, queueRetreat, moveCrewById, stepBoarding, finalizeBoarding,
    mount: (root, read, commands) => mountBoarding(root, () => {
      const state = read(); return { combat: state.combat, selectedId: state.selectedCrewId, mode: state.mode };
    }, {
      selectCrew: commands.selectCrew,
      setMode: () => commands.board(),
      retreat: () => commands.retreat(),
      cancel: id => {
        const result = cancelBoard(read().combat, id);
        if (!result.ok) read().combat.events.push(result.reason);
        closeModal(); updateBattleUI();
      },
    }),
  },
  port: { createPortStock, quotePurchase, purchase, mount: mountPort },
  createBattle: (state, boss) => createCombat(state.player, boss, Math.random, deriveModifiers(state.equipment)),
};
let battle: Combat | null = null;
let screen: 'map' | 'battle' | 'port' | 'end' = 'map', selected: string | null = null, mode: CommandMode = 'inspect', modal = false;
let view: MountedView | null = null;
let boardingView: (MountedView & { render?(): void }) | null = null;
const playerShip = () => run.player;
function disposeView() { boardingView?.dispose(); boardingView = null; view?.dispose(); view = null; }
let boxes: Box[] = [], accumulated = 0, previous = 0, uiClock = 0;
function header() { document.body.classList.toggle('in-battle', screen === 'battle'); return `<header><button class="brand" id="home" aria-label="View sea chart">☠ <span>SKELETON CREW<small>THE HOLLOW SEA</small></span></button><div class="voyage"><span class="live-dot"></span> VOYAGE 01 <i>/</i> ${screen === 'battle' ? 'HOSTILE WATERS' : 'THE HOLLOW SEA'}</div><div class="header-right"><span class="gold">◈ <b id="gold">${run.gold}</b><span class="gold-label"> GOLD</span></span><button id="help" class="icon-button" aria-label="How to play">?</button></div></header>`; }
function bindHeader() {
  document.querySelector('#help')!.addEventListener('click', showHelp);
  document.querySelector('#home')!.addEventListener('click', () => { if (screen === 'battle') { pause(); showHelp(); } else if (screen === 'map') showJournal(); });
}
function renderMap() {
  disposeView(); screen = 'map'; battle = null; modal = false;
  app.innerHTML = header() + '<main id="chart-root"></main>';
  bindHeader();
  view = mountChart(document.querySelector('#chart-root')!, () => run, { journal: showJournal, sail: id => {
    if (modal || matchMedia('(orientation: portrait)').matches) { renderMap(); return; }
    const result = commitJump(run, id); if (!result.ok) return;
    disposeView();
    if (run.terminalOutcome) { finish(false); return; }
    if (run.screen === 'battle') startBattle();
    else if (run.screen === 'port') showPort();
    else showEncounter();
  } });
}
function showPort() {
  disposeView(); screen = 'port'; battle = null;
  app.innerHTML = header() + '<main id="port-root"></main>'; bindHeader();
  const visitId = run.activeVisit!.id;
  const leave = () => { if (!modal && completeVisit(run, visitId, { kind: 'port' })) renderMap(); };
  if (initializePort(run, features) && features.port) {
    view = features.port.mount(document.querySelector('#port-root')!, () => run, {
      buy: itemId => {
        if (modal || run.activeVisit?.id !== visitId) return { ok: false, reason: 'Port visit unavailable' };
        const result = features.port!.purchase(run, run.activeVisit.stock, itemId);
        document.querySelector('#gold')!.textContent = String(run.gold);
        return result;
      }, leave,
    });
  } else {
    document.querySelector('#port-root')!.innerHTML = '<section class="unavailable-port"><h2>Lantern Cay</h2><p>The shop is not yet available. You can depart without buying. Fog advances only when you sail.</p><button class="primary" id="leave-port">Leave port →</button></section>';
    document.querySelector('#leave-port')!.addEventListener('click', leave, { once: true });
  }
}
let modalOpener: HTMLElement | null = null;
function overlay(content: string, className = '') {
  modalOpener = document.activeElement as HTMLElement;
  modal = true;
  [...app.children].forEach(child => (child as HTMLElement).inert = true);
  const el = document.createElement('div'); el.className = `modal-backdrop ${className}`; el.id = 'modal'; el.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">${content}</section>`; app.appendChild(el);
  el.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
}
function closeModal() { boardingView?.dispose(); boardingView = null; document.querySelector('#modal')?.remove(); [...app.children].forEach(child => (child as HTMLElement).inert = false); modal = false; if (modalOpener?.isConnected) modalOpener.focus(); }
function showEncounter() {
  if (modal) return;
  const visitId = run.activeVisit!.id;
  const e = encounters[nodeAt(run.chart, run.currentNode)!.encounterId!];
  overlay(`<p class="eyebrow">CAPTAIN’S DECISION</p><h2 id="dialog-title">${e.title}</h2><p class="story">${e.text}</p><div class="choices">${e.choices.map((ch, i) => `<button data-choice="${i}" class="choice" ${run.gold + ch.gold < 0 ? 'disabled' : ''}><strong>${ch.title}</strong><small>${ch.effect}${run.gold + ch.gold < 0 ? ' · Not enough gold' : ''}</small></button>`).join('')}</div>`);
  document.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(b => b.addEventListener('click', () => {
    if (!completeVisit(run, visitId, { kind: 'encounter', choice: Number(b.dataset.choice) })) return;
    closeModal(); if (run.terminalOutcome) finish(false); else renderMap();
  }));
}
function showJournal() {
  if (modal) return;
  overlay(`<p class="eyebrow">THE WAYWARD · VOYAGE 01</p><h2 id="dialog-title">Ship’s log</h2><ol class="log">${run.journal.length ? run.journal.map(l => `<li>${l}</li>`).join('') : '<li>A fair wind and an ill omen. We sail for the Hollow Sea.</li>'}</ol><button class="primary" id="close">Back to the chart →</button>`);
  document.querySelector('#close')!.addEventListener('click', closeModal);
}
function showHelp() {
  if (modal) return;
  pause();
  overlay(`<p class="eyebrow">A CAPTAIN’S FIELD GUIDE</p><h2 id="dialog-title">Command the chaos.</h2><div class="help-grid"><div><b>01 / Pause & plan</b><p>Fog advances only on sailing. Select a chart node to preview its passage, then confirm Sail. Touch the battlefield to pause. Give orders, then tap Resume. Space also pauses on desktop.</p></div><div><b>02 / Give orders</b><p>Tap a pirate below, then a friendly room. Crew walk there and automatically fight fires, seal holes, and repair.</p></div><div><b>03 / Fire at will</b><p>Tap Cannons on the power rail, then an enemy room. Cannons repeat fire when charged. Ward absorbs hits.</p></div><div><b>04 / Mind the power</b><p>Six power total. Use − to free power, then + to assign it. Sails dodge; pumps drain water. Morale below 35 slows crew.</p></div></div><p class="story help-traits">Rook reloads faster at Cannons. Nell repairs faster. Vesper boosts the Ward-witch. Keep them out of fire. ${features.boarding ? 'Select a pirate, open Board / retreat, choose Board, then tap an enemy room. Abroad pirates can move between enemy rooms. Retreat returns them home; orders queue while paused.' : 'Boarding orders are unavailable on this voyage.'} ${features.port ? 'Lantern Cay offers supplies. Fog stays still while shopping.' : 'Lantern Cay’s shop is unavailable on this voyage.'}</p><button id="close" class="primary">Aye, captain →</button>`);
  document.querySelector('#close')!.addEventListener('click', () => { closeModal(); if (battle) updateBattleUI(); });
}
function startBattle() {
  disposeView(); screen = 'battle'; selected = null; mode = 'inspect';
  const player = playerShip();
  const boss = nodeAt(run.chart, run.currentNode)!.kind === 'boss';
  battle = features.createBattle ? features.createBattle(run, boss) : createCombat(player, boss); accumulated = 0;
  app.innerHTML = header() + `<main class="battle-screen"><div class="battle-status"><div class="ship-status"><span class="status-label">THE WAYWARD</span><span class="hull-bar"><i id="player-hull-bar"></i></span><b id="player-hull"></b><span class="ward-label" id="player-ward"></span></div><div class="time-label" id="battle-time">00:00</div><div class="ship-status enemy-status"><span class="status-label">${boss ? 'PALE SOVEREIGN' : 'BLACK FIN'}</span><span class="hull-bar"><i id="enemy-hull-bar"></i></span><b id="enemy-hull"></b><span class="ward-label" id="enemy-ward"></span></div></div>
    <div class="battlefield" id="battlefield"><canvas id="battle-canvas" aria-label="Side-on cutaway view of your ship on the left and the enemy ship on the right"></canvas><div id="room-controls"></div><div class="pause-banner" id="pause-banner"><span>Ⅱ TACTICAL PAUSE</span><small>Give your orders. Take your time.</small></div></div>
    <div class="command-strip"><span id="command-hint" aria-live="polite"></span><span class="charge-badge" id="charge-badge"></span><span class="last-event" id="last-event"></span><button class="orders-button" id="boarding-orders">Board / retreat</button><button class="resume" id="pause">Resume ▶</button></div>
    <div class="crew-roster">${player.crew.map((p, i) => `<button class="crew-card" data-crew="${crewId(i)}" aria-label="Select ${p.name}, ${p.trait}"><span class="crew-avatar avatar-${i}" style="--crew-color:${['#e3b474','#91d6af','#82b8cf','#d5a4ce','#b6cc79'][i % 5]}">${p.name.split(/\s+/).map(n => n[0]).join('').slice(0, 2)}</span><span class="crew-info"><strong>${p.name} <small>${p.trait}</small></strong><span class="crew-location" id="crew-location-${i}"></span><span class="morale-track"><i id="morale-${i}"></i></span></span><span class="crew-vitals"><span id="crew-morale-${i}"></span><small id="crew-health-${i}"></small></span></button>`).join('')}</div>
    <div class="power-rail"><div class="power-budget"><small>POWER</small><strong id="power-free">0<span>/6</span></strong></div>${SYSTEMS.map(s => `<div class="system" data-system="${s}"><button class="system-label" data-select-system="${s}" aria-label="${s === 'cannons' ? 'Select cannons to target enemy room' : labels[s] + ' information'}"><span>${symbols[s]}</span><strong>${labels[s]}</strong><small id="system-detail-${s}"></small></button><div class="power-controls"><button data-power="${s}" data-delta="-1" aria-label="Remove power from ${labels[s]}">−</button><div class="power-pips" id="pips-${s}"></div><button data-power="${s}" data-delta="1" aria-label="Add power to ${labels[s]}">+</button></div></div>`).join('')}</div></main>`;
  bindHeader();
  document.querySelector('#pause')!.addEventListener('click', togglePause);
  document.querySelector('#battlefield')!.addEventListener('click', e => { if ((e.target as HTMLElement).tagName !== 'BUTTON') { pause(); updateBattleUI(); } });
  document.querySelectorAll<HTMLButtonElement>('[data-crew]').forEach(b => b.addEventListener('click', () => { pause(); const id = b.dataset.crew!; const pirate = player.crew.find((_, i) => crewId(i) === id); if (!pirate || pirate.health <= 0) return; selected = selected === id ? null : id; mode = selected === null ? 'inspect' : 'move'; updateBattleUI(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-select-system]').forEach(b => b.addEventListener('click', () => {
    pause(); selected = null; mode = b.dataset.selectSystem === 'cannons' ? 'aim' : 'inspect';
    updateBattleUI();
    if (mode !== 'aim') document.querySelector('#command-hint')!.textContent = { ward: 'Ward: absorbs hits; recharges after 5 seconds of safety.', sails: 'Sails: each power gives 5% dodge chance.', pumps: 'Bilge pumps: each power drains water from every room.' }[b.dataset.selectSystem as 'ward' | 'sails' | 'pumps'];
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-power]').forEach(b => b.addEventListener('click', () => { pause(); allocate(player, b.dataset.power as System, Number(b.dataset.delta)); updateBattleUI(); }));
  document.querySelector('#boarding-orders')!.addEventListener('click', showBoarding);
  draw(); updateBattleUI();
}
function showBoarding() {
  if (!battle || battle.result || modal) return;
  pause();
  overlay('<h2 id="dialog-title">Boarding orders</h2><div id="boarding-root"></div><button type="button" class="primary" id="close">Back to battle →</button>');
  boardingView = features.boarding!.mount(document.querySelector('#boarding-root')!, () => ({ combat: battle!, selectedCrewId: selected, mode }), {
    selectCrew: id => {
      if (!battle!.player.crew.some(p => p.id === id)) return;
      selected = id; mode = 'move'; updateBattleUI();
    },
    board: () => { if (selected === null) return; mode = 'board'; closeModal(); updateBattleUI(); draw(); },
    retreat: () => {
      if (selected === null || !battle) return;
      const result = features.boarding!.queueRetreat(battle, selected);
      if (!result.ok) battle.events.push(result.reason);
      mode = result.ok ? 'retreat' : 'move'; closeModal(); updateBattleUI();
    },
  });
  document.querySelector('#close')!.addEventListener('click', closeModal);
}
function pause() { if (battle && !battle.result) { battle.paused = true; accumulated = 0; updateBattleUI(); } }
function togglePause() { if (!battle || battle.result || modal || matchMedia('(orientation: portrait)').matches) return; battle.paused = !battle.paused; accumulated = 0; updateBattleUI(); }
function roomClick(enemy: boolean, index: number) {
  const player = playerShip();
  if (!battle || modal || battle.result) return;
  if (!battle.paused) { pause(); return; }
  if (!enemy && selected === null && mode === 'inspect') {
    const i = player.crew.findIndex(p => p.room === index && p.health > 0 && (!('shipId' in p) || p.shipId === 'player') && !('transit' in p && p.transit));
    if (i >= 0) { selected = crewId(i); mode = 'move'; }
  } else {
    const result = routeRoomOrder(battle, mode, selected, enemy ? 'enemy' : 'player', index, features);
    if (!result.ok) battle.events.push(result.reason);
    else if (mode === 'aim') { selected = null; mode = 'inspect'; }
  }
  updateBattleUI();
}
function crewId(index: number) { return ownedCrewId(run.player, index); }
function selectedIndex(): number | null { const index = run.player.crew.findIndex((_, i) => crewId(i) === selected); return index >= 0 ? index : null; }
let lastLayout = '';
function draw() {
  if (!battle || screen !== 'battle') return;
  const canvas = document.querySelector<HTMLCanvasElement>('#battle-canvas')!;
  boxes = drawBattle(canvas, battle, selectedIndex(), mode === 'aim', battle.elapsed);
  const key = `${canvas.width}:${canvas.height}:${mode}`;
  if (key !== lastLayout || !document.querySelector('.room-hit')) {
    lastLayout = key;
    document.querySelector('#room-controls')!.innerHTML = boxes.map(b => `<button class="room-hit" data-room="${b.index}" data-enemy="${b.enemy}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px" aria-label="${roomActionLabel(mode, b.enemy ? 'enemy' : 'player', b.index)}"></button>`).join('');
    document.querySelectorAll<HTMLButtonElement>('.room-hit').forEach(b => b.addEventListener('click', () => roomClick(b.dataset.enemy === 'true', Number(b.dataset.room))));
  }
}
function updateBattleUI() {
  const player = playerShip();
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
  set('command-hint', mode === 'board' ? 'Board order → tap enemy room (cannon aim unchanged)' : mode === 'retreat' ? 'Retreat queued' : selected !== null ? `${player.crew[selectedIndex()!].name} → tap their ship’s room or Board / retreat` : mode === 'aim' ? 'Cannons selected → tap an enemy room' : c.paused ? `Orders ready · target: ${ROOM_NAMES[c.target]}` : 'Touch the battlefield to pause & command');
  set('last-event', c.events.at(-1) || '');
  set('charge-badge', `✹ ${Math.floor(player.charge * 100)}%`);
  player.crew.forEach((p, i) => {
    set(`crew-location-${i}`, p.health <= 0 ? 'Incapacitated' : locationLabel(p));
    set(`crew-morale-${i}`, `${Math.round(p.morale)} MRL`); set(`crew-health-${i}`, `${Math.ceil(p.health)} HP`);
    const bar = document.getElementById(`morale-${i}`)! as HTMLElement; bar.style.width = `${p.morale}%`; bar.style.background = p.morale < 35 ? '#ee936e' : ['#e3b474', '#91d6af', '#82b8cf', '#d5a4ce', '#b6cc79'][i % 5];
    document.querySelector(`[data-crew="${crewId(i)}"]`)!.classList.toggle('selected', selected === crewId(i));
  });
  boardingView?.render?.();
  const used = Object.values(player.power).reduce((a, b) => a + b, 0); set('power-free', `${6 - used}/6`);
  for (const s of SYSTEMS) {
    const n = player.power[s];
    const el = document.getElementById(`pips-${s}`)!;
    const markup = [0, 1, 2].map(i => `<i class="${i < n ? 'filled' : ''}"></i>`).join(''); if (el.innerHTML !== markup) el.innerHTML = markup;
    document.querySelector<HTMLButtonElement>(`[data-power="${s}"][data-delta="-1"]`)!.disabled = n === 0;
    document.querySelector<HTMLButtonElement>(`[data-power="${s}"][data-delta="1"]`)!.disabled = n === 3 || used === 6;
    document.querySelector(`[data-system="${s}"]`)!.classList.toggle('aiming', s === 'cannons' && mode === 'aim');
    set(`system-detail-${s}`, s === 'cannons' ? `${Math.floor(player.charge * 100)}% CHARGED` : s === 'ward' ? `${Math.floor(player.ward)}/${c.modifiers.wardCapacity} WARD` : s === 'sails' ? `${n * 5}% BASE DODGE` : n === 0 ? 'OFFLINE' : 'DRAINING');
  }
}
function resolveBattle() {
  if (!battle || modal || !run.activeVisit) return;
  const visitId = run.activeVisit.id;
  if (!completeVisit(run, visitId, { kind: 'battle', combat: battle }, features)) return;
  if (run.terminalOutcome) finish(run.terminalOutcome === 'win'); else renderMap();
}
function finish(victory: boolean) {
  disposeView(); screen = 'end'; battle = null; modal = false;
  const player = playerShip();
  app.innerHTML = header() + `<main class="end-screen"><p class="eyebrow">VOYAGE 01 · ${victory ? 'THE CURSE BREAKS' : 'LOST TO THE HOLLOW SEA'}</p><div class="end-skull">☠</div><h1>${victory ? 'The living<br><em>have the last word.</em>' : 'The sea keeps<br><em>her secrets.</em>'}</h1><p class="intro-copy">${run.terminalReason}</p><div class="end-stats"><span><b>${run.gold}</b> GOLD</span><span><b>${Math.ceil(player.hull)}</b> HULL</span><span><b>${player.crew.filter(p => p.health > 0).length}/${player.crew.length}</b> CREW</span></div><h3>THE SHIP’S LOG</h3><ol class="log">${run.journal.map(l => `<li>${l}</li>`).join('')}</ol><button id="restart" class="primary">Sail another day ↻</button></main>`;
  bindHeader(); document.querySelector('#restart')!.addEventListener('click', () => { run = createRun(crypto.getRandomValues(new Uint32Array(1))[0]); selected = null; mode = 'inspect'; accumulated = 0; renderMap(); });
}
// Trap focus inside modal dialogs, preserving keyboard use alongside touch.
document.addEventListener('keydown', e => {
  if (app.inert) return;
  if (modal && e.key === 'Tab') {
    const focusable = [...document.querySelectorAll<HTMLButtonElement>('#modal button:not(:disabled)')];
    if (!focusable.length) return;
    const i = focusable.indexOf(document.activeElement as HTMLButtonElement);
    if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === focusable.length - 1)) { e.preventDefault(); focusable[e.shiftKey ? focusable.length - 1 : 0].focus(); }
  }
  if (e.code === 'Space' && screen === 'battle' && !modal && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); togglePause(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
let landscapeFocus: HTMLElement | null = null;
function syncOrientation() {
  const portrait = matchMedia('(orientation: portrait)').matches;
  if (portrait && !app.inert) {
    landscapeFocus = app.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    pause();
  }
  // The visual curtain alone cannot block focused keyboard or assistive controls.
  app.inert = portrait;
  if (!portrait && landscapeFocus) {
    if (landscapeFocus.isConnected) landscapeFocus.focus();
    landscapeFocus = null;
  }
}
window.addEventListener('resize', () => { syncOrientation(); lastLayout = ''; draw(); });
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
renderMap(); syncOrientation(); requestAnimationFrame(frame);
// Deliberately no persistent save: this slice is one short, replayable voyage.
