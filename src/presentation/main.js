modules["src/presentation/main.mjs"]=(()=>{
const {content,byId,nameOf,validateContent}=modules["src/content/data.mjs"];
const {makeUnit,unitPower,calculateTeamPower,attachUnit,recipeFor,elementStacks,effectStrength,resolveCombat,elementPower}=modules["src/domain/rules.mjs"];
const {initialState,applyCommand,validateAttachment,validatePlacement,placeUnit}=modules["src/application/game.mjs"];
const {renderCharacter}=modules["src/rendering/compositor.mjs"];

validateContent();
const c=content,app=document.getElementById('app');
document.documentElement.style.setProperty('--art-background',`url("${c.assets.asset_background.file}")`);
// 아이콘 이미지는 CSS 클래스로 한 번만 등록한다. 매 렌더마다 대용량 data URI를 복제하지 않기 위함.
(()=>{const ids=[...c.weapons.map(w=>w.assetId),...c.elements.map(e=>e.assetId),'asset_star'];const st=document.createElement('style');st.textContent=ids.map(id=>`.ic-${id}{background-image:url("${c.assets[id].file}")}`).join('');document.head.append(st);})();

let state=initialState(),selected=null,serial=0,toastTimer,fx=null,hpHold=null,resolveRun=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const messages={target:'캐릭터가 있는 자리에 붙여주세요.',card:'사용할 수 없는 스티커입니다.',maxStars:'별이 이미 가득 찼어요.',maxElementStacks:'속성이 최대 중첩이에요.',same:'이미 같은 무기가 붙어 있어요.',limit:'이번 턴은 모두 붙였어요. 전투를 시작하세요.',phase:'지금은 붙일 수 없어요.',swapLocked:`${c.characterRules.replaceFromTurn}턴부터 캐릭터를 교체할 수 있어요.`,sameCharacter:'같은 캐릭터로는 교체할 수 없어요.',rig:'이 캐릭터에게 맞지 않는 무기입니다.',duplicate:'이미 처리한 행동입니다.'};
const shortReason={maxStars:'별 가득',maxElementStacks:'최대 중첩',same:'같은 무기',rig:'장착 불가',target:'빈 자리',swapLocked:`${c.characterRules.replaceFromTurn}턴부터`,sameCharacter:'같은 캐릭터'};
const axisLabels={race:'종족',job:'직업',weapon:'무기',element:'속성',star:'별'};
const comboLabels={pair:'페어',collection:'컬렉션',straight:'스트레이트',triple:'트리플',double:'더블 완성',full:'풀 완성'};
const kindShort={pair:'페어',collection:'컬렉션',straight:'1·2·3',triple:'트리플'};
const number=v=>Number.isInteger(v)?String(v):String(Number(v.toFixed(2)));
const ic=(assetId,cls='')=>`<i class="ic ic-${assetId} ${cls}" aria-hidden="true"></i>`;

function toast(text){const el=document.getElementById('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}
function comboName(m){const v=m.matchedValueId;return `${axisLabels[m.axis]} ${v==null?'':m.axis==='star'?v+'별 ':nameOf(v)+' '}${comboLabels[m.kind]}`;}
function comboChanges(before,after){
 const out=[];
 after.matches.forEach(m=>{if(!before.matches.some(b=>b.ruleId===m.ruleId&&b.matchedValueId===m.matchedValueId))out.push({axis:m.axis,text:`${comboName(m)} +${m.bonus}`,gain:true});});
 before.matches.forEach(m=>{if(!after.matches.some(a=>a.axis===m.axis))out.push({axis:m.axis,text:`${comboName(m)} 해제`,gain:false});});
 if(after.compound?.kind!==before.compound?.kind)out.push(after.compound?{axis:'compound',text:`${comboLabels[after.compound.kind]} +${after.compound.bonus}`,gain:true}:{axis:'compound',text:'완성 보너스 해제',gain:false});
 return out;
}
function effectDescription(recipe,unit=null){
 const e=byId(c.weaponEffects,recipe.effectId),strength=unit?effectStrength(unit,c):1;
 const amount=e.operation==='multiply'?1+(e.value-1)*strength:e.value*strength;
 const condition=e.condition==='combo'?`${axisLabels[e.axis]} ${comboLabels[e.kind]}이면`:e.condition==='completeAxes'?'장착 완성 축마다':e.condition==='lowerScore'?'효과 전 점수가 상대보다 낮으면':e.condition==='collections'?'컬렉션·스트레이트마다':e.condition==='allStars'?'모두 별 1개 이상이면':'항목별 페어마다';
 return `${condition} ${e.operation==='multiply'?'배율 ×'+number(amount):e.operation==='grow'?'다음 공격부터 누적 +'+number(amount):'이번 점수 +'+number(amount)}`;
}
function effShort(e){return e.operation==='multiply'?'×'+number(e.amount):e.operation==='grow'?'누적+'+number(e.amount):'+'+number(e.amount);}
function reading(){const b=state.battle;return state.phase==='attach'?resolveCombat(b,c):b.lastCombat??resolveCombat(b,c);}
const isCharTurn=t=>c.characterRules.drawTurns.includes(t);
const members=team=>team.characters.filter(Boolean);
function previewFor(slot,cardId,eslot='weapon'){
 const b=state.battle,card=b.hand.find(x=>x.instanceId===cardId);if(!card)return {reason:'card'};
 const team=structuredClone(b.player),old=team.characters[slot];let unit,def=null;
 if(card.characterDefId){const reason=validatePlacement(state,{cardInstanceId:cardId,targetSlot:slot},c);if(reason)return {reason};unit=placeUnit(old,slot,card.characterDefId,c);}
 else{const reason=validateAttachment(state,{stickerInstanceId:cardId,targetInstanceId:`player_${slot}`,elementSlot:eslot},c);if(reason)return {reason};def=byId(c.stickers,card.stickerDefId);unit=attachUnit(old,def,c,eslot).unit;}
 team.characters[slot]=unit;
 return {reason:null,reading:resolveCombat({...b,player:team},c),unit,old,def,card,before:calculateTeamPower(b.player,c),after:calculateTeamPower(team,c)};
}

// 커맨드 실행 전후 상태를 비교해 연출 정보를 만든다. 도메인 상태는 건드리지 않는다.
function command(type,payload={}){
 const cardSnapshot=['AttachSticker','PlaceCharacter','SelectReward'].includes(type)?snapshotCard(app.querySelector(type==='SelectReward'?`[data-action="reward"][data-sticker="${payload.stickerDefId}"]`:`[data-card="${selected}"]`)):null;
 const prev=state,r=applyCommand(state,{type,commandId:`ui_${++serial}`,...payload},c);
 if(r.error){toast(messages[r.error]??'다시 시도해주세요.');return false;}
 state=r.state;selected=null;fx=buildFx(type,prev,state,payload);fx.cardSnapshot=cardSnapshot;fx.rewardSnapshot=type==='SelectReward'?cardSnapshot:null;fx.celebrate=state.phase==='battle_result'&&state.battle.outcome==='win';render();return true;
}
function buildFx(type,prev,next,payload){
 const f={};
 if(type==='AttachSticker'){
  f.attached=Number(payload.targetInstanceId.split('_')[1]);f.eslot=payload.elementSlot;
  f.delta=resolveCombat(next.battle,c).player.score-resolveCombat(prev.battle,c).player.score;
  f.changes=comboChanges(calculateTeamPower(prev.battle.player,c),calculateTeamPower(next.battle.player,c));
 }
 if(type==='PlaceCharacter'){
  const slot=payload.targetSlot,old=prev.battle.player.characters[slot],now=next.battle.player.characters[slot];
  f.attached=slot;f.delta=resolveCombat(next.battle,c).player.score-resolveCombat(prev.battle,c).player.score;
  f.changes=[{axis:'none',text:old?`${nameOf(now.characterDefId)} 교체!`:`${nameOf(now.characterDefId)} 합류!`,gain:true},...comboChanges(calculateTeamPower(prev.battle.player,c),calculateTeamPower(next.battle.player,c))];
 }
 if(next.battle&&next.phase==='attach'&&['StartRun','StartNextBattle','FinishResolution'].includes(type)){
  const same=prev.battle?.battleId===next.battle.battleId,sc=c.scenarios[next.run.stageIndex];
  const base=same?prev.battle.enemy.characters:Array(c.balance.teamSize).fill(null);
  f.enemyMoves=[];
  next.battle.enemy.characters.forEach((u,i)=>{if(!u)return;const name=nameOf(u.characterDefId);
   if(!base[i])f.enemyMoves.push({id:u.instanceId,text:`${name} 등장`});
   else if(base[i].characterDefId!==u.characterDefId)f.enemyMoves.push({id:u.instanceId,text:`${nameOf(base[i].characterDefId)} → ${name} 교체`});
   const o=base[i]??makeUnit(u.instanceId,u.characterDefId,c);
   if(u.weaponId!==o.weaponId)f.enemyMoves.push({id:u.instanceId,text:`${name} ${nameOf(u.weaponId)}`});
   if(u.elementId!==o.elementId||u.elementStacks!==o.elementStacks)f.enemyMoves.push({id:u.instanceId,text:`${name} ${nameOf(u.elementId)}`});
   if(u.stars!==o.stars)f.enemyMoves.push({id:u.instanceId,text:`${name} 별+${u.stars-o.stars}`});});
  f.turnStart=true;
 }
 if(type==='EndTurn'){hpHold={player:prev.battle.player.hp,enemy:prev.battle.enemy.hp};f.resolve=true;}
 return f;
}

/* ── 공용 조각 ── */
function gearBadges(u){const e=u.elementId?byId(c.elements,u.elementId):null,n=elementStacks(u);return e&&n>1?`<span class="stack" style="--el:${e.color}" title="${nameOf(e.id)} ${n}중첩">×${n}</span>`:'';}
function starPips(u){return `<span class="pips" aria-label="별 ${u.stars}개">${Array.from({length:c.balance.maxStars},(_,i)=>`<i class="${i<u.stars?'on':''}"></i>`).join('')}</span>`;}
function hpBar(hp,max,side){const v=Math.max(0,hpHold?hpHold[side]:hp);return `<div class="hp ${side}"><div class="hp-track"><i data-hp="${side}" style="width:${v/max*100}%"></i></div><b data-hpnum="${side}">${v}</b><small>/${max}</small></div>`;}
function uiIcon(kind){const shapes={book:'<path d="M3 5q5-2 9 1 4-3 9-1v15q-5-2-9 0-4-2-9 0Z"/><path d="M12 6v14M6 9h3m-3 4h3m6-4h3m-3 4h3"/>',seal:'<path d="m12 2 3 3 4 1 1 4 2 3-3 3-1 4-4 1-3 1-3-3-4-1-1-4-1-3 3-3 1-4Z"/><path d="m7 12 3 3 6-6"/>',cards:'<rect x="5" y="3" width="15" height="18" rx="3"/><path d="M3 6 1 18q0 3 3 3m7-13 4 4-4 4-3-4Z"/>',sword:'<path d="m16 3 5-1-1 5-9 9-4-4Z M5 11l8 8M3 21l6-6"/>'};return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[kind]??shapes.seal}</svg>`;}
function toolsNav(){return `<nav class="tools"><button data-action="recipes">${uiIcon('seal')}조합</button><button data-action="rules">${uiIcon('book')}규칙</button>${state.phase!=='title'?'<button data-action="restart-ask" aria-label="처음부터 다시">↺</button>':''}</nav>`;}
function stageTop(extra=''){const i=state.run.stageIndex,won=state.battle?.outcome==='win';return `<header class="top"><div class="stage">${c.scenarios.map((s,k)=>`<span class="pip ${k<i||(k===i&&won&&state.phase!=='attach'&&state.phase!=='resolve')?'done':k===i?'now':''}"></span>`).join('')}${extra}</div>${toolsNav()}</header>`;}
function stickerCard(id,{instanceId='',action='select',i=0,n=1,count=0,extra='',spent=false}={}){
 const s=byId(c.stickers,id),e=s.kind==='element'?byId(c.elements,s.payloadId):null;
 const rot=n>1?(i-(n-1)/2)*5:0,tint=e?.color??(s.kind==='star'?'#d9a72c':'#7d6aa0');
 const desc=s.kind==='star'?`별 +${s.starAmount}`:s.kind==='weapon'?`전투력 +${byId(c.weapons,s.payloadId).powerBonus}`:'무기와 조합';
 return `<button type="button" class="sticker k-${s.kind} ${instanceId&&selected===instanceId?'sel':''} ${spent?'spent':''}" style="--rot:${rot}deg;--tint:${tint}" data-action="${action}" data-card="${instanceId}" data-sticker="${id}" ${extra} ${action==='select'?`aria-pressed="${selected===instanceId}"`:''}>${ic(s.iconAssetId,'sicon')}<span class="sname">${nameOf(s.nameKey)}${count?` <em>×${count}</em>`:''}</span><span class="sdesc">${desc}</span></button>`;
}

function handCard(card,i,n,spent){
 if(card.stickerDefId)return stickerCard(card.stickerDefId,{instanceId:card.instanceId,i,n,spent});
 const d=byId(c.characters,card.characterDefId),rot=n>1?(i-(n-1)/2)*5:0,canSwap=state.battle.turn>=c.characterRules.replaceFromTurn;
 return `<button type="button" class="sticker k-char ${selected===card.instanceId?'sel':''} ${spent?'spent':''}" style="--rot:${rot}deg;--tint:#7d6aa0" data-action="select" data-card="${card.instanceId}" aria-pressed="${selected===card.instanceId}"><canvas class="ccanvas" data-def-render="${d.id}"></canvas><span class="sname">${nameOf(d.id)}</span><span class="sdesc">${canSwap?'배치·교체':'빈 자리에 배치'}</span></button>`;
}

/* ── 전투 화면 ── */
function enemyZone(){
 const b=state.battle,sc=c.scenarios[state.run.stageIndex],p=calculateTeamPower(b.enemy,c);
 return `<section class="enemy-zone"><div class="zone-head"><strong>${sc.name}</strong>${hpBar(b.enemy.hp,sc.hp,'enemy')}</div>
 <div class="enemy-row">${b.enemy.characters.map((u,slot)=>u?`<button type="button" class="eunit" data-action="inspect" data-unit="${u.instanceId}" aria-label="${nameOf(u.characterDefId)} 정보"><canvas data-render="${u.instanceId}"></canvas>${gearBadges(u)}${starPips(u)}</button>`:`<div class="eunit empty-e"><span class="qmark">?</span><small>합류 대기</small></div>`).join('')}</div>
 <div class="mini-combos">${p.matches.map(m=>`<span>${axisLabels[m.axis]} ${comboLabels[m.kind]}</span>`).join('')}${p.compound?`<span class="gold">${comboLabels[p.compound.kind]}</span>`:''}</div>
 <div class="enemy-move" id="enemy-move" hidden></div></section>`;
}
function verdictText(r){return r.difference>0?`상대에게 ${r.damageToEnemy} 피해`:r.difference<0?`우리가 ${r.damageToPlayer} 피해`:'동점 · 피해 없음';}
const axisKo={element:'속성',weapon:'무기',race:'종족'};
function affinityStrip(){
 const r=reading();
 return `<button type="button" class="aff" id="aff" data-action="affinity" aria-label="상성 설명 보기"><span class="aff-title">상성</span>${r.player.affinity.axes.map((a,i)=>{const e=r.enemy.affinity.axes[i],cls=a.multiplier>e.multiplier?'win':a.multiplier<e.multiplier?'lose':'';return `<span class="aff-axis ${cls}"><small>${axisKo[a.axis]}</small><b>×${number(a.multiplier)}</b><em>상대 ×${number(e.multiplier)}</em></span>`;}).join('')}</button>`;
}
function duel(){
 const r=reading(),p=r.player;
 return `<button type="button" class="duel" id="duel" data-action="breakdown" aria-label="점수 계산 내역 보기">
 <div class="formula"><span class="chips"><small>기초</small><b id="chips">${number(p.subtotal)}</b></span><span class="op">×</span><span class="mult"><small>배율</small><b id="mult">${number(p.totalMultiplier)}</b><i class="mult-sub" id="mult-sub">효과 ×${number(p.multiplier)} · 상성 ×${number(p.affinity.total)}</i></span><span class="op">=</span><span class="score"><small>${state.phase==='attach'?'예상 점수':'우리 점수'}</small><b id="my-score">${p.score}</b></span></div>
 <div class="duel-foot"><span class="foe">상대 점수<b id="foe-score">${r.enemy.score}</b></span><span class="verdict ${r.difference>0?'good':r.difference<0?'bad':''}" id="verdict">${verdictText(r)}</span></div>
 <div class="preview-line" id="preview-line"></div></button>`;
}
function playerUnit(u,slot,r){
 let cls='',badge='';
 if(selected&&state.phase==='attach'){const pv=previewFor(slot,selected);
  if(pv.reason){cls='no';badge=`<span class="delta no">${shortReason[pv.reason]??'불가'}</span>`;}
  else{const d=pv.reading.player.score-r.player.score;cls='ok';badge=`<span class="delta ${d>0?'up':d<0?'down':''}">${d>0?'+':''}${d}</span>`;}}
 const selCard=selected?state.battle.hand.find(x=>x.instanceId===selected):null,selDef=selCard?.stickerDefId?byId(c.stickers,selCard.stickerDefId):null;
 if(!u)return `<button type="button" class="punit vacant ${cls} ${fx?.attached===slot?'slap':''}" data-action="attach" data-slot="${slot}" aria-label="빈 자리 ${slot+1}">${badge}<span class="vacant-mark">+</span><span class="uname">빈 자리</span><span class="recipe">캐릭터 카드</span></button>`;
 const recipe=recipeFor(u,c),eff=recipe?r.player.effects.find(x=>x.sourceInstanceId===u.instanceId):null;
 return `<button type="button" class="punit ${cls} ${fx?.attached===slot?'slap':''}" data-action="attach" data-slot="${slot}" aria-label="${nameOf(u.characterDefId)}${selected?'에게 놓기':' 정보'}">${badge}<span class="pow" title="개인 전투력">${unitPower(u,c)}</span><canvas data-render="${u.instanceId}"></canvas>${gearBadges(u)}${starPips(u)}<span class="uname">${nameOf(u.characterDefId)}</span>${recipe?`<span class="recipe ${eff?.active?'on':''}">${recipe.name}${eff?.active?' '+effShort(eff):''}</span>`:''}</button>`;
}
function zoneBadge(slot,eslot,r){const pv=previewFor(slot,selected,eslot);if(pv.reason)return {cls:'no',html:`<span class="zd no">${shortReason[pv.reason]??'불가'}</span>`};const d=pv.reading.player.score-r.player.score;return {cls:'ok',html:`<span class="zd ${d>0?'up':d<0?'down':''}">${d>0?'+':''}${d}</span>`};}
function elementZones(u,slot,r){
 const w=zoneBadge(slot,'weapon',r),b=zoneBadge(slot,'body',r);
 return `<div class="punit split ${fx?.attached===slot?'slap':''}"><span class="pow">${unitPower(u,c)}</span><canvas data-render="${u.instanceId}"></canvas>${gearBadges(u)}${starPips(u)}<span class="uname">${nameOf(u.characterDefId)}</span>
 <button type="button" class="ez top ${w.cls}" data-action="attach" data-slot="${slot}" data-eslot="weapon" aria-label="${nameOf(u.characterDefId)} 무기에 붙이기"><span class="ez-l">무기에</span>${w.html}</button>
 <button type="button" class="ez bottom ${b.cls}" data-action="attach" data-slot="${slot}" data-eslot="body" aria-label="${nameOf(u.characterDefId)} 몸에 붙이기"><span class="ez-l">몸에</span>${b.html}</button></div>`;
}
function playerZone(){const b=state.battle,r=reading();return `<section class="player-zone"><div class="zone-head"><strong>${uiIcon('sword')} 우리 원정대</strong>${hpBar(b.player.hp,c.balance.teamHp,'player')}</div><div class="party">${b.player.characters.map((u,slot)=>playerUnit(u,slot,r)).join('')}</div></section>`;}
function comboTray(team){
 const p=calculateTeamPower(team,c),burst=new Set((fx?.changes??[]).filter(x=>x.gain).map(x=>x.axis));
 return `<button type="button" class="tray" data-action="combos" aria-label="족보 설명 보기">${c.comboAxes.map(axis=>{const m=p.matches.find(x=>x.axis===axis);return `<span class="axis ${m?(m.complete&&['weapon','element','star'].includes(axis)?'full':'part'):''} ${burst.has(axis)?'burst':''}"><small>${axisLabels[axis]}</small><b>${m?kindShort[m.kind]:'—'}</b><em>${m?'+'+m.bonus:''}</em></span>`;}).join('')}<span class="compound ${p.compound?'on':''} ${burst.has('compound')?'burst':''}"><small>${uiIcon('seal')} 완성</small><span class="dots">${['weapon','element','star'].map(a=>`<i class="${p.matches.some(m=>m.axis===a&&m.complete)?'on':''}"></i>`).join('')}</span><em>${p.compound?'+'+p.compound.bonus:''}</em></span></button>`;
}
function hintText(){
 const b=state.battle,sel=b.hand.find(x=>x.instanceId===selected),selDef=sel?.stickerDefId?byId(c.stickers,sel.stickerDefId):null,hasChar=b.hand.some(x=>x.characterDefId),swap=b.turn>=c.characterRules.replaceFromTurn;
 if(sel?.characterDefId)return swap?'빈 자리에 놓거나, 교체할 캐릭터를 누르세요':'빈 자리에 놓으세요';
 if(selDef?.kind==='element')return `무기가 있으면 조합 효과, 없으면 중첩당 전투력 +${c.balance.bodyElementPower}`;
 if(sel)return '숫자는 붙였을 때 점수 변화예요';
 if(b.actionsUsed>=c.balance.attachLimit)return '다 붙였어요. 전투를 시작하세요';
 if(hasChar)return swap?'교체 턴! 스티커는 새 캐릭터로 옮겨져요':'캐릭터 카드를 빈 자리에 놓으세요';
 return '스티커를 끌어서 캐릭터에 붙이세요';
}
function handDock(){
 const b=state.battle,left=c.balance.attachLimit-b.actionsUsed;
 return `<footer class="dock"><div class="hand-head"><span class="hint" id="hint">${hintText()}</span><span class="uses" aria-label="남은 붙이기 ${left}회">${Array.from({length:c.balance.attachLimit},(_,i)=>`<i class="${i<left?'on':''}"></i>`).join('')}</span></div>
 <div class="hand">${b.hand.length?b.hand.map((card,i,arr)=>handCard(card,i,arr.length,left<=0)).join(''):'<p class="empty">손패가 없어요</p>'}</div>
 <div class="actions"><button type="button" class="deck-mini" data-action="deck" aria-label="덱 보기"><b>${b.drawPile.length}</b><small>${uiIcon('cards')} 남은 덱</small></button><button type="button" class="go" data-action="end">${b.actionsUsed===0?'붙이지 않고 전투':'전투!'}</button></div></footer>`;
}
function stepItems(a){
 const b=a.base,items=[],core=b.base+b.weapons+b.stars+b.elements;
 items.push(`<li class="add" data-add="${core}">캐릭터·장비<b>+${core}</b></li>`);
 if(b.combos)items.push(`<li class="add" data-add="${b.combos}">족보<b>+${b.combos}</b></li>`);
 if(b.growth)items.push(`<li class="add" data-add="${b.growth}">누적<b>+${number(b.growth)}</b></li>`);
 for(const e of a.effects){
  if(!e.active){items.push(`<li class="off">${e.name}</li>`);continue;}
  if(e.operation==='add')items.push(`<li class="add" data-add="${e.amount}">${e.name}<b>+${number(e.amount)}</b></li>`);
  else if(e.operation==='multiply')items.push(`<li class="mul" data-mul="${e.amount}">${e.name}<b>×${number(e.amount)}</b></li>`);
  else items.push(`<li class="grow">${e.name}<b>다음 턴 +${number(e.amount)}</b></li>`);
 }
  for(const x of a.affinity.axes)if(x.multiplier>1)items.push(`<li class="mul aff-step" data-mul="${x.multiplier}">${axisKo[x.axis]} 상성<b>×${number(x.multiplier)}</b></li>`);
 return items.join('');
}
function resolveDock(){
 const b=state.battle;
 if(state.phase!=='resolve')return '<footer class="dock"><ul class="steps"></ul></footer>';
 return `<footer class="dock"><ul class="steps" id="steps">${stepItems(b.lastCombat.player)}</ul><p class="skip-hint" id="skip-hint">화면을 누르면 바로 결과를 봐요</p><button type="button" class="go" data-action="finish" id="finish">${b.outcome?'결과 보기':'다음 턴'}</button></footer>`;
}
function outcomeOverlay(){
 if(state.phase!=='battle_result')return '';
 const b=state.battle,win=b.outcome==='win',last=state.run.stageIndex===c.scenarios.length-1;
 const reason=b.turn>=c.balance.maxTurns&&b.player.hp>0&&b.enemy.hp>0?`${c.balance.maxTurns}턴이 끝나 남은 체력으로 판정했어요.`:win?'상대 체력을 모두 깎았어요.':b.outcome==='lose'?'우리 원정대의 체력이 바닥났어요.':'양쪽 체력이 같아요.';
 return `<div class="over ${b.outcome}"><div class="over-card"><h2>${win?'승리!':b.outcome==='lose'?'패배':'무승부'}</h2><p>${reason}<br>우리 ${b.player.hp} : 상대 ${b.enemy.hp}</p><button type="button" class="go" data-action="continue">${win&&!last?'보상 고르기':'원정 결과 보기'}</button></div></div>`;
}
function renderBattle(){
 const b=state.battle;
 return stageTop(`<b>전투 ${state.run.stageIndex+1}</b><span class="turn">${b.turn}/${c.balance.maxTurns}턴</span>`)+
 `<main class="battle">${enemyZone()}${affinityStrip()}${duel()}${playerZone()}${comboTray(b.player)}</main>${state.phase==='attach'?handDock():resolveDock()}${outcomeOverlay()}`;
}

/* ── 타이틀 ── */
function renderTitle(){
 const t=c.characterRules.drawTurns,first=t.filter(x=>x<c.characterRules.replaceFromTurn),swap=t.filter(x=>x>=c.characterRules.replaceFromTurn);
 return `<header class="top"><div class="logo"><b>스티커 원정대</b><small>붙여서 완성하는 판타지</small></div>${toolsNav()}</header>
 <main class="title"><div class="title-art">${['char_human_warrior','char_elf_archer','char_dwarf_mage'].map(id=>`<canvas data-def-render="${id}"></canvas>`).join('')}</div>
 <p class="lead">동료는 전투 중에 무작위로 찾아와요.<br>스티커를 붙여 족보를 완성하고, 점수로 상대를 이기세요.</p>
 <ol class="flow"><li><b>${first[0]}-${first[first.length-1]}턴</b><span>매 턴 캐릭터 카드 1장. 빈 자리에 놓아 동료를 모아요.</span></li><li><b>${first[first.length-1]+1}-${swap[0]-1}턴</b><span>스티커로 무기·속성·별을 채워요.</span></li><li><b>${swap[0]}-${swap[swap.length-1]}턴</b><span>캐릭터 카드로 교체 가능. 붙인 스티커는 그대로 옮겨져요.</span></li></ol>
 <p class="note-dark">상대의 속성·무기·종족을 보고 상성을 맞추면 배율이 올라가요.<br>배치와 교체도 행동 ${c.balance.attachLimit}회에 포함돼요.</p></main>
 <footer class="dock"><button type="button" class="go" data-action="start">원정 시작</button></footer>`;
}

/* ── 보상·결과 ── */
function deckGroups(){const groups=new Map();state.run.deckDefIds.forEach((id,index)=>{if(!groups.has(id))groups.set(id,{index,count:0});groups.get(id).count++;});return [...groups];}
function renderReward(){
 const ph=state.phase,next=c.scenarios[state.run.stageIndex+1];let body='',dock='';
 if(ph==='reward_pick'){body=`<h2>보상 스티커</h2><p class="lead">1장을 골라 덱에 넣으세요.</p><div class="reward-hand">${state.rewardOptions.map((id,i)=>stickerCard(id,{action:'reward',i,n:3})).join('')}</div>`;}
 else if(ph==='reward_remove'){body=`<h2>덱 정리</h2><p class="lead">빼고 싶은 스티커를 누르면 1장만 빠져요.<br>현재 덱 ${state.run.deckDefIds.length}장</p><div class="deck-grid">${deckGroups().map(([id,g])=>stickerCard(id,{action:'remove',count:g.count,extra:`data-index="${g.index}"`})).join('')}</div>`;dock='<footer class="dock"><button type="button" class="ghost" data-action="skip">빼지 않고 넘어가기</button></footer>';}
 else{body=`<h2>준비 완료</h2><p class="lead">체력과 덱은 복원되고, 붙인 스티커와 별은 초기화돼요.<br>누적 공격력 +${number(state.run.growth)}는 그대로 가져가요.</p><div class="next-foe"><small>다음 상대</small><b>${next.name}</b></div>`;dock=`<footer class="dock row"><button type="button" class="ghost" data-action="deck">덱 ${state.run.deckDefIds.length}장</button><button type="button" class="go" data-action="next-battle">다음 전투</button></footer>`;}
 return stageTop(`<b>전투 ${state.run.stageIndex+1} 승리</b>`)+`<main class="reward"><div class="reward-deck">${uiIcon('cards')} 원정 덱 · ${state.run.deckDefIds.length}장</div>${body}</main>${dock}`;
}
function renderRunResult(){
 const b=state.battle,win=b.outcome==='win'&&state.run.stageIndex===c.scenarios.length-1,n=state.run.stageIndex+1;
 return stageTop()+`<main class="result"><h2 class="${win?'':'lose'}">${win?'원정 성공':'원정 실패'}</h2><p class="lead">${win?'세 전투를 모두 이겼어요.':b.outcome==='draw'?`${n}번째 전투가 무승부로 끝났어요.`:`${n}번째 전투에서 졌어요.`}<br>최종 덱 ${state.run.deckDefIds.length}장</p><div class="party">${members(b.player).map(u=>`<div class="punit static"><canvas data-render="${u.instanceId}"></canvas>${gearBadges(u)}${starPips(u)}<span class="uname">${nameOf(u.characterDefId)}</span></div>`).join('')}</div></main><footer class="dock"><button type="button" class="go" data-action="restart">다시 편성하기</button></footer>`;
}

/* ── 렌더 ── */
function render(){
 const f=fx,p=state.phase;
 app.innerHTML=p==='title'?renderTitle():p.startsWith('reward_')?renderReward():p==='run_result'?renderRunResult():renderBattle();
 for(const canvas of app.querySelectorAll('[data-render]')){
  const id=canvas.dataset.render,unit=[...members(state.battle.player),...members(state.battle.enemy)].find(u=>u.instanceId===id);
  if(unit){if(f?.attached!==undefined&&id===`player_${f.attached}`)canvas.dataset.evolve='yes';renderCharacter(canvas,unit,c);}
 }
 paintDefs(app);
 fx=null;afterRender(f);
}
function paintDefs(root){for(const canvas of root.querySelectorAll('[data-def-render]'))renderCharacter(canvas,makeUnit('def_'+canvas.dataset.defRender,canvas.dataset.defRender,c),c);}
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
function decorateUnits(){
 for(const u of [...members(state.battle?.player??{characters:[]}),...members(state.battle?.enemy??{characters:[]})]){
  const el=app.querySelector(`canvas[data-render="${u.instanceId}"]`)?.closest('.punit,.eunit');
  if(!el)continue;
  el.dataset.rank=String(u.stars);
  if(!u.elementId)continue;
  const color=byId(c.elements,u.elementId).color,n=elementStacks(u),body=!u.weaponId;
  if(body){el.dataset.bodyElement=u.elementId;el.style.setProperty('--aura',color+'66');el.style.setProperty('--glow',(3+n*2)+'px');}
  if(n>=3){
   const field=document.createElement('span');field.className='element-fx '+u.elementId.replace('element_','')+(body?' body-fx':'');field.setAttribute('aria-hidden','true');field.style.setProperty('--element-color',color);field.innerHTML='<i></i><i></i><i></i>';el.append(field);
  }
 }
}
function launchAttack(lc){
 if(reduced||!lc.difference)return;const won=lc.difference>0,source=app.querySelector(won?'.player-zone':'.enemy-zone'),target=app.querySelector(won?'.enemy-zone':'.player-zone');if(!source||!target)return;const a=centerOf(source),b=centerOf(target),n=document.createElement('i');n.className='fx-projectile';n.style.cssText=`left:${a.x-9}px;top:${a.y-35}px;`;document.body.append(n);source.classList.add('fx-source');setTimeout(()=>source.classList.remove('fx-source'),350);animateFx(n,[{transform:'translate(0,0) scale(.4)',opacity:0},{offset:.2,transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${b.x-a.x}px,${b.y-a.y}px) scale(.6)`,opacity:1}],{duration:320});
}

