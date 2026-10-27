import './chart.css';
import { nodeAt, passages, type ChartNode } from './chart';
import { previewJump } from './run';
import type { MountedView, RunState } from './contracts';
const icons = { start: '⚓', encounter: '◇', battle: '☠', port: '☼', boss: '♛' };
const x = (n: ChartNode) => 20 + n.depth * 150;
const y = (n: ChartNode) => 6 + n.lane * 56;
export function mountChart(root: HTMLElement, read: () => RunState, commands: { sail(nodeId: string): void; journal(): void }): MountedView {
  const run = read(), choices = passages(run.chart, run.currentNode);
  let selected = choices[0]?.to || run.currentNode, disposed = false;
  const controller = new AbortController();
  root.className = 'chart-r2';
  root.innerHTML = `<div class="status-strip"><span>WAYWARD ${Math.ceil(run.player.hull)}/${run.player.maxHull} hull · ${run.player.crew.length} crew · ${Math.round(run.player.crew.reduce((n,p) => n + p.morale,0) / (run.player.crew.length || 1))} morale<br><small>Fog advances on sailing · Front ${run.fogFront} · Separation ${nodeAt(run.chart, run.currentNode)!.depth - run.fogFront}${run.fogContacts ? ' · CAUGHT: next jump fatal' : ''}</small></span><button data-log>Ship’s log</button></div>
    <div class="chart-nav"><button data-scroll="-1" aria-label="Previous chart section">←</button><span>☠ Battle · ◇ Encounter · ☼ Port · ♛ Boss · ▧ Covered fog<br>— Normal +1 · ┄ Treacherous +2 · Depth 5 → final approach</span><button data-scroll="1" aria-label="Next chart section">→</button></div>
    <div class="chart-scroll" tabindex="0" aria-label="Three lane sea chart"><div class="chart-map">
    <div class="fog-bank" style="width:${Math.max(0, Math.min(1050, 150 * run.fogFront + 140))}px" aria-hidden="true"></div>
    <svg width="1070" height="168" aria-hidden="true">${run.chart.edges.map(e => { const a=nodeAt(run.chart,e.from)!,b=nodeAt(run.chart,e.to)!;return `<path class="${e.jumpCost === 2 ? 'treacherous' : ''}" d="M${x(a)+55},${y(a)+22} L${x(b)+55},${y(b)+22}"/>`; }).join('')}</svg>
    ${run.chart.nodes.map(n => `<button class="sea-node ${n.depth <= run.fogFront ? 'covered' : 'safe'} ${n.id === run.currentNode ? 'position' : ''} ${choices.some(e=>e.to===n.id) ? 'reachable' : ''}" data-node="${n.id}" style="left:${x(n)}px;top:${y(n)}px" aria-label="${n.name}, ${n.kind}, depth ${n.depth}, ${n.depth <= run.fogFront ? 'covered by fog' : 'safe'}${n.id === run.currentNode ? ', current position' : ''}">${icons[n.kind]} ${n.shortName}<small>${n.id === run.currentNode ? '● YOU' : run.clearedNodeIds.includes(n.id) ? '✓ CLEARED' : n.depth <= run.fogFront ? '▧ COVERED' : 'SAFE'}</small></button>`).join('')}</div></div>
    <div class="chart-details"><div data-detail aria-live="polite"></div><button data-sail class="primary">Sail →</button></div>`;
  const scroll = root.querySelector<HTMLElement>('.chart-scroll')!;
  const detail = root.querySelector<HTMLElement>('[data-detail]')!, sail = root.querySelector<HTMLButtonElement>('[data-sail]')!;
  function select(id: string) {
    selected = id; const n=nodeAt(read().chart,id)!, p=previewJump(read(),id);
    root.querySelectorAll<HTMLButtonElement>('[data-node]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.node === id)));
    detail.innerHTML = `<strong>${n.name}</strong> · ${n.kind}<br>${p.ok ? `${p.jumpCost === 2 ? '⚠ Treacherous' : 'Normal'} passage · Fog +${p.jumpCost} → front ${p.nextFront} · ${p.damage ? '−30 hull' : 'No hull damage'}${p.fatal ? ' · FATAL: ghost armada defeat' : ''}` : p.reason}`;
    sail.disabled = !p.ok; sail.textContent = p.ok && p.damage ? 'Dangerous Sail · confirm →' : 'Sail →';
  }
  const listen = (element: Element, callback: () => void) => element.addEventListener('click',callback,{signal:controller.signal});
  root.querySelectorAll<HTMLButtonElement>('[data-node]').forEach(b=>listen(b,()=>select(b.dataset.node!)));
  root.querySelectorAll<HTMLButtonElement>('[data-scroll]').forEach(b=>listen(b,()=>scroll.scrollBy({left:Number(b.dataset.scroll)*150,behavior:'auto'})));
  listen(root.querySelector('[data-log]')!,commands.journal);
  listen(sail,()=>{ if (disposed || sail.disabled) return; sail.disabled=true; commands.sail(selected); });
  select(selected);
  scroll.scrollLeft = Math.max(0,x(nodeAt(run.chart,run.currentNode)!)-30);
  return { dispose() { disposed=true; controller.abort(); root.replaceChildren(); } };
}
