modules["src/application/game.mjs"]=(()=>{
const {byId}=modules["src/content/data.mjs"];
const {makeUnit,attachUnit,attachmentReason,activeCombos,recipeFor,scoreTeam,turnEndGain,shuffle,weightedPick,drawCards,nextRandom}=modules["src/domain/rules.mjs"];

// 흐름: title → (블라인드마다) attach 최대 6턴(언제든 조기 전투) → resolve → reward_reveal → reward_pick → reward_done → 다음 블라인드
//       목표 미달이거나 마지막 블라인드를 넘기면 run_result.
const initialState=()=>({phase:'title',run:null,battle:null,reward:null,appliedCommandIds:[],events:[],history:[]});
const progressOf=run=>({levels:run.levels,accumulated:run.accumulated});
const blindOf=(b)=>({target:b.target,elementId:b.elementId,ruleId:b.ruleId??null});
// 지금 전투하면 판정될 점수. 전투(마지막 턴 또는 조기 전투)는 턴 종료 누적이 판정 직전에 더해지므로 미리 포함한다.
// 화면의 예상 점수와 EndTurn의 판정이 같은 함수를 쓴다. team을 주면 그 편성으로 계산한다(미리보기용).
function projectedScore(run,b,c,team=run.team,fight=false){
 const gain=fight||b.turn>=c.balance.turnsPerBlind?turnEndGain(team,progressOf(run),c,blindOf(b)):0;
 return scoreTeam(team,blindOf(b),{levels:run.levels,accumulated:run.accumulated+gain},c);
}
function validateAttachment(state,command,c){
 const b=state.battle;if(state.phase!=='attach'||!b)return 'phase';if(b.actionsUsed>=c.balance.attachLimit)return 'limit';
 const card=b.hand.find(x=>x.instanceId===command.stickerInstanceId);if(!card||!card.stickerDefId)return 'card';
 return attachmentReason(state.run.team.characters.find(u=>u?.instanceId===command.targetInstanceId),byId(c.stickers,card.stickerDefId),c);
}
// 빈 자리 배치와 교체 모두 언제나 가능하고 붙이기 1회를 쓴다.
function validatePlacement(state,command,c){
 const b=state.battle;if(state.phase!=='attach'||!b)return 'phase';if(b.actionsUsed>=c.balance.attachLimit)return 'limit';
 const card=b.hand.find(x=>x.instanceId===command.cardInstanceId);if(!card||!card.characterDefId)return 'card';
 const slot=command.targetSlot;if(!Number.isInteger(slot)||slot<0||slot>=c.balance.teamSize)return 'target';
 const cur=state.run.team.characters[slot];
 if(cur&&cur.characterDefId===card.characterDefId)return 'sameCharacter';
 return null;
}
// 교체해도 스티커와 레벨은 새 캐릭터로 옮겨진다.
function placeUnit(old,slot,defId){const unit=makeUnit(`unit_${slot}`,defId);return old?{...unit,weaponId:old.weaponId,weaponPlus:old.weaponPlus??0,elementId:old.elementId,elementLevel:old.elementLevel,starLevel:old.starLevel}:unit;}
function beginTurn(s,c){
 const b=s.battle;b.turn++;b.actionsUsed=0;
 let charTurn=c.characterRules.guaranteedTurns[b.blindIndex].includes(b.turn);
 if(!charTurn){const r=nextRandom(b.rngState);b.rngState=r.seed;charTurn=r.value<c.characterRules.randomChance;}
 drawCards(b,c.balance.handSize-(charTurn?1:0));
 if(charTurn){const r=nextRandom(b.rngState);b.rngState=r.seed;const def=c.characters[Math.floor(r.value*c.characters.length)];b.hand.unshift({instanceId:`${b.blindId}:char:${b.turn}`,characterDefId:def.id});}
 s.phase='attach';s.events.push({type:'TurnStarted',turn:b.turn});
}
function startBlind(s,c){
 const r=s.run,i=r.blindIndex,blind=c.blinds[i],blindId=`${r.runId}:blind:${i}`;
 const deck=r.deckDefIds.map((id,k)=>({instanceId:`${blindId}:card:${k}`,stickerDefId:id})),sh=shuffle(deck,r.rngState);
 const elementId=r.blindElements[i],monsterId=blind.boss?c.bossMonsterId:c.monsters.find(m=>m.elementId===elementId).id;
 s.battle={blindId,blindIndex:i,target:blind.target,boss:blind.boss,monsterId,elementId,ruleId:blind.boss?r.bossRuleId:null,turn:0,actionsUsed:0,drawPile:sh.list,hand:[],discardPile:[],rngState:sh.seed,lastScore:null,outcome:null};
 s.events.push({type:'BlindStarted',blindIndex:i,elementId:s.battle.elementId,target:blind.target});
 beginTurn(s,c);
}
// 보상 후보: 원정대가 든 레시피 각각 + 족보 종류. 3장을 고르고 각각 등급을 굴린다.
function rollRewards(s,c){
 const r=s.run,rw=c.rewardRules;let seed=r.rngState;
 const recipes=[...new Set(r.team.characters.filter(Boolean).map(u=>recipeFor(u,c)?.id).filter(Boolean))];
 const candidates=[...recipes.map(key=>({type:'recipe',key})),...rw.comboKinds.map(key=>({type:'combo',key}))];
 const sh=shuffle(candidates,seed);seed=sh.seed;
 const offers=sh.list.slice(0,rw.offerCount).map((o,k)=>{const g=weightedPick(rw.grades,seed);seed=g.seed;return {id:`${r.runId}:reward:${r.blindIndex}:${k}`,...o,grade:g.item.id,levels:g.item.levels};});
 // 섞기: 자리 두 개를 바꾸는 교체를 swaps번. 화면은 이 순서대로 움직이고, 고른 자리의 카드가 그대로 보상이 된다.
 const swaps=[];let order=offers.map((_,k)=>k);
 for(let k=0;k<rw.swaps[r.blindIndex];k++){
  const a=nextRandom(seed),b=nextRandom(a.seed);seed=b.seed;
  const i=Math.floor(a.value*order.length),j=(i+1+Math.floor(b.value*(order.length-1)))%order.length;
  swaps.push([i,j]);[order[i],order[j]]=[order[j],order[i]];
 }
 r.rngState=seed;
 return {offers,swaps,order,picked:null};
}
function applyReward(run,offer){run.levels={...run.levels,[offer.key]:(run.levels[offer.key]??1)+offer.levels};}
function applyCommand(state,cmd,c){
 if(!cmd.commandId)return {state,error:'command',events:[]};
 if(state.appliedCommandIds.includes(cmd.commandId))return {state,error:'duplicate',events:[]};
 // 실패는 원래 상태 그대로 반환하며 카드와 행동을 소비하지 않는다.
 if(cmd.type==='AttachSticker'){const reason=validateAttachment(state,cmd,c);if(reason)return {state,error:reason,events:[]};}
 if(cmd.type==='PlaceCharacter'){const reason=validatePlacement(state,cmd,c);if(reason)return {state,error:reason,events:[]};}
 const s=structuredClone(state);s.events=[];const fail=error=>({state,error,events:[]});
 switch(cmd.type){
 case 'StartRun':{
  if(s.phase!=='title')return fail('phase');
  const seed=cmd.seed>>>0||1;let rng=seed;
  const blindElements=c.blinds.map(()=>{const r=nextRandom(rng);rng=r.seed;return c.elements[Math.floor(r.value*c.elements.length)].id;});
  const rr=nextRandom(rng);rng=rr.seed;const bossRuleId=c.bossRules[Math.floor(rr.value*c.bossRules.length)].id;
  s.run={schemaVersion:5,contentVersion:c.version,runId:`run_${seed}`,seed,rngState:rng,blindIndex:0,blindElements,bossRuleId,diamonds:0,team:{characters:Array(c.balance.teamSize).fill(null)},levels:{},accumulated:0,deckDefIds:[...c.initialDeck],result:null};
  s.history=[];startBlind(s,c);break;
 }
 case 'AttachSticker':{
  const b=s.battle,team=s.run.team,idx=b.hand.findIndex(x=>x.instanceId===cmd.stickerInstanceId),card=b.hand[idx],def=byId(c.stickers,card.stickerDefId),ui=team.characters.findIndex(u=>u?.instanceId===cmd.targetInstanceId),old=team.characters[ui];
  const before=activeCombos(team,c,s.run.levels,blindOf(b));team.characters[ui]=attachUnit(old,def,c).unit;b.discardPile.push(...b.hand.splice(idx,1));b.actionsUsed++;
  const now=team.characters[ui];
  s.events.push({type:'StickerAttached',targetInstanceId:old.instanceId,stickerDefId:def.id});
  if(def.kind==='star')s.events.push({type:'StarLeveled',targetInstanceId:old.instanceId,level:now.starLevel});
  else if(def.kind==='element'&&old.elementId===def.payloadId)s.events.push({type:'ElementLeveled',targetInstanceId:old.instanceId,level:now.elementLevel});
  else if(def.kind==='element'&&old.elementId)s.events.push({type:'ElementReplaced',targetInstanceId:old.instanceId,from:old.elementId,lostLevel:old.elementLevel});
  else if(def.kind==='weapon'&&old.weaponId===def.payloadId)s.events.push({type:'WeaponEnhanced',targetInstanceId:old.instanceId,plus:now.weaponPlus});
  else if(def.kind==='weapon'&&old.weaponId)s.events.push({type:'EquipmentReplaced',targetInstanceId:old.instanceId,from:old.weaponId,lostPlus:old.weaponPlus??0});
  const after=activeCombos(team,c,s.run.levels,blindOf(b));if(JSON.stringify(before)!==JSON.stringify(after))s.events.push({type:'ComboChanged',matches:after});break;
 }
 case 'PlaceCharacter':{
  const b=s.battle,team=s.run.team,idx=b.hand.findIndex(x=>x.instanceId===cmd.cardInstanceId),card=b.hand[idx],slot=cmd.targetSlot,old=team.characters[slot];
  const before=activeCombos(team,c,s.run.levels,blindOf(b));team.characters[slot]=placeUnit(old,slot,card.characterDefId);b.hand.splice(idx,1);b.actionsUsed++;
  s.events.push(old?{type:'CharacterReplaced',slot,from:old.characterDefId,to:card.characterDefId}:{type:'CharacterPlaced',slot,characterDefId:card.characterDefId});
  const after=activeCombos(team,c,s.run.levels,blindOf(b));if(JSON.stringify(before)!==JSON.stringify(after))s.events.push({type:'ComboChanged',matches:after});break;
 }
 case 'EndTurn':{
  // fight: 마지막 턴이 아니어도 지금 전투한다(조기 전투). 남은 턴은 다이아몬드 보너스가 된다.
  if(s.phase!=='attach')return fail('phase');
  const b=s.battle,r=s.run,last=b.turn>=c.balance.turnsPerBlind||cmd.fight===true;
  // 전투는 누적을 더하기 전 상태로 판정 점수를 구한다(projectedScore가 누적을 포함한다).
  const res=last?projectedScore(r,b,c,r.team,true):null,gain=turnEndGain(r.team,progressOf(r),c,blindOf(b));
  if(gain>0){r.accumulated+=gain;s.events.push({type:'Accumulated',gain,total:r.accumulated});}
  b.discardPile.push(...b.hand.filter(x=>x.stickerDefId));b.hand=[];
  if(!last){s.events.push({type:'TurnEnded',turn:b.turn});beginTurn(s,c);break;}
  // 마지막 턴: 목표 점수 판정.
  b.lastScore=res;b.outcome=res.score>=b.target?'win':'lose';r.rngState=b.rngState;s.phase='resolve';
  const turnsLeft=c.balance.turnsPerBlind-b.turn,diamonds=b.outcome==='win'?c.metaRules.clearDiamonds+turnsLeft*c.metaRules.diamondsPerTurnLeft:0;
  b.turnsLeft=turnsLeft;b.diamonds=diamonds;r.diamonds=(r.diamonds??0)+diamonds;
  s.history.push({blindIndex:b.blindIndex,target:b.target,score:res.score,outcome:b.outcome,turn:b.turn,diamonds});
  s.events.push({type:'BlindResolved',score:res.score,target:b.target,outcome:b.outcome,diamonds});break;
 }
 case 'FinishResolution':{
  if(s.phase!=='resolve')return fail('phase');
  const b=s.battle,r=s.run;
  if(b.outcome!=='win'||r.blindIndex===c.blinds.length-1){r.result=b.outcome;s.phase='run_result';s.events.push({type:'RunEnded',result:r.result});}
  else {s.reward=rollRewards(s,c);s.phase='reward_reveal';s.events.push({type:'RewardsRevealed',offers:s.reward.offers});}
  break;
 }
 case 'ShuffleRewards':{
  if(s.phase!=='reward_reveal')return fail('phase');s.phase='reward_pick';s.events.push({type:'RewardsShuffled',swaps:s.reward.swaps});break;
 }
 case 'PickReward':{
  if(s.phase!=='reward_pick')return fail('phase');const p=cmd.position;
  if(!Number.isInteger(p)||p<0||p>=s.reward.order.length)return fail('target');
  const offer=s.reward.offers[s.reward.order[p]];applyReward(s.run,offer);s.reward.picked=p;s.phase='reward_done';
  s.events.push({type:'RewardPicked',position:p,offer,level:s.run.levels[offer.key]});break;
 }
 case 'StartNextBlind':{
  if(s.phase!=='reward_done')return fail('phase');s.reward=null;s.run.blindIndex++;startBlind(s,c);break;
 }
 case 'RestartRun':return {state:initialState(),error:null,events:[{type:'RunReset'}]};
 default:return fail('command');
 }
 s.appliedCommandIds.push(cmd.commandId);return {state:s,error:null,events:s.events};
}

return {initialState,projectedScore,applyCommand};})();