function afterRender(f){
 decorateUnits();
 if(!f)return;
 if(f.attached!==undefined){
  const el=app.querySelector(`.punit[data-slot="${f.attached}"]`);if(f.delta)floatText(el,(f.delta>0?'+':'')+f.delta,f.delta>0?'up':'down');
  f.changes.forEach((ch,i)=>setTimeout(()=>burst(ch.text,!ch.gain),i*450));
 }
 if(f.turnStart)app.querySelector('.hand')?.classList.add('dealing');
 if(f.attached!==undefined){const target=app.querySelector(`.punit[data-slot="${f.attached}"]`);flyCard(f.cardSnapshot,target);particles(target);}
 if(f.rewardSnapshot){flyCard(f.rewardSnapshot,app.querySelector('.reward-deck')??app.querySelector('main'));}
 if(f.celebrate)particles(app.querySelector('.over-card')??app.querySelector('main'),'#f5c64b',24);
 if(f.turnStart&&state.battle){const b=state.battle;if(b.turn===1)banner(`전투 ${state.run.stageIndex+1}`,c.scenarios[state.run.stageIndex].name);else banner(`${b.turn}턴`,isCharTurn(b.turn)?(b.turn>=c.characterRules.replaceFromTurn?'교체 가능':'동료 합류'):'');}
 if(f.enemyMoves?.length){
  const box=document.getElementById('enemy-move');
  if(box){box.hidden=false;box.textContent='상대가 붙였어요: '+f.enemyMoves.map(m=>m.text).join(', ');setTimeout(()=>{if(box.isConnected)box.hidden=true;},3200);}
  f.enemyMoves.forEach(m=>app.querySelector(`.eunit[data-unit="${m.id}"]`)?.classList.add('moved'));
 }
 if(f.resolve&&state.phase==='resolve')playResolve();
}

