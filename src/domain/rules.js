modules["src/domain/rules.mjs"]=(()=>{
const {byId}=modules["src/content/data.mjs"];

// ── 캐릭터 ──
// 캐릭터 1명: 레벨(별), 무기 1칸(강화), 속성 1칸, 체력. skillCd는 지금 스킬의 남은 쿨타임(스킬이 바뀌면 0).
const defOf=(unit,c)=>byId(c.characters,unit.characterDefId);
const levelMult=(level,c)=>c.balance.levelGrowth**(level-1);
const maxHpOf=(unit,c)=>Math.round(defOf(unit,c).hp*levelMult(unit.level,c));
function makeUnit(id,defId,c){const u={instanceId:id,characterDefId:defId,level:1,weaponId:null,weaponPlus:0,elementId:null,skillCd:0,hp:0};u.hp=maxHpOf(u,c);return u;}
function skillOf(unit,c){return unit&&unit.weaponId&&unit.elementId?c.skills.find(s=>s.weaponId===unit.weaponId&&s.elementId===unit.elementId)??null:null;}
function attachmentReason(unit,sticker,c){
 if(!unit)return 'target';if(!sticker)return 'card';
 if(sticker.kind==='star'&&unit.level>=c.balance.maxLevel)return 'maxLevel';
 if(sticker.kind==='element'&&unit.elementId===sticker.payloadId)return 'same';
 if(sticker.kind==='weapon'){const def=defOf(unit,c),w=byId(c.weapons,sticker.payloadId);if(!w.compatibleRigIds.includes(c.visuals[def.visualProfileId].rigId))return 'rig';}
 return null;
}
// 별은 Lv+1(체력은 늘어난 만큼 함께 회복). 속성은 교체. 같은 무기는 강화 +1, 다른 무기는 교체하고 +0부터. 스킬이 바뀌면 쿨타임이 0이 된다.
function attachUnit(unit,sticker,c){
 const before=skillOf(unit,c);let u={...unit};
 if(sticker.kind==='star'){const old=maxHpOf(u,c);u.level++;u.hp+=maxHpOf(u,c)-old;}
 else if(sticker.kind==='element')u.elementId=sticker.payloadId;
 else if(u.weaponId===sticker.payloadId)u.weaponPlus=(u.weaponPlus??0)+1;
 else{u.weaponId=sticker.payloadId;u.weaponPlus=0;}
 if(skillOf(u,c)?.id!==before?.id)u.skillCd=0;
 return u;
}

// ── 스탯 ──
// 적성 계수: 직업에 어울리는 무기가 아니면 mismatchFit. 무지개 활이면 1, 원정대에 축적 지팡이가 있으면 그 값(0.75).
function fitOf(unit,team,c){
 if(!unit.weaponId)return 1;
 if(byId(c.jobs,defOf(unit,c).jobId).weaponId===unit.weaponId)return 1;
 if(skillOf(unit,c)?.effect.type==='fitOwn')return 1;
 const aura=team.map(u=>u&&u.hp>0&&skillOf(u,c)).find(s=>s&&s.effect.type==='fitAura');
 return aura?aura.effect.value:c.balance.mismatchFit;
}
// 상성 배율: attEl이 defEl을 이기면 ×advantage, 지면 ÷advantage. 공격하는 쪽이 누구든 같은 식이다.
function relationMult(attEl,defEl,c){
 if(!attEl||!defEl)return 1;
 return c.affinity.beats[attEl]===defEl?c.balance.advantage:c.affinity.beats[defEl]===attEl?1/c.balance.advantage:1;
}
// 공격 보너스(합): 폭발궁(몬스터 체력이 낮을 때), 연마검(라운드 쌓임), 화염 지팡이(원정대 전체). 각 수치에 그 캐릭터의 적성 계수가 곱해진다.
function atkBonus(unit,team,monster,round,c){
 let bonus=0;const sk=skillOf(unit,c);
 if(sk?.effect.type==='atkIfMonsterLow'&&monster.hp<=monster.maxHp*sk.effect.threshold)bonus+=sk.effect.bonus*fitOf(unit,team,c);
 if(sk?.effect.type==='atkStack')bonus+=Math.min(sk.effect.max,sk.effect.perRound*(round-1))*fitOf(unit,team,c);
 for(const h of team){const hs=h&&h.hp>0&&skillOf(h,c);if(hs&&hs.effect.type==='auraAtk')bonus+=hs.effect.bonus*fitOf(h,team,c);}
 return bonus;
}
// 이 캐릭터의 지금 공격: 기본 공격 × 레벨 × 무기·강화 × 적성 × (1 + 보너스).
function attackOf(unit,team,monster,round,c){
 const b=c.balance,weapon=unit.weaponId?b.weaponMult*b.weaponPlusMult**(unit.weaponPlus??0):1;
 return defOf(unit,c).atk*levelMult(unit.level,c)*weapon*fitOf(unit,team,c)*(1+atkBonus(unit,team,monster,round,c));
}
const reduceOf=(unit,team,c)=>{const sk=skillOf(unit,c);return sk?.effect.type==='damageReduce'?sk.effect.ratio*fitOf(unit,team,c):0;};

// ── 한 라운드 ──
// 공격 순서 1→2→3번, 몬스터는 살아 있는 동료 중 맨 뒤(3번 쪽)부터 때린다. 순수 함수라 예상 표시와 실제 판정이 같다.
// team: [unit|null]×3. monster: {hp,maxHp,atk,elementId}. round: 이번 전투의 몇 번째 라운드인지(1부터).
// 반환: events, 갱신된 team·monster. 쓰러진 동료는 team에서 null이 된다(붙은 스티커도 사라진다).
function resolveRound(teamIn,monsterIn,round,c){
 const team=teamIn.map(u=>u&&{...u}),monster={...monsterIn},events=[];
 const hit=(dmg)=>{const d=Math.max(1,Math.round(dmg));monster.hp=Math.max(0,monster.hp-d);return d;};
 for(let slot=0;slot<team.length&&monster.hp>0;slot++){
  const u=team[slot];if(!u||u.hp<=0)continue;
  const sk=skillOf(u,c),atk=attackOf(u,team,monster,round,c),rel=relationMult(u.elementId,monster.elementId,c),s=fitOf(u,team,c);
  let used=false;
  if(sk?.kind==='active'){
   if(u.skillCd>0)u.skillCd--;
   else if(sk.effect.type==='heal'){
    const hurt=team.map((t,i)=>t&&t.hp>0&&t.hp<maxHpOf(t,c)?{i,r:t.hp/maxHpOf(t,c)}:null).filter(Boolean).sort((a,b)=>a.r-b.r||a.i-b.i)[0];
    if(hurt){const t=team[hurt.i],amount=Math.min(maxHpOf(t,c)-t.hp,Math.max(1,Math.round(maxHpOf(t,c)*sk.effect.ratio*s)));t.hp+=amount;u.skillCd=sk.cooldown;used=true;events.push({type:'heal',slot,target:hurt.i,amount,hp:t.hp,skillId:sk.id});}
    }
   else if(sk.effect.type==='damage'){
    const hits=Array.from({length:sk.effect.hits},()=>hit(atk*sk.effect.mult*rel));u.skillCd=sk.cooldown;used=true;
    events.push({type:'attack',slot,skillId:sk.id,hits,total:hits.reduce((a,b)=>a+b,0),monsterHp:monster.hp});
   }
  }
  if(!used){const d=hit(atk*rel);events.push({type:'attack',slot,skillId:null,hits:[d],total:d,monsterHp:monster.hp});}
 }
 if(monster.hp<=0){events.push({type:'monsterDown'});return {team,monster,events,won:true,lost:false};}
 for(let slot=team.length-1;slot>=0;slot--){
  const u=team[slot];if(!u||u.hp<=0)continue;
  const dmg=Math.max(1,Math.round(monster.atk*relationMult(monster.elementId,u.elementId,c)*(1-reduceOf(u,team,c))));
  u.hp-=dmg;const killed=u.hp<=0;
  events.push({type:'counter',slot,dmg,hp:Math.max(0,u.hp),killed,characterDefId:u.characterDefId});
  if(killed)team[slot]=null;
  break;
 }
 const lost=team.every(u=>!u||u.hp<=0);
 if(lost)events.push({type:'partyDown'});
 return {team,monster,events,won:false,lost};
}

// 시드 기반 RNG: 순수한 상태 입출력. 같은 시드와 명령은 같은 결과를 만든다.
function nextRandom(seed){let x=seed>>>0||1;x^=x<<13;x^=x>>>17;x^=x<<5;return {seed:x>>>0,value:(x>>>0)/4294967296};}
function shuffle(list,seed){const result=[...list];for(let i=result.length-1;i>0;i--){const r=nextRandom(seed);seed=r.seed;const j=Math.floor(r.value*(i+1));[result[i],result[j]]=[result[j],result[i]];}return {list:result,seed};}
// 손패를 handSize까지 채운다. 뽑을 더미가 비면 버린 더미를 섞어 다시 쓴다.
function drawCards(b,handSize){
 while(b.hand.length<handSize){
  if(!b.drawPile.length&&b.discardPile.length){const r=shuffle(b.discardPile,b.rngState);b.drawPile=r.list;b.rngState=r.seed;b.discardPile=[];}
  if(!b.drawPile.length)break;b.hand.push(b.drawPile.pop());
 }
}

return {defOf,levelMult,maxHpOf,makeUnit,skillOf,attachmentReason,attachUnit,fitOf,relationMult,atkBonus,attackOf,reduceOf,resolveRound,nextRandom,shuffle,drawCards};})();
