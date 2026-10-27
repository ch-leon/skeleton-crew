import { describe, expect, it, vi } from 'vitest';
import { createCombat } from './combat';
import { BOSS, nodeAt, passages } from './chart';
import { commitJump, completeVisit, createRun, initializePort, previewJump } from './run';
import type { RunState } from './contracts';
function normal(run: RunState) { return passages(run.chart, run.currentNode).find(e=>e.jumpCost === 1)!; }
function finishVisit(run: RunState) {
  const id=run.activeVisit!.id, node=nodeAt(run.chart,run.currentNode)!;
  if (node.kind === 'encounter') return completeVisit(run,id,{kind:'encounter',choice:0});
  if (node.kind === 'port') return completeVisit(run,id,{kind:'port'});
  const combat=createCombat(run.player,node.kind === 'boss'); combat.result='win'; return completeVisit(run,id,{kind:'battle',combat});
}
describe('run transactions',()=>{
  it('inspection, selection previews and waiting do not mutate the run; accepted jump advances once',()=>{
    const run=createRun(13), id=normal(run).to, before=structuredClone(run);
    for(let i=0;i<100;i++) previewJump(run,id);
    expect(run).toEqual(before);
    const result=commitJump(run,id); expect(result.ok).toBe(true);
    expect(run.fogFront).toBe(-1); const arrived=structuredClone(run);
    expect(commitJump(run,id).ok).toBe(false); expect(run).toEqual(arrived);
    expect(commitJump(run,'missing').ok).toBe(false); expect(run).toEqual(arrived);
  });
  it.each([
    {front:-2, contacts:0, hull:180, cost:1, damage:0, fatal:false},
    {front:0, contacts:0, hull:180, cost:1, damage:30, fatal:false},
    {front:-1, contacts:0, hull:30, cost:2, damage:30, fatal:true},
    {front:0, contacts:1, hull:180, cost:1, damage:30, fatal:true},
  ])('preview matches commit at fog boundary $front/$contacts/$hull',({front,contacts,hull,cost,damage,fatal})=>{
    const run=createRun(2), edge=normal(run); edge.jumpCost=cost as 1|2;
    run.fogFront=front; run.fogContacts=contacts; run.player.hull=hull;
    const preview=previewJump(run,edge.to); expect(preview.ok).toBe(true);
    if(!preview.ok) throw Error('missing preview');
    expect(preview.damage).toBe(damage); expect(preview.fatal).toBe(fatal);
    expect(commitJump(run,edge.to)).toEqual(preview);
    expect(run.fogFront).toBe(preview.nextFront); expect(run.player.hull).toBe(hull-damage);
    expect(run.fogContacts).toBe(preview.contacts); expect(run.terminalOutcome).toBe(fatal?'lose':null);
  });
  it('implements the two-treacherous-passages example and fatal next normal jump',()=>{
    const run=createRun(2);
    for (let depth=1;depth<=3;depth++) {
      const edge=normal(run); edge.jumpCost=depth<3?2:1;
      commitJump(run,edge.to);
      expect(run.fogFront).toBe([0,2,3][depth-1]);
      if(depth<3) expect(finishVisit(run)).toBe(true);
    }
    expect(run.fogContacts).toBe(2); expect(run.terminalReason).toBe('Overtaken by the ghost armada');
  });
  it('six normal jumps stay safe and only the boss win ends the voyage',()=>{
    const run=createRun(19);
    for(let d=1;d<=6;d++) {
      commitJump(run,normal(run).to); expect(run.fogContacts).toBe(0); expect(run.terminalOutcome).toBe(null);
      const id=run.activeVisit!.id; expect(finishVisit(run)).toBe(true);
      expect(run.clearedNodeIds).toContain(run.currentNode); expect(run.activeVisit).toBe(null);
      expect(completeVisit(run,id,{kind:'port'})).toBe(false);
      expect(run.terminalOutcome).toBe(d===6?'win':null);
    }
    expect(run.currentNode).toBe(BOSS);
  });
  it('fog defeats before boss dispatch or any reward',()=>{
    const run=createRun(8);
    for(let d=1;d<=5;d++) { commitJump(run,normal(run).to); finishVisit(run); }
    run.fogFront=5; run.fogContacts=1; const gold=run.gold;
    commitJump(run,BOSS); expect(run.screen).toBe('end'); expect(run.terminalOutcome).toBe('lose');
    const combat=createCombat(run.player,true); combat.result='win';
    expect(completeVisit(run,run.activeVisit!.id,{kind:'battle',combat})).toBe(false); expect(run.gold).toBe(gold);
    expect(run.clearedNodeIds).not.toContain(BOSS);
  });
  it('rejects stale, wrong-kind and unaffordable outcomes without mutation',()=>{
    const run=createRun(1); commitJump(run,normal(run).to); const id=run.activeVisit!.id;
    nodeAt(run.chart,run.currentNode)!.encounterId='drowned-bell'; run.gold=0; const before=structuredClone(run);
    expect(completeVisit(run,'stale',{kind:'encounter',choice:0})).toBe(false);
    expect(completeVisit(run,id,{kind:'port'})).toBe(false);
    expect(completeVisit(run,id,{kind:'encounter',choice:1})).toBe(false);
    expect(run).toEqual(before);
  });
  it('encounter hull loss ends immediately and caps healing at maxHull',()=>{
    const run=createRun(1); commitJump(run,normal(run).to);
    nodeAt(run.chart,run.currentNode)!.encounterId='widows-passage'; run.player.hull=18;
    expect(completeVisit(run,run.activeVisit!.id,{kind:'encounter',choice:1})).toBe(true);
    expect(run.terminalOutcome).toBe('lose'); expect(run.activeVisit).toBe(null);
    const healed=createRun(1); commitJump(healed,normal(healed).to);
    nodeAt(healed.chart,healed.currentNode)!.encounterId='widows-passage'; healed.player.maxHull=200; healed.player.hull=195;
    completeVisit(healed,healed.activeVisit!.id,{kind:'encounter',choice:0}); expect(healed.player.hull).toBe(200);
  });
  it('reward and recovery happen once and defeat grants neither',()=>{
    const run=createRun(6); commitJump(run,normal(run).to); finishVisit(run); commitJump(run,normal(run).to);
    const id=run.activeVisit!.id, combat=createCombat(run.player); combat.result='win'; run.player.crew[0].health=0; run.player.crew[0].morale=20;
    const gold=run.gold;
    expect(completeVisit(run,id,{kind:'battle',combat})).toBe(true);
    expect(run.gold).toBe(gold+35); expect(run.player.crew[0].health).toBe(100); expect(run.player.crew[0].morale).toBe(28);
    const after=structuredClone(run); expect(completeVisit(run,id,{kind:'battle',combat})).toBe(false); expect(run).toEqual(after);
    const lost=createRun(6); commitJump(lost,normal(lost).to); finishVisit(lost); commitJump(lost,normal(lost).to);
    const loss=createCombat(lost.player); loss.result='lose'; lost.player.crew[0].health=0;
    const wallet=lost.gold; const finalize=vi.fn();
    completeVisit(lost,lost.activeVisit!.id,{kind:'battle',combat:loss},{boarding:{finalizeBoarding:finalize} as never});
    expect(finalize).not.toHaveBeenCalled(); expect(lost.gold).toBe(wallet); expect(lost.player.crew[0].health).toBe(0);
  });
  it('complete reset owns fresh crew, chart, wallet, equipment, stock and journal',()=>{
    const run=createRun(9); run.player.crew.push({...run.player.crew[0],name:'Fixture recruit'});
    run.gold=1; run.equipment={weapon:'chainshot',charms:['fixture-charm']}; run.fogFront=5; run.fogContacts=1;
    run.journal.push('purchase'); run.activeVisit={id:'old',nodeId:'old',stock:{sold:true}};
    expect(createRun(9)).toEqual(createRun(9)); const reset=createRun(9);
    expect(reset.player.crew).toHaveLength(3); expect(reset.player.hull).toBe(180); expect(reset.gold).toBe(25);
    expect(reset.equipment).toEqual({weapon:'roundshot',charms:[]}); expect(reset.fogFront).toBe(-2);
    expect(reset.fogContacts).toBe(0); expect(reset.activeVisit).toBe(null); expect(reset.journal).toEqual([]);
    expect(reset.player).not.toBe(run.player);
  });
  it('missing features have no stock or shopping side effects',()=>{
    const run=createRun(0); const before=structuredClone(run);
    expect(initializePort(run,{})).toBe(false); expect(run).toEqual(before);
  });
});