/* ── 공방 연출: 기초를 쌓고, 배율을 곱하고, 점수를 찍는다 ── */
async function playResolve(){
 const b=state.battle,lc=b.lastCombat,p=lc.player,e=lc.enemy,$=id=>document.getElementById(id);
 const pend=new Set(),token={skip:false,flush(){this.skip=true;pend.forEach(fn=>fn());pend.clear();}};resolveRun=token;
 const wait=ms=>token.skip||reduced?Promise.resolve():new Promise(res=>{const fin=()=>{clearTimeout(t);pend.delete(fin);res();},t=setTimeout(fin,ms);pend.add(fin);});
 const count=async(el,from,to,ms)=>{const n=8;for(let i=1;i<=n&&!token.skip;i++){el.textContent=number(Math.round(from+(to-from)*i/n));await wait(ms/n);}el.textContent=number(to);};
 const chipsEl=$('chips'),multEl=$('mult'),scoreEl=$('my-score'),foeEl=$('foe-score'),verdict=$('verdict'),finish=$('finish'),duelEl=$('duel');
 if(!chipsEl||!finish){hpHold=null;resolveRun=null;return;}
 chipsEl.textContent='0';multEl.textContent='1';const subEl=$('mult-sub');if(subEl)subEl.textContent='';scoreEl.textContent='?';foeEl.textContent='—';verdict.textContent='계산 중';verdict.className='verdict';finish.classList.add('waiting');
 const steps=[...app.querySelectorAll('#steps li:not(.off)')];steps.forEach(li=>li.classList.add('pending'));
 let chips=0,mult=1;
 await wait(250);
 for(const li of steps){
  if(token.skip)break;
  li.classList.remove('pending');li.classList.add('hit');
  const origin=app.querySelector(li.classList.contains('aff-step')?'.aff':li.textContent.includes('족보')?'.tray':'.party');if(origin&&!reduced){origin.classList.add('fx-source');setTimeout(()=>origin.classList.remove('fx-source'),420);}
  const add=Number(li.dataset.add||0),mul=Number(li.dataset.mul||1);
  if(add){await count(chipsEl,chips,chips+add,320);chips+=add;bump(chipsEl.parentElement);}
  if(mul!==1){mult*=mul;multEl.textContent=number(mult);bump(multEl.parentElement,true);if(!reduced){app.classList.remove('quake');void app.offsetWidth;app.classList.add('quake');}}
  await wait(280);
 }
 steps.forEach(li=>li.classList.remove('pending'));
 chipsEl.textContent=number(p.subtotal);multEl.textContent=number(p.totalMultiplier);
 await wait(180);
 await count(scoreEl,0,p.score,480);scoreEl.textContent=p.score;scoreEl.classList.add('slam');if(p.multiplier>=2)duelEl.classList.add('blaze');
 await wait(450);
 foeEl.textContent=e.score;bump(foeEl);
 await wait(350);
 verdict.textContent=verdictText(lc);verdict.className='verdict '+(lc.difference>0?'good':lc.difference<0?'bad':'');
 launchAttack(lc);await wait(320);if(!token.skip&&lc.difference)particles(app.querySelector(lc.difference>0?'.enemy-zone':'.player-zone'),lc.difference>0?'#f5c64b':'#ef6a5b');
 hpHold=null;
 setHp('enemy',b.enemy.hp,c.scenarios[state.run.stageIndex].hp,lc.damageToEnemy);
 setHp('player',b.player.hp,c.balance.teamHp,lc.damageToPlayer);
 if(subEl)subEl.textContent=`효과 ×${number(p.multiplier)} · 상성 ×${number(p.affinity.total)}`;
 finish.classList.remove('waiting');$('skip-hint')?.remove();resolveRun=null;
}
function setHp(side,hp,max,dmg){
 const bar=app.querySelector(`[data-hp="${side}"]`),num=app.querySelector(`[data-hpnum="${side}"]`);if(!bar)return;
 bar.style.width=Math.max(0,hp)/max*100+'%';num.textContent=Math.max(0,hp);
 if(dmg>0){const zone=bar.closest('section');zone.classList.remove('hurt');void zone.offsetWidth;zone.classList.add('hurt');floatText(bar.closest('.hp'),'-'+dmg,'down');}
}

