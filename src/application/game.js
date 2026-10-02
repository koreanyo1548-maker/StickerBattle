modules["src/application/game.mjs"]=(()=>{
const {byId}=modules["src/content/data.mjs"];
const {makeUnit,attachmentReason,scoreAttack,nextRandom,shuffle,weightedPick,drawCards}=modules["src/domain/rules.mjs"];

// 흐름: title → starter(시작 캐릭터 3명 중 1명) → blind_select ⇄(건너뛰기) → battle(공격·버리기)
//       → 승리: cashout → shop(⇄ deck_pick) → blind_select … 마지막 보스 정산 뒤 run_result. 패배: run_result.
const initialState=()=>({phase:'title',run:null,battle:null,shop:null,starter:null,pick:null,appliedCommandIds:[],events:[],history:[]});
const blindKindOf=(run,c)=>c.blindKinds[run.blindIndex];
const targetOf=(run,c)=>Math.round(c.anteBase[run.ante]*blindKindOf(run,c).targetMult);
const isFinalBlind=(run,c)=>run.ante===c.balance.anteCount-1&&run.blindIndex===c.blindKinds.length-1;
const bossRuleOf=(run,c)=>byId(c.bossRules,run.bossRuleIds[run.ante]);
// 지금 블라인드(또는 다음에 고를 블라인드)의 정보. 화면의 블라인드 선택과 전투가 같은 값을 쓴다.
function blindInfo(run,c,index=run.blindIndex){
 const kind=c.blindKinds[index],k=run.ante*c.blindKinds.length+index,boss=kind.id==='boss';
 return {kind,index,target:Math.round(c.anteBase[run.ante]*kind.targetMult),elementId:run.blindElements[k],rule:boss?bossRuleOf(run,c):null,tagId:kind.skippable?run.skipTags[k]:null,monsterId:boss?c.bossMonsterId:c.monsters.find(m=>m.elementId===run.blindElements[k]).id};
}
// 공격 미리보기와 판정이 같은 함수를 쓴다. plays: [{uid,targetInstanceId}]
function previewAttack(state,plays,c){
 const b=state.battle,run=state.run;
 const cards=plays.map(p=>({card:b.hand.find(x=>x.uid===p.uid),targetInstanceId:p.targetInstanceId}));
 return scoreAttack({team:run.team.characters,plays:cards,levels:run.levels,blind:{elementId:b.elementId,effect:b.effect,silencedSlot:b.silencedSlot},discardsLeft:b.discardsLeft,lastAttack:b.attacksLeft===1},c);
}
// 다섯 장 규칙: 낼 수 있는 카드가 5장보다 적으면 가진 카드 전부.
function requiredPlay(state,c){const b=state.battle;return b.effect==='exactFive'?Math.min(c.balance.maxPlay,b.hand.length):null;}
function validateAttack(state,cmd,c){
 const b=state.battle;if(state.phase!=='battle'||!b)return 'phase';
 const plays=cmd.plays;if(!Array.isArray(plays)||!plays.length)return 'empty';
 if(plays.length>c.balance.maxPlay)return 'tooMany';
 const need=requiredPlay(state,c);if(need&&plays.length!==need)return 'exactFive';
 if(new Set(plays.map(p=>p.uid)).size!==plays.length)return 'card';
 for(const p of plays){
  const card=b.hand.find(x=>x.uid===p.uid);if(!card)return 'card';
  const unit=state.run.team.characters.find(u=>u?.instanceId===p.targetInstanceId);if(!unit)return 'target';
  const reason=attachmentReason(unit,byId(c.stickers,card.defId),c);if(reason)return reason;
 }
 return null;
}
function rollSilence(b,team){
 if(b.effect!=='silence'){b.silencedSlot=null;return;}
 const slots=team.map((u,i)=>u?i:-1).filter(i=>i>=0);if(!slots.length){b.silencedSlot=null;return;}
 const r=nextRandom(b.rngState);b.rngState=r.seed;b.silencedSlot=slots[Math.floor(r.value*slots.length)];
}
function startBlind(s,c){
 const r=s.run,info=blindInfo(r,c),blindId=`${r.runId}:a${r.ante}:b${r.blindIndex}`;
 const sh=shuffle(r.deck.map(x=>({...x})),r.rngState);
 const effect=info.rule?.effect??null;
 s.battle={blindId,ante:r.ante,kindId:info.kind.id,target:info.target,damage:0,attacksLeft:c.balance.attacks,attacksUsed:0,discardsLeft:effect==='noDiscard'?0:c.balance.discards,
  elementId:info.elementId,monsterId:info.monsterId,ruleId:info.rule?.id??null,effect,silencedSlot:null,drawPile:sh.list,hand:[],discardPile:[],rngState:sh.seed,lastAttack:null,outcome:null,cashout:null};
 rollSilence(s.battle,r.team.characters);
 drawCards(s.battle,c.balance.handSize);
 s.phase='battle';s.events.push({type:'BlindStarted',ante:r.ante,kindId:info.kind.id,target:info.target,elementId:info.elementId});
}
function advanceBlind(run,c){run.blindIndex++;if(run.blindIndex>=c.blindKinds.length){run.blindIndex=0;run.ante++;}}
const randomHand=(run,c)=>{const r=nextRandom(run.rngState);run.rngState=r.seed;return c.hands[Math.floor(r.value*c.hands.length)].id;};
const levelUp=(run,handId,n)=>{run.levels={...run.levels,[handId]:(run.levels[handId]??1)+n};};
const newCard=(run,defId,mod=null)=>({uid:`card_${run.nextUid++}`,defId,mod});
function applyTag(s,tag,c){
 const run=s.run;
 if(tag.effect==='gold')run.gold+=tag.value;
 else if(tag.effect==='freeRerolls')run.pending.freeRerolls+=tag.value;
 else if(tag.effect==='halfCharacters')run.pending.halfCharacters=true;
 else if(tag.effect==='handLevels'){const id=randomHand(run,c);levelUp(run,id,tag.value);s.events.push({type:'HandLeveled',handId:id,level:run.levels[id]});}
 else if(tag.effect==='shinyCards'){
  const plain=run.deck.filter(x=>!x.mod),sh=shuffle(plain,run.rngState);run.rngState=sh.seed;
  const picked=new Set(sh.list.slice(0,tag.value).map(x=>x.uid));run.deck=run.deck.map(x=>picked.has(x.uid)?{...x,mod:'shiny'}:x);
  s.events.push({type:'CardsModded',uids:[...picked],mod:'shiny'});
 }
}
const characterCost=(run,def,half)=>half?Math.ceil(def.cost/2):def.cost;
function stockShop(s,c){
 const run=s.run,sh=s.shop;let seed=run.rngState;
 sh.characters=Array.from({length:c.shopRules.characterOffers},()=>{const r=nextRandom(seed);seed=r.seed;const def=c.characters[Math.floor(r.value*c.characters.length)];return {defId:def.id,cost:characterCost(run,def,sh.half),sold:false};});
 sh.items=Array.from({length:c.shopRules.itemOffers},()=>{const p=weightedPick(c.items,seed);seed=p.seed;return {itemId:p.item.id,cost:p.item.cost,sold:false};});
 run.rngState=seed;
}
function openShop(s,c){
 const run=s.run;
 s.shop={characters:[],items:[],rerolls:0,freeRerolls:run.pending.freeRerolls,half:run.pending.halfCharacters};
 run.pending={freeRerolls:0,halfCharacters:false};
 stockShop(s,c);s.phase='shop';
}
const rerollCost=(s,c)=>s.shop.freeRerolls>0?0:c.shopRules.rerollCost+s.shop.rerolls*c.shopRules.rerollStep;
const slotCost=(run,c)=>run.team.characters.length<c.balance.maxSlots?c.shopRules.slotCosts[run.team.characters.length-c.balance.startSlots]:null;
const sellValue=(unit,c)=>Math.max(1,Math.floor(byId(c.characters,unit.characterDefId).cost*c.shopRules.sellRate));
function placeCharacter(run,defId){const slot=run.team.characters.findIndex(u=>!u);if(slot<0)return -1;run.team.characters[slot]=makeUnit(`unit_${run.nextUnit++}`,defId);return slot;}

function applyCommand(state,cmd,c){
 if(!cmd.commandId)return {state,error:'command',events:[]};
 if(state.appliedCommandIds.includes(cmd.commandId))return {state,error:'duplicate',events:[]};
 // 실패는 원래 상태 그대로 반환하며 카드·골드·행동을 소비하지 않는다.
 if(cmd.type==='Attack'){const reason=validateAttack(state,cmd,c);if(reason)return {state,error:reason,events:[]};}
 const s=structuredClone(state);s.events=[];const fail=error=>({state,error,events:[]});
 const run=s.run,b=s.battle;
 switch(cmd.type){
 case 'StartRun':{
  if(s.phase!=='title')return fail('phase');
  const seed=cmd.seed>>>0||1;let rng=seed;const rand=()=>{const r=nextRandom(rng);rng=r.seed;return r.value;};
  const total=c.balance.anteCount*c.blindKinds.length;
  const blindElements=Array.from({length:total},()=>c.elements[Math.floor(rand()*c.elements.length)].id);
  const skipTags=Array.from({length:total},()=>c.tags[Math.floor(rand()*c.tags.length)].id);
  const bossSh=shuffle(c.bossRules.map(r=>r.id),rng);rng=bossSh.seed;
  const starterSh=shuffle(c.characters.map(d=>d.id),rng);rng=starterSh.seed;
  s.run={schemaVersion:7,contentVersion:c.version,runId:`run_${seed}`,seed,rngState:rng,ante:0,blindIndex:0,gold:c.economy.startGold,
   team:{characters:Array(c.balance.startSlots).fill(null)},levels:{},deck:[],nextUid:0,nextUnit:0,blindElements,skipTags,bossRuleIds:bossSh.list.slice(0,c.balance.anteCount),
   pending:{freeRerolls:0,halfCharacters:false},diamonds:0,result:null,handsPlayed:{}};
  s.run.deck=c.initialDeck.map(id=>newCard(s.run,id));
  s.starter=starterSh.list.slice(0,3);s.history=[];s.phase='starter';s.events.push({type:'RunStarted',seed});break;
 }
 case 'PickStarter':{
  if(s.phase!=='starter')return fail('phase');const defId=s.starter[cmd.index];if(!defId)return fail('target');
  placeCharacter(run,defId);s.starter=null;s.phase='blind_select';s.events.push({type:'CharacterJoined',slot:0,defId});break;
 }
 case 'SelectBlind':{if(s.phase!=='blind_select')return fail('phase');startBlind(s,c);break;}
 case 'SkipBlind':{
  if(s.phase!=='blind_select')return fail('phase');const info=blindInfo(run,c);if(!info.kind.skippable)return fail('boss');
  const tag=byId(c.tags,info.tagId);applyTag(s,tag,c);
  s.history.push({ante:run.ante,kindId:info.kind.id,target:info.target,score:0,outcome:'skip',tagId:tag.id});
  s.events.push({type:'BlindSkipped',kindId:info.kind.id,tagId:tag.id});advanceBlind(run,c);break;
 }
 case 'Attack':{
  const res=previewAttack(state,cmd.plays,c);
  run.team.characters=res.team;
  const used=new Set(cmd.plays.map(p=>p.uid)),played=b.hand.filter(x=>used.has(x.uid));b.hand=b.hand.filter(x=>!used.has(x.uid));
  // 유리 각인: 공격 뒤 확률로 깨져 덱에서 사라진다.
  const broken=[];
  for(const card of played){
   const m=card.mod&&byId(c.mods,card.mod);
   if(m?.breakChance){const r=nextRandom(b.rngState);b.rngState=r.seed;if(r.value<m.breakChance){broken.push(card.uid);continue;}}
   b.discardPile.push(card);
  }
  if(broken.length)run.deck=run.deck.filter(x=>!broken.includes(x.uid));
  b.damage+=res.score;b.attacksLeft--;b.attacksUsed++;run.handsPlayed[res.handId]=(run.handsPlayed[res.handId]??0)+1;
  b.lastAttack={...res,plays:cmd.plays.map(p=>({...p,defId:played.find(x=>x.uid===p.uid).defId,mod:played.find(x=>x.uid===p.uid).mod})),broken};
  s.events.push({type:'Attacked',score:res.score,handId:res.handId,damage:b.damage,target:b.target,broken});
  if(b.damage>=b.target){
   const kind=byId(c.blindKinds,b.kindId),e=c.economy;
   const interest=Math.min(e.interestMax,Math.floor(run.gold/e.interestPer));
   b.cashout={blindGold:kind.gold,attackGold:b.attacksLeft*e.attackGold,interest,total:kind.gold+b.attacksLeft*e.attackGold+interest};
   const diamonds=kind.diamonds+b.attacksLeft*e.attackDiamonds;b.diamonds=diamonds;run.diamonds+=diamonds;
   b.outcome='win';run.rngState=b.rngState;s.phase='cashout';
   s.history.push({ante:run.ante,kindId:b.kindId,target:b.target,score:b.damage,outcome:'win',attacksUsed:b.attacksUsed,diamonds});
   s.events.push({type:'BlindWon',diamonds,cashout:b.cashout});
  }else if(b.attacksLeft<=0){
   b.outcome='lose';run.result='lose';run.rngState=b.rngState;s.phase='run_result';
   s.history.push({ante:run.ante,kindId:b.kindId,target:b.target,score:b.damage,outcome:'lose',attacksUsed:b.attacksUsed,diamonds:0});
   s.events.push({type:'BlindLost'},{type:'RunEnded',result:'lose'});
  }else{drawCards(b,c.balance.handSize);rollSilence(b,run.team.characters);}
  break;
 }
 case 'Discard':{
  if(s.phase!=='battle')return fail('phase');if(b.discardsLeft<=0)return fail('noDiscards');
  const uids=cmd.uids;if(!Array.isArray(uids)||!uids.length)return fail('empty');if(uids.length>c.balance.maxPlay)return fail('tooMany');
  if(new Set(uids).size!==uids.length||uids.some(u=>!b.hand.some(x=>x.uid===u)))return fail('card');
  b.discardPile.push(...b.hand.filter(x=>uids.includes(x.uid)));b.hand=b.hand.filter(x=>!uids.includes(x.uid));b.discardsLeft--;
  drawCards(b,c.balance.handSize);s.events.push({type:'Discarded',uids});break;
 }
 case 'CashOut':{
  if(s.phase!=='cashout')return fail('phase');
  run.gold+=b.cashout.total;
  if(isFinalBlind(run,c)){run.result='win';s.phase='run_result';s.events.push({type:'RunEnded',result:'win'});break;}
  advanceBlind(run,c);openShop(s,c);s.events.push({type:'ShopOpened'});break;
 }
 case 'BuyCharacter':{
  if(s.phase!=='shop')return fail('phase');const o=s.shop.characters[cmd.index];if(!o||o.sold)return fail('target');
  if(run.gold<o.cost)return fail('gold');const slot=placeCharacter(run,o.defId);if(slot<0)return fail('full');
  run.gold-=o.cost;o.sold=true;s.events.push({type:'CharacterJoined',slot,defId:o.defId});break;
 }
 case 'BuyItem':{
  if(s.phase!=='shop')return fail('phase');const o=s.shop.items[cmd.index];if(!o||o.sold)return fail('target');
  const item=byId(c.items,o.itemId);if(run.gold<o.cost)return fail('gold');
  if(['mod','remove','copy'].includes(item.effect)){s.pick={index:cmd.index,itemId:item.id};s.phase='deck_pick';break;}
  run.gold-=o.cost;o.sold=true;
  if(item.effect==='handLevel'){const id=randomHand(run,c);levelUp(run,id,1);s.events.push({type:'HandLeveled',handId:id,level:run.levels[id]});}
  else{
   let r=nextRandom(run.rngState);const def=c.stickers[Math.floor(r.value*c.stickers.length)];
   const m=weightedPick(c.addStickerMods,r.seed);run.rngState=m.seed;const card=newCard(run,def.id,m.item.mod);run.deck.push(card);
   s.events.push({type:'CardAdded',card});
  }
  break;
 }
 case 'PickDeckCards':{
  if(s.phase!=='deck_pick')return fail('phase');const o=s.shop.items[s.pick.index],item=byId(c.items,o.itemId),uids=cmd.uids;
  if(!Array.isArray(uids)||!uids.length||uids.length>item.pick||new Set(uids).size!==uids.length||uids.some(u=>!run.deck.some(x=>x.uid===u)))return fail('card');
  if(run.gold<o.cost)return fail('gold');
  if(item.effect==='remove'&&run.deck.length-uids.length<c.balance.handSize)return fail('deckSize');
  run.gold-=o.cost;o.sold=true;
  if(item.effect==='mod')run.deck=run.deck.map(x=>uids.includes(x.uid)?{...x,mod:item.mod}:x);
  else if(item.effect==='remove')run.deck=run.deck.filter(x=>!uids.includes(x.uid));
  else for(const u of uids){const src=run.deck.find(x=>x.uid===u);run.deck.push(newCard(run,src.defId,src.mod));}
  s.events.push({type:'DeckEdited',effect:item.effect,uids,mod:item.mod??null});s.pick=null;s.phase='shop';break;
 }
 case 'CancelPick':{if(s.phase!=='deck_pick')return fail('phase');s.pick=null;s.phase='shop';break;}
 case 'Reroll':{
  if(s.phase!=='shop')return fail('phase');const cost=rerollCost(s,c);if(run.gold<cost)return fail('gold');
  run.gold-=cost;if(s.shop.freeRerolls>0)s.shop.freeRerolls--;else s.shop.rerolls++;stockShop(s,c);s.events.push({type:'ShopRerolled'});break;
 }
 case 'BuySlot':{
  if(s.phase!=='shop')return fail('phase');const cost=slotCost(run,c);if(cost==null)return fail('maxSlots');if(run.gold<cost)return fail('gold');
  run.gold-=cost;run.team.characters.push(null);s.events.push({type:'SlotAdded',slots:run.team.characters.length});break;
 }
 case 'SellCharacter':{
  if(!['shop','blind_select'].includes(s.phase))return fail('phase');const u=run.team.characters[cmd.slot];if(!u)return fail('target');
  if(run.team.characters.filter(Boolean).length<=1)return fail('lastCharacter');
  run.gold+=sellValue(u,c);run.team.characters[cmd.slot]=null;s.events.push({type:'CharacterSold',slot:cmd.slot,defId:u.characterDefId});break;
 }
 case 'MoveCharacter':{
  if(!['shop','blind_select','battle'].includes(s.phase))return fail('phase');const ch=run.team.characters,{from,to}=cmd;
  if(![from,to].every(i=>Number.isInteger(i)&&i>=0&&i<ch.length)||from===to||!ch[from])return fail('target');
  [ch[from],ch[to]]=[ch[to],ch[from]];
  // 침묵은 자리 기준이 아니라 캐릭터 기준으로 따라간다.
  if(b&&s.phase==='battle'&&b.silencedSlot!=null)b.silencedSlot=b.silencedSlot===from?to:b.silencedSlot===to?from:b.silencedSlot;
  s.events.push({type:'CharacterMoved',from,to});break;
 }
 case 'LeaveShop':{if(s.phase!=='shop')return fail('phase');s.shop=null;s.battle=null;s.phase='blind_select';break;}
 case 'RestartRun':return {state:initialState(),error:null,events:[{type:'RunReset'}]};
 default:return fail('command');
 }
 s.appliedCommandIds.push(cmd.commandId);return {state:s,error:null,events:s.events};
}

return {initialState,blindInfo,targetOf,isFinalBlind,previewAttack,requiredPlay,validateAttack,rerollCost,slotCost,sellValue,applyCommand};})();
