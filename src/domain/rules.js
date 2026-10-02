modules["src/domain/rules.mjs"]=(()=>{
const {byId}=modules["src/content/data.mjs"];

// 캐릭터 1명: 무기 1칸(강화 수치), 속성 1칸(레벨), 별 레벨. 강화·레벨 상한은 없다.
function makeUnit(id,defId){return {instanceId:id,characterDefId:defId,weaponId:null,weaponPlus:0,elementId:null,elementLevel:0,starLevel:0};}
function attachmentReason(unit,sticker,c){
 if(!unit)return 'target';if(!sticker)return 'card';
 if(sticker.kind==='weapon'){
  if(unit.weaponId===sticker.payloadId&&c.attachRules.sameWeapon==='reject')return 'same';
  const def=byId(c.characters,unit.characterDefId),w=byId(c.weapons,sticker.payloadId);
  if(!w.compatibleRigIds.includes(c.visuals[def.visualProfileId].rigId))return 'rig';
 }
 return null;
}
// 별은 Lv+1. 같은 속성은 Lv+1, 다른 속성은 교체하고 Lv1부터. 같은 무기는 강화 +1, 다른 무기는 교체하고 +0부터.
function attachUnit(unit,sticker,c){
 const reason=attachmentReason(unit,sticker,c);if(reason)return {reason,unit};
 if(sticker.kind==='star')return {reason:null,unit:{...unit,starLevel:unit.starLevel+sticker.starAmount}};
 if(sticker.kind==='element')return {reason:null,unit:{...unit,elementId:sticker.payloadId,elementLevel:unit.elementId===sticker.payloadId?unit.elementLevel+1:1}};
 return {reason:null,unit:{...unit,weaponId:sticker.payloadId,weaponPlus:unit.weaponId===sticker.payloadId?(unit.weaponPlus??0)+1:0}};
}
const members=team=>team.characters.filter(Boolean);
// 런 레벨표: 레시피 ID와 족보 종류(collection·triple)별 레벨. 없으면 Lv1.
const levelOf=(levels,key)=>levels?.[key]??1;
const byLevel=(value,perLevel,level)=>value+perLevel*(level-1);
function axisValue(u,axis,c){
 const def=byId(c.characters,u.characterDefId);
 return axis==='race'?def.raceId:axis==='job'?def.jobId:axis==='weapon'?u.weaponId:axis==='element'?u.elementId:null;
}
// 3명 기준 판정: 모두 같으면 triple, 모두 다르면 collection. 3명이 아니거나 값이 빈 캐릭터가 있으면 불성립. 페어는 없다.
function patternOf(us,axis,c){
 if(us.length!==3)return null;
 const vs=us.map(u=>axisValue(u,axis,c));if(vs.some(v=>!v))return null;
 const n=new Set(vs).size;return n===1?{kind:'triple',value:vs[0]}:n===3?{kind:'collection',value:null}:null;
}
// 족보(무기·속성 축). 족보 레벨이 보너스(×Lv)와 배율(1+0.25(Lv−1))을 정한다.
function evaluateCombos(team,c,levels){
 const us=members(team),found=[];
 for(const axis of c.comboAxes){
  const p=patternOf(us,axis,c);if(!p)continue;
  const rule=c.combos.find(r=>r.axis===axis&&r.kind===p.kind),lv=levelOf(levels,rule.levelKind);
  found.push({ruleId:rule.id,axis,kind:rule.kind,levelKind:rule.levelKind,level:lv,matchedValueId:p.value,memberInstanceIds:us.map(u=>u.instanceId),bonus:rule.flatPowerBonus*byLevel(1,c.balance.comboBonusPerLevel,lv),multiplier:byLevel(1,c.balance.comboMultPerLevel,lv),priority:rule.priority,complete:true});
 }
 return found;
}
// 보스 규칙의 효과 종류. blind.ruleId가 없으면 null.
const sealOf=(blind,c)=>blind?.ruleId?byId(c.bossRules,blind.ruleId).seal:null;
// 화면·이벤트용 이름 유지. 족보를 끄는 보스 규칙은 이제 없다.
function activeCombos(team,c,levels){return evaluateCombos(team,c,levels);}
// 무기 기초 점수: 무기 기본값 + 강화 수치 × weaponPlusPower.
function weaponPower(u,c){return u.weaponId?byId(c.weapons,u.weaponId).powerBonus+(u.weaponPlus??0)*c.balance.weaponPlusPower:0;}
function recipeFor(unit,c){return c.weaponRecipes.find(r=>r.weaponId===unit.weaponId&&r.elementId===unit.elementId)??null;}
// T1: 레시피가 있으면 조건 없이 t1Power × 레시피 Lv. 캐릭터당 하나.
function t1Of(unit,c,levels){const r=recipeFor(unit,c);if(!r)return null;const level=levelOf(levels,r.id);return {instanceId:unit.instanceId,recipeId:r.id,name:r.name,level,power:c.balance.t1Power*level};}
// T2(종족)·T3(직업): 원정대 단위. 성립하면 원정대에 한 번 더한다.
function evaluateTiers(team,c){
 const us=members(team),pick=(tier,axis)=>{const p=patternOf(us,axis,c);return p?c.tierCombos.find(t=>t.tier===tier&&t.axis===axis&&t.kind===p.kind)??null:null;};
 return {t2:pick(2,'race'),t3:pick(3,'job')};
}
const jobMatches=(u,c)=>c.jobWeapon[byId(c.characters,u.characterDefId).jobId]===u.weaponId;
function jobWeaponOk(pattern,chars,c){
 const m=chars.map(u=>jobMatches(u,c));
 return pattern==='allMatch'?m.every(Boolean):pattern==='allMismatch'?m.every(x=>!x):pattern==='centerMatch'?(m[1]&&!m[0]&&!m[2]):true;
}
// T4: 원정대 3명 모두 T1이 있고 조건을 만족하는 규칙 전부. 슬롯 순서(가운데 = 1번)를 쓴다.
function activeT4(team,c){
 const chars=team.characters;if(chars.length!==3||chars.some(u=>!u)||chars.some(u=>!recipeFor(u,c)))return [];
 const tiers=evaluateTiers(team,c);
 return c.t4Rules.filter(r=>tiers.t2?.kind===r.race&&tiers.t3?.kind===r.job
  &&(!r.jobWeapon||jobWeaponOk(r.jobWeapon,chars,c))
  &&(!r.elements||new Set(chars.map(u=>u.elementId)).size===3)
  &&(!r.sameRecipe||new Set(chars.map(u=>recipeFor(u,c).id)).size===1));
}
// 지금 편성으로 턴당 붙이기에 더해지는 횟수(진형 등).
function attachBonusOf(team,c){return activeT4(team,c).reduce((n,r)=>n+(r.attachBonus??0),0);}
// 캐릭터마다 블라인드 속성과 비교한다. 유리 ×(1+k·Lv), 불리 ÷(1+k·Lv), 무관 ×1.
// invert: 보스 규칙 상성 반전(유리↔불리). flip: 원소 공명(남은 불리를 유리로). 원정대에는 3명 배율의 산술 평균을 곱한다.
function relationOf(elementId,blindElementId,c){
 if(!elementId||!blindElementId)return 'neutral';
 return c.affinity.beats[elementId]===blindElementId?'advantage':c.affinity.beats[blindElementId]===elementId?'disadvantage':'neutral';
}
function evaluateAffinity(team,blindElementId,c,{invert=false,flip=false}={}){
 const units=[];
 for(const u of members(team)){
  let relation=relationOf(u.elementId,blindElementId,c);
  if(invert&&relation!=='neutral')relation=relation==='advantage'?'disadvantage':'advantage';
  if(flip&&relation==='disadvantage')relation='advantage';
  const f=1+c.balance.affinityPerLevel*u.elementLevel,multiplier=relation==='advantage'?f:relation==='disadvantage'?1/f:1;
  units.push({instanceId:u.instanceId,relation,multiplier});
 }
 const average=units.length?units.reduce((n,x)=>n+x.multiplier,0)/units.length:1;
 return {average,units};
}
// 점수 = floor((캐릭터 덧셈 + 족보 보너스 + T2 + T3) × 상성 평균 × 족보 레벨 배율 × Π T4 배율).
// 캐릭터 덧셈 = 기본 + 무기(강화 포함) + 별 + T1. 봉인은 해당 점수만 0으로 하고 T4 조건 판정에는 영향이 없다.
// opts.burst: 판정 때 굴린 확률 효과(운명의 일족)가 터졌는지. 미리보기는 false.
function scoreTeam(team,blind,progress,c,opts={}){
 const levels=progress?.levels??{},us=members(team),seal=sealOf(blind,c);
 const base=us.reduce((n,u)=>n+byId(c.characters,u.characterDefId).basePower,0);
 const weapons=seal==='weapon'?0:us.reduce((n,u)=>n+weaponPower(u,c),0);
 const stars=seal==='star'?0:us.reduce((n,u)=>n+u.starLevel*c.balance.starPower,0);
 const t1Units=us.map(u=>t1Of(u,c,levels)).filter(Boolean),t1=seal==='t1'?0:t1Units.reduce((n,x)=>n+x.power,0);
 const matches=evaluateCombos(team,c,levels),combos=matches.reduce((n,m)=>n+m.bonus,0);
 const tiers=evaluateTiers(team,c),t2=seal==='t2'?0:tiers.t2?.power??0,t3=seal==='t3'?0:tiers.t3?.power??0;
 const t4Rules=activeT4(team,c);
 const affinity=evaluateAffinity(team,blind?.elementId,c,{invert:seal==='invertAffinity',flip:t4Rules.some(r=>r.flipDisadvantage)});
 const comboMultiplier=matches.reduce((n,m)=>n*m.multiplier,1);
 const t4=t4Rules.map(r=>({id:r.id,name:r.name,multiplier:r.multiplier*(opts.burst&&r.chance?r.chanceMultiplier:1),burst:!!(opts.burst&&r.chance)}));
 const t4Multiplier=t4.reduce((n,x)=>n*x.multiplier,1);
 const chips=base+weapons+stars+t1+combos+t2+t3,multiplier=affinity.average*comboMultiplier*t4Multiplier;
 // 모든 배율을 합성한 뒤에만 소수점 버림. 경계의 부동소수점 오차만 보정한다.
 const floor=v=>Math.floor(v+Number.EPSILON*Math.max(1,Math.abs(v))*8);
 return {base,weapons,stars,t1,t1Units,combos,matches,tiers,t2,t3,t4,t4Multiplier,affinity,comboMultiplier,chips,multiplier,score:floor(chips*multiplier)};
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

return {makeUnit,attachmentReason,attachUnit,levelOf,evaluateCombos,activeCombos,weaponPower,recipeFor,t1Of,evaluateTiers,activeT4,attachBonusOf,relationOf,evaluateAffinity,scoreTeam,sealOf,nextRandom,shuffle,weightedPick,drawCards};})();
