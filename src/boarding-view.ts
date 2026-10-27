import { ROOM_NAMES, type Combat } from './combat';
import { allCrew, type CommandMode, type ShipId } from './boarding';
import './boarding.css';
export interface BoardingViewState { combat: Combat; selectedId: string | null; mode: CommandMode }
export interface BoardingCommands { selectCrew: (id: string) => void; setMode: (mode: CommandMode) => void; retreat: (id: string) => void; cancel: (id: string) => void }
export function locationLabel(p: ReturnType<typeof allCrew>[number]): string {
  if (p.transit) return `${p.transit.phase === 'crossing' ? 'Transit' : p.shipId === p.faction ? 'Home' : 'Abroad'} · ${p.transit.retreat ? 'Retreat' : 'Board'}: ${p.transit.phase} → ${p.transit.destinationShip} ${ROOM_NAMES[p.transit.destinationRoom]}${p.transit.remaining ? ` (${p.transit.remaining.toFixed(1)}s)` : ''}`;
  return `${p.shipId === p.faction ? 'Home' : 'Abroad'} · ${ROOM_NAMES[p.room]}${p.travel ? ` → ${ROOM_NAMES[p.destination]}` : ''}`;
}
export function roomActionLabel(mode: CommandMode, ship: ShipId, room: number): string {
  return `${mode === 'board' ? 'Board' : mode === 'aim' ? 'Aim cannons at' : mode === 'move' ? 'Move crew to' : mode === 'retreat' ? 'Retreat via' : 'Inspect'} ${ship} ship ${ROOM_NAMES[room]}`;
}
/** A owns lifecycle, first-tap pause, room routing and mounting. No automatic entry point. */
export function mountBoarding(root: HTMLElement, read: () => BoardingViewState, commands: BoardingCommands) {
  const panel = document.createElement('section'); panel.className = 'boarding-r2'; panel.setAttribute('aria-label', 'Boarding orders'); root.append(panel);
  // Keep touch targets and scrolling containers alive across simulation refreshes.
  const roster = document.createElement('div'); roster.className = 'boarding-roster';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const actions = document.createElement('div'); actions.className = 'boarding-actions';
  const enemies = document.createElement('div'); enemies.className = 'boarding-roster';
  const actionButtons = ['board', 'retreat', 'cancel'].map(action => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.action = action;
    b.textContent = action === 'board' ? 'Board → choose enemy room' : action === 'retreat' ? 'Retreat to home Cargo' : 'Cancel pending order';
    actions.append(b); return b;
  });
  panel.append(roster, status, actions, enemies);
  let disposed = false;
  function renderRoster(container: HTMLElement, crew: Combat['player']['crew'], selectedId: string | null, finished: boolean, enemy: boolean) {
    for (const card of Array.from(container.querySelectorAll<HTMLButtonElement>('button'))) {
      if (!crew.some(p => p.id === card.dataset.crew)) card.remove();
    }
    crew.forEach((p, index) => {
      let card = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.dataset.crew === p.id);
      if (!card) { card = document.createElement('button'); card.type = 'button'; card.dataset.crew = p.id; }
      card.setAttribute('aria-pressed', String(p.id === selectedId));
      const text = `${enemy ? '◆ Enemy ' : '● '}${p.name} · ${Math.ceil(p.health)} HP · ${locationLabel(p)}`;
      if (card.textContent !== text) card.textContent = text;
      card.disabled = finished;
      if (container.children[index] !== card) container.insertBefore(card, container.children[index] ?? null);
    });
  }
  function render() {
    if (disposed) return;
    const { combat: c, selectedId, mode } = read();
    renderRoster(roster, c.player.crew, selectedId, !!c.result, false);
    renderRoster(enemies, c.enemy.crew, selectedId, !!c.result, true);
    const p = c.player.crew.find(p => p.id === selectedId);
    const cooldown = c.boarding.hooks.player.cooldown;
    const text = `${mode} · ${cooldown > 0 ? `Hook cooling down (${Math.ceil(cooldown)}s)` : 'Hook ready'}${p?.health === 0 ? ' · Crew incapacitated' : ''}`;
    if (status.textContent !== text) status.textContent = text;
    for (const b of actionButtons) {
      b.hidden = !p || (b.dataset.action === 'board' ? p.shipId !== 'player' : b.dataset.action === 'retreat' ? p.shipId === 'player' : !p.transit);
      b.disabled = !p || !!c.result || p.health <= 0 || p.transit?.phase === 'crossing' || (b.dataset.action === 'board' && cooldown > 0);
    }
  }
  const click = (event: Event) => {
    const b = (event.target as Element).closest<HTMLButtonElement>('button'); if (!b || b.disabled || !panel.contains(b)) return;
    const state = read(); if (state.combat.result) return;
    if (b.dataset.crew) commands.selectCrew(b.dataset.crew);
    else if (state.selectedId) {
      if (b.dataset.action === 'board') commands.setMode('board');
      else if (b.dataset.action === 'retreat') commands.retreat(state.selectedId);
      else if (b.dataset.action === 'cancel') commands.cancel(state.selectedId);
    }
    render();
  };
  panel.addEventListener('click', click); render();
  return { render, dispose() { disposed = true; panel.removeEventListener('click', click); panel.remove(); } };
}
