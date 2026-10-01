modules["src/presentation/main.mjs"]=(()=>{
const {content,byId,nameOf,validateContent}=modules["src/content/data.mjs"];
const {makeUnit,recipeFor,weaponPower,activeCombos,effectStrength,relationOf,levelOf}=modules["src/domain/rules.mjs"];
const {initialState,projectedScore,applyCommand}=modules["src/application/game.mjs"];
const {renderCharacter}=modules["src/rendering/compositor.mjs"];

validateContent();
const c=content,app=document.getElementById('app');
document.documentElement.style.setProperty('--art-background',`url("${c.assets.asset_background.file}")`);
// 그림은 CSS 클래스로 한 번만 등록한다. 매 렌더마다 대용량 data URI를 복제하지 않기 위함.
(()=>{const ids=[...c.weapons.map(w=>w.assetId),...c.elements.map(e=>e.assetId),'asset_star',...c.weaponRecipes.map(r=>r.assetId),...c.monsters.map(m=>m.assetId),'asset_reward_back'];const st=document.createElement('style');st.textContent=ids.map(id=>`.ic-${id}{background-image:url("${c.assets[id].file}")}`).join('');document.head.append(st);})();

let state=initialState(),selected=null,serial=0,toastTimer,fx=null,resolveRun=null,shuffleRun=null,intro=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const messages={target:'캐릭터가 있는 자리에 붙여주세요.',card:'사용할 수 없는 스티커입니다.',same:'이미 같은 무기가 붙어 있어요.',limit:'이번 턴은 모두 붙였어요.',phase:'지금은 할 수 없어요.',sameCharacter:'같은 캐릭터로는 교체할 수 없어요.',rig:'이 캐릭터에게 맞지 않는 무기입니다.',duplicate:'이미 처리한 행동입니다.'};
const shortReason={same:'같은 무기',rig:'장착 불가',target:'빈 자리',sameCharacter:'같은 캐릭터'};
const axisLabels={race:'종족',job:'직업',weapon:'무기',element:'속성',star:'별'};
const comboLabels={pair:'페어',collection:'컬렉션',straight:'스트레이트',triple:'트리플'};
const levelKindLabels={pair:'페어',collection:'컬렉션',triple:'트리플'};
const gradeLabels={low:'하',mid:'중',high:'상'};
const relationMark={advantage:'▲',disadvantage:'▼',neutral:''};
const number=v=>Number.isInteger(v)?String(v):String(Number(v.toFixed(2)));
const ic=(assetId,cls='')=>`<i class="ic ic-${assetId} ${cls}" aria-hidden="true"></i>`;
const members=team=>team.characters.filter(Boolean);
const elementOf=id=>id?byId(c.elements,id):null;
const monsterOf=id=>byId(c.monsters,id);

function toast(text){const el=document.getElementById('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}
function comboName(m){const v=m.matchedValueId;return `${axisLabels[m.axis]} ${v==null?'':m.axis==='star'?`Lv${v} `:nameOf(v)+' '}${comboLabels[m.kind]}`;}
// after에 새로 생긴 것(같은 규칙·같은 값이 before에 없음)과, before에서 사라지거나 한 단계 내려간 것.
const newMatches=(before,after)=>after.filter(m=>!before.some(x=>x.ruleId===m.ruleId&&x.matchedValueId===m.matchedValueId));
const lostMatches=(before,after)=>before.filter(m=>{const a=after.find(x=>x.axis===m.axis);return !a||a.priority<m.priority;});
function comboChanges(before,after){
 const out=[];
 after.forEach(m=>{if(!before.some(b=>b.ruleId===m.ruleId&&b.matchedValueId===m.matchedValueId))out.push({axis:m.axis,text:`${comboName(m)} +${number(m.bonus)}`,gain:true});});
 before.forEach(m=>{if(!after.some(a=>a.axis===m.axis))out.push({axis:m.axis,text:`${comboName(m)} 해제`,gain:false});});
 return out;
}
// 조합 무기 효과 문장. level을 주면 그 레벨의 수치로 쓴다.
function effectDescription(recipe,level=1){
 const e=byId(c.weaponEffects,recipe.effectId),s=number(effectStrength(e,level));
 const cond=e.condition==='combo'?`${axisLabels[e.axis]} ${comboLabels[e.kinds[0]]}${e.kinds.length>1?' 이상':''}이면 `:e.condition==='completeAxes'?`${e.axes.map(a=>axisLabels[a]).join('·')}의 컬렉션·트리플마다 `:e.condition==='collections'?'컬렉션·스트레이트마다 ':e.condition==='starBalance'?`3명의 별 Lv 차이가 ${e.maxGap} 이하면 `:'';
 const scale=e.scaleBy==='starLevelSum'?'별 Lv 합×':e.scaleBy==='maxStarLevel'?'최고 별 Lv×':'';
 const what=e.operation==='multiply'?`배율 ×${s}`:e.operation==='add'?`기초 +${scale}${s}`:e.operation==='targetPercent'?`최종 점수 + 목표의 ${s}%`:`누적 +${scale}${s}`;
 return `${e.operation==='accumulate'?'턴 종료 시 ':''}${cond}${what}`;
}
function effectKind(recipe){const op=byId(c.weaponEffects,recipe.effectId).operation;return op==='multiply'?'mul':op==='accumulate'?'acc':'add';}
// 점수 계산은 상태가 바뀔 때만 한다. 한 번의 렌더와 드래그 중 미리보기가 같은 결과를 재사용한다.
let memoState=null,memoReading=null;const memoPreview=new Map();
function syncMemo(){if(memoState!==state){memoState=state;memoReading=null;memoPreview.clear();}}
function reading(){syncMemo();return memoReading??=state.phase==='attach'?projectedScore(state.run,state.battle,c):state.battle.lastScore;}
// 미리보기는 실제 명령을 상태 사본에 적용해 본다(dry run). 규칙이 바뀌어도 화면과 엔진이 어긋나지 않는다.
function previewFor(slot,cardId){
 syncMemo();const key=slot+'|'+cardId;if(memoPreview.has(key))return memoPreview.get(key);
 const b=state.battle,card=b.hand.find(x=>x.instanceId===cardId),old=state.run.team.characters[slot];let result;
 if(!card)result={reason:'card'};
 else if(!card.characterDefId&&!old)result={reason:'target'};
 else{
  const cmd=card.characterDefId?{type:'PlaceCharacter',cardInstanceId:cardId,targetSlot:slot}:{type:'AttachSticker',stickerInstanceId:cardId,targetInstanceId:old.instanceId};
  const r=applyCommand(state,{...cmd,commandId:'preview'},c);
  if(r.error)result={reason:r.error};
  else{const team=r.state.run.team;result={reason:null,reading:projectedScore(state.run,b,c,team),unit:team.characters[slot],old,def:card.stickerDefId?byId(c.stickers,card.stickerDefId):null,card,before:activeCombos(state.run.team,c,state.run.levels,b),after:activeCombos(team,c,state.run.levels,b)};}
 }
 memoPreview.set(key,result);return result;
}

// 커맨드 실행 전후 상태를 비교해 연출 정보를 만든다. 도메인 상태는 건드리지 않는다.
function command(type,payload={}){
 const cardSnapshot=['AttachSticker','PlaceCharacter'].includes(type)?snapshotCard(app.querySelector(`[data-card="${selected}"]`)):null;
 const prev=state,r=applyCommand(state,{type,commandId:`ui_${++serial}`,...payload},c);
 if(r.error){toast(messages[r.error]??'다시 시도해주세요.');return false;}
 state=r.state;selected=null;fx=buildFx(type,prev,state,r.events);fx.cardSnapshot=cardSnapshot;
 const won=r.events.find(e=>e.type==='BlindResolved')?.diamonds;if(won)addDiamonds(won);
 // 블라인드 시작: 몬스터 소개 화면을 먼저 보여주고, 누르면 손패 연출과 함께 시작한다.
 intro=fx.blindStart?{fx}:null;if(intro)fx=null;
 render();return true;
}
function buildFx(type,prev,next,events){
 const f={events};
 if(type==='AttachSticker'||type==='PlaceCharacter'){
  const slot=type==='PlaceCharacter'?events.find(e=>e.slot!==undefined).slot:prev.run.team.characters.findIndex(u=>u?.instanceId===events[0].targetInstanceId);
  f.attached=slot;
  const pb=projectedScore(prev.run,prev.battle,c),nb=projectedScore(next.run,next.battle,c);
  f.delta=nb.score-pb.score;f.changes=comboChanges(pb.matches,nb.matches);f.comboDelta=nb.combos-pb.combos;
  // 가운데에 띄울 큰 사건: 새로 생긴 3명짜리(컬렉션·스트레이트·트리플) 또는 조합 무기 완성.
  f.newBig=newMatches(pb.matches,nb.matches).filter(m=>m.complete).sort((a,b)=>b.priority-a.priority)[0]?.kind??null;
  const was=prev.run.team.characters[slot],now=next.run.team.characters[slot],rec=now&&recipeFor(now,c);
  if(rec&&(!was||recipeFor(was,c)?.id!==rec.id))f.recipe=rec.name;
  for(const e of events){
   if(e.type==='CharacterPlaced')f.changes.unshift({text:`${nameOf(e.characterDefId)} 합류!`,gain:true});
   if(e.type==='CharacterReplaced')f.changes.unshift({text:`${nameOf(e.to)} 교체!`,gain:true});
   if(e.type==='StarLeveled')f.changes.unshift({text:`★ Lv${e.level}`,gain:true});
   if(e.type==='ElementLeveled')f.changes.unshift({text:`속성 Lv${e.level}`,gain:true});
   if(e.type==='WeaponEnhanced')f.changes.unshift({text:`강화 +${e.plus}`,gain:true});
   if(e.type==='EquipmentReplaced'&&e.lostPlus)f.changes.unshift({text:`+${e.lostPlus} ${nameOf(e.from)} 사라짐`,gain:false});
   if(e.type==='ElementReplaced')f.changes.unshift({text:`${nameOf(e.from)} Lv${e.lostLevel} 사라짐`,gain:false});
  }
 }
 f.turnStart=events.some(e=>e.type==='TurnStarted');
 f.blindStart=events.some(e=>e.type==='BlindStarted');
 f.accumulated=events.find(e=>e.type==='Accumulated');
 f.resolve=next.phase==='resolve'&&prev.phase==='attach';
 f.shuffle=type==='ShuffleRewards';
 f.picked=type==='PickReward';
 return f;
}

/* ── 공용 조각 ── */
function uiIcon(kind){const shapes={book:'<path d="M3 5q5-2 9 1 4-3 9-1v15q-5-2-9 0-4-2-9 0Z"/><path d="M12 6v14M6 9h3m-3 4h3m6-4h3m-3 4h3"/>',seal:'<path d="m12 2 3 3 4 1 1 4 2 3-3 3-1 4-4 1-3 1-3-3-4-1-1-4-1-3 3-3 1-4Z"/><path d="m7 12 3 3 6-6"/>',cards:'<rect x="5" y="3" width="15" height="18" rx="3"/><path d="M3 6 1 18q0 3 3 3m7-13 4 4-4 4-3-4Z"/>',sword:'<path d="m16 3 5-1-1 5-9 9-4-4Z M5 11l8 8M3 21l6-6"/>'};return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[kind]??shapes.seal}</svg>`;}
function toolsNav(){return `<nav class="tools"><button data-action="recipes">${uiIcon('seal')}조합</button><button data-action="rules">${uiIcon('book')}규칙</button>${state.phase!=='title'?'<button data-action="restart-ask" aria-label="처음부터 다시">↺</button>':''}</nav>`;}
function stageTop(extra=''){
 const i=state.run.blindIndex,cleared=k=>state.history.some(h=>h.blindIndex===k&&h.outcome==='win');
 return `<header class="top"><div class="stage">${c.blinds.map((b,k)=>`<span class="pip ${cleared(k)?'done':k===i?'now':''} ${b.boss?'boss':''}"></span>`).join('')}${extra}</div>${toolsNav()}</header>`;
}
// 메타 재화. 런 밖에 남으므로 브라우저에 저장한다(저장이 막혀 있어도 게임은 동작한다).
const META_KEY='stickerBattle.meta.v1';
const wallet=(()=>{try{return {diamonds:0,...JSON.parse(localStorage.getItem(META_KEY)??'{}')};}catch{return {diamonds:0};}})();
function addDiamonds(n){wallet.diamonds+=n;try{localStorage.setItem(META_KEY,JSON.stringify(wallet));}catch{}}
const gem=(n,cls='')=>`<span class="gem ${cls}"><i aria-hidden="true">◆</i>${n}</span>`;
const diamondsFor=turn=>c.metaRules.clearDiamonds+(c.balance.turnsPerBlind-turn)*c.metaRules.diamondsPerTurnLeft;
const ruleChip=b=>{const r=b.ruleId?byId(c.bossRules,b.ruleId):null;return r?`<div class="rule-chip" title="${r.text}"><b>⛓ ${r.name}</b><span>${r.text}</span></div>`:'';};
function elementChip(id,extra=''){const e=elementOf(id);return e?`<span class="el-chip" style="--el:${e.color}">${ic(e.assetId)}${nameOf(id)}${extra}</span>`:'';}
function stickerCard(id,{instanceId='',i=0,n=1,spent=false}={}){
 const s=byId(c.stickers,id),e=s.kind==='element'?byId(c.elements,s.payloadId):null;
 const rot=n>1?(i-(n-1)/2)*4:0,tint=e?.color??(s.kind==='star'?'#d9a72c':'#7d6aa0');
 const desc=s.kind==='star'?'별 Lv+1':s.kind==='weapon'?`기초 +${byId(c.weapons,s.payloadId).powerBonus}`:'속성 Lv+1';
 return `<button type="button" class="sticker k-${s.kind} ${instanceId&&selected===instanceId?'sel':''} ${spent?'spent':''}" style="--rot:${rot}deg;--tint:${tint}" data-action="select" data-card="${instanceId}" aria-pressed="${selected===instanceId}">${ic(s.iconAssetId,'sicon')}<span class="sname">${nameOf(s.nameKey)}</span><span class="sdesc">${desc}</span></button>`;
}
function handCard(card,i,n,spent){
 if(card.stickerDefId)return stickerCard(card.stickerDefId,{instanceId:card.instanceId,i,n,spent});
 const d=byId(c.characters,card.characterDefId),rot=n>1?(i-(n-1)/2)*4:0;
 return `<button type="button" class="sticker k-char ${selected===card.instanceId?'sel':''} ${spent?'spent':''}" style="--rot:${rot}deg;--tint:#7d6aa0" data-action="select" data-card="${card.instanceId}" aria-pressed="${selected===card.instanceId}"><canvas class="ccanvas" data-def-render="${d.id}"></canvas><span class="sname">${nameOf(d.id)}</span><span class="sdesc">배치·교체</span></button>`;
}

/* ── 전투 화면 ── */
// 몬스터 그림 자리: 가로 세로 같은 상자. 그림 캔버스 1254×1254 전체를 담고, 바닥선(y=1165)이 상자 아래에서 7% 위에 온다.
function blindZone(){
 const b=state.battle,m=monsterOf(b.monsterId),score=reading().score;
 const fill=Math.min(100,score/b.target*100);
 return `<section class="blind-zone ${b.boss?'boss':''}" id="blind-zone"><div class="monster-slot" aria-hidden="true">${ic(m.assetId,'monster-art')}</div>
 <div class="blind-info"><div class="blind-name"><strong>${nameOf(m.nameKey)}</strong>${b.boss?'<em class="boss-tag">보스</em>':''}<button type="button" class="el-btn" data-action="affinity" aria-label="상성 설명 보기">${elementChip(b.elementId)}</button></div>
 <div class="target-row"><small>목표</small><b id="target">${b.target}</b></div>
 <div class="target-gauge" aria-label="예상 점수 ${score} / 목표 ${b.target}"><i id="gauge" style="width:${fill}%"></i><span class="gauge-mark"></span></div>
 ${ruleChip(b)}</div></section>`;
}
function scoreBoard(){
 const r=reading(),b=state.battle,gap=r.score-b.target;
 return `<button type="button" class="duel" id="duel" data-action="breakdown" aria-label="점수 계산 내역 보기">
 <div class="formula"><span class="chips"><small>기초</small><b id="chips">${number(r.chips)}</b></span><span class="op">×</span><span class="mult"><small>배율</small><b id="mult">${number(r.multiplier)}</b></span><span class="op">=</span><span class="score"><small>${state.phase==='attach'?'예상 점수':'최종 점수'}</small><b id="my-score">${r.score}</b></span></div>
 <div class="duel-foot"><span class="foe">${r.targetBonus?`목표 보너스 <b>+${r.targetBonus}</b>`:''}</span><span class="verdict ${gap>=0?'good':'bad'}" id="verdict">${gap>=0?`목표 달성 +${gap}`:`목표까지 ${-gap}`}</span></div>
 <div class="preview-line" id="preview-line"></div></button>`;
}
// final: 원정이 끝난 뒤라 상성을 표시하지 않는다.
function unitBadges(u,b,final=false){
 const e=elementOf(u.elementId),rel=final?'neutral':relationOf(u.elementId,b.elementId,c);
 const star=u.starLevel?`<span class="lv-star" title="별 Lv${u.starLevel}">★${u.starLevel}</span>`:'';
 const plus=u.weaponPlus?`<span class="lv-wpn" title="${nameOf(u.weaponId)} 강화 +${u.weaponPlus}">${ic(byId(c.weapons,u.weaponId).assetId)}+${u.weaponPlus}</span>`:'';
 const el=e?`<span class="lv-el ${rel}" style="--el:${e.color}" title="${nameOf(e.id)} Lv${u.elementLevel}">${ic(e.assetId)}<b>${u.elementLevel}</b>${rel!=='neutral'?`<i class="rel">${relationMark[rel]}</i>`:''}</span>`:'';
 return `<span class="badges-l">${star}${plus}</span><span class="badges-r">${el}</span>`;
}
function recipeChip(u,r){
 const recipe=recipeFor(u,c);if(!recipe)return '';
 const eff=r.effects.find(x=>x.sourceInstanceId===u.instanceId),lv=levelOf(state.run.levels,recipe.id);
 return `<span class="recipe ${eff?.active?'on':''} k-${effectKind(recipe)}">${u.weaponPlus?`+${u.weaponPlus} `:''}${recipe.name} Lv${lv}<i>${eff?.active?'✓':'✗'}</i></span>`;
}
function playerUnit(u,slot,r){
 let cls='',badge='';
 if(selected&&state.phase==='attach'){const pv=previewFor(slot,selected);
  if(pv.reason){cls='no';badge=`<span class="delta no">${shortReason[pv.reason]??'불가'}</span>`;}
  else{const d=pv.reading.score-r.score;cls='ok';badge=`<span class="delta ${d>0?'up':d<0?'down':''}">${d>0?'+':''}${d}</span>`;}}
 if(!u)return `<button type="button" class="punit vacant ${cls} ${fx?.attached===slot?'slap':''}" data-action="attach" data-slot="${slot}" aria-label="빈 자리 ${slot+1}">${badge}<span class="vacant-mark">+</span><span class="uname">빈 자리</span><span class="recipe">캐릭터 카드</span></button>`;
 return `<button type="button" class="punit ${cls} ${fx?.attached===slot?'slap':''}" data-action="attach" data-slot="${slot}" aria-label="${nameOf(u.characterDefId)}${selected?'에게 놓기':' 정보'}">${badge}${unitBadges(u,state.battle)}<canvas data-render="${u.instanceId}"></canvas><span class="uname">${nameOf(u.characterDefId)}</span>${recipeChip(u,r)}</button>`;
}
function playerZone(){
 const r=reading(),acc=state.run.accumulated;
 return `<section class="player-zone"><div class="zone-head"><strong>${uiIcon('sword')} 우리 원정대</strong>${acc?`<span class="acc" id="acc" title="번개 조합 무기가 쌓은 기초 점수">누적 +${number(acc)}</span>`:'<span class="acc" id="acc" hidden></span>'}</div><div class="party">${state.run.team.characters.map((u,slot)=>playerUnit(u,slot,r)).join('')}</div></section>`;
}
// 5칸은 성립하면 불이 켜지고(2명짜리 파랑, 3명짜리 금색), 오른쪽에 보너스 합계만. 자세한 내용은 말풍선.
function comboTray(){
 const r=reading(),burst=new Set((fx?.changes??[]).filter(x=>x.gain&&x.axis).map(x=>x.axis));
 return `<button type="button" class="tray" data-action="combos" aria-label="페어·트리플 보너스 +${number(r.combos)}, 자세히 보기"><span class="lights">${c.comboAxes.map(axis=>{const m=r.matches.find(x=>x.axis===axis);return `<span class="light ${m?(m.complete?'full':'part'):''} ${burst.has(axis)?'lit':''}"><small>${axisLabels[axis]}</small><i></i></span>`;}).join('')}</span><b class="tray-total ${r.combos?'on':''}" id="tray-total">+${number(r.combos)}</b></button>`;
}
// 고른 카드의 이름과 효과 한 줄.
function cardTip(card){
 if(card.characterDefId)return `<b>${nameOf(card.characterDefId)}</b> 빈 자리에 합류. 캐릭터 위에 놓으면 교체(스티커 유지)`;
 const s=byId(c.stickers,card.stickerDefId);
 if(s.kind==='star')return `<b>별</b> 별 Lv+1, 기초 +${c.balance.starPower}`;
 if(s.kind==='weapon')return `<b>${nameOf(s.payloadId)}</b> 기초 +${byId(c.weapons,s.payloadId).powerBonus}. 같은 무기에 붙이면 강화 +1(기초 +${c.balance.weaponPlusPower})`;
 return `<b>${nameOf(s.payloadId)}</b> 같은 속성이면 Lv+1, 다르면 교체하고 Lv1부터`;
}
function hintText(){
 const b=state.battle,sel=b.hand.find(x=>x.instanceId===selected);
 if(sel)return cardTip(sel);
 if(b.actionsUsed>=c.balance.attachLimit)return b.turn<c.balance.turnsPerBlind?'다 붙였어요. 턴을 넘기세요':'다 붙였어요. 전투하세요';
 if(!members(state.run.team).length)return '캐릭터 카드를 빈 자리에 놓으세요';
 return '스티커를 끌어서 캐릭터에 붙이세요';
}
function handDock(){
 const b=state.battle,left=c.balance.attachLimit-b.actionsUsed,last=b.turn>=c.balance.turnsPerBlind;
 return `<footer class="dock"><div class="hand-head"><span class="turn-chip ${last?'last':''}" aria-label="${b.turn}/${c.balance.turnsPerBlind}턴">${last?'마지막 턴':`${b.turn}<small>/${c.balance.turnsPerBlind}턴</small>`}</span><span class="hint ${selected?'card-tip':''}" id="hint">${hintText()}</span><span class="uses" aria-label="남은 붙이기 ${left}회">${Array.from({length:c.balance.attachLimit},(_,i)=>`<i class="${i<left?'on':''}"></i>`).join('')}</span></div>
 <div class="hand">${b.hand.length?b.hand.map((card,i,arr)=>handCard(card,i,arr.length,left<=0)).join(''):'<p class="empty">손패가 없어요</p>'}</div>
 <div class="actions"><button type="button" class="deck-mini" data-action="deck" aria-label="덱 보기"><b>${b.drawPile.length}</b><small>${uiIcon('cards')} 남은 덱</small></button>${last?`<button type="button" class="go fight" data-action="end">전투! ${gem('+'+diamondsFor(b.turn))}</button>`:`<button type="button" class="go" data-action="end">턴 종료</button>${earlyFight(b)}`}</div></footer>`;
}
// 조기 전투: 지금 전투해도 목표를 넘을 때만 누를 수 있다. 남은 턴만큼 다이아몬드를 더 받는다.
function earlyFight(b){
 const ok=projectedScore(state.run,b,c,state.run.team,true).score>=b.target;
 return `<button type="button" class="early" data-action="fight" ${ok?'':'disabled'} aria-label="조기 전투, 다이아몬드 ${diamondsFor(b.turn)}">${ok?'조기 전투':'목표 미달'}${gem('+'+diamondsFor(b.turn))}</button>`;
}
// 점수 연출 단계: 덧셈은 기초 한 번에 채우고, 배율이 들어가는 순간만 하나씩 보여준다(발라트로식).
function stepItems(r){
 const items=[`<li class="add" data-add="${r.chips}">기초<b>+${number(r.chips)}</b></li>`];
 if(r.comboMultiplier!==1)items.push(`<li class="mul" data-mul="${r.comboMultiplier}" data-src="tray">페어·트리플 Lv<b>×${number(r.comboMultiplier)}</b></li>`);
 for(const e of r.effects.filter(x=>x.operation==='multiply'&&x.active&&x.amount!==1))items.push(`<li class="mul" data-mul="${e.amount}" data-unit="${e.sourceInstanceId}">${e.name}<b>×${number(e.amount)}</b></li>`);
 if(r.affinity.total!==1)items.push(`<li class="mul aff-step" data-mul="${r.affinity.total}">상성<b>×${number(r.affinity.total)}</b></li>`);
 if(r.targetBonus)items.push(`<li class="bonus" data-bonus="${r.targetBonus}">목표 보너스<b>+${r.targetBonus}</b></li>`);
 return items.join('');
}
function resolveDock(){
 const b=state.battle,win=b.outcome==='win',last=b.blindIndex===c.blinds.length-1;
 return `<footer class="dock"><ul class="steps" id="steps">${stepItems(b.lastScore)}</ul><p class="skip-hint" id="skip-hint">화면을 누르면 바로 결과를 봐요</p><button type="button" class="go" data-action="finish" id="finish">${win&&!last?'보상 뽑기':'원정 결과'}</button></footer>`;
}
function renderBattle(){
 const b=state.battle;if(state.phase!=='attach')return renderArena();
 return stageTop(`<b>블라인드 ${b.blindIndex+1}</b>`)+
 `<main class="battle">${blindZone()}${scoreBoard()}${playerZone()}${comboTray()}</main>${handDock()}`;
}
// 결과 도장은 승패와 상관없이 화면(전투 영역) 정가운데, 뒤를 어둡게 깔고 찍는다.
const resultStamp=(win,b)=>`<div class="verdict-layer ${win?'win':'lose'}"><div class="stamp ${win?'win':'lose'}" role="status">${win?'격파!':'패배'}${win?`<small>${gem('+'+b.diamonds)}${b.turnsLeft?` <em>조기 전투 +${b.turnsLeft*c.metaRules.diamondsPerTurnLeft}</em>`:''}</small>`:''}</div></div>`;
// 전투 페이지: 원정대가 몬스터를 공격한다. 점수 = 데미지, 목표 = 몬스터 HP.
// live(방금 전투 시작)면 playResolve가 HP를 채운 상태부터 연출하고, 아니면 결과 상태로 바로 그린다.
function renderArena(){
 const b=state.battle,r=b.lastScore,m=monsterOf(b.monsterId),live=!!fx?.resolve,win=b.outcome==='win',hp=Math.max(0,b.target-r.score);
 return stageTop(`<b>블라인드 ${b.blindIndex+1}</b><span class="turn">전투</span>`)+
 `<main class="arena ${live?'enter':win?'won':'lost'}" id="arena">
 <section class="foe-zone ${b.boss?'boss':''} ${!live&&win?'defeated':''}" id="blind-zone"><div class="blind-name"><strong>${nameOf(m.nameKey)}</strong>${b.boss?'<em class="boss-tag">보스</em>':''}${elementChip(b.elementId)}</div>${ruleChip(b)}
 <div class="monster-slot" aria-hidden="true">${ic(m.assetId,'monster-art')}</div>
 <div class="hp" aria-label="몬스터 HP ${hp} / ${b.target}"><i id="hp" style="width:${live?100:hp/b.target*100}%"></i><span id="hp-text">HP ${live?b.target:hp} / ${b.target}</span></div></section>
 ${scoreBoard()}
 <div class="party arena-party">${members(state.run.team).map(u=>`<div class="punit static">${unitBadges(u,b)}<canvas data-render="${u.instanceId}"></canvas><span class="uname">${nameOf(u.characterDefId)}</span></div>`).join('')}</div>
 ${live?'':resultStamp(win,b)}</main>${resolveDock()}`;
}

// 블라인드 소개: 몬스터 이름·목표 점수·속성(유리한 속성)·보스 규칙.
function renderIntro(){
 const b=state.battle,m=monsterOf(b.monsterId),el=elementOf(b.elementId),beater=Object.keys(c.affinity.beats).find(k=>c.affinity.beats[k]===b.elementId);
 return stageTop(`<b>블라인드 ${b.blindIndex+1}</b>`)+`<main class="intro ${b.boss?'boss':''}"><p class="intro-kicker">${b.boss?'보스 등장!':`블라인드 ${b.blindIndex+1} / ${c.blinds.length}`}</p>
 <div class="intro-art monster-slot" aria-hidden="true">${ic(m.assetId,'monster-art')}</div>
 <h2>${nameOf(m.nameKey)}</h2>
 <div class="intro-stats"><div><small>목표 점수</small><b>${b.target}</b></div><div><small>속성</small>${elementChip(el.id)}${beater?`<span class="beat">유리 ${elementChip(beater)}</span>`:''}</div></div>
 ${ruleChip(b)}</main>
 <footer class="dock"><button type="button" class="go ${b.boss?'fight':''}" data-action="intro-ok">도전!</button></footer>`;
}

/* ── 타이틀 ── */
function renderTitle(){
 const t=c.balance;
 return `<header class="top"><div class="logo"><b>스티커 원정대</b><small>붙여서 완성하는 판타지</small></div>${toolsNav()}</header>
 <main class="title"><div class="title-art">${['char_human_warrior','char_elf_archer','char_dwarf_mage'].map(id=>`<canvas data-def-render="${id}"></canvas>`).join('')}</div>
 <p class="lead">스티커를 붙여 원정대를 키우고,<br>블라인드의 목표 점수를 넘기세요.</p>
 <ol class="flow"><li><b>${t.turnsPerBlind}턴</b><span>매 턴 ${t.handSize}장 중 ${t.attachLimit}번 붙여요. 별과 속성은 붙일수록 레벨이 올라요.</span></li><li><b>전투</b><span>마지막 턴 뒤 점수가 목표 이상이면 통과. 일찍 넘기면 조기 전투로 다이아몬드를 더 받아요.</span></li><li><b>보상</b><span>카드 3장을 섞어 1장을 뽑아요. 원정대는 다음 블라인드로 그대로 가요.</span></li></ol>
 <p class="note-dark">블라인드 속성을 이기는 속성은 배율이 오르고, 지는 속성은 내려가요.</p><p class="wallet">보유 ${gem(wallet.diamonds)}</p></main>
 <footer class="dock"><button type="button" class="go" data-action="start">원정 시작</button></footer>`;
}

/* ── 보상: 공개 → 뒤집어 섞기 → 선택 ── */
// 보상 카드 자리: 5:7 비율(뒷면 그림 600×840과 같음). 세 자리는 가로로 나란히, 섞을 때 자리만 바꾼다.
// applied: 이미 적용된 보상이면 적용 전 레벨부터 보여준다.
function rewardFace(o,applied=false){
 const recipe=o.type==='recipe'?byId(c.weaponRecipes,o.key):null,cur=levelOf(state.run.levels,o.key)-(applied?o.levels:0);
 const art=recipe?ic(recipe.assetId,'rart'):`<span class="rkind">${levelKindLabels[o.key]}</span>`;
 const title=recipe?recipe.name:`${levelKindLabels[o.key]} 보너스`;
 return `<span class="rgrade">${gradeLabels[o.grade]}</span>${art}<b class="rtitle">${title}</b><span class="rlv">Lv${cur} → <em>Lv${cur+o.levels}</em></span><span class="rplus">+${o.levels}</span>`;
}
function rewardCards(){
 const rw=state.reward,ph=state.phase;
 // reward_reveal: 제시 순서대로 앞면. 그 뒤: 섞인 자리(order)에 뒷면, 고른 자리만 앞면.
 const at=ph==='reward_reveal'||(ph==='reward_pick'&&fx?.shuffle)?rw.offers.map((_,k)=>k):rw.order;
 return `<div class="shell ${ph}" id="shell">${at.map((offerIndex,slot)=>{
  const o=rw.offers[offerIndex],faceUp=ph==='reward_reveal'||(ph==='reward_pick'&&fx?.shuffle)||(ph==='reward_done'&&rw.picked===slot);
  return `<button type="button" class="rcard g-${o.grade} ${faceUp?'':'down'} ${ph==='reward_done'&&rw.picked===slot?'picked':''}" style="--slot:${slot}" data-action="pick" data-slot="${slot}" data-offer="${offerIndex}" ${ph==='reward_pick'?'':'tabindex="-1"'} aria-label="${ph==='reward_pick'?`${slot+1}번 카드 고르기`:''}"><span class="rinner"><span class="rfront">${rewardFace(o,ph==='reward_done'&&rw.picked===slot)}</span><span class="rback">${ic('asset_reward_back','rback-art')}</span></span></button>`;
 }).join('')}</div>`;
}
function renderReward(){
 const ph=state.phase,rw=state.reward,b=state.battle;
 const lead=ph==='reward_reveal'?'세 장 중 하나를 받아요. 섞은 뒤 원하는 카드를 쫓아가세요!':ph==='reward_pick'?'카드를 골라 뒤집으세요.':'';
 let dock='';
 if(ph==='reward_reveal')dock='<footer class="dock"><button type="button" class="go" data-action="shuffle">섞기</button></footer>';
 else if(ph==='reward_done'){const o=rw.offers[rw.order[rw.picked]];dock=`<footer class="dock"><p class="got">${o.type==='recipe'?byId(c.weaponRecipes,o.key).name:levelKindLabels[o.key]+' 보너스'} Lv${levelOf(state.run.levels,o.key)}!</p><button type="button" class="go" data-action="next-blind">다음 블라인드</button></footer>`;}
 return stageTop(`<b>블라인드 ${b.blindIndex+1} 통과</b>`)+`<main class="reward"><h2>보상 뽑기</h2><p class="lead" id="reward-lead">${lead}</p>${rewardCards()}</main>${dock}`;
}

/* ── 결과 ── */
function renderRunResult(){
 const win=state.run.result==='win',h=state.history;
 return stageTop()+`<main class="result"><h2 class="${win?'':'lose'}">${win?'원정 성공':'원정 실패'}</h2><p class="lead">${win?`${c.blinds.length}개의 블라인드를 모두 넘겼어요.`:`블라인드 ${h.length}에서 목표를 넘지 못했어요.`}</p>
 <table class="table history">${h.map(x=>`<tr class="${x.outcome}"><td>블라인드 ${x.blindIndex+1}${x.outcome==='win'&&x.turn<c.balance.turnsPerBlind?` <small>${x.turn}턴</small>`:''}</td><td>${x.score} / 목표 ${x.target}</td><td>${x.diamonds?gem('+'+x.diamonds):''}</td></tr>`).join('')}</table>
 <p class="wallet">이번 원정 ${gem('+'+(state.run.diamonds??0))} · 보유 ${gem(wallet.diamonds)}</p>
 <div class="party">${members(state.run.team).map(u=>`<div class="punit static">${unitBadges(u,state.battle,true)}<canvas data-render="${u.instanceId}"></canvas><span class="uname">${nameOf(u.characterDefId)}</span></div>`).join('')}</div></main><footer class="dock"><button type="button" class="go" data-action="restart">다시 원정</button></footer>`;
}

/* ── 말풍선: 누르거나(모바일) 올려두면(PC) 그 자리 옆에 현재 적용 상태를 보여준다 ── */
let pop=null;
function closePop(){pop?.el.remove();pop=null;}
// hover: PC에서 올려둬서 연 말풍선. 누르면 고정되고, 포인터가 떠나면 고정 안 된 것만 닫힌다.
function openPop(key,anchor,html,hover=false){
 closePop();if(!anchor)return;
 const el=document.createElement('div');el.className='pop';el.setAttribute('role','tooltip');el.innerHTML=html;app.append(el);
 const a=anchor.getBoundingClientRect(),box=app.getBoundingClientRect(),w=Math.min(290,box.width-20);
 el.style.width=w+'px';const left=Math.max(10,Math.min(box.width-w-10,a.left+a.width/2-w/2-box.left));el.style.left=left+'px';
 let top=a.top-box.top-el.offsetHeight-10;const below=top<8;if(below)top=a.bottom-box.top+10;
 el.style.top=top+'px';el.classList.toggle('below',below);el.style.setProperty('--arrow',Math.max(14,Math.min(w-14,a.left+a.width/2-box.left-left))+'px');
 pop={key,el,hover,anchor};
}
const effValue=e=>e.operation==='multiply'?`×${number(e.amount)}`:e.operation==='targetPercent'?`최종 +목표의 ${number(e.amount)}%`:e.operation==='accumulate'?`턴 종료 시 +${number(e.amount)}`:`+${number(e.amount)}`;
function unitPop(slot){
 const u=state.run.team.characters[slot],r=reading(),b=state.battle,rec=recipeFor(u,c),lv=rec?levelOf(state.run.levels,rec.id):0;
 const eff=rec&&r.effects.find(x=>x.sourceInstanceId===u.instanceId),rel=relationOf(u.elementId,b.elementId,c),aff=r.affinity.units.find(x=>x.instanceId===u.instanceId);
 return `<b class="pop-title">${nameOf(u.characterDefId)}</b>
 ${u.starLevel?`<div class="pop-row">★ 별 Lv${u.starLevel}<em>+${u.starLevel*c.balance.starPower}</em></div>`:''}
 ${u.weaponId?`<div class="pop-row">${u.weaponPlus?`+${u.weaponPlus} `:''}${nameOf(u.weaponId)}<em>+${weaponPower(u,c)}</em></div>`:''}
 ${u.elementId?`<div class="pop-row">${nameOf(u.elementId)} Lv${u.elementLevel}${rel!=='neutral'?`<em class="${rel==='advantage'?'good':'bad'}">${rel==='advantage'?'▲ 유리':'▼ 불리'} ×${number(aff.multiplier)}</em>`:'<em>상성 무관</em>'}</div>`:''}
 ${rec?`<div class="pop-recipe ${eff?.active?'on':'off'}"><b>${rec.name} Lv${lv}</b><em>${eff?.active?effValue(eff):'조건 미충족'}</em><small>${effectDescription(rec,lv)}</small></div>`:''}
 ${!u.weaponId&&!u.elementId&&!u.starLevel?'<div class="pop-row dim">스티커를 붙여 키워 보세요</div>':''}
 <button type="button" class="pop-more" data-action="inspect-more" data-slot="${slot}">자세히</button>`;
}
function combosPop(){
 const r=reading(),ups=c.comboLevelKinds.filter(k=>levelOf(state.run.levels,k)>1);
 return `<b class="pop-title">페어 · 트리플 보너스 <em>+${number(r.combos)}</em></b>
 ${r.matches.length?r.matches.map(m=>`<div class="pop-row">${comboName(m)}<em>+${number(m.bonus)}</em></div>`).join(''):'<div class="pop-row dim">같은 종족·직업·무기·속성이 2명이면 페어, 3명이면 트리플, 모두 다르면 컬렉션이에요.</div>'}
 ${ups.map(k=>`<div class="pop-row lv">${levelKindLabels[k]} Lv${levelOf(state.run.levels,k)}<em>성립마다 ×${number(1+c.balance.comboMultPerLevel*(levelOf(state.run.levels,k)-1))}</em></div>`).join('')}
 <button type="button" class="pop-more" data-action="combos-sheet">자세히</button>`;
}
function elementPop(){
 const b=state.battle,beats=c.affinity.beats,win=Object.keys(beats).find(k=>beats[k]===b.elementId),lose=beats[b.elementId];
 return `<b class="pop-title">${nameOf(b.elementId)} 블라인드</b>
 <div class="pop-row">${nameOf(win)} 속성<em class="good">▲ 유리</em></div><div class="pop-row">${nameOf(lose)} 속성<em class="bad">▼ 불리</em></div>
 <div class="pop-row dim">속성 Lv이 높을수록 차이가 커져요.</div>
 <button type="button" class="pop-more" data-action="affinity-sheet">자세히</button>`;
}
function togglePop(key,anchor,html){if(pop?.key===key){if(pop.hover)pop.hover=false;else closePop();return;}openPop(key,anchor,html());}

/* ── 신규 유저 안내 ── */
// 상황이 처음 생길 때 한 번만 뜨는 팁. 본 팁은 브라우저에 기억한다(저장이 막혀 있어도 동작은 한다).
const TIP_KEY='stickerBattle.tips.v1';
const seenTips=(()=>{try{return new Set(JSON.parse(localStorage.getItem(TIP_KEY)??'[]'));}catch{return new Set();}})();
function saveTips(){try{localStorage.setItem(TIP_KEY,JSON.stringify([...seenTips]));}catch{}}
const attaching=()=>state.phase==='attach'&&!intro;
const tips=[
 {id:'goal',when:()=>attaching()&&state.battle.blindIndex===0&&state.battle.turn===1,text:`카드를 끌어 원정대에 붙여요. ${c.balance.turnsPerBlind}턴이 끝났을 때 점수가 목표를 넘으면 통과!`},
 {id:'combo',when:()=>attaching()&&reading().matches.length>0,text:'같은 종족·직업·무기·속성이 2명이면 페어, 3명이면 트리플! 아래 칸에 불이 켜지고 점수가 붙어요. 칸을 누르면 자세히 볼 수 있어요.'},
 {id:'element',when:()=>attaching()&&members(state.run.team).some(u=>u.elementId),text:'속성이 블라인드 속성을 이기면 ▲ 배율이 오르고, 지면 ▼ 내려가요. 같은 속성을 또 붙이면 Lv이 올라요.'},
 {id:'recipe',when:()=>attaching()&&members(state.run.team).some(u=>recipeFor(u,c)),text:'무기 + 속성 = 조합 무기! 불은 배율, 물은 기초 점수, 번개는 턴마다 쌓여요. ✗ 표시면 조건 미충족이에요. 캐릭터를 누르면 효과를 볼 수 있어요.'},
 {id:'enhance',when:()=>attaching()&&state.battle.hand.some(h=>h.stickerDefId&&members(state.run.team).some(u=>u.weaponId&&byId(c.stickers,h.stickerDefId).payloadId===u.weaponId)),text:'같은 무기를 든 캐릭터에게 무기를 또 붙이면 강화 +1! 무기 기초 점수가 올라요. 다른 무기를 붙이면 강화는 사라져요.'},
 {id:'early',when:()=>attaching()&&state.battle.turn<c.balance.turnsPerBlind&&projectedScore(state.run,state.battle,c,state.run.team,true).score>=state.battle.target,text:`벌써 목표를 넘었어요! 조기 전투로 끝내면 남은 턴마다 다이아몬드를 ${c.metaRules.diamondsPerTurnLeft}개씩 더 받아요. 더 키워도 되지만 남은 턴이 줄어요.`},
 {id:'fight',when:()=>attaching()&&state.battle.turn===c.balance.turnsPerBlind,text:'마지막 턴! 전투를 누르면 점수가 목표를 넘는지 판정해요.'},
 {id:'reward',when:()=>state.phase==='reward_reveal',text:'원하는 카드를 봐 두세요. 섞는 동안 눈으로 쫓아가면 그 카드를 가질 수 있어요!'},
];
let activeTip=null;
// 띄운 팁은 닫거나 상황이 지나갈 때까지 유지하고, 한 번 띄운 팁은 다시 띄우지 않는다.
function pickTip(){
 if(activeTip&&!activeTip.when()){seenTips.add(activeTip.id);saveTips();activeTip=null;}
 if(!activeTip&&!selected)activeTip=tips.find(t=>!seenTips.has(t.id)&&t.when())??null;
 return activeTip;
}
function dismissTip(){if(activeTip){seenTips.add(activeTip.id);saveTips();activeTip=null;}render();}
// 첫 블라인드 1~2턴: 점수가 가장 오르는 카드와 자리를 반짝여, 따라만 해도 첫 족보를 경험하게 한다.
function suggestion(){
 const b=state.battle;if(!attaching()||b.blindIndex!==0||b.turn>2||selected||b.actionsUsed>=c.balance.attachLimit)return null;
 const base=reading().score;let best=null;
 for(const card of b.hand)for(let slot=0;slot<c.balance.teamSize;slot++){const pv=previewFor(slot,card.instanceId);if(pv.reason)continue;const d=pv.reading.score-base;if(!best||d>best.d)best={card:card.instanceId,slot,d};}
 return best&&best.d>0?best:null;
}

/* ── 렌더 ── */
function render(){
 const f=fx,p=state.phase;
 pop=null;movedSinceRender=false;clearTimeout(hoverTimer);
 app.innerHTML=p==='title'?renderTitle():p.startsWith('reward_')?renderReward():p==='run_result'?renderRunResult():intro?renderIntro():renderBattle();
 const tip=pickTip();if(tip)app.insertAdjacentHTML('beforeend',`<div class="tip" role="note"><p>${tip.text}</p><button type="button" data-action="tip-ok">알겠어요</button></div>`);
 const sg=p==='attach'?suggestion():null;if(sg){app.querySelector(`.hand [data-card="${sg.card}"]`)?.classList.add('suggest');app.querySelector(`.punit[data-slot="${sg.slot}"]`)?.classList.add('suggest');}
 for(const canvas of app.querySelectorAll('[data-render]')){
  const id=canvas.dataset.render,slot=state.run.team.characters.findIndex(u=>u?.instanceId===id),unit=state.run.team.characters[slot];
  if(unit){if(f?.attached===slot)canvas.dataset.evolve='yes';renderCharacter(canvas,unit,c);}
 }
 paintDefs(app);
 fx=null;afterRender(f);
}
function paintDefs(root){for(const canvas of root.querySelectorAll('[data-def-render]'))renderCharacter(canvas,makeUnit('def_'+canvas.dataset.defRender,canvas.dataset.defRender),c);}
function floatText(el,text,cls){if(!el)return;const s=document.createElement('span');s.className='floater '+cls;s.textContent=text;el.append(s);setTimeout(()=>s.remove(),1000);}
function burst(text,loss=false){if(reduced)return;const d=document.createElement('div');d.className='burst'+(loss?' loss':'');d.textContent=text;app.append(d);setTimeout(()=>d.remove(),1100);}
function banner(text,sub=''){if(reduced)return;const d=document.createElement('div');d.className='turn-banner';d.innerHTML=`${text}${sub?`<small>${sub}</small>`:''}`;app.append(d);setTimeout(()=>d.remove(),1000);}
function bump(el,big=false){if(!el)return;el.classList.remove('bump','big','slam');void el.offsetWidth;el.classList.add('bump');if(big)el.classList.add('big');}

/* 표현 전용 효과: 게임 상태를 변경하지 않는다. */
function animateFx(el,frames,options){
 if(reduced){el.remove();return;}
 const animation=el.animate(frames,{easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards',...options});
 animation.finished.catch(()=>{}).finally(()=>el.remove());return animation;
}
function centerOf(el){const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}
function particles(el,color='#f5c64b',count=10){
 if(reduced||!el)return;const {x,y}=centerOf(el);
 for(let i=0;i<count;i++){const a=i/count*Math.PI*2,d=32+Math.random()*40,n=document.createElement('i');n.className='fx-particle';n.style.cssText=`left:${x}px;top:${y}px;background:${color}`;document.body.append(n);animateFx(n,[{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:`translate(${Math.cos(a)*d}px,${Math.sin(a)*d+15}px) rotate(${i*57}deg) scale(.2)`,opacity:0}],{duration:550+i*15});}
 const ring=document.createElement('i');ring.className='fx-ring';ring.style.cssText=`left:${x-37}px;top:${y-37}px;border-color:${color}`;document.body.append(ring);animateFx(ring,[{transform:'scale(.25)',opacity:1},{transform:'scale(1.5)',opacity:0}],{duration:450});
}
function flyCard(snapshot,target){
 if(reduced||!snapshot||!target)return;const {rect,node}=snapshot,to=centerOf(target);node.classList.remove('sel');node.classList.add('fx-flight');node.style.cssText+=`;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;max-width:none;min-height:0;`;node.setAttribute('aria-hidden','true');node.removeAttribute('data-action');document.body.append(node);
 animateFx(node,[{transform:'translate(0,0) rotate(-8deg) scale(1)',opacity:1},{transform:`translate(${to.x-rect.left-rect.width/2}px,${to.y-rect.top-rect.height/2}px) rotate(6deg) scale(.25)`,opacity:0}],{duration:360});
}
function snapshotCard(el){if(!el)return null;const node=el.cloneNode(true);el.querySelectorAll('canvas').forEach((cv,i)=>{const copy=node.querySelectorAll('canvas')[i];copy.width=cv.width;copy.height=cv.height;copy.getContext('2d').drawImage(cv,0,0);});return {node,rect:el.getBoundingClientRect()};}
// 별 Lv 구간은 compositor의 장식과 같게 1·3·5. 속성 Lv3부터 입자 효과.
function decorateUnits(){
 state.run?.team.characters.forEach((u,slot)=>{
  if(!u)return;const el=app.querySelector(`canvas[data-render="${u.instanceId}"]`)?.closest('.punit');if(!el)return;
  if(!u.elementId||u.elementLevel<3)return;
  const color=elementOf(u.elementId).color,field=document.createElement('span');
  field.className='element-fx '+u.elementId.replace('element_','')+(u.weaponId?'':' body-fx');field.setAttribute('aria-hidden','true');field.style.setProperty('--element-color',color);field.innerHTML='<i></i><i></i><i></i>';el.append(field);
 });
}
function afterRender(f){
 decorateUnits();
 if(!f)return;
 if(f.attached!==undefined){
  const el=app.querySelector(`.punit[data-slot="${f.attached}"]`);if(f.delta)floatText(el,(f.delta>0?'+':'')+f.delta,f.delta>0?'up':'down');
  // 제자리 반응: 합류·레벨·교체는 캐릭터 위, 페어·트리플 보너스 변화는 합계 위. 가운데는 큰 사건 한 단어만.
  const note=f.changes.find(ch=>!ch.axis);if(note)setTimeout(()=>floatText(el,note.text,(note.gain?'up':'down')+' note'),260);
  if(f.comboDelta)floatText(document.getElementById('tray-total'),(f.comboDelta>0?'+':'')+number(f.comboDelta),f.comboDelta>0?'up':'down');
  const big=f.recipe?`${f.recipe}!`:f.newBig?`${comboLabels[f.newBig]}!`:null;if(big)burst(big);
  flyCard(f.cardSnapshot,el);particles(el);
 }
 if(f.accumulated){const acc=document.getElementById('acc');if(acc){bump(acc,true);floatText(acc,'+'+number(f.accumulated.gain),'up');}}
 if(f.turnStart&&state.phase==='attach'){
  app.querySelector('.hand')?.classList.add('dealing');
  const b=state.battle;
  if(!f.blindStart)banner(b.turn===c.balance.turnsPerBlind?'마지막 턴':`${b.turn}턴`,b.hand.some(x=>x.characterDefId)?'동료 카드 등장':'');
 }
 if(f.resolve)playResolve();
 if(f.shuffle)playShuffle();
 if(f.picked){const el=app.querySelector('.rcard.picked');particles(el,'#f5c64b',state.reward.offers[state.reward.order[state.reward.picked]].grade==='high'?30:14);if(el&&!reduced)el.animate([{transform:'translateY(-18px) rotateY(180deg) scale(1.1)'},{transform:'translateY(-18px) rotateY(0) scale(1.1)'}],{duration:450,easing:'ease-out'});}
}

/* ── 전투 연출: 기초를 쌓고, 배율을 곱하고, 몬스터 체력을 깎는다 ── */
async function playResolve(){
 const b=state.battle,r=b.lastScore,$=id=>document.getElementById(id);
 const pend=new Set(),token={skip:false,flush(){this.skip=true;pend.forEach(fn=>fn());pend.clear();}};resolveRun=token;
 const wait=ms=>token.skip||reduced?Promise.resolve():new Promise(res=>{const fin=()=>{clearTimeout(t);pend.delete(fin);res();},t=setTimeout(fin,ms);pend.add(fin);});
 const count=async(el,from,to,ms,fmt=number)=>{const n=8;for(let i=1;i<=n&&!token.skip;i++){el.textContent=fmt(Math.round(from+(to-from)*i/n));await wait(ms/n);}el.textContent=fmt(to);};
 const chipsEl=$('chips'),multEl=$('mult'),scoreEl=$('my-score'),verdict=$('verdict'),finish=$('finish'),zone=$('blind-zone'),arena=$('arena'),hpEl=$('hp'),hpText=$('hp-text');
 if(!chipsEl||!finish||!arena||!hpEl){resolveRun=null;return;}
 chipsEl.textContent='0';multEl.textContent='1';scoreEl.textContent='?';verdict.textContent='계산 중';verdict.className='verdict';finish.classList.add('waiting');
 const steps=[...app.querySelectorAll('#steps li:not(.off)')];steps.forEach(li=>li.classList.add('pending'));
 let chips=0,mult=1,bonus=0;
 await wait(250);
 for(const li of steps){
  if(token.skip)break;
  li.classList.remove('pending');li.classList.add('hit');
  const origin=li.dataset.unit?app.querySelector(`canvas[data-render="${li.dataset.unit}"]`)?.closest('.punit'):app.querySelector(li.dataset.src==='tray'?'.duel':'.arena-party');if(origin&&!reduced){origin.classList.add('fx-source','charge');setTimeout(()=>origin.classList.remove('fx-source','charge'),450);}
  const add=Number(li.dataset.add||0),mul=Number(li.dataset.mul||1),bn=Number(li.dataset.bonus||0);
  if(add){await count(chipsEl,chips,chips+add,520);chips+=add;bump(chipsEl.parentElement);}
  if(mul!==1){mult*=mul;multEl.textContent=number(mult);bump(multEl.parentElement,true);if(!reduced&&mul>1){app.classList.remove('quake');void app.offsetWidth;app.classList.add('quake');}}
  if(bn)bonus+=bn;
  await wait(260);
 }
 steps.forEach(li=>li.classList.remove('pending'));
 chipsEl.textContent=number(r.chips);multEl.textContent=number(r.multiplier);
 await wait(160);
 await count(scoreEl,0,r.score,520);scoreEl.textContent=r.score;scoreEl.classList.add('slam');if(r.multiplier>=2)$('duel').classList.add('blaze');
 await wait(380);
 // 공격: 원정대가 달려들고, 점수만큼 HP가 깎인다.
 const units=[...app.querySelectorAll('.arena-party .punit')],win=b.outcome==='win',hp=Math.max(0,b.target-r.score);
 if(!token.skip&&!reduced)units.forEach((u,i)=>setTimeout(()=>{u.classList.add('charge');setTimeout(()=>u.classList.remove('charge'),450);},i*90));
 await wait(300);
 if(!token.skip){zone.classList.remove('hit');void zone.offsetWidth;zone.classList.add('hit');floatText(zone,'-'+number(r.score),'down dmg');particles(zone.querySelector('.monster-slot'),'#fff3c4',12);}
 hpEl.style.width=hp/b.target*100+'%';await count(hpText,b.target,hp,600,v=>`HP ${v} / ${b.target}`);hpText.textContent=`HP ${hp} / ${b.target}`;
 await wait(250);
 verdict.textContent=win?`목표 달성 +${r.score-b.target}`:`목표까지 ${b.target-r.score}`;verdict.className='verdict '+(win?'good':'bad');
 if(win){zone.classList.add('defeated');if(!token.skip)particles(zone.querySelector('.monster-slot'),'#f5c64b',26);}
 else{
  // 버틴 몬스터의 반격: 원정대가 쓰러진다.
  if(!token.skip){zone.classList.add('counter');await wait(260);if(!reduced){const f=document.createElement('div');f.className='arena-flash';app.append(f);setTimeout(()=>f.remove(),500);app.classList.remove('quake');void app.offsetWidth;app.classList.add('quake');}}
 }
 arena.insertAdjacentHTML('beforeend',resultStamp(win,b));
 arena.classList.remove('enter');arena.classList.add(win?'won':'lost');
 finish.classList.remove('waiting');$('skip-hint')?.remove();resolveRun=null;
}

/* ── 보상 섞기 연출: 엔진이 정한 교체(swaps) 순서대로 자리만 옮긴다. 고른 자리의 카드가 곧 보상이다. ── */
async function playShuffle(){
 const cards=[...app.querySelectorAll('.rcard')],rw=state.reward,lead=document.getElementById('reward-lead');
 const token={skip:false};shuffleRun=token;
 const place=()=>{
  // 최종 자리 확정: order[p]번 제시 카드가 p번 자리. 연출을 건너뛰어도 같은 결과.
  cards.forEach(el=>{const p=rw.order.indexOf(Number(el.dataset.offer));el.style.setProperty('--slot',p);el.dataset.slot=String(p);el.classList.add('down');});
  shuffleRun=null;app.querySelector('#shell')?.classList.add('ready');if(lead)lead.textContent='카드를 골라 뒤집으세요.';
 };
 if(reduced){place();return;}
 const wait=ms=>new Promise(res=>setTimeout(res,ms));
 await wait(250);cards.forEach(el=>el.classList.add('down'));await wait(500);
 const pos=cards.map((_,k)=>k),dur=Math.max(220,520-rw.swaps.length*45);
 app.querySelector('#shell')?.style.setProperty('--swap-ms',dur+'ms');
 for(const [i,j] of rw.swaps){
  if(token.skip||!cards[0].isConnected)break;
  const a=pos.indexOf(i),b=pos.indexOf(j);pos[a]=j;pos[b]=i;
  cards[a].style.setProperty('--slot',j);cards[b].style.setProperty('--slot',i);
  cards[a].classList.add('lift');cards[b].classList.add('dip');
  await wait(dur);cards[a].classList.remove('lift');cards[b].classList.remove('dip');await wait(60);
 }
 if(cards[0].isConnected)place();
}

/* ── 드래그 미리보기 ── */
function setDuel(r,previewing){
 const $=id=>document.getElementById(id);if(!$('duel'))return;const b=state.battle,gap=r.score-b.target;
 $('chips').textContent=number(r.chips);$('mult').textContent=number(r.multiplier);$('my-score').textContent=r.score;
 const v=$('verdict');v.textContent=gap>=0?`목표 달성 +${gap}`:`목표까지 ${-gap}`;v.className='verdict '+(gap>=0?'good':'bad');
 $('gauge').style.width=Math.min(100,r.score/b.target*100)+'%';
 $('duel').classList.toggle('previewing',previewing);
}
function preview(target){
 app.querySelectorAll('.hover').forEach(el=>el.classList.remove('hover'));
 const line=document.getElementById('preview-line');if(!line||state.phase!=='attach')return;
 if(!target||!selected){setDuel(reading(),false);line.innerHTML='';return;}
 const pv=previewFor(Number(target.dataset.slot),selected);
 if(pv.reason){setDuel(reading(),false);line.innerHTML=`<span class="loss">${messages[pv.reason]}</span>`;return;}
 target.classList.add('hover');setDuel(pv.reading,true);
 // 가장 중요한 변화 한 가지만: 잃는 것 > 조합 무기 완성 > 새 페어·트리플 > 레벨 > 상성.
 const rec=recipeFor(pv.unit,c),oldRec=pv.old?recipeFor(pv.old,c):null,rel=pv.def?.kind==='element'?relationOf(pv.unit.elementId,state.battle.elementId,c):'neutral';
 const gained=newMatches(pv.before,pv.after).sort((a,b)=>b.priority-a.priority)[0],lost=lostMatches(pv.before,pv.after).sort((a,b)=>b.priority-a.priority)[0];
 const relMark=rel==='advantage'?' ▲':rel==='disadvantage'?' ▼':'';
 const word=pv.def?.kind==='element'&&pv.old.elementId&&pv.old.elementId!==pv.def.payloadId?['loss',`${nameOf(pv.old.elementId)} Lv${pv.old.elementLevel} 사라짐`]
  :pv.def?.kind==='weapon'&&pv.old.weaponId&&pv.old.weaponId!==pv.def.payloadId?['loss',pv.old.weaponPlus?`+${pv.old.weaponPlus} ${nameOf(pv.old.weaponId)} 사라짐`:`${nameOf(pv.old.weaponId)} 교체`]
  :lost?['loss',`${comboName(lost)} 해제`]
  :pv.card.characterDefId&&pv.old?['gain',`${nameOf(pv.card.characterDefId)}로 교체, 스티커 유지`]
  :rec&&oldRec?.id!==rec.id?['gain',`${rec.name} 완성`]
  :gained?['gain',`${comboName(gained)} +${number(gained.bonus)}`]
  :pv.def?.kind==='star'?['gain',`★ Lv${pv.unit.starLevel}`]
  :pv.def?.kind==='weapon'&&pv.old.weaponId===pv.def.payloadId?['gain',`${nameOf(pv.def.payloadId)} 강화 +${pv.unit.weaponPlus}`]
  :pv.def?.kind==='element'&&pv.old.elementId===pv.def.payloadId?[rel==='disadvantage'?'loss':'gain',`${nameOf(pv.def.payloadId)} Lv${pv.unit.elementLevel}${relMark}`]
  :rel!=='neutral'?[rel==='advantage'?'gain':'loss',`상성 ${rel==='advantage'?'유리 ▲':'불리 ▼'}`]
  :pv.def?.kind==='element'?['gain',`${nameOf(pv.def.payloadId)} Lv${pv.unit.elementLevel}`]:null;
 line.innerHTML=word?`<span class="${word[0]}">${word[1]}</span>`:'';
}

/* ── 바텀시트 ── */
function openInfo(html){document.getElementById('info-content').innerHTML=html;const d=document.getElementById('info');if(!d.open)d.showModal();}
function cycleText(){const m=c.affinity.beats,start=Object.keys(m)[0];let k=start,s=[nameOf(k)];do{k=m[k];s.push(nameOf(k));}while(k!==start);return s.join(' > ');}
// 캐릭터 카드 확정 턴 설명. 콘텐츠의 guaranteedTurns에서 만든다.
function guaranteedText(){
 const g=c.characterRules.guaranteedTurns,t=ts=>ts.length>1?`${ts[0]}~${ts[ts.length-1]}턴`:`${ts[0]}턴`,rest=g.slice(1).map(t);
 return rest.every(x=>x===rest[0])?`블라인드 1은 ${t(g[0])}, 이후 블라인드는 ${rest[0]}에`:g.map((ts,i)=>`블라인드 ${i+1}은 ${t(ts)}`).join(', ')+'에';
}
document.getElementById('info-content').addEventListener('click',e=>{
 if(e.target.closest('[data-help="tips"]')){seenTips.clear();saveTips();activeTip=null;document.getElementById('info').close();render();}
});
function showRules(){const t=c.balance;openInfo(`<h2>원정 규칙</h2><ol>
<li>원정은 블라인드 ${c.blinds.length}개. 블라인드마다 ${t.turnsPerBlind}턴을 진행하고, 마지막 턴이 끝나면 점수가 목표 이상인지 판정해요. 못 넘기면 원정이 끝나요.</li>
<li><b>조기 전투</b>: 점수가 이미 목표를 넘었으면 아무 턴에나 전투할 수 있어요. 이기면 다이아몬드 ${c.metaRules.clearDiamonds}개, 남은 턴마다 ${c.metaRules.diamondsPerTurnLeft}개를 더 받아요.</li>
<li><b>보스</b>: 마지막 블라인드의 보스는 규칙 하나(${c.bossRules.map(r=>r.name).join('·')} 중)를 걸어요. 보스가 등장할 때 공개돼요.</li>
<li>매 턴 손패 ${t.handSize}장을 받고 최대 ${t.attachLimit}번 붙여요. 남은 카드는 턴 종료 때 버려져요.</li>
<li>${guaranteedText()} 캐릭터 카드가 꼭 나오고, 다른 턴에도 가끔 나와요. 빈 자리에 놓거나 교체할 수 있고, 교체해도 스티커와 레벨은 옮겨져요.</li>
<li><b>별</b>: 붙일 때마다 Lv+1. 캐릭터 기초 점수가 Lv당 +${t.starPower}.</li>
<li><b>속성</b>: 같은 속성을 붙이면 Lv+1, 다른 속성을 붙이면 교체되고 Lv1부터 다시 시작해요.</li>
<li><b>무기</b>: 기초 +${t.weaponPower}. 같은 무기를 또 붙이면 강화 +1(기초 +${t.weaponPlusPower}씩), 다른 무기를 붙이면 교체되고 강화는 +0부터. 무기와 속성이 함께 있으면 조합 무기가 돼요.</li>
<li><b>상성</b>: ${cycleText()}. 블라인드 속성을 이기면 ×(1+${t.affinityPerLevel}×속성Lv), 지면 그만큼 나눠요.</li>
<li>점수는 <b>기초 × 배율</b>. 기초는 캐릭터·무기·별·페어/트리플 보너스·물 조합 효과·누적의 합, 배율은 페어/트리플 레벨·불 조합 효과·상성을 곱한 값이에요.</li>
<li>원정대는 블라인드가 바뀌어도 그대로예요. 블라인드를 넘기면 보상 카드 3장을 섞어 1장을 뽑아요.</li></ol><p class="note">현재 수치는 재미와 균형 확인용 임시값입니다.</p><button type="button" class="ghost help-tips" data-help="tips">처음 안내 다시 보기</button>`);}
function showAffinity(){openInfo(`<h2>상성</h2><p>${cycleText()}. 캐릭터마다 블라인드 속성과 비교해요.</p><table class="table"><tr><td>유리 ▲</td><td>×(1 + ${c.balance.affinityPerLevel} × 속성 Lv)</td></tr><tr><td>불리 ▼</td><td>÷(1 + ${c.balance.affinityPerLevel} × 속성 Lv)</td></tr><tr><td>무관</td><td>×1</td></tr></table><p class="note">다음 블라인드 속성은 미리 알려줘요. 그때 불리해질 캐릭터에는 ! 표시가 붙어요.</p>`);}
function showCombos(){
 const lv=k=>levelOf(state.run?.levels,k),row=(kind,desc,axisBonus,starBonus)=>`<tr><td>${comboLabels[kind]}</td><td>${desc}</td><td>+${axisBonus} · 별 +${starBonus}×Lv</td></tr>`;
 const bonus=(axis,kind)=>c.combos.find(r=>r.axis===axis&&r.kind===kind).flatPowerBonus;
 openInfo(`<h2>페어 · 트리플 · 컬렉션</h2><p>종족·직업·무기·속성·별 5개 항목을 3명 기준으로 비교해요. 항목마다 가장 높은 것 하나만 적용되고, 성립한 칸은 불이 켜져요. 별은 레벨로 비교해요.</p><table class="table">${row('pair','같은 값 2명',bonus('race','pair'),bonus('star','pair'))}${row('collection','3명 모두 다름 (별은 연속 Lv = 스트레이트)',bonus('race','collection'),bonus('star','straight'))}${row('triple','3명 모두 같음',bonus('race','triple'),bonus('star','triple'))}</table>
 <h3 class="sheet-h">레벨</h3><p>보상으로 페어·컬렉션·트리플 레벨을 올려요. Lv이 오르면 보너스가 ×Lv, 그 종류가 성립할 때마다 배율 ×(1+${c.balance.comboMultPerLevel}×(Lv−1)).</p><table class="table">${c.comboLevelKinds.map(k=>`<tr><td>${levelKindLabels[k]}</td><td>Lv${lv(k)}</td></tr>`).join('')}</table><p class="note">빈 칸과 별 Lv0은 판정에서 빠져요.</p>`);
}
function showRecipes(){openInfo(`<h2>조합 무기</h2><p>무기와 속성을 같은 캐릭터에 붙이면 조합 무기가 돼요. 불은 배율, 물은 기초 점수, 번개는 턴마다 누적. 레벨은 보상으로 올려요.</p><div class="recipe-list">${c.weaponRecipes.map(r=>{const lv=levelOf(state.run?.levels,r.id);return `<article>${ic(r.assetId,'recipe-art')}<b>${r.name} <small>Lv${lv}</small></b><small>${nameOf(r.weaponId)} + ${nameOf(r.elementId)}</small><p>${effectDescription(r,lv)}</p></article>`;}).join('')}</div>`);}
function inspect(slot){
 const u=state.run.team.characters[slot];if(!u)return;
 const d=byId(c.characters,u.characterDefId),rec=recipeFor(u,c),b=state.battle,rel=relationOf(u.elementId,b.elementId,c);
 openInfo(`<h2>${nameOf(d.id)}</h2><table class="table"><tr><td>기본</td><td>${d.basePower}</td></tr><tr><td>무기</td><td>${u.weaponId?`${u.weaponPlus?`+${u.weaponPlus} `:''}${nameOf(u.weaponId)} +${weaponPower(u,c)}`:'없음'}</td></tr><tr><td>별</td><td>Lv${u.starLevel} +${u.starLevel*c.balance.starPower}</td></tr><tr><td>속성</td><td>${u.elementId?`${nameOf(u.elementId)} Lv${u.elementLevel}${rel!=='neutral'?` · 이번 블라인드 ${rel==='advantage'?'유리':'불리'}`:''}`:'없음'}</td></tr></table>${rec?`<div class="recipe-card"><b>${rec.name} Lv${levelOf(state.run.levels,rec.id)}</b><p>${effectDescription(rec,levelOf(state.run.levels,rec.id))}</p></div>`:'<p class="note">무기와 속성을 함께 붙이면 조합 무기가 돼요.</p>'}`);
}
function showBreakdown(){
 const r=reading(),b=state.battle;
 openInfo(`<h2>점수 계산</h2><p class="sub">${state.phase==='attach'?'지금 전투하면 이렇게 계산돼요.':'이번 블라인드의 확정 점수예요.'}</p><table class="table">
 <tr><td>캐릭터·무기·별</td><td>${r.base+r.weapons+r.stars}</td></tr><tr><td>페어·트리플 보너스</td><td>+${number(r.combos)}</td></tr><tr><td>물 조합 효과</td><td>+${number(r.flat)}</td></tr><tr><td>누적</td><td>+${number(r.accumulated)}</td></tr><tr><td><b>기초</b></td><td><b>${number(r.chips)}</b></td></tr>
 <tr><td>페어·트리플 레벨 배율</td><td>×${number(r.comboMultiplier)}</td></tr><tr><td>불 조합 효과 배율</td><td>×${number(r.effectMultiplier)}</td></tr><tr><td>상성 배율</td><td>×${number(r.affinity.total)}</td></tr><tr><td><b>배율</b></td><td><b>×${number(r.multiplier)}</b></td></tr>
 <tr><td>목표 보너스</td><td>+${r.targetBonus}</td></tr><tr><td><b>점수</b> / 목표</td><td><b>${r.score}</b> / ${b.target}</td></tr></table>
 ${r.effects.length?`<p class="note">${r.effects.map(e=>`${e.name} Lv${e.level}: ${e.active?(e.operation==='multiply'?'×':e.operation==='accumulate'?'턴 종료 시 +':'+')+number(e.amount)+(e.operation==='targetPercent'?'%':''):'조건 미충족'}`).join('<br>')}</p>`:''}`);
}
function showDeck(){const groups=new Map();state.run.deckDefIds.forEach(id=>groups.set(id,(groups.get(id)??0)+1));openInfo(`<h2>덱 ${state.run.deckDefIds.length}장</h2><p class="sub">원정 내내 같은 덱이에요. 남은 덱 ${state.battle.drawPile.length}장.</p><table class="table">${[...groups].map(([id,n])=>`<tr><td>${nameOf(byId(c.stickers,id).nameKey)}</td><td>${n}장</td></tr>`).join('')}</table>`);}

/* ── 입력 ── */
let pointer=null,ghost=null,suppressClick=false;
function attach(slot){const card=state.battle.hand.find(x=>x.instanceId===selected);if(!card)return;const target=state.run.team.characters[slot];const ok=card.characterDefId?command('PlaceCharacter',{cardInstanceId:selected,targetSlot:slot}):target?command('AttachSticker',{stickerInstanceId:selected,targetInstanceId:target.instanceId}):(toast(messages.target),false);if(!ok){selected=null;render();}}
app.addEventListener('click',e=>{
 if(suppressClick){e.preventDefault();return;}
 if(resolveRun){resolveRun.flush();e.preventDefault();return;}
 const el=e.target.closest('[data-action]');
 if(pop&&!e.target.closest('.pop')&&!['attach','combos','affinity'].includes(el?.dataset.action))closePop();
 if(!el||el.disabled)return;
 switch(el.dataset.action){
 case 'tip-ok':dismissTip();break;
 case 'inspect-more':closePop();inspect(Number(el.dataset.slot));break;
 case 'combos-sheet':closePop();showCombos();break;
 case 'affinity-sheet':closePop();showAffinity();break;
 case 'rules':showRules();break;
 case 'recipes':showRecipes();break;
 case 'combos':if(state.phase==='attach'||state.phase==='resolve')togglePop('combos',el,combosPop);else showCombos();break;
 case 'affinity':if(state.battle)togglePop('element',el,elementPop);else showAffinity();break;
 case 'breakdown':if(!selected)showBreakdown();break;
 case 'start':command('StartRun',{seed:crypto.getRandomValues(new Uint32Array(1))[0]});break;
 case 'select':if(state.battle.actionsUsed>=c.balance.attachLimit){toast(messages.limit);return;}selected=selected===el.dataset.card?null:el.dataset.card;render();break;
 case 'attach':{if(state.phase!=='attach')break;const slot=Number(el.dataset.slot),u=state.run.team.characters[slot];if(selected){closePop();attach(slot);}else if(u)togglePop('unit'+slot,el,()=>unitPop(slot));else toast('캐릭터 카드를 놓을 자리예요.');break;}
 case 'end':command('EndTurn');break;
 case 'fight':command('EndTurn',{fight:true});break;
 case 'intro-ok':if(intro){fx=intro.fx;intro=null;render();}break;
 case 'finish':command('FinishResolution');break;
 case 'shuffle':command('ShuffleRewards');break;
 case 'pick':if(state.phase==='reward_pick'&&!shuffleRun)command('PickReward',{position:Number(el.dataset.slot)});break;
 case 'next-blind':command('StartNextBlind');break;
 case 'restart':command('RestartRun');break;
 case 'restart-ask':openInfo('<h2>처음부터 다시 할까요?</h2><p>지금까지의 원정이 모두 초기화돼요.</p><button type="button" class="go" id="confirm-restart" style="width:100%;margin-top:16px">처음부터 다시</button>');document.getElementById('confirm-restart').onclick=()=>{document.getElementById('info').close();command('RestartRun');};break;
 case 'deck':showDeck();break;
 }
});
app.addEventListener('pointerdown',e=>{const el=e.target.closest('[data-action="select"]');if(!el||e.button!==0||state.phase!=='attach'||state.battle.actionsUsed>=c.balance.attachLimit)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,card:el.dataset.card,html:el.outerHTML,dragging:false};});
document.addEventListener('pointermove',e=>{
 if(!pointer||pointer.id!==e.pointerId)return;
 if(!pointer.dragging&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>7){pointer.dragging=true;app.setPointerCapture(e.pointerId);selected=pointer.card;render();ghost=document.createElement('div');ghost.className='dragghost';ghost.innerHTML=pointer.html;document.body.append(ghost);paintDefs(ghost);}
 if(!pointer.dragging)return;e.preventDefault();ghost.style.left=`${e.clientX}px`;ghost.style.top=`${e.clientY}px`;preview(document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-action="attach"]'));
},{passive:false});
function cancelDrag(){if(pointer&&app.hasPointerCapture(pointer.id))app.releasePointerCapture(pointer.id);pointer=null;ghost?.remove();ghost=null;app.querySelectorAll('.punit.hover').forEach(x=>x.classList.remove('hover'));}
document.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const was=pointer.dragging;cancelDrag();if(was){suppressClick=true;setTimeout(()=>suppressClick=false,0);const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-action="attach"]');if(target)attach(Number(target.dataset.slot));else{selected=null;render();}}});
document.addEventListener('pointercancel',()=>{if(!pointer)return;cancelDrag();selected=null;render();});
// PC 올려두기 말풍선: 화면이 다시 그려진 뒤 마우스가 실제로 움직였고, 잠깐 머물렀을 때만 연다.
// (붙이고 나서 마우스가 가만히 있는데 말풍선이 뜨면 점수판을 가린다.)
let hoverTimer=null,movedSinceRender=false;
document.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')movedSinceRender=true;},{passive:true});
app.addEventListener('pointerover',e=>{
 if(e.pointerType!=='mouse'||selected||state.phase!=='attach'||!movedSinceRender||(pop&&!pop.hover))return;
 const t=e.target.closest('.punit[data-slot],.tray');if(!t||t.contains(e.relatedTarget))return;
 clearTimeout(hoverTimer);
 hoverTimer=setTimeout(()=>{if(!t.isConnected||selected||(pop&&!pop.hover))return;const slot=t.dataset.slot,u=slot!==undefined&&state.run.team.characters[Number(slot)];if(t.classList.contains('tray'))openPop('combos',t,combosPop(),true);else if(u)openPop('unit'+slot,t,unitPop(Number(slot)),true);},350);
});
app.addEventListener('pointerout',e=>{
 if(e.pointerType!=='mouse')return;
 const t=e.target.closest('.punit[data-slot],.tray,.pop');if(!t||t.contains(e.relatedTarget))return;
 clearTimeout(hoverTimer);
 // 앵커와 말풍선 사이를 오가는 건 유지, 둘 다 벗어나면 닫는다(올려두기로 연 것만).
 const to=e.relatedTarget;if(pop?.hover&&!to?.closest?.('.pop')&&!(pop.anchor&&pop.anchor.contains(to)))closePop();
});
app.addEventListener('pointerover',e=>{if(selected&&!pointer?.dragging&&state.phase==='attach')preview(e.target.closest('[data-action="attach"]'));});
app.addEventListener('focusin',e=>{if(selected&&state.phase==='attach')preview(e.target.closest('[data-action="attach"]'));});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pop){closePop();return;}if(e.key==='Escape'&&selected){cancelDrag();selected=null;render();}});
app.addEventListener('scroll',()=>closePop(),true);
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('paused',document.hidden);if(document.hidden)cancelDrag();});
render();

return {};})();