describe('terminal dispatch and cleanup guards',()=>{
  it('first contact bypasses ward/sails and fatal port approach never initializes stock',()=>{
    const run=createRun(44);
    for(let d=1;d<=2;d++) {commitJump(run,normal(run).to);finishVisit(run);}
    const port=run.chart.nodes.find(n=>n.kind==='port')!;
    run.fogFront=2; run.player.hull=30; run.player.ward=100; run.player.power.sails=3;
    const createStock=vi.fn(); const rooms=structuredClone(run.player.rooms);
    commitJump(run,port.id);
    expect(run.player.hull).toBe(0); expect(run.player.ward).toBe(100); expect(run.player.rooms).toEqual(rooms);
    expect(run.screen).toBe('end'); expect(initializePort(run,{port:{createPortStock:createStock} as never})).toBe(false);
    expect(createStock).not.toHaveBeenCalled();
  });
  it('locks completion while owner cleanup runs before recovery and reward',()=>{
    const run=createRun(0); commitJump(run,normal(run).to); finishVisit(run); commitJump(run,normal(run).to);
    const id=run.activeVisit!.id, combat=createCombat(run.player), gold=run.gold;
    combat.result='win';run.player.crew[0].health=0;
    const cleanup=vi.fn(()=>{
      expect(run.gold).toBe(gold);expect(run.player.crew[0].health).toBe(0);
      expect(completeVisit(run,id,{kind:'battle',combat})).toBe(false);
    });
    expect(completeVisit(run,id,{kind:'battle',combat},{boarding:{finalizeBoarding:cleanup} as never})).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1); expect(run.gold).toBe(gold+35); expect(run.pendingTransition).toBe(false);
  });
});
