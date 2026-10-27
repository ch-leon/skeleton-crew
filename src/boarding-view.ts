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
  let disposed = false;
  function render() {
    if (disposed) return;
    const { combat: c, selectedId, mode } = read();
    const focused = panel.contains(document.activeElement) ? document.activeElement as HTMLButtonElement : null;
    const focusCrew = focused?.dataset.crew, focusAction = focused?.dataset.action;
    panel.replaceChildren();
    const roster = document.createElement('div'); roster.className = 'boarding-roster';
    for (const p of c.player.crew) {
      const card = document.createElement('button'); card.type = 'button'; card.dataset.crew = p.id;
      card.setAttribute('aria-pressed', String(p.id === selectedId));
      card.textContent = `● ${p.name} · ${Math.ceil(p.health)} HP · ${locationLabel(p)}`;
      card.disabled = !!c.result; roster.append(card);
    }
    panel.append(roster);
    const p = c.player.crew.find(p => p.id === selectedId);
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const cooldown = c.boarding.hooks.player.cooldown;
    status.textContent = `${mode} · ${cooldown > 0 ? `Hook cooling down (${Math.ceil(cooldown)}s)` : 'Hook ready'}${p?.health === 0 ? ' · Crew incapacitated' : ''}`;
    panel.append(status);
    if (p) {
      const actions = document.createElement('div'); actions.className = 'boarding-actions';
      const add = (action: string, text: string, disabled: boolean) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.action = action; b.textContent = text; b.disabled = disabled || !!c.result || p.health <= 0 || p.transit?.phase === 'crossing'; actions.append(b); };
      if (p.shipId === 'player') add('board', 'Board → choose enemy room', cooldown > 0);
      else add('retreat', 'Retreat to home Cargo', false);
      if (p.transit) add('cancel', 'Cancel pending order', false);
      panel.append(actions);
    }
    const enemies = document.createElement('div'); enemies.className = 'boarding-roster';
    for (const enemy of c.enemy.crew) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.crew = enemy.id;
      b.textContent = `◆ Enemy ${enemy.name} · ${Math.ceil(enemy.health)} HP · ${locationLabel(enemy)}`;
      b.setAttribute('aria-pressed', String(enemy.id === selectedId)); b.disabled = !!c.result; enemies.append(b);
    }
    panel.append(enemies);
    if (focusCrew || focusAction) Array.from(panel.querySelectorAll('button')).find(b => focusCrew ? b.dataset.crew === focusCrew : b.dataset.action === focusAction)?.focus({ preventScroll: true });
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
