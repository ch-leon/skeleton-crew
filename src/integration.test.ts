import { describe, expect, it, vi } from 'vitest';
import { createCombat, type Combat } from './combat';
import { BOSS, nodeAt, passages } from './chart';
import { commitJump, completeVisit, createRun, initializePort } from './run';
import type { BoardingAdapter, FeatureAdapters, PortAdapter, RunState } from './contracts';

// Boundary fixtures exercise A's wiring only. They do not implement, or assert
// the correctness of, C's catalog/effects or B's boarding simulation.
function fixtures(): FeatureAdapters {
  const finalizeBoarding=vi.fn((combat: Combat) => { for(const p of combat.player.crew) Object.assign(p,{shipId:'player',transit:null,room:4,destination:4,travel:0}); });
  const port: PortAdapter = {
    createPortStock:vi.fn((seed,nodeId)=>({seed,nodeId,purchased:[]})),
    quotePurchase:()=>({fixture:true}),
    purchase:(run,stock,itemId)=> {
      if(run.screen!=='port'||run.activeVisit?.stock!==stock) return {ok:false,reason:'Stale fixture'};
      (stock as {purchased:string[]}).purchased.push(itemId);
      run.gold -= 1; // Fixture debit proves the single wallet is carried forward.
      if(itemId==='fixture-recruit') run.player.crew.push(Object.assign({...run.player.crew[0],name:'Fixture recruit',room:5},{id:'fixture-recruit',shipId:'player',transit:null}));
      if(itemId==='fixture-cannon') run.equipment.weapon='chainshot';
      if(itemId==='fixture-charm') run.equipment.charms.push('fixture-charm');
      run.journal.push(itemId); return {ok:true};
    }, mount:()=>({dispose(){}}),
  };
  return {port,boarding:{finalizeBoarding} as unknown as BoardingAdapter};
}
function arrive(run:RunState,id:string) { const p=commitJump(run,id); expect(p.ok).toBe(true); expect(run.terminalOutcome).toBe(null); }
function resolve(run:RunState,features:FeatureAdapters) {
  const node=nodeAt(run.chart,run.currentNode)!;
  if(node.kind==='encounter') return completeVisit(run,run.activeVisit!.id,{kind:'encounter',choice:0},features);
  if(node.kind==='port') return completeVisit(run,run.activeVisit!.id,{kind:'port'},features);
  const combat=createCombat(run.player,node.kind==='boss'); combat.result='win';
  return completeVisit(run,run.activeVisit!.id,{kind:'battle',combat},features);
}
describe('A integration across owner contracts',()=>{
  it('all three depth-2 lanes can choose the port or skip it',()=>{
    for(let seed=0;seed<100;seed++) {
      const template=createRun(seed), port=template.chart.nodes.find(n=>n.kind==='port')!;
      for(const battleNode of template.chart.nodes.filter(n=>n.depth===2)) {
        const first=template.chart.edges.find(e=>e.to===battleNode.id)!;
        const run=createRun(seed); run.chart.edges.forEach(e=>e.jumpCost=1);
        arrive(run,first.from); resolve(run,{}); arrive(run,battleNode.id); resolve(run,{});
        const choices=passages(run.chart,run.currentNode);
        expect(choices.some(e=>e.to===port.id)).toBe(true); expect(choices.some(e=>e.to!==port.id)).toBe(true);
        arrive(run,port.id); expect(run.screen).toBe('port');
        const front=run.fogFront,id=run.activeVisit!.id;
        expect(completeVisit(run,id,{kind:'port'})).toBe(true); expect(run.fogFront).toBe(front);
        expect(completeVisit(run,id,{kind:'port'})).toBe(false);
      }
    }
  });
  it('persists fixture recruit/cannon/charm and stock, rescues before awards, and enters boss',()=>{
    const run=createRun(44), features=fixtures(); run.chart.edges.forEach(e=>e.jumpCost=1);
    const first=passages(run.chart,run.currentNode)[0]; arrive(run,first.to); resolve(run,features);
    arrive(run,passages(run.chart,run.currentNode)[0].to); resolve(run,features);
    const port=run.chart.nodes.find(n=>n.kind==='port')!; arrive(run,port.id);
    expect(initializePort(run,features)).toBe(true); const stock=run.activeVisit!.stock;
    for(let i=0;i<4;i++) expect(initializePort(run,features)).toBe(true);
    expect(features.port!.createPortStock).toHaveBeenCalledTimes(1); expect(run.activeVisit!.stock).toBe(stock);
    for(const id of ['fixture-recruit','fixture-cannon','fixture-charm']) features.port!.purchase(run,stock,id);
    resolve(run,features); const equipment=structuredClone(run.equipment), wallet=run.gold;
    const optional=run.chart.nodes.find(n=>n.depth===4&&n.kind==='battle')!;
    expect(passages(run.chart,run.currentNode).some(e=>e.to===optional.id)).toBe(true);
    arrive(run,optional.id); const combat=createCombat(run.player);
    const recruit=run.player.crew.at(-1)!; Object.assign(recruit,{shipId:'enemy',transit:{phase:'crossing'}}); recruit.health=0;
    const id=run.activeVisit!.id; combat.result='win';
    const cleanup=features.boarding!.finalizeBoarding;
    expect(completeVisit(run,id,{kind:'battle',combat},features)).toBe(true);
    expect(cleanup).toHaveBeenCalled(); expect(recruit).toMatchObject({shipId:'player',transit:null,room:4,health:100});
    expect(run.gold).toBe(wallet+35); expect(run.equipment).toEqual(equipment); expect(run.player.crew).toHaveLength(4);
    expect(completeVisit(run,id,{kind:'battle',combat},features)).toBe(false); expect(run.gold).toBe(wallet+35);
    arrive(run,passages(run.chart,run.currentNode)[0].to); resolve(run,features); arrive(run,BOSS);
    expect(run.screen).toBe('battle'); expect(run.activeVisit!.nodeId).toBe(BOSS); resolve(run,features);
    expect(run.terminalOutcome).toBe('win'); expect(run.equipment).toEqual(equipment);
  });
  it('can skip the port and finish a divergent route',()=>{
    const run=createRun(3); run.chart.edges.forEach(e=>e.jumpCost=1);
    while(!run.terminalOutcome) {
      const edges=passages(run.chart,run.currentNode), chosen=edges.find(e=>nodeAt(run.chart,e.to)!.kind!=='port')!;
      arrive(run,chosen.to); resolve(run,{});
    }
    expect(run.terminalOutcome).toBe('win'); expect(run.clearedNodeIds.some(id=>nodeAt(run.chart,id)!.kind==='port')).toBe(false);
  });
});

