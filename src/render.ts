import { type Combat, type Ship, ROOM_NAMES, type Pirate } from './combat';
export interface Box { x: number; y: number; w: number; h: number; enemy: boolean; index: number }
export const colors = ['#e9bb70', '#8fe6bd', '#82bbcf'];
export function skull(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color = '#c9d5c8') {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 24, s / 24); ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, -2, 10, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-6, 3, 12, 7);
  ctx.fillStyle = '#10252b'; ctx.beginPath(); ctx.ellipse(-4, -2, 2.6, 3, -.2, 0, 7); ctx.ellipse(4, -2, 2.6, 3, .2, 0, 7); ctx.fill();
  ctx.fillRect(-3, 7, 1, 4); ctx.fillRect(2, 7, 1, 4); ctx.restore();
}
function pirate(ctx: CanvasRenderingContext2D, p: Pirate, index: number, x: number, y: number, selected: boolean) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = p.health <= 0 ? .25 : p.travel > 0 ? .55 : 1;
  if (selected) { ctx.strokeStyle = colors[index]; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 2, 13, 16, 0, 0, 7); ctx.stroke(); }
  ctx.fillStyle = colors[index]; ctx.beginPath(); ctx.arc(0, -5, 5, 0, 7); ctx.fill(); ctx.fillRect(-6, 1, 12, 10);
  ctx.fillStyle = '#142831'; ctx.fillRect(-7, -10, 14, 3); ctx.fillRect(-4, -13, 8, 4); ctx.fillRect(-1, -6, 5, 2);
  ctx.fillStyle = '#a4bab4'; ctx.fillRect(-4, 11, 3, 4); ctx.fillRect(2, 11, 3, 4); ctx.restore();
}
export function drawBattle(canvas: HTMLCanvasElement, c: Combat, selected: number | null, aim: boolean, time: number): Box[] {
  const rect = canvas.getBoundingClientRect(), w = rect.width, h = rect.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#0b2029'); sky.addColorStop(.7, '#102f36'); sky.addColorStop(1, '#071c26'); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  // Sparse stars, moon and banks of sea mist, drawn without downloaded assets.
  for (let i = 0; i < 47; i++) { const x = (i * 137.3 + 29) % w, y = (i * 61.1 + 8) % (h * .48); ctx.fillStyle = `rgba(187,220,208,${.1 + i % 4 * .05})`; ctx.fillRect(x, y, 1, 1); }
  ctx.fillStyle = '#bdd7bf'; ctx.shadowColor = '#9ad2b3'; ctx.shadowBlur = 25; ctx.beginPath(); ctx.arc(w * .52, h * .15, Math.min(23, h * .07), 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#0c252d'; ctx.beginPath(); ctx.arc(w * .535, h * .13, Math.min(22, h * .067), 0, 7); ctx.fill();
  const boxes: Box[] = [], shipW = Math.min(w * .425, 520), roomW = (shipW - 28) / 3;
  const roomH = Math.max(44, Math.min(76, (h - 82) / 2));
  const top = h - roomH * 2 - (h < 145 ? 13 : 32);
  // Distant rocks and water.
  ctx.fillStyle = '#0a2028'; ctx.beginPath(); ctx.moveTo(w * .42, h - 28); ctx.lineTo(w * .48, h * .62); ctx.lineTo(w * .51, h * .76); ctx.lineTo(w * .55, h * .52); ctx.lineTo(w * .62, h - 20); ctx.fill();
  const waterline = top + roomH + roomH * .65;
  for (let row = 0; row < 7; row++) {
    ctx.strokeStyle = row % 2 ? '#1d4149' : '#193840'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= w; x += 8) { const y = waterline + row * 11 + Math.sin(x * .028 + time * .4 + row) * 2; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
  }
  function ship(s: Ship, enemy: boolean) {
    const sx = enemy ? w - shipW - w * .025 : w * .025;
    const tint = enemy ? '#6db69c' : '#c7aa76';
    // Rigging and sails.
    if (top > 72) {
      const mastX = sx + shipW * .52, mastTop = Math.max(22, top - h * .4);
      ctx.strokeStyle = enemy ? '#4d7165' : '#665b47'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(mastX, top); ctx.lineTo(mastX, mastTop); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = '#405956';
      ctx.beginPath(); ctx.moveTo(sx + 12, top); ctx.lineTo(mastX, mastTop + 4); ctx.lineTo(sx + shipW - 14, top); ctx.stroke();
      ctx.fillStyle = enemy ? '#244b45' : '#394440';
      ctx.beginPath(); ctx.moveTo(mastX - shipW * .24, mastTop + 18); ctx.quadraticCurveTo(mastX, mastTop + 29, mastX + shipW * .23, mastTop + 18); ctx.lineTo(mastX + shipW * .20, top - 28); ctx.quadraticCurveTo(mastX, top - 15, mastX - shipW * .23, top - 28); ctx.quadraticCurveTo(mastX - shipW * .17, top - 52, mastX - shipW * .24, mastTop + 18); ctx.fill();
      skull(ctx, mastX, (mastTop + top) / 2, Math.min(42, (top - mastTop) * .3), enemy ? '#83bea3' : '#b1b5a0');
      ctx.fillStyle = tint; ctx.beginPath(); ctx.moveTo(mastX, mastTop); ctx.lineTo(mastX + 32, mastTop + 7); ctx.lineTo(mastX, mastTop + 14); ctx.fill();
    }
    ctx.font = `600 ${h < 145 ? 9 : 11}px ui-monospace, monospace`; ctx.textAlign = 'left'; ctx.fillStyle = tint;
    ctx.fillText(enemy ? (c.ghost ? 'THE PALE SOVEREIGN' : 'THE BLACK FIN') : 'THE WAYWARD • YOUR SHIP', sx + 12, top - (h < 145 ? 5 : 11));
    // Keel silhouette and brass rails.
    ctx.fillStyle = enemy ? '#19332f' : '#302f27'; ctx.strokeStyle = enemy ? '#497665' : '#7f6a48'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, top - 4); ctx.lineTo(sx + shipW, top - 4); ctx.lineTo(sx + shipW - 14, top + roomH * 2 + 6); ctx.quadraticCurveTo(sx + shipW * .5, top + roomH * 2 + 40, sx + 18, top + roomH * 2 + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const x = sx + 10 + (i % 3) * (roomW + 3), y = top + Math.floor(i / 3) * (roomH + 3), rw = roomW, rh = roomH;
      const r = s.rooms[i]; boxes.push({ x, y, w: rw, h: rh, enemy, index: i });
      const targeted = enemy && c.target === i;
      ctx.fillStyle = enemy ? '#142e2e' : '#172e33'; ctx.fillRect(x, y, rw, rh);
      // Wood beams.
      ctx.strokeStyle = enemy ? '#27433a' : '#2a3c3a'; ctx.lineWidth = 1;
      for (let j = 1; j < 4; j++) { ctx.beginPath(); ctx.moveTo(x, y + rh * j / 4); ctx.lineTo(x + rw, y + rh * j / 4); ctx.stroke(); }
      if (r.health < 65) { ctx.strokeStyle = '#8b7055'; ctx.beginPath(); ctx.moveTo(x + rw * .7, y + 3); ctx.lineTo(x + rw * .6, y + 13); ctx.lineTo(x + rw * .75, y + 24); ctx.stroke(); }
      if (r.water > .01) { ctx.fillStyle = '#327e9c80'; ctx.fillRect(x, y + rh * (1 - r.water), rw, rh * r.water); }
      if (r.fire > .01) { ctx.fillStyle = '#f2984566'; ctx.fillRect(x, y, rw, rh); ctx.fillStyle = '#ffb65e'; for (let f = 0; f < 3; f++) { const fx = x + rw * (.25 + f * .25), fy = y + rh - 7; ctx.beginPath(); ctx.moveTo(fx - 5, fy); ctx.quadraticCurveTo(fx - 9, fy - 9, fx + Math.sin(time * 5 + f) * 4, fy - 16 - r.fire * 10); ctx.quadraticCurveTo(fx + 10, fy - 6, fx + 5, fy); ctx.fill(); } }
      ctx.strokeStyle = targeted ? '#e7ad68' : !enemy && selected !== null && c.player.crew[selected].destination === i ? colors[selected] : enemy && aim ? '#71b593' : '#40524c'; ctx.lineWidth = targeted ? 2 : 1; ctx.strokeRect(x + .5, y + .5, rw - 1, rh - 1);
      ctx.fillStyle = enemy ? '#a3c4b1' : '#ccd3bf'; ctx.font = `${w < 750 ? 10 : 12}px ui-monospace, monospace`; ctx.textAlign = 'left';
      ctx.fillText(ROOM_NAMES[i], x + 6, y + 14);
      ctx.fillStyle = '#354c48'; ctx.fillRect(x + 5, y + rh - 5, rw - 10, 2); ctx.fillStyle = r.health < 40 ? '#df8f68' : '#83a596'; ctx.fillRect(x + 5, y + rh - 5, (rw - 10) * r.health / 100, 2);
      const crew = s.crew.map((p, pi) => ({ p, pi })).filter(({ p }) => p.room === i);
      crew.forEach(({ p, pi }, ci) => pirate(ctx, p, pi, x + rw * (ci + 1) / (crew.length + 1), y + rh * .58, selected === pi));
      if (r.breach > .01) { ctx.fillStyle = '#93cfe0'; ctx.font = 'bold 16px serif'; ctx.fillText('≋', x + rw - 19, y + 29); }
      if (targeted) { ctx.strokeStyle = '#e7ad68'; ctx.beginPath(); ctx.arc(x + rw - 12, y + 12, 5, 0, 7); ctx.stroke(); }
    }
    // Ward arc around the ship, kept outside the rooms.
    if (s.ward > .1) { ctx.strokeStyle = `rgba(127,224,177,${.12 + s.ward / 35})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx + shipW / 2, top + roomH, shipW * .51, roomH * 1.22, 0, Math.PI, Math.PI * 2); ctx.stroke(); }
  }
  ship(c.player, false); ship(c.enemy, true);
  for (const e of c.effects) {
    const target = boxes.find(b => b.enemy === !e.fromEnemy && b.index === e.room)!;
    const source = boxes.find(b => b.enemy === e.fromEnemy && b.index === 0)!;
    const progress = Math.min(1, (1.1 - e.life) * 5);
    const x = source.x + source.w / 2 + (target.x + target.w / 2 - source.x - source.w / 2) * progress;
    const y = source.y + source.h / 2 + (target.y + target.h / 2 - source.y - source.h / 2) * progress - Math.sin(progress * Math.PI) * 25;
    ctx.fillStyle = e.kind === 'ward' ? '#a0ffd0' : '#f5c27f'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 13; ctx.beginPath(); ctx.arc(x, y, progress < 1 ? 4 : e.life * 14, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    if (progress === 1) { ctx.font = 'bold 12px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(e.kind === 'dodge' ? 'EVADED' : e.kind === 'ward' ? 'WARDED' : 'HIT', x, y - 19); }
  }
  return boxes;
}