/* ── 드래그 미리보기 ── */
function setDuel(r,previewing){
 const $=id=>document.getElementById(id);if(!$('duel'))return;
 $('chips').textContent=number(r.player.subtotal);$('mult').textContent=number(r.player.totalMultiplier);if($('mult-sub'))$('mult-sub').textContent=`효과 ×${number(r.player.multiplier)} · 상성 ×${number(r.player.affinity.total)}`;$('my-score').textContent=r.player.score;$('foe-score').textContent=r.enemy.score;
 const v=$('verdict');v.textContent=verdictText(r);v.className='verdict '+(r.difference>0?'good':r.difference<0?'bad':'');
 $('duel').classList.toggle('previewing',previewing);
}
function preview(target){
 app.querySelectorAll('.hover').forEach(el=>el.classList.remove('hover'));
 const line=document.getElementById('preview-line');if(!line||state.phase!=='attach')return;
 if(!target||!selected){setDuel(reading(),false);line.innerHTML='';return;}
 const pv=previewFor(Number(target.dataset.slot),selected,target.dataset.eslot??'weapon');
 if(pv.reason){setDuel(reading(),false);line.innerHTML=`<span class="loss">${messages[pv.reason]}</span>`;return;}
 target.classList.add('hover');setDuel(pv.reading,true);
 const bits=comboChanges(pv.before,pv.after).map(x=>`<span class="${x.gain?'gain':'loss'}">${x.text}</span>`);
 const rec=recipeFor(pv.unit,c),oldRec=pv.old?recipeFor(pv.old,c):null;
 if(rec&&oldRec?.id!==rec.id)bits.push(`<span class="gain">${rec.name} 완성</span>`);
 else if(rec&&pv.def?.kind==='element'&&pv.old?.elementId===pv.def.payloadId)bits.push(`<span class="gain">${rec.name} ${elementStacks(pv.unit)}중첩</span>`);
 const replaced=!pv.def?null:pv.def.kind==='weapon'?pv.old.weaponId:pv.def.kind==='element'&&pv.old.elementId&&pv.old.elementId!==pv.def.payloadId?pv.old.elementId:null;
 if(replaced)bits.push(`<span class="loss">기존 ${nameOf(replaced)} 사라짐</span>`);
 if(pv.card.characterDefId&&pv.old)bits.unshift(`<span class="gain">${nameOf(pv.old.characterDefId)} → ${nameOf(pv.card.characterDefId)}, 스티커 유지</span>`);
 const base=reading(),pa=base.player.affinity.total,na=pv.reading.player.affinity.total,ea=base.enemy.affinity.total,nea=pv.reading.enemy.affinity.total;
 if(na!==pa)bits.push(`<span class="${na>pa?'gain':'loss'}">우리 상성 ×${number(pa)} → ×${number(na)}</span>`);
 if(nea!==ea)bits.push(`<span class="${nea<ea?'gain':'loss'}">상대 상성 ×${number(ea)} → ×${number(nea)}</span>`);
 line.innerHTML=bits.join('');
}

