modules["src/domain/rules.mjs"]=(()=>{
const {byId}=modules["src/content/data.mjs"];

// 속성 칸은 캐릭터당 1개. 무기가 있으면 조합 효과, 무기 없이 속성만 있으면 중첩당 전투력.
function makeUnit(id,defId,c){return {instanceId:id,characterDefId:defId,weaponId:null,elementId:null,stars:c.balance.startStars,elementStacks:0,bodyElementId:null,bodyElementStacks:0};}
function attachmentReason(unit,sticker,c,elementSlot='weapon'){
 if(!unit)return 'target';if(!sticker)return 'card';
 if(sticker.kind==='star')return unit.stars+sticker.starAmount>c.balance.maxStars?'maxStars':null;
 const slot=sticker.kind==='weapon'?'weaponId':'elementId';
 if(unit[slot]===sticker.payloadId){if(sticker.kind==='weapon')return 'same';if(elementStacks(unit)>=c.balance.maxElementStacks)return 'maxElementStacks';}
 if(sticker.kind==='weapon'){
  const def=byId(c.characters,unit.characterDefId),w=byId(c.weapons,sticker.payloadId);
  if(!w.compatibleRigIds.includes(c.visuals[def.visualProfileId].rigId))return 'rig';
 }
 return null;
}
function attachUnit(unit,sticker,c,elementSlot='weapon'){
 const reason=attachmentReason(unit,sticker,c,elementSlot);if(reason)return {reason,unit};
 if(sticker.kind==='element')return {reason:null,unit:{...unit,elementId:sticker.payloadId,elementStacks:unit.elementId===sticker.payloadId?elementStacks(unit)+1:1}};
 return {reason:null,unit:sticker.kind==='star'?{...unit,stars:unit.stars+sticker.starAmount}:{...unit,[sticker.kind==='weapon'?'weaponId':'elementId']:sticker.payloadId}};
}
// 빈 슬롯·0별 제외. 축별 최고 우선순위 하나, 복합은 장착 3축의 완성 수로 판정한다.
function elementSet(u){return u.elementId?[u.elementId]:[];}
function elementPower(u,c){return u.elementId&&!u.weaponId?elementStacks(u)*c.balance.bodyElementPower:0;}
function distinctPick(lists){for(const a of lists[0])for(const b of lists[1])if(b!==a)for(const x of lists[2])if(x!==a&&x!==b)return true;return false;}
function evaluateCombos(team,c){
 const found=[];
 for(const axis of c.comboAxes){
  const groups=new Map(),values=[],perMember=[];
  for(const u of team.characters.filter(Boolean)){
   const def=byId(c.characters,u.characterDefId);
   const list=(axis==='element'?elementSet(u):[axis==='race'?def.raceId:axis==='job'?def.jobId:axis==='weapon'?u.weaponId:u.stars]).filter(Boolean);
   if(!list.length)continue;
   perMember.push(list);values.push(list[0]);
   for(const v of list){if(!groups.has(v))groups.set(v,[]);groups.get(v).push(u.instanceId);}
  }
  const eligible=[];
  for(const rule of c.combos.filter(r=>r.axis===axis)){
   const add=(value,members)=>eligible.push({ruleId:rule.id,axis,kind:rule.kind,matchedValueId:value,memberInstanceIds:members,bonus:rule.flatPowerBonus,threshold:rule.threshold,priority:rule.priority,complete:rule.threshold===3});
   if(rule.kind==='pair'||rule.kind==='triple'){
    for(const [value,members] of groups)if(members.length>=rule.threshold)add(value,members);
   }else if(perMember.length===3&&distinctPick(perMember)){
    if(rule.kind==='collection'||(rule.kind==='straight'&&[...values].sort((a,b)=>a-b).every((v,i)=>v===i+1)))add(null,team.characters.filter(Boolean).map(u=>u.instanceId));
   }
  }
  eligible.sort((a,b)=>b.priority-a.priority||a.ruleId.localeCompare(b.ruleId));
  if(eligible[0])found.push(eligible[0]);
 }
 return found;
}
function evaluateCompound(matches,c){
 const candidates=c.compoundCombos.map(rule=>({rule,axes:matches.filter(m=>rule.axes.includes(m.axis)&&m.complete).map(m=>m.axis)})).filter(x=>x.axes.length>=x.rule.threshold).sort((a,b)=>b.rule.threshold-a.rule.threshold);
 const best=candidates[0];return best?{ruleId:best.rule.id,kind:best.rule.kind,axes:best.axes,bonus:best.rule.flatPowerBonus}:null;
}
function unitPower(u,c){return byId(c.characters,u.characterDefId).basePower+(u.weaponId?byId(c.weapons,u.weaponId).powerBonus:0)+u.stars*c.balance.starPower+elementPower(u,c);}
function calculateTeamPower(team,c){
 const matches=evaluateCombos(team,c),compound=evaluateCompound(matches,c);
 const base=team.characters.filter(Boolean).reduce((n,u)=>n+byId(c.characters,u.characterDefId).basePower,0),weapons=team.characters.filter(Boolean).reduce((n,u)=>n+(u.weaponId?byId(c.weapons,u.weaponId).powerBonus:0),0),stars=team.characters.filter(Boolean).reduce((n,u)=>n+u.stars*c.balance.starPower,0),elements=team.characters.filter(Boolean).reduce((n,u)=>n+elementPower(u,c),0);
 const growth=team.growth??0;
 const basicCombos=matches.reduce((n,m)=>n+m.bonus,0),compoundBonus=compound?.bonus??0,combos=basicCombos+compoundBonus;
 return {base,weapons,stars,elements,growth,basicCombos,compoundBonus,compound,combos,total:base+weapons+stars+elements+combos+growth,matches};
}
function elementStacks(unit){return unit.elementId?Math.max(1,unit.elementStacks??1):0;}
function recipeFor(unit,c){return c.weaponRecipes.find(r=>r.weaponId===unit.weaponId&&r.elementId===unit.elementId)??null;}
function effectStrength(unit,c){return 1+(Math.max(1,elementStacks(unit))-1)*c.balance.elementBoostPercent/100;}
function effectCount(effect,team,own,opponent){
 switch(effect.condition){
 case 'combo':return own.matches.some(m=>m.axis===effect.axis&&m.kind===effect.kind)?1:0;
 case 'completeAxes':return own.matches.filter(m=>['weapon','element','star'].includes(m.axis)&&m.complete).length;
 case 'lowerScore':return own.total<opponent.total?1:0;
 case 'collections':return own.matches.filter(m=>['collection','straight'].includes(m.kind)).length;
 case 'allStars':return team.characters.filter(Boolean).length===3&&team.characters.every(u=>u&&u.stars>=1)?1:0;
 case 'pairs':return own.matches.filter(m=>m.kind==='pair').length;
 default:throw Error('알 수 없는 효과 조건');
 }
}
// 동일한 전투 전 스냅샷으로 양측 조건 판정. 미리보기는 상태를 변경하지 않는다.
function evaluateWeaponEffects(team,own,opponent,c){
 let flat=0,multiplier=1,growthGain=0;const effects=[];
 for(const unit of team.characters.filter(Boolean)){
  const recipe=recipeFor(unit,c);if(!recipe)continue;
  const effect=byId(c.weaponEffects,recipe.effectId),count=effectCount(effect,team,own,opponent),strength=effectStrength(unit,c);
  const perUnit=effect.operation==='multiply'?1+(effect.value-1)*strength:effect.value*strength;
  const amount=effect.operation==='multiply'?Math.pow(perUnit,count):perUnit*count;
  if(effect.operation==='multiply')multiplier*=amount;else if(effect.operation==='add')flat+=amount;else growthGain+=amount;
  effects.push({sourceInstanceId:unit.instanceId,recipeId:recipe.id,name:recipe.name,effectId:effect.id,operation:effect.operation,stacks:elementStacks(unit),count,active:count>0,amount});
 }
 return {flat,multiplier,growthGain,effects};
}
function affinityCounts(team,axis,c){
 const m=new Map(),add=(k,n)=>{if(k&&n>0)m.set(k,(m.get(k)??0)+n);};
 for(const u of team.characters.filter(Boolean)){
  if(axis==='element')add(u.elementId,elementStacks(u));
  else if(axis==='weapon')add(u.weaponId,1);else add(byId(c.characters,u.characterDefId).raceId,1);
 }
 return m;
}
// 축마다 (내 x의 수 × x가 이기는 상대 속성의 수)를 유리 쌍으로 센다.
function evaluateAffinity(team,opponentTeam,c){
 let total=1;const axes=[];
 for(const [axis,beats] of Object.entries(c.affinity.beats)){
  const own=affinityCounts(team,axis,c),opp=affinityCounts(opponentTeam,axis,c);let pairs=0;
  for(const [k,n] of own)pairs+=n*(opp.get(beats[k])??0);
  const multiplier=1+pairs*c.balance.affinityPercent/100;total*=multiplier;axes.push({axis,pairs,multiplier});
 }
 return {total,axes};
}
function calculateAttack(team,own,opponent,c,opponentTeam){
 const result=evaluateWeaponEffects(team,own,opponent,c),subtotal=own.total+result.flat,affinity=evaluateAffinity(team,opponentTeam,c);
 // 모든 효과를 합성한 최종 점수에서만 소수점 버림. 경계의 부동소수점 오차만 보정한다.
 const raw=subtotal*result.multiplier*affinity.total,score=Math.floor(raw+Number.EPSILON*Math.max(1,Math.abs(raw))*8);
 return {base:own,...result,affinity,totalMultiplier:result.multiplier*affinity.total,subtotal,score};
}
function resolveCombat(b,c){
 const p=calculateTeamPower(b.player,c),e=calculateTeamPower(b.enemy,c);
 const player=calculateAttack(b.player,p,e,c,b.enemy),enemy=calculateAttack(b.enemy,e,p,c,b.player);
 const difference=player.score-enemy.score,damageToEnemy=Math.max(0,difference),damageToPlayer=Math.max(0,-difference);
 const nextHp={player:Math.max(0,b.player.hp-damageToPlayer),enemy:Math.max(0,b.enemy.hp-damageToEnemy)};
 const nextGrowth={player:(b.player.growth??0)+player.growthGain,enemy:(b.enemy.growth??0)+enemy.growthGain};let outcome=null;
 if(nextHp.player<=0||nextHp.enemy<=0)outcome=nextHp.player<=0&&nextHp.enemy<=0?'draw':nextHp.enemy<=0?'win':'lose';
 else if(b.turn>=c.balance.maxTurns)outcome=nextHp.player===nextHp.enemy?'draw':nextHp.player>nextHp.enemy?'win':'lose';
 return {damageToPlayer,damageToEnemy,nextHp,nextGrowth,player,enemy,difference,outcome};
}
// 시드 기반 RNG: 순수한 상태 입출력. 같은 시드와 명령은 같은 결과를 만든다.
function nextRandom(seed){let x=seed>>>0||1;x^=x<<13;x^=x>>>17;x^=x<<5;return {seed:x>>>0,value:(x>>>0)/4294967296};}
function shuffle(list,seed){const result=[...list];for(let i=result.length-1;i>0;i--){const r=nextRandom(seed);seed=r.seed;const j=Math.floor(r.value*(i+1));[result[i],result[j]]=[result[j],result[i]];}return {list:result,seed};}
function drawCards(b,count){
 for(let i=0;i<count;i++){
  if(!b.drawPile.length&&b.discardPile.length){const r=shuffle(b.discardPile,b.rngState);b.drawPile=r.list;b.rngState=r.seed;b.discardPile=[];}
  if(!b.drawPile.length)break;b.hand.push(b.drawPile.pop());
 }
}

return {evaluateAffinity,elementSet,elementPower,makeUnit,attachmentReason,attachUnit,evaluateCombos,evaluateCompound,unitPower,calculateTeamPower,elementStacks,recipeFor,effectStrength,evaluateWeaponEffects,calculateAttack,resolveCombat,nextRandom,shuffle,drawCards};})();
