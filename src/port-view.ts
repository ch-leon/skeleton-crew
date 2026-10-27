import type { RunState, CommandResult } from './contracts';
import { CHARMS, WEAPONS, type CharmId } from './equipment';
import { isPortStock, quotePurchase } from './port';
import './port.css';

export function mountPort(root: HTMLElement, read: () => RunState, commands: { buy(itemId: string): CommandResult; leave(): void }) {
  const panel = document.createElement('section'); panel.className = 'port-r2'; panel.setAttribute('aria-label', 'Lantern Cay shop');
  panel.innerHTML = `<div class="port-heading"><h1>Lantern Cay</h1><p>Fog stays still in port.</p></div><div class="port-balances"></div><div class="port-panes"><nav class="port-catalog" aria-label="Shop catalog"></nav><section class="port-details" aria-label="Selected item"><h2></h2><p class="port-description"></p><p class="port-effect"></p><p class="port-reason" id="port-buy-reason"></p><button type="button" class="port-buy" aria-describedby="port-buy-reason">Buy</button></section></div><footer><p class="port-message" role="status" aria-live="polite"></p><button type="button" class="port-leave">Leave port →</button></footer>`;
  root.append(panel);
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const catalog = find('.port-catalog'), buy = find<HTMLButtonElement>('.port-buy');
  const initialVisitId = read().activeVisit?.id;
  let selected = 'repair', disposed = false, leaving = false;
  function render() {
    if (disposed) return;
    const run = read(), stock = run.activeVisit?.stock;
    const active = run.activeVisit?.id === initialVisitId && run.screen === 'port' && !run.terminalOutcome;
    find('.port-balances').textContent = `${run.gold} gold · Hull ${Math.ceil(run.player.hull)}/${run.player.maxHull} · Crew ${run.player.crew.length}/5 · ${WEAPONS[run.equipment.weapon].name} · Charms ${run.equipment.charms.length}/2: ${run.equipment.charms.map(id => CHARMS[id as CharmId]?.name || id).join(', ') || 'none'}`;
    if (!isPortStock(stock) || !active) { buy.disabled = true; find('.port-reason').textContent = 'Port visit unavailable'; return; }
    // Preserve item buttons, focus and scroll across purchases and rerenders.
    for (const item of stock.items) {
      let button = [...catalog.querySelectorAll<HTMLButtonElement>('button')].find(b => b.dataset.item === item.id);
      if (!button) { button = document.createElement('button'); button.type = 'button'; button.dataset.item = item.id; catalog.append(button); }
      const quote = quotePurchase(run, stock, item.id);
      button.textContent = `${item.name} · ${item.price} gold${quote.ok ? '' : ` · ${quote.reason}`}`;
      button.setAttribute('aria-pressed', String(selected === item.id));
    }
    const item = stock.items.find(item => item.id === selected)!;
    find('h2').textContent = item.name;
    find('.port-description').textContent = item.description;
    const quote = quotePurchase(run, stock, selected);
    find('.port-effect').textContent = quote.ok ? quote.effect : '';
    find('.port-reason').textContent = quote.ok ? `Price: ${quote.price} gold. Balance after purchase: ${run.gold - quote.price}.` : quote.reason;
    buy.textContent = `Buy · ${item.price} gold`; buy.disabled = !quote.ok;
  }
  const click = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.disabled || disposed || leaving || !panel.contains(button)) return;
    if (button.dataset.item) { selected = button.dataset.item; render(); find('.port-details').scrollTop = 0; }
    else if (button === buy) {
      if (read().activeVisit?.id !== initialVisitId) return;
      const result = commands.buy(selected);
      find('.port-message').textContent = result.ok ? `Purchased ${find('h2').textContent}. Balances updated.` : result.reason;
      render();
    } else if (button.classList.contains('port-leave')) { leaving = true; commands.leave(); }
  };
  panel.addEventListener('click', click); render();
  return { render, dispose() { disposed = true; panel.removeEventListener('click', click); panel.remove(); } };
}