/* ── 바텀시트 ── */
function openInfo(html){document.getElementById('info-content').innerHTML=html;const d=document.getElementById('info');if(!d.open)d.showModal();}
function showRules(){openInfo(`<h2>원정 규칙</h2><ol><li>매 턴 손패 ${c.balance.drawCount}장을 받고 최대 ${c.balance.attachLimit}번 행동해요. 안 쓰고 전투해도 돼요.</li><li>${c.characterRules.drawTurns.join('·')}턴에는 손패 1장이 무작위 캐릭터 카드예요(12종, 중복 가능). 빈 자리에 놓으면 합류하고, ${c.characterRules.replaceFromTurn}턴부터는 기존 캐릭터와 교체할 수 있어요. 교체해도 붙인 무기·속성·별은 새 캐릭터로 옮겨져요. 배치·교체도 행동 1회예요.</li><li>매 전투는 빈 편성에서 시작해요. 상대도 자기 테마 덱과 캐릭터 카드로 같은 규칙을 따라요.</li><li>캐릭터마다 무기 1개, 속성 1개, 별 ${c.balance.maxStars}개까지. 같은 속성은 ${c.balance.maxElementStacks}중첩까지 쌓이고, 다른 무기·속성을 붙이면 교체돼요.</li><li>무기가 있는 캐릭터의 속성은 무기와 조합 효과를 만들어요. 무기 없이 속성만 있으면 중첩당 전투력 +${c.balance.bodyElementPower}. 나중에 무기를 받으면 조합 효과로 바뀌어요.</li><li>상성: 속성·무기·종족마다 내가 이기는 쌍 1개당 +${c.balance.affinityPercent}%. 세 축의 배율을 곱해요.</li><li>점수는 <b>기초 × 배율</b>. 기초는 캐릭터·장비 전투력, 족보, 누적 공격력, 가산 효과의 합이에요. 배율은 조합 효과 배율 × 상성 배율이에요.</li><li>양쪽 점수를 비교해 높은 쪽이 차이만큼 피해를 줘요. 동점은 피해 없음.</li><li>${c.balance.maxTurns}턴이 끝나면 남은 체력이 많은 쪽이 이겨요.</li><li>총 ${c.scenarios.length}전투. 이기면 스티커 1장을 얻고, 원하면 1장을 뺄 수 있어요. 다음 전투엔 체력과 덱이 복원되고 붙인 스티커는 초기화돼요.</li><li>상대는 턴 시작 때 먼저 행동하고, 무엇을 했는지 알려줘요.</li></ol><p class="note">현재 수치는 재미와 균형 확인용 임시값입니다.</p>`);}
function showAffinity(){
 const cyc=axis=>{const m=c.affinity.beats[axis],start=Object.keys(m)[0];let k=start,s=[nameOf(k)];do{k=m[k];s.push(nameOf(k));}while(k!==start);return s.join(' > ');};
 const r=state.battle?reading():null;
 openInfo(`<h2>상성</h2><p>양 팀의 속성·무기·종족을 모두 짝지어, 내가 이기는 쌍 1개마다 +${c.balance.affinityPercent}%. 축마다 계산한 배율을 곱해요.</p><table class="table"><tr><td>속성</td><td>${cyc('element')}</td></tr><tr><td>무기</td><td>${cyc('weapon')}</td></tr><tr><td>종족</td><td>${cyc('race')}</td></tr></table><p class="note">속성은 중첩 수만큼 세요. 예: 우리 불 2 대 상대 번개 2면 불이 번개를 이기는 쌍이 4개라 +40%.</p>${r?`<h3 class="sheet-h">지금</h3><table class="table">${r.player.affinity.axes.map((a,i)=>`<tr><td>${axisKo[a.axis]}</td><td>우리 ${a.pairs}쌍 ×${number(a.multiplier)} · 상대 ${r.enemy.affinity.axes[i].pairs}쌍 ×${number(r.enemy.affinity.axes[i].multiplier)}</td></tr>`).join('')}</table>`:''}`);
}
function showCombos(){openInfo(`<h2>족보</h2><p>종족·직업·무기·속성·별 5개 항목을 3명 기준으로 비교해요. 항목마다 가장 높은 족보 하나만 적용돼요.</p><table class="table"><tr><td>페어</td><td>같은 값 2명</td><td>+${c.balance.pairBonus}</td></tr><tr><td>컬렉션</td><td>3명 모두 다름</td><td>+${c.balance.collectionBonus}</td></tr><tr><td>1·2·3</td><td>별 1개, 2개, 3개</td><td>+${c.balance.collectionBonus}</td></tr><tr><td>트리플</td><td>3명 모두 같음</td><td>+${c.balance.tripleBonus}</td></tr></table><h3 class="sheet-h">완성 보너스</h3><p>무기·속성·별에서 3명짜리 족보(컬렉션·1·2·3·트리플)를 만들면 금색으로 표시돼요. 2개 항목이면 더블 +${c.balance.doubleBonus}, 3개 모두면 풀 +${c.balance.fullBonus}.</p><p class="note">빈 칸과 별 0개는 족보에서 빠져요.</p>`);}
function showRecipes(){openInfo(`<h2>무기 조합</h2><p>무기와 속성을 같은 캐릭터에 붙이면 효과가 생겨요. 같은 속성을 또 붙이면 효과가 강해져요.</p><div class="recipe-list">${c.weaponRecipes.map(r=>`<article><img src="${c.assets[r.assetId].file}" alt=""/><b>${r.name}</b><small>${nameOf(r.weaponId)} + ${nameOf(r.elementId)}</small><p>${effectDescription(r)}</p></article>`).join('')}</div>`);}
function inspect(id){
 const u=[...members(state.battle.player),...members(state.battle.enemy)].find(x=>x.instanceId===id);if(!u)return;
 const d=byId(c.characters,u.characterDefId),rec=recipeFor(u,c);
 openInfo(`<h2>${nameOf(d.id)}</h2><p class="sub">${id.startsWith('enemy_')?'상대 팀':'우리 팀'}</p><table class="table"><tr><td>기본</td><td>${d.basePower}</td></tr><tr><td>무기</td><td>${u.weaponId?`${nameOf(u.weaponId)} +${byId(c.weapons,u.weaponId).powerBonus}`:'없음'}</td></tr><tr><td>속성</td><td>${u.elementId?`${nameOf(u.elementId)} ${elementStacks(u)}중첩${u.weaponId?' · 무기와 조합':` · 전투력 +${elementPower(u,c)}`}`:'없음'}</td></tr><tr><td>별</td><td>${u.stars}개 +${u.stars*c.balance.starPower}</td></tr><tr><td><b>개인 전투력</b></td><td><b>${unitPower(u,c)}</b></td></tr></table>${rec?`<div class="recipe-card"><b>${rec.name}</b><p>${effectDescription(rec,u)}</p></div>`:'<p class="note">무기와 속성을 함께 붙이면 조합 효과가 생겨요.</p>'}`);
}
function showBreakdown(){
 const r=reading(),rows=(a)=>`<table class="table"><tr><td>캐릭터·무기·별</td><td>${a.base.base+a.base.weapons+a.base.stars}</td></tr><tr><td>속성 전투력 (무기 없음)</td><td>+${a.base.elements}</td></tr><tr><td>족보</td><td>+${a.base.combos}</td></tr><tr><td>누적 공격력</td><td>+${number(a.base.growth)}</td></tr><tr><td>효과 가산</td><td>+${number(a.flat)}</td></tr><tr><td><b>기초</b></td><td><b>${number(a.subtotal)}</b></td></tr><tr><td>효과 배율</td><td>×${number(a.multiplier)}</td></tr><tr><td>상성 배율</td><td>×${number(a.affinity.total)} (${a.affinity.axes.map(x=>`${axisKo[x.axis]} ${x.pairs}쌍`).join(', ')})</td></tr><tr><td><b>점수</b></td><td><b>${a.score}</b></td></tr></table>${a.effects.length?`<p class="note">${a.effects.map(e=>`${e.name} ${e.stacks}중첩: ${e.active?effShort(e):'조건 미충족'}`).join('<br>')}</p>`:''}${a.growthGain?`<p class="note">이번 공방 뒤 누적 +${number(a.growthGain)}</p>`:''}`;
 openInfo(`<h2>점수 계산</h2><p class="sub">${state.phase==='attach'?'지금 전투하면 이렇게 계산돼요.':'이번 공방의 확정 점수예요.'}</p><h3 class="sheet-h">우리 팀</h3>${rows(r.player)}<h3 class="sheet-h">상대 팀</h3>${rows(r.enemy)}`);
}
function showDeck(){openInfo(`<h2>덱 ${state.run.deckDefIds.length}장</h2><p class="sub">원정 내내 유지되는 덱이에요.</p><table class="table">${deckGroups().map(([id,g])=>`<tr><td>${nameOf(byId(c.stickers,id).nameKey)}</td><td>${g.count}장</td></tr>`).join('')}</table>`);}

