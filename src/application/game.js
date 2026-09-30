modules["src/application/game.mjs"]=(()=>{
const {byId}=modules["src/content/data.mjs"];
const {makeUnit,attachUnit,attachmentReason,calculateTeamPower,resolveCombat,shuffle,drawCards,nextRandom}=modules["src/domain/rules.mjs"];


const initialState=()=>({phase:'title',run:null,battle:null,rewardOptions:[],appliedCommandIds:[],events:[],history:[]});
function validateAttachment(state,command,c){
 const b=state.battle;if(state.phase!=='attach'||!b)return 'phase';if(b.actionsUsed>=c.balance.attachLimit)return 'limit';
 const card=b.hand.find(x=>x.instanceId===command.stickerInstanceId);if(!card||!card.stickerDefId)return 'card';
 return attachmentReason(b.player.characters.find(u=>u?.instanceId===command.targetInstanceId),byId(c.stickers,card.stickerDefId),c,command.elementSlot??'weapon');
}
// 빈 자리 배치는 언제나, 기존 캐릭터 교체는 replaceFromTurn부터. 둘 다 부착 1회를 쓴다.
function drawFrom(pile,b,count,hand){
 for(let i=0;i<count;i++){
  if(!pile.drawPile.length&&pile.discardPile.length){const r=shuffle(pile.discardPile,b.rngState);pile.drawPile=r.list;b.rngState=r.seed;pile.discardPile=[];}
  if(!pile.drawPile.length)break;hand.push(pile.drawPile.pop());
 }
}
// 상대 턴: 테마 덱에서 손패를 받고, 플레이어와 같은 제약(행동 2회, 빈 자리 배치, 교체는 replaceFromTurn부터) 안에서
// 매 행동마다 (상대 점수 - 플레이어 점수)가 가장 커지는 수를 고른다. 이득이 없으면 행동하지 않는다.
function enemyCandidates(b,c,hand){
 const list=[],chars=b.enemy.characters;
 for(const card of hand)for(let slot=0;slot<c.balance.teamSize;slot++){
  const cur=chars[slot];
  if(card.characterDefId){if(!cur||(b.turn>=c.characterRules.replaceFromTurn&&cur.characterDefId!==card.characterDefId))list.push({card,slot});}
  else if(cur&&!attachmentReason(cur,byId(c.stickers,card.stickerDefId),c))list.push({card,slot});
 }
 return list;
}
function enemyApply(chars,m,c){const old=chars[m.slot];chars[m.slot]=m.card.characterDefId?placeUnit(old,m.slot,m.card.characterDefId,c,'enemy'):attachUnit(old,byId(c.stickers,m.card.stickerDefId),c).unit;}
function enemyTurn(s,c,charTurn){
 const b=s.battle,sc=c.scenarios[s.run.stageIndex],pile=b.enemyPile,hand=[];
 drawFrom(pile,b,c.balance.drawCount-(charTurn?1:0),hand);
 if(charTurn){const r=nextRandom(b.rngState);b.rngState=r.seed;hand.unshift({instanceId:`${b.battleId}:echar:${b.turn}`,characterDefId:sc.characterPool[Math.floor(r.value*sc.characterPool.length)]});}
 const value=()=>{const r=resolveCombat(b,c);return r.enemy.score-r.player.score;};
 for(let k=0;k<c.balance.attachLimit;k++){
  const base=b.enemy.characters,cur=value();let best=null,bv=-Infinity;
  for(const m of enemyCandidates(b,c,hand)){b.enemy.characters=[...base];enemyApply(b.enemy.characters,m,c);const v=value();if(v>bv){bv=v;best=m;}}
  b.enemy.characters=base;
  if(!best||bv<cur)break;
  b.enemy.characters=[...base];enemyApply(b.enemy.characters,best,c);hand.splice(hand.indexOf(best.card),1);
  s.events.push({type:'EnemyActed',slot:best.slot,cardDefId:best.card.characterDefId??best.card.stickerDefId});
 }
 pile.discardPile.push(...hand.filter(x=>x.stickerDefId));
}
function validatePlacement(state,command,c){
 const b=state.battle;if(state.phase!=='attach'||!b)return 'phase';if(b.actionsUsed>=c.balance.attachLimit)return 'limit';
 const card=b.hand.find(x=>x.instanceId===command.cardInstanceId);if(!card||!card.characterDefId)return 'card';
 const slot=command.targetSlot;if(!Number.isInteger(slot)||slot<0||slot>=c.balance.teamSize)return 'target';
 const cur=b.player.characters[slot];if(!cur)return null;
 if(b.turn<c.characterRules.replaceFromTurn)return 'swapLocked';
 if(cur.characterDefId===card.characterDefId)return 'sameCharacter';
 return null;
}
function placeUnit(old,slot,defId,c,side='player'){const unit=makeUnit(`${side}_${slot}`,defId,c);return old?{...unit,weaponId:old.weaponId,elementId:old.elementId,elementStacks:old.elementStacks,bodyElementId:old.bodyElementId,bodyElementStacks:old.bodyElementStacks,stars:old.stars}:unit;}
function beginTurn(s,c){
 const b=s.battle;b.turn++;b.actionsUsed=0;
 const charTurn=c.characterRules.drawTurns.includes(b.turn);drawCards(b,c.balance.drawCount-(charTurn?1:0));
 if(charTurn){const r=nextRandom(b.rngState);b.rngState=r.seed;const def=c.characters[Math.floor(r.value*c.characters.length)];b.hand.unshift({instanceId:`${b.battleId}:char:${b.turn}`,characterDefId:def.id});}
 enemyTurn(s,c,charTurn);
 s.phase='attach';s.events.push({type:'TurnStarted',turn:b.turn});
}
function startBattle(s,c){
 const r=s.run,sc=c.scenarios[r.stageIndex],battleId=`${r.runId}:battle:${r.stageIndex}`;
 const deck=r.deckDefIds.map((id,i)=>({instanceId:`${battleId}:card:${i}`,stickerDefId:id})),sh=shuffle(deck,r.rngState);r.rngState=sh.seed;
 const edeck=sc.deck.map((id,i)=>({instanceId:`${battleId}:ecard:${i}`,stickerDefId:id})),esh=shuffle(edeck,sh.seed);
 s.battle={battleId,turn:0,actionsUsed:0,player:{hp:c.balance.teamHp,growth:r.growth??0,characters:Array(c.balance.teamSize).fill(null)},enemy:{hp:sc.hp,growth:0,characters:Array(c.balance.teamSize).fill(null)},drawPile:sh.list,hand:[],discardPile:[],consumedPile:[],enemyPile:{drawPile:esh.list,discardPile:[]},rngState:esh.seed,enemyActionIds:[],lastCombat:null,outcome:null};
 s.history=[];beginTurn(s,c);
}
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
  const seed=cmd.seed>>>0||1;s.run={schemaVersion:3,contentVersion:c.version,runId:`run_${seed}`,seed,rngState:seed,stageIndex:0,growth:0,deckDefIds:[...c.initialDeck]};startBattle(s,c);break;
 }
 case 'AttachSticker':{
  const b=s.battle,idx=b.hand.findIndex(x=>x.instanceId===cmd.stickerInstanceId),card=b.hand[idx],def=byId(c.stickers,card.stickerDefId),ui=b.player.characters.findIndex(u=>u?.instanceId===cmd.targetInstanceId),old=b.player.characters[ui];
  const before=calculateTeamPower(b.player,c);b.player.characters[ui]=attachUnit(old,def,c,cmd.elementSlot??'weapon').unit;b.consumedPile.push(...b.hand.splice(idx,1));b.actionsUsed++;
  s.events.push({type:'StickerAttached',targetInstanceId:old.instanceId,stickerDefId:def.id});
  if(def.kind==='star')s.events.push({type:'StarRaised',targetInstanceId:old.instanceId,stars:b.player.characters[ui].stars});
  else if(def.kind==='element'&&old.elementId===def.payloadId)s.events.push({type:'ElementStacked',targetInstanceId:old.instanceId,stacks:b.player.characters[ui].elementStacks});
  else if(old[def.kind==='weapon'?'weaponId':'elementId'])s.events.push({type:'EquipmentReplaced',targetInstanceId:old.instanceId});
  const after=calculateTeamPower(b.player,c);if(JSON.stringify(before.matches)!==JSON.stringify(after.matches))s.events.push({type:'ComboChanged',matches:after.matches});break;
 }
 case 'PlaceCharacter':{
  const b=s.battle,idx=b.hand.findIndex(x=>x.instanceId===cmd.cardInstanceId),card=b.hand[idx],slot=cmd.targetSlot,old=b.player.characters[slot];
  const before=calculateTeamPower(b.player,c);b.player.characters[slot]=placeUnit(old,slot,card.characterDefId,c);b.hand.splice(idx,1);b.actionsUsed++;
  s.events.push(old?{type:'CharacterReplaced',slot,from:old.characterDefId,to:card.characterDefId}:{type:'CharacterPlaced',slot,characterDefId:card.characterDefId});
  const after=calculateTeamPower(b.player,c);if(JSON.stringify(before.matches)!==JSON.stringify(after.matches))s.events.push({type:'ComboChanged',matches:after.matches});break;
 }
 case 'EndTurn':{
  if(s.phase!=='attach')return fail('phase');const b=s.battle,res=resolveCombat(b,c);
  b.lastCombat=res;b.outcome=res.outcome;b.player.hp=res.nextHp.player;b.enemy.hp=res.nextHp.enemy;
  b.player.growth=res.nextGrowth.player;b.enemy.growth=res.nextGrowth.enemy;s.run.growth=res.nextGrowth.player;
  b.discardPile.push(...b.hand.filter(x=>x.stickerDefId));b.hand=[];s.run.rngState=b.rngState;s.phase='resolve';
  s.history.push({turn:b.turn,...res});s.events.push({type:'CombatResolved',...res});break;
 }
 case 'FinishResolution':{
  if(s.phase!=='resolve')return fail('phase');
  if(s.battle.outcome){s.phase='battle_result';s.events.push({type:'BattleEnded',outcome:s.battle.outcome});}else beginTurn(s,c);break;
 }
 case 'ContinueResult':{
  if(s.phase!=='battle_result')return fail('phase');
  if(s.battle.outcome!=='win'||s.run.stageIndex===c.scenarios.length-1)s.phase='run_result';
  else {const r=shuffle(c.stickers.map(x=>x.id),s.run.rngState);s.run.rngState=r.seed;s.rewardOptions=r.list.slice(0,3);s.phase='reward_pick';}break;
 }
 case 'SelectReward':{
  if(s.phase!=='reward_pick'||!s.rewardOptions.includes(cmd.stickerDefId))return fail('phase');s.run.deckDefIds.push(cmd.stickerDefId);s.rewardOptions=[];s.phase='reward_remove';break;
 }
 case 'RemoveDeckCard':{
  if(s.phase!=='reward_remove')return fail('phase');const i=cmd.deckIndex;if(s.run.deckDefIds.length<=1||!Number.isInteger(i)||i<0||i>=s.run.deckDefIds.length)return fail('card');s.run.deckDefIds.splice(i,1);s.phase='reward_done';break;
 }
 case 'SkipRemoval':if(s.phase!=='reward_remove')return fail('phase');s.phase='reward_done';break;
 case 'StartNextBattle':if(s.phase!=='reward_done')return fail('phase');s.run.stageIndex++;startBattle(s,c);break;
 case 'RestartRun':return {state:initialState(),error:null,events:[{type:'RunReset'}]};
 default:return fail('command');
 }
 s.appliedCommandIds.push(cmd.commandId);return {state:s,error:null,events:s.events};
}

return {initialState,validateAttachment,validatePlacement,placeUnit,applyCommand};})();
