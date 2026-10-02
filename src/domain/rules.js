modules["src/domain/rules.mjs"]=(()=>{
const {byId}=modules["src/content/data.mjs"];

// 캐릭터 1명: 무기 1칸(강화), 속성 1칸(Lv), 별 Lv, charge(축적 지팡이 누적 배율). 상한은 없다.
function makeUnit(id,defId){return {instanceId:id,characterDefId:defId,weaponId:null,weaponPlus:0,elementId:null,elementLevel:0,starLevel:0,charge:0};}
function attachmentReason(unit,sticker,c){
 if(!unit)return 'target';if(!sticker)return 'card';
 if(sticker.kind==='weapon'){const def=byId(c.characters,unit.characterDefId),w=byId(c.weapons,sticker.payloadId);if(!w.compatibleRigIds.includes(c.visuals[def.visualProfileId].rigId))return 'rig';}
 return null;
}
// 별은 Lv+1. 같은 속성은 Lv+1, 다른 속성은 교체하고 Lv1부터. 같은 무기는 강화 +1, 다른 무기는 교체하고 +0부터.
function attachUnit(unit,sticker){
 if(sticker.kind==='star')return {...unit,starLevel:unit.starLevel+1};
 if(sticker.kind==='element')return {...unit,elementId:sticker.payloadId,elementLevel:unit.elementId===sticker.payloadId?unit.elementLevel+1:1};
 return {...unit,weaponId:sticker.payloadId,weaponPlus:unit.weaponId===sticker.payloadId?(unit.weaponPlus??0)+1:0};
}
function recipeFor(unit,c){return unit?c.weaponRecipes.find(r=>r.weaponId===unit.weaponId&&r.elementId===unit.elementId)??null:null;}
const levelOf=(levels,key)=>levels?.[key]??1;
const growthOf=u=>(u.weaponPlus??0)+u.starLevel+u.elementLevel;

// ── 족보 판정 ──
// 같은 스티커 = 같은 스티커 정의(검·활·지팡이·불·물·번개·별).
const ELEMENTS=['sticker_fire','sticker_water','sticker_lightning'],WEAPONS=['sticker_sword','sticker_bow','sticker_staff'];
function classify(ids){
 const counts={};ids.forEach(id=>counts[id]=(counts[id]??0)+1);
 const v=Object.values(counts).sort((a,b)=>b-a),top=v[0]??0,second=v[1]??0,has=list=>list.every(id=>counts[id]);
 const out=[];
 if(top>=5)out.push('five');if(top>=4)out.push('four');if(top>=3&&second>=2)out.push('fullHouse');if(top>=3)out.push('triple');
 if(has(ELEMENTS))out.push('triElement');if(has(WEAPONS))out.push('triWeapon');
 if(top>=2&&second>=2)out.push('twoPair');if(top>=2)out.push('pair');
 out.push('single');return out;
}
function handValue(handId,levels,c,flat=false){const h=byId(c.hands,handId),lv=flat?1:levelOf(levels,handId);return {level:lv,chips:h.chips+h.perChips*(lv-1),mult:h.mult+h.perMult*(lv-1)};}
// defIds: 낸 스티커 정의 ID. opts.elementsSame: 무지개 활(속성 스티커를 모두 같은 스티커로). opts.flat: 족보 하향(레벨 1).
function evaluateHand(defIds,levels,c,{elementsSame=false,flat=false}={}){
 const ids=elementsSame?defIds.map(id=>ELEMENTS.includes(id)?'element':id):defIds;
 const best=classify(ids).map(id=>({id,rank:byId(c.hands,id).rank,...handValue(id,levels,c,flat)})).sort((a,b)=>b.rank-a.rank||b.chips*b.mult-a.chips*a.mult)[0];
 return {handId:best.id,level:best.level,chips:best.chips,mult:best.mult};
}

// ── 상성 ──
function relationOf(elementId,blindElementId,c,invert=false){
 if(!elementId||!blindElementId)return 'neutral';
 let r=c.affinity.beats[elementId]===blindElementId?'advantage':c.affinity.beats[blindElementId]===elementId?'disadvantage':'neutral';
 if(invert&&r!=='neutral')r=r==='advantage'?'disadvantage':'advantage';
 return r;
}

// ── 공격 점수 ──
// ctx: {team:[unit|null], plays:[{card:{uid,defId,mod},targetInstanceId}], levels, blind:{elementId,effect,silencedSlot}, discardsLeft, lastAttack}
// 반환: 족보, 단계(steps: 화면 연출과 내역), 칩·배율·점수, 공격 뒤 원정대(장비·강화·누적이 반영됨).
// 순서: 족보 → 낸 스티커(왼쪽 캐릭터부터, 같은 캐릭터는 낸 순서) → 캐릭터 왼쪽부터(기본 능력, 조합 무기).
function scoreAttack(ctx,c){
 const b=c.balance,effect=ctx.blind?.effect??null,silenced=effect==='silence'?ctx.blind.silencedSlot:null;
 const team=ctx.team.map(u=>u&&{...u});
 const slotOf=id=>team.findIndex(u=>u?.instanceId===id);
 const plays=ctx.plays.map((p,i)=>({...p,i,slot:slotOf(p.targetInstanceId)})).sort((a,b)=>a.slot-b.slot||a.i-b.i);
 // 1) 붙이기: 카드마다 그 순간의 캐릭터 상태를 기억해 둔다(같은 캐릭터에 두 장이면 두 번째는 강화된 상태로 계산).
 const snaps=plays.map(p=>{const s=byId(c.stickers,p.card.defId);team[p.slot]=attachUnit(team[p.slot],s);return {...team[p.slot]};});
 const active=i=>team[i]&&i!==silenced;
 const elementsSame=team.some((u,i)=>active(i)&&recipeFor(u,c)?.ability==='elementsSame');
 const hand=evaluateHand(plays.map(p=>p.card.defId),ctx.levels,c,{elementsSame,flat:effect==='flatHands'});
 let chips=hand.chips,mult=hand.mult;const steps=[];
 const step=(src,extra,label,d)=>{
  if(d.chips)chips+=d.chips;if(d.mult)mult+=d.mult;if(d.xmult)mult*=d.xmult;
  steps.push({src,...extra,label,chips:d.chips??0,mult:d.mult??0,xmult:d.xmult??1,totalChips:chips,totalMult:mult});
 };
 step('hand',{},`${byId(c.hands,hand.handId).name} Lv${hand.level}`,{});
 // 2) 스티커
 const counts={weapon:0,element:0};
 plays.forEach((p,k)=>{
  const s=byId(c.stickers,p.card.defId),u=snaps[k],at={slot:p.slot,uid:p.card.uid};counts[s.kind]=(counts[s.kind]??0)+1;
  if(s.kind==='weapon')step('card',at,'무기',{chips:effect==='weaponSeal'?0:b.weaponChips+b.weaponPlusChips*u.weaponPlus});
  else if(s.kind==='star')step('card',at,'별',{chips:effect==='starSeal'?0:b.starChips*u.starLevel});
  else{
   const rel=relationOf(u.elementId,ctx.blind?.elementId,c,effect==='invertAffinity'),seal=effect==='elementSeal';
   step('card',at,rel==='advantage'&&!seal?'속성 ▲':rel==='disadvantage'&&!seal?'속성 ▼':'속성',{chips:b.elementChips,mult:seal||rel==='disadvantage'?0:u.elementLevel*(rel==='advantage'?b.advantageMult:1)});
  }
  const m=p.card.mod&&byId(c.mods,p.card.mod);
  if(m)step('card',at,m.name,{chips:m.chips,mult:m.mult,xmult:m.xmult});
 });
 // 3) 캐릭터
 const passive=(i,by=i)=>{
  if(!active(i))return;const u=team[i],d=byId(c.characters,u.characterDefId),at={slot:i,by};
  const n=d.trigger==='pairHand'?(c.pairHands.includes(hand.handId)?1:0):d.trigger==='elementCard'?counts.element:d.trigger==='weaponCard'?counts.weapon:growthOf(u);
  if(!n)return;
  if(d.effect==='chips')step('unit',at,'능력',{chips:d.value*n});
  else if(d.effect==='mult')step('unit',at,'능력',{mult:d.value*n});
  else step('unit',at,'능력',{xmult:d.trigger==='growth'?1+d.value*n:d.value**n});
 };
 for(let i=0;i<team.length;i++){
  if(!active(i))continue;
  passive(i);
  const r=recipeFor(team[i],c);if(!r)continue;const at={slot:i,recipe:r.id};
  switch(r.ability){
  case 'retriggerSelf':passive(i);break;
  case 'retriggerRight':if(i+1<team.length)passive(i+1,i);break;
  case 'retriggerLeft':if(i>0)passive(i-1,i);break;
  case 'chipsPerDiscard':if(ctx.discardsLeft)step('unit',at,r.name,{chips:r.value*ctx.discardsLeft});break;
  case 'autoEnhance':team[i]={...team[i],weaponPlus:team[i].weaponPlus+r.value};steps.push({src:'unit',...at,label:`${r.name} 강화 +${r.value}`,chips:0,mult:0,xmult:1,totalChips:chips,totalMult:mult,note:true});break;
  case 'lastAttackXMult':if(ctx.lastAttack)step('unit',at,r.name,{xmult:r.value});break;
  case 'allDifferentXMult':if(new Set(plays.map(p=>p.card.defId)).size===plays.length&&plays.length>1)step('unit',at,r.name,{xmult:r.value});break;
  case 'charge':team[i]={...team[i],charge:(team[i].charge??0)+r.value};step('unit',at,r.name,{mult:team[i].charge});break;
  }
 }
 // 모든 계산 뒤에만 소수점 버림. 경계의 부동소수점 오차만 보정한다.
 const raw=chips*mult,score=Math.floor(raw+Number.EPSILON*Math.max(1,Math.abs(raw))*8);
 return {handId:hand.handId,level:hand.level,steps,chips,mult,score,team,elementsSame};
}

// 시드 기반 RNG: 순수한 상태 입출력. 같은 시드와 명령은 같은 결과를 만든다.
function nextRandom(seed){let x=seed>>>0||1;x^=x<<13;x^=x>>>17;x^=x<<5;return {seed:x>>>0,value:(x>>>0)/4294967296};}
function shuffle(list,seed){const result=[...list];for(let i=result.length-1;i>0;i--){const r=nextRandom(seed);seed=r.seed;const j=Math.floor(r.value*(i+1));[result[i],result[j]]=[result[j],result[i]];}return {list:result,seed};}
function weightedPick(items,seed){const r=nextRandom(seed);let x=r.value*items.reduce((n,i)=>n+i.weight,0);for(const item of items)if((x-=item.weight)<0)return {item,seed:r.seed};return {item:items[items.length-1],seed:r.seed};}
// 블라인드 안에서는 다시 섞지 않는다. 덱이 바닥나면 손패가 줄어든다.
function drawCards(b,handSize){while(b.hand.length<handSize&&b.drawPile.length)b.hand.push(b.drawPile.pop());}

return {makeUnit,attachmentReason,attachUnit,recipeFor,levelOf,growthOf,evaluateHand,handValue,relationOf,scoreAttack,nextRandom,shuffle,weightedPick,drawCards};})();