describe('explicit battlefield command routing',()=>{
  it('never aims in board/inspect/move mode and first running tap only pauses',async()=>{
    const {routeRoomOrder,ownedCrewId}=await import('./contracts');
    const run=createRun(1), combat=createCombat(run.player), features=fixtures();
    const queue=vi.fn(()=>({ok:true as const})); features.boarding!.queueBoard=queue;
    const id=ownedCrewId(run.player,0); combat.target=2;
    routeRoomOrder(combat,'board',id,'enemy',0,features); expect(queue).toHaveBeenCalledWith(combat,id,0); expect(combat.target).toBe(2);
    routeRoomOrder(combat,'inspect',null,'enemy',4,features); expect(combat.target).toBe(2);
    combat.paused=false; routeRoomOrder(combat,'aim',null,'enemy',1,features); expect(combat.paused).toBe(true); expect(combat.target).toBe(2);
    routeRoomOrder(combat,'aim',null,'enemy',1,features); expect(combat.target).toBe(1);
    expect(routeRoomOrder(combat,'board',id,'enemy',0,{}).ok).toBe(false);
  });
  it('moves a recruited stable ID through B instead of treating it as a roster index',async()=>{
    const {routeRoomOrder}=await import('./contracts');
    const run=createRun(2),combat=createCombat(run.player),features=fixtures();
    run.player.crew.push(Object.assign({...run.player.crew[0],name:'Fixture recruit'},{id:'fixture-unique-id'}));
    const move=vi.fn(()=>({ok:true as const})); features.boarding!.moveCrewById=move;
    routeRoomOrder(combat,'move','fixture-unique-id','enemy',4,features);
    expect(move).toHaveBeenCalledWith(combat,'fixture-unique-id','enemy',4); expect(combat.target).toBe(0);
  });
});
