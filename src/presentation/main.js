modules["src/presentation/main.mjs"]=(()=>{
const {content,byId,nameOf,validateContent}=modules["src/content/data.mjs"];
const {makeUnit,attachUnit,recipeFor,evaluateCombos,scoreTeam,relationOf,levelOf}=modules["src/domain/rules.mjs"];
const {initialState,applyCommand,validateAttachment,validatePlacement,placeUnit}=modules["src/application/game.mjs"];
const {renderCharacter}=modules["src/rendering/compositor.mjs"];

validateContent();
const c=content,app=document.getElementById('app');
document.documentElement.style.setProperty('--art-background',`url("${c.assets.asset_background.file}")`);
// 그림은 CSS 클래스로 한 번만 등록한다. 매 렌더마다 대용량 data URI를 복제하지 않기 위함.
(()=>{const ids=[...c.weapons.map(w=>w.assetId),...c.elements.map(e=>e.assetId),'asset_star',...c.weaponRecipes.map(r=>r.assetId),...c.monsters.map(m=>m.assetId),'asset_reward_back'];const st=document.createElement('style');st.textContent=ids.map(id=>`.ic-${id}{background-image:url("${c.assets[id].file}")}`).join('');document.head.append(st);})();

let state=initialState(),selected=null,serial=0,toastTimer,fx=null,resolveRun=null,shuffleRun=null;
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
function comboChanges(before,after){
 const out=[];
 after.forEach(m=>{if(!before.some(b=>b.ruleId===m.ruleId&&b.matchedValueId===m.matchedValueId))out.push({axis:m.axis,text:`${comboName(m)} +${number(m.bonus)}`,gain:true});});
 before.forEach(m=>{if(!after.some(a=>a.axis===m.axis))out.push({axis:m.axis,text:`${comboName(m)} 해제`,gain:false});});
 return out;
}
// 조합 무기 효과 문장. level을 주면 그 레벨의 수치로 쓴다.
function effectDescription(recipe,level=1){
 const e=byId(c.weaponEffects,recipe.effectId),s=number(e.value+e.perLevel*(level-1));
 const cond=e.condition==='combo'?`${axisLabels[e.axis]} ${comboLabels[e.kinds[0]]}${e.kinds.length>1?' 이상':''}이면 `:e.condition==='completeAxes'?`${e.axes.map(a=>axisLabels[a]).join('·')}의 컬렉션·트리플마다 `:e.condition==='collections'?'컬렉션·스트레이트마다 ':e.condition==='starBalance'?`3명의 별 Lv 차이가 ${e.maxGap} 이하면 `:'';
 const scale=e.scaleBy==='starLevelSum'?'별 Lv 합×':e.scaleBy==='maxStarLevel'?'최고 별 Lv×':'';
 const what=e.operation==='multiply'?`배율 ×${s}`:e.operation==='add'?`기초 +${scale}${s}`:e.operation==='targetPercent'?`최종 점수 + 목표의 ${s}%`:`누적 +${scale}${s}`;
 return `${e.operation==='accumulate'?'턴 종료 시 ':''}${cond}${what}`;
}
function effectKind(recipe){const op=byId(c.weaponEffects,recipe.effectId).operation;return op==='multiply'?'mul':op==='accumulate'?'acc':'add';}
const blindOf=b=>({target:b.target,elementId:b.elementId});
function reading(){const b=state.battle;return state.phase==='attach'?scoreTeam(state.run.team,blindOf(b),state.run,c):b.lastScore;}
function previewFor(slot,cardId){
 const b=state.battle,card=b.hand.find(x=>x.instanceId===cardId);if(!card)return {reason:'card'};
 const team=structuredClone(state.run.team),old=team.characters[slot];let unit,def=null;
 if(card.characterDefId){const reason=validatePlacement(state,{cardInstanceId:cardId,targetSlot:slot},c);if(reason)return {reason};unit=placeUnit(old,slot,card.characterDefId);}
 else{if(!old)return {reason:'target'};const reason=validateAttachment(state,{stickerInstanceId:cardId,targetInstanceId:old.instanceId},c);if(reason)return {reason};def=byId(c.stickers,card.stickerDefId);unit=attachUnit(old,def,c).unit;}
 team.characters[slot]=unit;
 return {reason:null,reading:scoreTeam(team,blindOf(b),state.run,c),unit,old,def,card,before:evaluateCombos(state.run.team,c,state.run.levels),after:evaluateCombos(team,c,state.run.levels)};
}

// 커맨드 실행 전후 상태를 비교해 연출 정보를 만든다. 도메인 상태는 건드리지 않는다.
function command(type,payload={}){
 const cardSnapshot=['AttachSticker','PlaceCharacter'].includes(type)?snapshotCard(app.querySelector(`[data-card="${selected}"]`)):null;
 const prev=state,r=applyCommand(state,{type,commandId:`ui_${++serial}`,...payload},c);
 if(r.error){toast(messages[r.error]??'다시 시도해주세요.');return false;}
 state=r.state;selected=null;fx=buildFx(type,prev,state,r.events);fx.cardSnapshot=cardSnapshot;render();return true;
}
function buildFx(type,prev,next,events){
 const f={events};
 if(type==='AttachSticker'||type==='PlaceCharacter'){
  const slot=type==='PlaceCharacter'?events.find(e=>e.slot!==undefined).slot:prev.run.team.characters.findIndex(u=>u?.instanceId===events[0].targetInstanceId);
  f.attached=slot;
  f.delta=scoreTeam(next.run.team,blindOf(next.battle),next.run,c).score-scoreTeam(prev.run.team,blindOf(prev.battle),prev.run,c).score;
  f.changes=comboChanges(evaluateCombos(prev.run.team,c,prev.run.levels),evaluateCombos(next.run.team,c,next.run.levels));
  for(const e of events){
   if(e.type==='CharacterPlaced')f.changes.unshift({text:`${nameOf(e.characterDefId)} 합류!`,gain:true});
   if(e.type==='CharacterReplaced')f.changes.unshift({text:`${nameOf(e.to)} 교체!`,gain:true});
   if(e.type==='StarLeveled')f.changes.unshift({text:`★ Lv${e.level}`,gain:true});
   if(e.type==='ElementLeveled')f.changes.unshift({text:`속성 Lv${e.level}`,gain:true});
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
 const fill=Math.min(100,score/b.target*100),next=elementOf(b.nextElementId);
 const risk=next?members(state.run.team).filter(u=>relationOf(u.elementId,next.id,c)==='disadvantage').length:0;
 return `<section class="blind-zone ${b.boss?'boss':''}" id="blind-zone"><div class="monster-slot" aria-hidden="true">${ic(m.assetId,'monster-art')}</div>
 <div class="blind-info"><div class="blind-name"><strong>${nameOf(m.nameKey)}</strong>${b.boss?'<em class="boss-tag">보스</em>':''}${elementChip(b.elementId)}</div>
 <div class="target-row"><small>목표</small><b id="target">${b.target}</b></div>
 <div class="target-gauge" aria-label="예상 점수 ${score} / 목표 ${b.target}"><i id="gauge" style="width:${fill}%"></i><span class="gauge-mark"></span></div>
 ${next?`<div class="next-blind">다음 블라인드 ${elementChip(next.id)}${risk?`<span class="risk">불리 ${risk}명</span>`:''}</div>`:'<div class="next-blind">마지막 블라인드</div>'}</div></section>`;
}
function scoreBoard(){
 const r=reading(),b=state.battle,gap=r.score-b.target;
 return `<button type="button" class="duel" id="duel" data-action="breakdown" aria-label="점수 계산 내역 보기">
 <div class="formula"><span class="chips"><small>기초</small><b id="chips">${number(r.chips)}</b></span><span class="op">×</span><span class="mult"><small>배율</small><b id="mult">${number(r.multiplier)}</b></span><span class="op">=</span><span class="score"><small>${state.phase==='attach'?'예상 점수':'최종 점수'}</small><b id="my-score">${r.score}</b></span></div>
 <div class="duel-foot"><span class="foe">${r.targetBonus?`목표 보너스 <b>+${r.targetBonus}</b>`:''}</span><span class="verdict ${gap>=0?'good':'bad'}" id="verdict">${gap>=0?`목표 달성 +${gap}`:`목표까지 ${-gap}`}</span></div>
 <div class="preview-line" id="preview-line"></div></button>`;
}
function unitBadges(u,b){
 const e=elementOf(u.elementId),rel=relationOf(u.elementId,b.elementId,c),nextRel=b.nextElementId?relationOf(u.elementId,b.nextElementId,c):'neutral';
 const star=u.starLevel?`<span class="lv-star" title="별 Lv${u.starLevel}">★${u.starLevel}</span>`:'';
 const el=e?`<span class="lv-el ${rel}" style="--el:${e.color}" title="${nameOf(e.id)} Lv${u.elementLevel}">${ic(e.assetId)}<b>${u.elementLevel}</b>${rel!=='neutral'?`<i class="rel">${relationMark[rel]}</i>`:''}</span>`:'';
 const warn=nextRel==='disadvantage'?'<span class="lv-warn" title="다음 블라인드에서 불리">!</span>':'';
 return `<span class="badges-l">${star}</span><span class="badges-r">${el}${warn}</span>`;
}
function recipeChip(u,r){
 const recipe=recipeFor(u,c);if(!recipe)return '';
 const eff=r.effects.find(x=>x.sourceInstanceId===u.instanceId),lv=levelOf(state.run.levels,recipe.id);
 return `<span class="recipe ${eff?.active?'on':''} k-${effectKind(recipe)}">${recipe.name} Lv${lv}<i>${eff?.active?'✓':'✗'}</i></span>`;
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
function comboTray(){
 const r=reading(),burst=new Set((fx?.changes??[]).filter(x=>x.gain&&x.axis).map(x=>x.axis));
 const lv=k=>levelOf(state.run.levels,k);
 return `<button type="button" class="tray" data-action="combos" aria-label="족보 설명 보기">${c.comboAxes.map(axis=>{const m=r.matches.find(x=>x.axis===axis);return `<span class="axis ${m?(m.complete?'full':'part'):''} ${burst.has(axis)?'burst':''}"><small>${axisLabels[axis]}</small><b>${m?comboLabels[m.kind]:'—'}</b><em>${m?'+'+number(m.bonus):''}</em></span>`;}).join('')}
 <span class="combo-levels">${c.comboLevelKinds.map(k=>`<span class="${lv(k)>1?'up':''}">${levelKindLabels[k]}<b>Lv${lv(k)}</b></span>`).join('')}</span></button>`;
}
function hintText(){
 const b=state.battle,sel=b.hand.find(x=>x.instanceId===selected),selDef=sel?.stickerDefId?byId(c.stickers,sel.stickerDefId):null;
 if(sel?.characterDefId)return '빈 자리에 놓거나, 교체할 캐릭터를 누르세요. 스티커와 레벨은 옮겨져요';
 if(selDef?.kind==='element')return '같은 속성은 Lv+1, 다른 속성은 교체하고 Lv1부터';
 if(selDef?.kind==='star')return '별 Lv가 오를수록 기초 점수가 커져요';
 if(sel)return '숫자는 붙였을 때 점수 변화예요';
 if(b.actionsUsed>=c.balance.attachLimit)return b.turn<c.balance.turnsPerBlind?'다 붙였어요. 턴을 넘기세요':'다 붙였어요. 전투하세요';
 if(!members(state.run.team).length)return '캐릭터 카드를 빈 자리에 놓으세요';
 return '스티커를 끌어서 캐릭터에 붙이세요';
}
function handDock(){
 const b=state.battle,left=c.balance.attachLimit-b.actionsUsed,last=b.turn>=c.balance.turnsPerBlind;
 return `<footer class="dock"><div class="hand-head"><span class="hint" id="hint">${hintText()}</span><span class="uses" aria-label="남은 붙이기 ${left}회">${Array.from({length:c.balance.attachLimit},(_,i)=>`<i class="${i<left?'on':''}"></i>`).join('')}</span></div>
 <div class="hand">${b.hand.length?b.hand.map((card,i,arr)=>handCard(card,i,arr.length,left<=0)).join(''):'<p class="empty">손패가 없어요</p>'}</div>
 <div class="actions"><button type="button" class="deck-mini" data-action="deck" aria-label="덱 보기"><b>${b.drawPile.length}</b><small>${uiIcon('cards')} 남은 덱</small></button><button type="button" class="go ${last?'fight':''}" data-action="end">${last?'전투!':'턴 종료'}</button></div></footer>`;
}
// 점수 연출 단계: 기초(덧셈) → 배율(곱셈) → 목표 보너스.
function stepItems(r){
 const items=[],core=r.base+r.weapons+r.stars;
 items.push(`<li class="add" data-add="${core}">캐릭터·무기·별<b>+${core}</b></li>`);
 if(r.combos)items.push(`<li class="add" data-add="${r.combos}" data-src="tray">족보<b>+${number(r.combos)}</b></li>`);
 for(const e of r.effects.filter(x=>x.operation==='add'))items.push(e.active?`<li class="add" data-add="${e.amount}">${e.name}<b>+${number(e.amount)}</b></li>`:`<li class="off">${e.name}</li>`);
 if(r.accumulated)items.push(`<li class="add" data-add="${r.accumulated}">누적<b>+${number(r.accumulated)}</b></li>`);
 if(r.comboMultiplier!==1)items.push(`<li class="mul" data-mul="${r.comboMultiplier}" data-src="tray">족보 레벨<b>×${number(r.comboMultiplier)}</b></li>`);
 for(const e of r.effects.filter(x=>x.operation==='multiply'))items.push(e.active&&e.amount!==1?`<li class="mul" data-mul="${e.amount}">${e.name}<b>×${number(e.amount)}</b></li>`:`<li class="off">${e.name}</li>`);
 if(r.affinity.total!==1)items.push(`<li class="mul aff-step" data-mul="${r.affinity.total}">상성<b>×${number(r.affinity.total)}</b></li>`);
 if(r.targetBonus)items.push(`<li class="bonus" data-bonus="${r.targetBonus}">목표 보너스<b>+${r.targetBonus}</b></li>`);
 return items.join('');
}
function resolveDock(){
 const b=state.battle,win=b.outcome==='win',last=b.blindIndex===c.blinds.length-1;
 return `<footer class="dock"><ul class="steps" id="steps">${stepItems(b.lastScore)}</ul><p class="skip-hint" id="skip-hint">화면을 누르면 바로 결과를 봐요</p><button type="button" class="go" data-action="finish" id="finish">${win&&!last?'보상 뽑기':'원정 결과'}</button></footer>`;
}
function renderBattle(){
 const b=state.battle;
 return stageTop(`<b>블라인드 ${b.blindIndex+1}</b><span class="turn">${b.turn}/${c.balance.turnsPerBlind}턴</span>`)+
 `<main class="battle">${blindZone()}${scoreBoard()}${playerZone()}${comboTray()}</main>${state.phase==='attach'?handDock():resolveDock()}`;
}

/* ── 타이틀 ── */
function renderTitle(){
 const t=c.balance;
 return `<header class="top"><div class="logo"><b>스티커 원정대</b><small>붙여서 완성하는 판타지</small></div>${toolsNav()}</header>
 <main class="title"><div class="title-art">${['char_human_warrior','char_elf_archer','char_dwarf_mage'].map(id=>`<canvas data-def-render="${id}"></canvas>`).join('')}</div>
 <p class="lead">스티커를 붙여 원정대를 키우고,<br>블라인드의 목표 점수를 넘기세요.</p>
 <ol class="flow"><li><b>${t.turnsPerBlind}턴</b><span>매 턴 ${t.handSize}장 중 ${t.attachLimit}번 붙여요. 별과 속성은 붙일수록 레벨이 올라요.</span></li><li><b>전투</b><span>마지막 턴 뒤 점수가 목표 이상이면 통과. 못 넘기면 원정 끝.</span></li><li><b>보상</b><span>카드 3장을 섞어 1장을 뽑아요. 원정대는 다음 블라인드로 그대로 가요.</span></li></ol>
 <p class="note-dark">블라인드 속성을 이기는 속성은 배율이 오르고, 지는 속성은 내려가요.</p></main>
 <footer class="dock"><button type="button" class="go" data-action="start">원정 시작</button></footer>`;
}

/* ── 보상: 공개 → 뒤집어 섞기 → 선택 ── */
// 보상 카드 자리: 5:7 비율(뒷면 그림 600×840과 같음). 세 자리는 가로로 나란히, 섞을 때 자리만 바꾼다.
// applied: 이미 적용된 보상이면 적용 전 레벨부터 보여준다.
function rewardFace(o,applied=false){
 const recipe=o.type==='recipe'?byId(c.weaponRecipes,o.key):null,cur=levelOf(state.run.levels,o.key)-(applied?o.levels:0);
 const art=recipe?ic(recipe.assetId,'rart'):`<span class="rkind">${levelKindLabels[o.key]}</span>`;
 const title=recipe?recipe.name:`${levelKindLabels[o.key]} 족보`;
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
 const ph=state.phase,rw=state.reward,b=state.battle,nextBlind=c.blinds[b.blindIndex+1],nextEl=b.nextElementId;
 const lead=ph==='reward_reveal'?'세 장 중 하나를 받아요. 섞은 뒤 원하는 카드를 쫓아가세요!':ph==='reward_pick'?'카드를 골라 뒤집으세요.':'';
 let dock='';
 if(ph==='reward_reveal')dock='<footer class="dock"><button type="button" class="go" data-action="shuffle">섞기</button></footer>';
 else if(ph==='reward_done'){const o=rw.offers[rw.order[rw.picked]];dock=`<footer class="dock"><p class="got">${o.type==='recipe'?byId(c.weaponRecipes,o.key).name:levelKindLabels[o.key]+' 족보'} Lv${levelOf(state.run.levels,o.key)}!</p><div class="next-foe"><small>다음 블라인드</small>${elementChip(nextEl)}<b>목표 ${nextBlind.target}</b></div><button type="button" class="go" data-action="next-blind">다음 블라인드</button></footer>`;}
 return stageTop(`<b>블라인드 ${b.blindIndex+1} 통과</b>`)+`<main class="reward"><h2>보상 뽑기</h2><p class="lead" id="reward-lead">${lead}</p>${rewardCards()}</main>${dock}`;
}

/* ── 결과 ── */
function renderRunResult(){
 const win=state.run.result==='win',h=state.history;
 return stageTop()+`<main class="result"><h2 class="${win?'':'lose'}">${win?'원정 성공':'원정 실패'}</h2><p class="lead">${win?`${c.blinds.length}개의 블라인드를 모두 넘겼어요.`:`블라인드 ${h.length}에서 목표를 넘지 못했어요.`}</p>
 <table class="table history">${h.map(x=>`<tr class="${x.outcome}"><td>블라인드 ${x.blindIndex+1}</td><td>${x.score} / 목표 ${x.target}</td></tr>`).join('')}</table>
 <div class="party">${members(state.run.team).map(u=>`<div class="punit static">${unitBadges(u,state.battle)}<canvas data-render="${u.instanceId}"></canvas><span class="uname">${nameOf(u.characterDefId)}</span></div>`).join('')}</div></main><footer class="dock"><button type="button" class="go" data-action="restart">다시 원정</button></footer>`;
}

/* ── 렌더 ── */
function render(){
 const f=fx,p=state.phase;
 app.innerHTML=p==='title'?renderTitle():p.startsWith('reward_')?renderReward():p==='run_result'?renderRunResult():renderBattle();
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
  el.dataset.rank=String(u.starLevel>=5?3:u.starLevel>=3?2:u.starLevel>=1?1:0);
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
  f.changes.forEach((ch,i)=>setTimeout(()=>burst(ch.text,!ch.gain),i*420));
  flyCard(f.cardSnapshot,el);particles(el);
 }
 if(f.accumulated){const acc=document.getElementById('acc');if(acc){bump(acc,true);floatText(acc,'+'+number(f.accumulated.gain),'up');}}
 if(f.turnStart&&state.phase==='attach'){
  app.querySelector('.hand')?.classList.add('dealing');
  const b=state.battle;
  if(f.blindStart)banner(`블라인드 ${b.blindIndex+1}`,`${nameOf(monsterOf(b.monsterId).nameKey)} · 목표 ${b.target}`);
  else banner(b.turn===c.balance.turnsPerBlind?'마지막 턴':`${b.turn}턴`,b.hand.some(x=>x.characterDefId)?'동료 카드 등장':'');
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
 const count=async(el,from,to,ms)=>{const n=8;for(let i=1;i<=n&&!token.skip;i++){el.textContent=number(Math.round(from+(to-from)*i/n));await wait(ms/n);}el.textContent=number(to);};
 const chipsEl=$('chips'),multEl=$('mult'),scoreEl=$('my-score'),verdict=$('verdict'),finish=$('finish'),gauge=$('gauge'),zone=$('blind-zone');
 if(!chipsEl||!finish){resolveRun=null;return;}
 chipsEl.textContent='0';multEl.textContent='1';scoreEl.textContent='?';verdict.textContent='계산 중';verdict.className='verdict';finish.classList.add('waiting');gauge.style.width='0%';
 const steps=[...app.querySelectorAll('#steps li:not(.off)')];steps.forEach(li=>li.classList.add('pending'));
 let chips=0,mult=1,bonus=0;
 await wait(250);
 for(const li of steps){
  if(token.skip)break;
  li.classList.remove('pending');li.classList.add('hit');
  const origin=app.querySelector(li.classList.contains('aff-step')?'.party':li.dataset.src==='tray'?'.tray':'.party');if(origin&&!reduced){origin.classList.add('fx-source');setTimeout(()=>origin.classList.remove('fx-source'),420);}
  const add=Number(li.dataset.add||0),mul=Number(li.dataset.mul||1),bn=Number(li.dataset.bonus||0);
  if(add){await count(chipsEl,chips,chips+add,300);chips+=add;bump(chipsEl.parentElement);}
  if(mul!==1){mult*=mul;multEl.textContent=number(mult);bump(multEl.parentElement,true);if(!reduced&&mul>1){app.classList.remove('quake');void app.offsetWidth;app.classList.add('quake');}}
  if(bn)bonus+=bn;
  await wait(260);
 }
 steps.forEach(li=>li.classList.remove('pending'));
 chipsEl.textContent=number(r.chips);multEl.textContent=number(r.multiplier);
 await wait(160);
 await count(scoreEl,0,r.score,520);scoreEl.textContent=r.score;scoreEl.classList.add('slam');if(r.multiplier>=2)$('duel').classList.add('blaze');
 gauge.style.width=Math.min(100,r.score/b.target*100)+'%';
 await wait(380);
 const win=b.outcome==='win';
 verdict.textContent=win?`목표 달성 +${r.score-b.target}`:`목표까지 ${b.target-r.score}`;verdict.className='verdict '+(win?'good':'bad');
 if(zone){zone.classList.remove('hurt');void zone.offsetWidth;zone.classList.add(win?'defeated':'hurt');}
 if(!token.skip){particles(zone?.querySelector('.monster-slot'),win?'#f5c64b':'#ef6a5b',win?24:10);burst(win?'격파!':'목표 미달',!win);}
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
 const bits=comboChanges(pv.before,pv.after).map(x=>`<span class="${x.gain?'gain':'loss'}">${x.text}</span>`);
 const rec=recipeFor(pv.unit,c),oldRec=pv.old?recipeFor(pv.old,c):null;
 if(rec&&oldRec?.id!==rec.id)bits.push(`<span class="gain">${rec.name} 완성</span>`);
 if(pv.def?.kind==='star')bits.unshift(`<span class="gain">★ Lv${pv.unit.starLevel}</span>`);
 if(pv.def?.kind==='element'){
  if(pv.old.elementId===pv.def.payloadId)bits.unshift(`<span class="gain">${nameOf(pv.def.payloadId)} Lv${pv.unit.elementLevel}</span>`);
  else if(pv.old.elementId)bits.unshift(`<span class="loss">${nameOf(pv.old.elementId)} Lv${pv.old.elementLevel} 사라짐</span>`);
  const rel=relationOf(pv.unit.elementId,state.battle.elementId,c);if(rel!=='neutral')bits.push(`<span class="${rel==='advantage'?'gain':'loss'}">상성 ${rel==='advantage'?'유리':'불리'}</span>`);
 }
 if(pv.def?.kind==='weapon'&&pv.old.weaponId)bits.push(`<span class="loss">기존 ${nameOf(pv.old.weaponId)} 사라짐</span>`);
 if(pv.card.characterDefId&&pv.old)bits.unshift(`<span class="gain">${nameOf(pv.old.characterDefId)} → ${nameOf(pv.card.characterDefId)}, 스티커 유지</span>`);
 line.innerHTML=bits.join('');
}

/* ── 바텀시트 ── */
function openInfo(html){document.getElementById('info-content').innerHTML=html;const d=document.getElementById('info');if(!d.open)d.showModal();}
function cycleText(){const m=c.affinity.beats,start=Object.keys(m)[0];let k=start,s=[nameOf(k)];do{k=m[k];s.push(nameOf(k));}while(k!==start);return s.join(' > ');}
function showRules(){const t=c.balance;openInfo(`<h2>원정 규칙</h2><ol>
<li>원정은 블라인드 ${c.blinds.length}개. 블라인드마다 ${t.turnsPerBlind}턴을 진행하고, 마지막 턴이 끝나면 점수가 목표 이상인지 판정해요. 못 넘기면 원정이 끝나요.</li>
<li>매 턴 손패 ${t.handSize}장을 받고 최대 ${t.attachLimit}번 붙여요. 남은 카드는 턴 종료 때 버려져요.</li>
<li>블라인드 첫 턴(블라인드 1은 1~3턴)에는 캐릭터 카드가 꼭 나오고, 다른 턴에도 가끔 나와요. 빈 자리에 놓거나 교체할 수 있고, 교체해도 스티커와 레벨은 옮겨져요.</li>
<li><b>별</b>: 붙일 때마다 Lv+1. 캐릭터 기초 점수가 Lv당 +${t.starPower}.</li>
<li><b>속성</b>: 같은 속성을 붙이면 Lv+1, 다른 속성을 붙이면 교체되고 Lv1부터 다시 시작해요.</li>
<li><b>무기</b>: 기초 +${t.weaponPower}. 무기와 속성이 함께 있으면 조합 무기가 돼요.</li>
<li><b>상성</b>: ${cycleText()}. 블라인드 속성을 이기면 ×(1+${t.affinityPerLevel}×속성Lv), 지면 그만큼 나눠요.</li>
<li>점수는 <b>기초 × 배율</b>. 기초는 캐릭터·무기·별·족보·물 조합 효과·누적의 합, 배율은 족보 레벨·불 조합 효과·상성을 곱한 값이에요.</li>
<li>원정대는 블라인드가 바뀌어도 그대로예요. 블라인드를 넘기면 보상 카드 3장을 섞어 1장을 뽑아요.</li></ol><p class="note">현재 수치는 재미와 균형 확인용 임시값입니다.</p>`);}
function showAffinity(){openInfo(`<h2>상성</h2><p>${cycleText()}. 캐릭터마다 블라인드 속성과 비교해요.</p><table class="table"><tr><td>유리 ▲</td><td>×(1 + ${c.balance.affinityPerLevel} × 속성 Lv)</td></tr><tr><td>불리 ▼</td><td>÷(1 + ${c.balance.affinityPerLevel} × 속성 Lv)</td></tr><tr><td>무관</td><td>×1</td></tr></table><p class="note">다음 블라인드 속성은 미리 알려줘요. 그때 불리해질 캐릭터에는 ! 표시가 붙어요.</p>`);}
function showCombos(){
 const lv=k=>levelOf(state.run?.levels,k),row=(kind,desc,axisBonus,starBonus)=>`<tr><td>${comboLabels[kind]}</td><td>${desc}</td><td>+${axisBonus} · 별 +${starBonus}×Lv</td></tr>`;
 const bonus=(axis,kind)=>c.combos.find(r=>r.axis===axis&&r.kind===kind).flatPowerBonus;
 openInfo(`<h2>족보</h2><p>종족·직업·무기·속성·별 5개 항목을 3명 기준으로 비교해요. 항목마다 가장 높은 족보 하나만 적용돼요. 별은 레벨로 비교해요.</p><table class="table">${row('pair','같은 값 2명',bonus('race','pair'),bonus('star','pair'))}${row('collection','3명 모두 다름 (별은 연속 Lv = 스트레이트)',bonus('race','collection'),bonus('star','straight'))}${row('triple','3명 모두 같음',bonus('race','triple'),bonus('star','triple'))}</table>
 <h3 class="sheet-h">족보 레벨</h3><p>보상으로 페어·컬렉션·트리플 레벨을 올려요. Lv이 오르면 보너스가 ×Lv, 그 족보가 성립할 때마다 배율 ×(1+${c.balance.comboMultPerLevel}×(Lv−1)).</p><table class="table">${c.comboLevelKinds.map(k=>`<tr><td>${levelKindLabels[k]}</td><td>Lv${lv(k)}</td></tr>`).join('')}</table><p class="note">빈 칸과 별 Lv0은 족보에서 빠져요.</p>`);
}
function showRecipes(){openInfo(`<h2>조합 무기</h2><p>무기와 속성을 같은 캐릭터에 붙이면 조합 무기가 돼요. 불은 배율, 물은 기초 점수, 번개는 턴마다 누적. 레벨은 보상으로 올려요.</p><div class="recipe-list">${c.weaponRecipes.map(r=>{const lv=levelOf(state.run?.levels,r.id);return `<article>${ic(r.assetId,'recipe-art')}<b>${r.name} <small>Lv${lv}</small></b><small>${nameOf(r.weaponId)} + ${nameOf(r.elementId)}</small><p>${effectDescription(r,lv)}</p></article>`;}).join('')}</div>`);}
function inspect(slot){
 const u=state.run.team.characters[slot];if(!u)return;
 const d=byId(c.characters,u.characterDefId),rec=recipeFor(u,c),b=state.battle,rel=relationOf(u.elementId,b.elementId,c);
 openInfo(`<h2>${nameOf(d.id)}</h2><table class="table"><tr><td>기본</td><td>${d.basePower}</td></tr><tr><td>무기</td><td>${u.weaponId?`${nameOf(u.weaponId)} +${byId(c.weapons,u.weaponId).powerBonus}`:'없음'}</td></tr><tr><td>별</td><td>Lv${u.starLevel} +${u.starLevel*c.balance.starPower}</td></tr><tr><td>속성</td><td>${u.elementId?`${nameOf(u.elementId)} Lv${u.elementLevel}${rel!=='neutral'?` · 이번 블라인드 ${rel==='advantage'?'유리':'불리'}`:''}`:'없음'}</td></tr></table>${rec?`<div class="recipe-card"><b>${rec.name} Lv${levelOf(state.run.levels,rec.id)}</b><p>${effectDescription(rec,levelOf(state.run.levels,rec.id))}</p></div>`:'<p class="note">무기와 속성을 함께 붙이면 조합 무기가 돼요.</p>'}`);
}
function showBreakdown(){
 const r=reading(),b=state.battle;
 openInfo(`<h2>점수 계산</h2><p class="sub">${state.phase==='attach'?'지금 전투하면 이렇게 계산돼요.':'이번 블라인드의 확정 점수예요.'}</p><table class="table">
 <tr><td>캐릭터·무기·별</td><td>${r.base+r.weapons+r.stars}</td></tr><tr><td>족보</td><td>+${number(r.combos)}</td></tr><tr><td>물 조합 효과</td><td>+${number(r.flat)}</td></tr><tr><td>누적</td><td>+${number(r.accumulated)}</td></tr><tr><td><b>기초</b></td><td><b>${number(r.chips)}</b></td></tr>
 <tr><td>족보 레벨 배율</td><td>×${number(r.comboMultiplier)}</td></tr><tr><td>불 조합 효과 배율</td><td>×${number(r.effectMultiplier)}</td></tr><tr><td>상성 배율</td><td>×${number(r.affinity.total)}</td></tr><tr><td><b>배율</b></td><td><b>×${number(r.multiplier)}</b></td></tr>
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
 const el=e.target.closest('[data-action]');if(!el||el.disabled)return;
 switch(el.dataset.action){
 case 'rules':showRules();break;
 case 'recipes':showRecipes();break;
 case 'combos':showCombos();break;
 case 'affinity':showAffinity();break;
 case 'breakdown':if(!selected)showBreakdown();break;
 case 'start':command('StartRun',{seed:crypto.getRandomValues(new Uint32Array(1))[0]});break;
 case 'select':if(state.battle.actionsUsed>=c.balance.attachLimit){toast(messages.limit);return;}selected=selected===el.dataset.card?null:el.dataset.card;render();break;
 case 'attach':{if(state.phase!=='attach')break;const slot=Number(el.dataset.slot),u=state.run.team.characters[slot];if(selected)attach(slot);else if(u)inspect(slot);else toast('캐릭터 카드를 놓을 자리예요.');break;}
 case 'end':command('EndTurn');break;
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
app.addEventListener('pointerover',e=>{if(selected&&!pointer?.dragging&&state.phase==='attach')preview(e.target.closest('[data-action="attach"]'));});
app.addEventListener('focusin',e=>{if(selected&&state.phase==='attach')preview(e.target.closest('[data-action="attach"]'));});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected){cancelDrag();selected=null;render();}});
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('paused',document.hidden);if(document.hidden)cancelDrag();});
render();

return {};})();