/* ── 입력 ── */
let pointer=null,ghost=null,suppressClick=false;
function attach(slot,eslot='weapon'){const card=state.battle.hand.find(x=>x.instanceId===selected);if(!card)return;const ok=card.characterDefId?command('PlaceCharacter',{cardInstanceId:selected,targetSlot:slot}):command('AttachSticker',{stickerInstanceId:selected,targetInstanceId:`player_${slot}`,elementSlot:eslot});if(!ok){selected=null;render();}}
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
 case 'inspect':inspect(el.dataset.unit);break;
 case 'start':command('StartRun',{seed:crypto.getRandomValues(new Uint32Array(1))[0]});break;
 case 'select':if(state.battle.actionsUsed>=c.balance.attachLimit){toast(messages.limit);return;}selected=selected===el.dataset.card?null:el.dataset.card;render();break;
 case 'attach':{if(state.phase!=='attach')break;const slot=Number(el.dataset.slot),u=state.battle.player.characters[slot];if(selected)attach(slot,el.dataset.eslot??'weapon');else if(u)inspect(u.instanceId);else toast('캐릭터 카드를 놓을 자리예요.');break;}
 case 'end':command('EndTurn');break;
 case 'finish':command('FinishResolution');break;
 case 'continue':command('ContinueResult');break;
 case 'reward':command('SelectReward',{stickerDefId:el.dataset.sticker});break;
 case 'remove':command('RemoveDeckCard',{deckIndex:Number(el.dataset.index)});break;
 case 'skip':command('SkipRemoval');break;
 case 'next-battle':command('StartNextBattle');break;
 case 'restart':command('RestartRun');break;
 case 'restart-ask':openInfo('<h2>처음부터 다시 할까요?</h2><p>지금까지의 전투와 덱이 모두 초기화돼요.</p><button type="button" class="go" id="confirm-restart" style="width:100%;margin-top:16px">처음부터 다시</button>');document.getElementById('confirm-restart').onclick=()=>{document.getElementById('info').close();command('RestartRun');};break;
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
document.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const was=pointer.dragging;cancelDrag();if(was){suppressClick=true;setTimeout(()=>suppressClick=false,0);const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-action="attach"]');if(target)attach(Number(target.dataset.slot),target.dataset.eslot??'weapon');else{selected=null;render();}}});
document.addEventListener('pointercancel',()=>{if(!pointer)return;cancelDrag();selected=null;render();});
app.addEventListener('pointerover',e=>{if(selected&&!pointer?.dragging&&state.phase==='attach')preview(e.target.closest('[data-action="attach"]'));});
app.addEventListener('focusin',e=>{if(selected&&state.phase==='attach')preview(e.target.closest('[data-action="attach"]'));});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected){cancelDrag();selected=null;render();}});
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('paused',document.hidden);if(document.hidden)cancelDrag();});
render();

return {};})();
