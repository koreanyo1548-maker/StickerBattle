modules["src/domain/rules.mjs"]=(()=>{
const {byId}=modules["src/content/data.mjs"];

// 캐릭터 1명: 무기 1칸, 속성 1칸(레벨), 별 레벨. 레벨 상한은 없다.
function makeUnit(id,defId){return {instanceId:id,characterDefId:defId,weaponId:null,elementId:null,elementLevel:0,starLevel:0};}
function attachmentReason(unit,sticker,c){
 if(!unit)return 'target';if(!sticker)return 'card';
 if(sticker.kind==='weapon'){
  if(unit.weaponId===sticker.payloadId&&c.attachRules.sameWeapon==='reject')return 'same';
  const def=byId(c.characters,unit.characterDefId),w=byId(c.weapons,sticker.payloadId);
  if(!w.compatibleRigIds.includes(c.visuals[def.visualProfileId].rigId))return 'rig';
 }
 return null;
}
// 별은 Lv+1. 같은 속성은 Lv+1, 다른 속성은 교체하고 Lv1부터. 무기는 장착·교체.
function attachUnit(unit,sticker,c){
 const reason=attachmentReason(unit,sticker,c);if(reason)return {reason,unit};
 if(sticker.kind==='star')return {reason:null,unit:{...unit,starLevel:unit.starLevel+sticker.starAmount}};
 if(sticker.kind==='element')return {reason:null,unit:{...unit,elementId:sticker.payloadId,elementLevel:unit.elementId===sticker.payloadId?unit.elementLevel+1:1}};
 return {reason:null,unit:{...unit,weaponId:sticker.payloadId}};
}
const members=team=>team.characters.filter(Boolean);
// 런 레벨표: 레시피 ID와 족보 종류(pair·collection·triple)별 레벨. 없으면 Lv1.
const levelOf=(levels,key)=>levels?.[key]??1;
const byLevel=(value,perLevel,level)=>value+perLevel*(level-1);
function axisValue(u,axis,c){
 const def=byId(c.characters,u.characterDefId);
 return axis==='race'?def.raceId:axis==='job'?def.jobId:axis==='weapon'?u.weaponId:axis==='element'?u.elementId:u.starLevel||null;
}
// 축마다 가장 높은 족보 하나. 별 축은 레벨로 판정한다: 같은 레벨 페어·트리플, 연속 레벨 스트레이트.
function evaluateCombos(team,c,levels){
 const found=[],us=members(team);
 for(const axis of c.comboAxes){
  const entries=us.map(u=>({id:u.instanceId,value:axisValue(u,axis,c)})).filter(x=>x.value);
  const groups=new Map();for(const x of entries){if(!groups.has(x.value))groups.set(x.value,[]);groups.get(x.value).push(x.id);}
  const eligible=[];
  for(const rule of c.combos.filter(r=>r.axis===axis)){
   const add=(value,ids,starLevel)=>{
    const lv=levelOf(levels,rule.levelKind),bonus=rule.flatPowerBonus*(rule.scaleByStarLevel?starLevel:1)*byLevel(1,c.balance.comboBonusPerLevel,lv);
    eligible.push({ruleId:rule.id,axis,kind:rule.kind,levelKind:rule.levelKind,level:lv,matchedValueId:value,memberInstanceIds:ids,bonus,multiplier:byLevel(1,c.balance.comboMultPerLevel,lv),priority:rule.priority,complete:rule.threshold===3});
   };
   if(rule.kind==='pair'||rule.kind==='triple'){
    for(const [value,ids] of groups)if(ids.length>=rule.threshold)add(value,ids,value);
   }else if(entries.length===3&&groups.size===3){
    const sorted=entries.map(x=>x.value).sort((a,b)=>a-b);
    if(rule.kind==='collection')add(null,entries.map(x=>x.id),0);
    else if(sorted[1]===sorted[0]+1&&sorted[2]===sorted[1]+1)add(null,entries.map(x=>x.id),sorted[1]);
   }
  }
  eligible.sort((a,b)=>b.priority-a.priority||a.ruleId.localeCompare(b.ruleId));
  if(eligible[0])found.push(eligible[0]);
 }
 return found;
}
// 조합 무기 효과의 레벨별 세기. 효과 문구(화면)도 이 함수를 쓴다.
const effectStrength=(effect,level)=>byLevel(effect.value,effect.perLevel,level);
function recipeFor(unit,c){return c.weaponRecipes.find(r=>r.weaponId===unit.weaponId&&r.elementId===unit.elementId)??null;}
function effectCount(effect,team,matches){
 switch(effect.condition){
 case 'combo':return matches.some(m=>m.axis===effect.axis&&effect.kinds.includes(m.kind))?1:0;
 case 'completeAxes':return matches.filter(m=>effect.axes.includes(m.axis)&&m.complete).length;
 case 'collections':return matches.filter(m=>m.levelKind==='collection').length;
 case 'starBalance':{const us=members(team),ls=us.map(u=>u.starLevel);return us.length===3&&Math.min(...ls)>=1&&Math.max(...ls)-Math.min(...ls)<=effect.maxGap?1:0;}
 case 'always':return 1;
 default:throw Error('알 수 없는 효과 조건');
 }
}
function effectScale(effect,team){
 const ls=members(team).map(u=>u.starLevel);
 return effect.scaleBy==='starLevelSum'?ls.reduce((a,b)=>a+b,0):effect.scaleBy==='maxStarLevel'?Math.max(0,...ls):1;
}
// 조합 무기 효과. 같은 레시피를 든 캐릭터가 여럿이면 각각 적용하고 레벨은 공유한다.
function evaluateWeaponEffects(team,matches,c,levels){
 let flat=0,multiplier=1,targetPercent=0,accumulateGain=0;const effects=[];
 for(const unit of members(team)){
  const recipe=recipeFor(unit,c);if(!recipe)continue;
  const effect=byId(c.weaponEffects,recipe.effectId),level=levelOf(levels,recipe.id),strength=effectStrength(effect,level);
  const count=effectCount(effect,team,matches),scale=effectScale(effect,team);
  const amount=effect.operation==='multiply'?Math.pow(strength,count):strength*count*scale;
  if(effect.operation==='multiply')multiplier*=amount;else if(effect.operation==='add')flat+=amount;else if(effect.operation==='targetPercent')targetPercent+=amount;else accumulateGain+=amount;
  effects.push({sourceInstanceId:unit.instanceId,recipeId:recipe.id,name:recipe.name,effectId:effect.id,operation:effect.operation,level,count,active:count>0&&(effect.operation==='multiply'||amount>0),amount});
 }
 return {flat,multiplier,targetPercent,accumulateGain,effects};
}
// 캐릭터마다 블라인드 속성과 비교한다. 유리 ×(1+k·Lv), 불리 ÷(1+k·Lv), 무관 ×1.
function relationOf(elementId,blindElementId,c){
 if(!elementId||!blindElementId)return 'neutral';
 return c.affinity.beats[elementId]===blindElementId?'advantage':c.affinity.beats[blindElementId]===elementId?'disadvantage':'neutral';
}
function evaluateAffinity(team,blindElementId,c){
 let total=1;const units=[];
 for(const u of members(team)){
  const relation=relationOf(u.elementId,blindElementId,c),f=1+c.balance.affinityPerLevel*u.elementLevel;
  const multiplier=relation==='advantage'?f:relation==='disadvantage'?1/f:1;
  total*=multiplier;units.push({instanceId:u.instanceId,relation,multiplier});
 }
 return {total,units};
}
// 점수 = floor(기초 × 배율) + 목표 비례 보너스. 기초 = 캐릭터·무기·별 + 족보 + 물 효과 + 번개 누적.
// progress: {levels, accumulated}. blind: {target, elementId}.
function scoreTeam(team,blind,progress,c){
 const levels=progress?.levels??{},us=members(team);
 const matches=evaluateCombos(team,c,levels),effects=evaluateWeaponEffects(team,matches,c,levels),affinity=evaluateAffinity(team,blind.elementId,c);
 const base=us.reduce((n,u)=>n+byId(c.characters,u.characterDefId).basePower,0);
 const weapons=us.reduce((n,u)=>n+(u.weaponId?byId(c.weapons,u.weaponId).powerBonus:0),0);
 const stars=us.reduce((n,u)=>n+u.starLevel*c.balance.starPower,0);
 const combos=matches.reduce((n,m)=>n+m.bonus,0),accumulated=progress?.accumulated??0;
 const chips=base+weapons+stars+combos+effects.flat+accumulated;
 const comboMultiplier=matches.reduce((n,m)=>n*m.multiplier,1);
 const multiplier=comboMultiplier*effects.multiplier*affinity.total;
 // 모든 배율을 합성한 뒤에만 소수점 버림. 경계의 부동소수점 오차만 보정한다.
 const floor=v=>Math.floor(v+Number.EPSILON*Math.max(1,Math.abs(v))*8);
 const targetBonus=floor(blind.target*effects.targetPercent/100);
 return {base,weapons,stars,combos,flat:effects.flat,accumulated,chips,comboMultiplier,effectMultiplier:effects.multiplier,affinity,multiplier,targetBonus,score:floor(chips*multiplier)+targetBonus,matches,effects:effects.effects,accumulateGain:effects.accumulateGain};
}
// 턴 종료 시 번개 조합 무기가 쌓는 양.
function turnEndGain(team,progress,c){
 const levels=progress?.levels??{};
 return evaluateWeaponEffects(team,evaluateCombos(team,c,levels),c,levels).accumulateGain;
}
// 시드 기반 RNG: 순수한 상태 입출력. 같은 시드와 명령은 같은 결과를 만든다.
function nextRandom(seed){let x=seed>>>0||1;x^=x<<13;x^=x>>>17;x^=x<<5;return {seed:x>>>0,value:(x>>>0)/4294967296};}
function shuffle(list,seed){const result=[...list];for(let i=result.length-1;i>0;i--){const r=nextRandom(seed);seed=r.seed;const j=Math.floor(r.value*(i+1));[result[i],result[j]]=[result[j],result[i]];}return {list:result,seed};}
function weightedPick(items,seed){const r=nextRandom(seed);let x=r.value*items.reduce((n,i)=>n+i.weight,0);for(const item of items)if((x-=item.weight)<0)return {item,seed:r.seed};return {item:items[items.length-1],seed:r.seed};}
function drawCards(b,count){
 for(let i=0;i<count;i++){
  if(!b.drawPile.length&&b.discardPile.length){const r=shuffle(b.discardPile,b.rngState);b.drawPile=r.list;b.rngState=r.seed;b.discardPile=[];}
  if(!b.drawPile.length)break;b.hand.push(b.drawPile.pop());
 }
}

return {makeUnit,attachmentReason,attachUnit,levelOf,evaluateCombos,recipeFor,effectStrength,evaluateWeaponEffects,relationOf,evaluateAffinity,scoreTeam,turnEndGain,nextRandom,shuffle,weightedPick,drawCards};})();
