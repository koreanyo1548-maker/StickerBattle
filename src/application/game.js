modules["src/application/game.mjs"]=(()=>{
const {byId}=modules["src/content/data.mjs"];
const {defOf,maxHpOf,makeUnit,skillOf,attachmentReason,attachUnit,resolveRound,nextRandom,shuffle,drawCards}=modules["src/domain/rules.mjs"];

// 흐름: title → starter_reveal(3명 공개) → starter_pick(뒤집어 섞은 뒤 고르기) → starter_done → blind_select
//       → battle(손패 4장 중 2장 붙이기·자리 바꾸기 → 전투 → 자동 한 라운드, 살아 있으면 다음 턴)
//       → 승리: cashout → shop → blind_select … 앤티 4 보스 정산 뒤 run_result. 동료가 모두 쓰러지면 run_result.
const initialState=()=>({phase:'title',run:null,battle:null,starter:null,shop:null,appliedCommandIds:[],events:[],history:[]});
// 블라인드 정보: 선택 화면과 전투가 같은 값을 쓴다.
function blindInfo(run,c,index=run.blindIndex,ante=run.ante){
 const kind=c.blindKinds[index],boss=kind.id==='boss',k=ante*c.blindKinds.length+index,elementId=run.blindElements[k],[hp,atk]=c.monsterStats[k];
 return {kind,index,ante,elementId,hp,atk,monsterId:boss?c.bossMonsterId:c.monsters.find(m=>m.elementId===elementId).id};
}
const isFinalBlind=(run,c)=>run.ante===c.balance.anteCount-1&&run.blindIndex===c.blindKinds.length-1;
const aliveUnits=team=>team.filter(u=>u&&u.hp>0);
// 지금 라운드를 시작하면 일어날 일(예상 표시와 실제 전투가 같은 함수를 쓴다). team을 주면 그 편성으로 계산한다.
function forecastRound(state,c,team=state.run.team.characters){const b=state.battle;return resolveRound(team,b.monster,b.turn,c);}
// 스티커를 붙인 뒤의 편성(미리보기용). 실패하면 null.
function previewAttach(state,uid,targetInstanceId,c){
 const b=state.battle,card=b.hand.find(x=>x.uid===uid),team=state.run.team.characters,i=team.findIndex(u=>u?.instanceId===targetInstanceId);
 if(!card||i<0)return null;const sticker=byId(c.stickers,card.defId);if(attachmentReason(team[i],sticker,c))return null;
 const next=team.map(u=>u&&{...u});next[i]=attachUnit(next[i],sticker,c);return next;
}
function validateAttach(state,cmd,c){
 const b=state.battle;if(state.phase!=='battle'||!b)return 'phase';if(b.attachesLeft<=0)return 'limit';
 const card=b.hand.find(x=>x.uid===cmd.uid);if(!card)return 'card';
 const unit=state.run.team.characters.find(u=>u?.instanceId===cmd.targetInstanceId);
 return attachmentReason(unit,byId(c.stickers,card.defId),c);
}
function startBattle(s,c){
 const r=s.run,info=blindInfo(r,c),blindId=`${r.runId}:a${r.ante}:b${r.blindIndex}`;
 const sh=shuffle(r.deck.map(x=>({...x})),r.rngState);
 r.team.characters=r.team.characters.map(u=>u&&{...u,skillCd:0});
 s.battle={blindId,ante:r.ante,kindId:info.kind.id,monsterId:info.monsterId,elementId:info.elementId,monster:{hp:info.hp,maxHp:info.hp,atk:info.atk,elementId:info.elementId},
  turn:1,attachesLeft:c.balance.attachLimit,swapsLeft:c.balance.swapLimit,drawPile:sh.list,hand:[],discardPile:[],rngState:sh.seed,lastRound:null,outcome:null,cashout:null,taken:0,startMaxHp:r.team.characters.reduce((n,u)=>n+(u?maxHpOf(u,c):0),0)};
 drawCards(s.battle,c.balance.handSize);
 s.phase='battle';s.events.push({type:'BlindStarted',ante:r.ante,kindId:info.kind.id,hp:info.hp,atk:info.atk,elementId:info.elementId});
}
function advanceBlind(run,c){run.blindIndex++;if(run.blindIndex>=c.blindKinds.length){run.blindIndex=0;run.ante++;}}
const newCard=(run,defId)=>({uid:`card_${run.nextUid++}`,defId});
function placeCharacter(run,defId,c){
 const slot=run.team.characters.findIndex(u=>!u);if(slot<0)return -1;
 run.team.characters[slot]=makeUnit(`unit_${run.nextUnit++}`,defId,c);return slot;
}
function stockShop(s,c){
 const sh=s.shop;let seed=s.run.rngState;
 sh.recruits=Array.from({length:c.shopRules.recruitOffers},()=>{const r=nextRandom(seed);seed=r.seed;const def=c.characters[Math.floor(r.value*c.characters.length)];return {defId:def.id,cost:def.cost,sold:false};});
 s.run.rngState=seed;
}
const rerollCost=(s,c)=>c.shopRules.rerollCost+s.shop.rerolls*c.shopRules.rerollStep;
const sellValue=(unit,c)=>Math.max(1,Math.floor(defOf(unit,c).cost*c.shopRules.sellRate));
const hurt=(u,c)=>u&&u.hp>0&&u.hp<maxHpOf(u,c);

function applyCommand(state,cmd,c){
 if(!cmd.commandId)return {state,error:'command',events:[]};
 if(state.appliedCommandIds.includes(cmd.commandId))return {state,error:'duplicate',events:[]};
 // 실패는 원래 상태 그대로 반환하며 카드·골드·행동을 소비하지 않는다.
 if(cmd.type==='Attach'){const reason=validateAttach(state,cmd,c);if(reason)return {state,error:reason,events:[]};}
 const s=structuredClone(state);s.events=[];const fail=error=>({state,error,events:[]});
 const run=s.run,b=s.battle;
 switch(cmd.type){
 case 'StartRun':{
  if(s.phase!=='title')return fail('phase');
  const seed=cmd.seed>>>0||1;let rng=seed;const rand=()=>{const r=nextRandom(rng);rng=r.seed;return r.value;};
  const blindElements=Array.from({length:c.balance.anteCount*c.blindKinds.length},()=>c.elements[Math.floor(rand()*c.elements.length)].id);
  const pool=shuffle(c.characters.map(d=>d.id),rng);rng=pool.seed;
  s.run={schemaVersion:8,contentVersion:c.version,runId:`run_${seed}`,seed,rngState:rng,ante:0,blindIndex:0,gold:c.economy.startGold,team:{characters:Array(c.balance.teamSize).fill(null)},
   deck:[],nextUid:0,nextUnit:0,blindElements,diamonds:0,result:null};
  s.run.deck=c.initialDeck.map(id=>newCard(s.run,id));
  s.starter={options:pool.list.slice(0,c.starterRules.offers),order:[0,1,2],swaps:[],picked:null};
  s.history=[];s.phase='starter_reveal';s.events.push({type:'RunStarted',seed});break;
 }
 case 'ShuffleStarter':{
  if(s.phase!=='starter_reveal')return fail('phase');
  // 섞기: 자리 두 개를 바꾸는 교체를 swaps번. 화면이 어떻게 보여 주든 최종 순서는 여기서 정해진다.
  let seed=run.rngState;const order=[0,1,2],swaps=[];
  for(let k=0;k<c.starterRules.swaps;k++){const x=nextRandom(seed),y=nextRandom(x.seed);seed=y.seed;const i=Math.floor(x.value*order.length),j=(i+1+Math.floor(y.value*(order.length-1)))%order.length;swaps.push([i,j]);[order[i],order[j]]=[order[j],order[i]];}
  run.rngState=seed;s.starter.order=order;s.starter.swaps=swaps;s.phase='starter_pick';s.events.push({type:'StarterShuffled',swaps});break;
 }
 case 'PickStarter':{
  if(s.phase!=='starter_pick')return fail('phase');const p=cmd.position;if(!Number.isInteger(p)||p<0||p>=s.starter.order.length)return fail('target');
  const defId=s.starter.options[s.starter.order[p]];placeCharacter(run,defId,c);s.starter.picked=p;s.phase='starter_done';s.events.push({type:'StarterPicked',position:p,defId});break;
 }
 case 'BeginJourney':{if(s.phase!=='starter_done')return fail('phase');s.phase='blind_select';break;}
 case 'SelectBlind':{if(s.phase!=='blind_select')return fail('phase');startBattle(s,c);break;}
 case 'Attach':{
  const idx=b.hand.findIndex(x=>x.uid===cmd.uid),card=b.hand[idx],sticker=byId(c.stickers,card.defId),slot=run.team.characters.findIndex(u=>u?.instanceId===cmd.targetInstanceId);
  const old=run.team.characters[slot],next=attachUnit(old,sticker,c);run.team.characters[slot]=next;
  b.discardPile.push(...b.hand.splice(idx,1));b.attachesLeft--;
  const gained=skillOf(next,c);
  s.events.push({type:'Attached',slot,defId:card.defId,kind:sticker.kind,skillId:gained&&gained.id!==skillOf(old,c)?.id?gained.id:null});break;
 }
 case 'SwapSlots':{
  if(s.phase!=='battle')return fail('phase');if(b.swapsLeft<=0)return fail('swapLimit');
  const ch=run.team.characters,x=cmd.a,y=cmd.b;
  if(![x,y].every(i=>Number.isInteger(i)&&i>=0&&i<ch.length)||x===y||(!ch[x]&&!ch[y]))return fail('target');
  [ch[x],ch[y]]=[ch[y],ch[x]];b.swapsLeft--;s.events.push({type:'Swapped',a:x,b:y});break;
 }
 case 'Fight':{
  if(s.phase!=='battle')return fail('phase');
  const res=resolveRound(run.team.characters,b.monster,b.turn,c);
  run.team.characters=res.team;b.monster=res.monster;b.lastRound={turn:b.turn,events:res.events};
  b.taken+=res.events.filter(e=>e.type==='counter').reduce((n,e)=>n+e.dmg,0);
  b.discardPile.push(...b.hand);b.hand=[];
  const kind=byId(c.blindKinds,b.kindId);
  s.events.push({type:'RoundResolved',turn:b.turn,won:res.won,lost:res.lost});
  if(res.won){
   const e=c.economy,speed=b.turn<=e.speedTurns?e.speedGold:0,interest=Math.min(e.interestMax,Math.floor(run.gold/e.interestPer));
   b.cashout={blindGold:kind.gold,speedGold:speed,interest,total:kind.gold+speed+interest};b.diamonds=kind.diamonds;run.diamonds+=kind.diamonds;
   b.outcome='win';run.rngState=b.rngState;s.phase='cashout';
   s.history.push({ante:run.ante,kindId:b.kindId,outcome:'win',turns:b.turn,taken:b.taken,startMaxHp:b.startMaxHp,diamonds:kind.diamonds});s.events.push({type:'BlindWon',diamonds:kind.diamonds,cashout:b.cashout});
  }else if(res.lost||b.turn>=c.balance.maxRounds){
   b.outcome='lose';run.result='lose';run.rngState=b.rngState;s.phase='run_result';
   s.history.push({ante:run.ante,kindId:b.kindId,outcome:'lose',turns:b.turn,taken:b.taken,startMaxHp:b.startMaxHp,diamonds:0});s.events.push({type:'RunEnded',result:'lose'});
  }else{
   b.turn++;b.attachesLeft=c.balance.attachLimit;b.swapsLeft=c.balance.swapLimit;drawCards(b,c.balance.handSize);
  }
  break;
 }
 case 'CashOut':{
  if(s.phase!=='cashout')return fail('phase');
  run.gold+=b.cashout.total;
  if(isFinalBlind(run,c)){run.result='win';s.phase='run_result';s.events.push({type:'RunEnded',result:'win'});break;}
  advanceBlind(run,c);s.shop={recruits:[],rerolls:0};stockShop(s,c);s.phase='shop';s.events.push({type:'ShopOpened'});break;
 }
 case 'BuyCharacter':{
  if(s.phase!=='shop')return fail('phase');const o=s.shop.recruits[cmd.index];if(!o||o.sold)return fail('target');
  if(run.gold<o.cost)return fail('gold');const slot=placeCharacter(run,o.defId,c);if(slot<0)return fail('full');
  run.gold-=o.cost;o.sold=true;s.events.push({type:'CharacterJoined',slot,defId:o.defId});break;
 }
 case 'HealUnit':{
  if(s.phase!=='shop')return fail('phase');const u=run.team.characters[cmd.slot];if(!hurt(u,c))return fail('target');
  if(run.gold<c.shopRules.healOneCost)return fail('gold');run.gold-=c.shopRules.healOneCost;u.hp=maxHpOf(u,c);s.events.push({type:'Healed',slot:cmd.slot});break;
 }
 case 'HealAll':{
  if(s.phase!=='shop')return fail('phase');if(!run.team.characters.some(u=>hurt(u,c)))return fail('target');
  if(run.gold<c.shopRules.healAllCost)return fail('gold');run.gold-=c.shopRules.healAllCost;
  run.team.characters.forEach(u=>{if(hurt(u,c))u.hp=Math.min(maxHpOf(u,c),u.hp+Math.round(maxHpOf(u,c)*c.shopRules.healAllRatio));});s.events.push({type:'Healed',slot:null});break;
 }
 case 'BuyPack':{
  if(s.phase!=='shop')return fail('phase');const pack=byId(c.packs,cmd.packId);if(!pack)return fail('target');if(run.gold<pack.cost)return fail('gold');
  run.gold-=pack.cost;const added=[];
  for(let k=0;k<pack.count;k++){
   let defId='sticker_star';
   if(pack.kinds==='any'){const r=nextRandom(run.rngState);run.rngState=r.seed;defId=c.stickers[Math.floor(r.value*c.stickers.length)].id;}
   const card=newCard(run,defId);run.deck.push(card);added.push(card);
  }
  s.events.push({type:'CardsAdded',cards:added});break;
 }
 case 'Reroll':{
  if(s.phase!=='shop')return fail('phase');const cost=rerollCost(s,c);if(run.gold<cost)return fail('gold');
  run.gold-=cost;s.shop.rerolls++;stockShop(s,c);s.events.push({type:'ShopRerolled'});break;
 }
 case 'SellCharacter':{
  if(!['shop','blind_select'].includes(s.phase))return fail('phase');const u=run.team.characters[cmd.slot];if(!u)return fail('target');
  if(aliveUnits(run.team.characters).length<=1)return fail('lastCharacter');
  run.gold+=sellValue(u,c);run.team.characters[cmd.slot]=null;s.events.push({type:'CharacterSold',slot:cmd.slot});break;
 }
 case 'MoveCharacter':{
  if(!['shop','blind_select'].includes(s.phase))return fail('phase');const ch=run.team.characters,{from,to}=cmd;
  if(![from,to].every(i=>Number.isInteger(i)&&i>=0&&i<ch.length)||from===to||(!ch[from]&&!ch[to]))return fail('target');
  [ch[from],ch[to]]=[ch[to],ch[from]];s.events.push({type:'CharacterMoved',from,to});break;
 }
 case 'LeaveShop':{if(s.phase!=='shop')return fail('phase');s.shop=null;s.battle=null;s.phase='blind_select';break;}
 case 'RestartRun':return {state:initialState(),error:null,events:[{type:'RunReset'}]};
 default:return fail('command');
 }
 s.appliedCommandIds.push(cmd.commandId);return {state:s,error:null,events:s.events};
}

return {initialState,blindInfo,isFinalBlind,aliveUnits,forecastRound,previewAttach,validateAttach,rerollCost,sellValue,hurt,applyCommand};})();
