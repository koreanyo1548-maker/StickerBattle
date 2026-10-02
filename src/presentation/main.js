modules["src/presentation/main.mjs"]=(()=>{
const {content,byId,nameOf,validateContent}=modules["src/content/data.mjs"];
const {makeUnit,recipeFor,relationOf,growthOf,evaluateHand,handValue}=modules["src/domain/rules.mjs"];
const {initialState,blindInfo,previewAttack,requiredPlay,rerollCost,slotCost,sellValue,applyCommand}=modules["src/application/game.mjs"];
const {renderCharacter}=modules["src/rendering/compositor.mjs"];

validateContent();
const c=content,app=document.getElementById('app');
document.documentElement.style.setProperty('--art-background',`url("${c.assets.asset_background.file}")`);
// 그림은 CSS 클래스로 한 번만 등록한다. 매 렌더마다 대용량 data URI를 복제하지 않기 위함.
(()=>{const ids=[...c.weapons.map(w=>w.assetId),...c.elements.map(e=>e.assetId),'asset_star',...c.weaponRecipes.map(r=>r.assetId),...c.monsters.map(m=>m.assetId),'asset_reward_back'];const st=document.createElement('style');st.textContent=ids.map(id=>`.ic-${id}{background-image:url("${c.assets[id].file}")}`).join('');document.head.append(st);})();

// sel: 고른 손패 카드와 붙일 자리. [{uid,slot|null}] 고른 순서대로.
let state=initialState(),sel=[],serial=0,toastTimer,anim=null,pickSel=[];
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const messages={target:'붙일 캐릭터를 골라 주세요.',empty:'카드를 골라 주세요.',tooMany:`한 번에 ${c.balance.maxPlay}장까지예요.`,exactFive:'이번 보스는 정확히 5장으로만 공격해요.',card:'사용할 수 없는 카드예요.',noDiscards:'버리기를 다 썼어요.',gold:'골드가 모자라요.',full:'빈 칸이 없어요. 칸을 늘리거나 동료를 팔아 주세요.',maxSlots:'칸을 더 늘릴 수 없어요.',lastCharacter:'마지막 동료는 팔 수 없어요.',deckSize:'덱이 너무 작아져요.',boss:'보스는 건너뛸 수 없어요.',phase:'지금은 할 수 없어요.',rig:'이 캐릭터에게 맞지 않는 무기예요.',duplicate:'이미 처리한 행동이에요.'};
const fmt=v=>Number.isInteger(v)?v.toLocaleString('en-US'):String(Number(v.toFixed(2)));
const ic=(assetId,cls='')=>`<i class="ic ic-${assetId} ${cls}" aria-hidden="true"></i>`;
const members=()=>state.run.team.characters.filter(Boolean);
const elementOf=id=>id?byId(c.elements,id):null;
const monsterOf=id=>byId(c.monsters,id);
const coin=(n,cls='')=>`<span class="coin ${cls}"><i aria-hidden="true"></i>${n}</span>`;
const gem=(n,cls='')=>`<span class="gem ${cls}"><i aria-hidden="true">◆</i>${n}</span>`;
function toast(text){const el=document.getElementById('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}

/* ── 문장 ── */
const triggerText={pairHand:'같은 스티커 2장 이상이 든 족보면',elementCard:'낸 속성 스티커 1장마다',weaponCard:'낸 무기 스티커 1장마다',growth:'성장치(강화+별+속성 Lv) 1마다'};
function effectText(d){return d.effect==='chips'?`+${d.value} 칩`:d.effect==='mult'?`+${d.value} 배율`:d.trigger==='growth'?`×(1+${d.value}×성장치)`:`×${d.value}`;}
function abilityText(defId){const d=byId(c.characters,defId);return d.trigger==='growth'&&d.effect==='xmult'?`성장치마다 ×${d.value} 더 (×(1+${d.value}×성장치))`:`${triggerText[d.trigger]} ${effectText(d)}`;}
const effectKind=defId=>byId(c.characters,defId).effect;
function stickerDesc(s){const b=c.balance;return s.kind==='weapon'?`+${b.weaponChips} 칩, 강화마다 +${b.weaponPlusChips}`:s.kind==='element'?`+${b.elementChips} 칩, +Lv 배율`:`+${b.starChips}×별 Lv 칩`;}
function modBadge(mod){const m=mod&&byId(c.mods,mod);return m?`<span class="mod-tag m-${m.id}">${m.name}</span>`:'';}
const handName=id=>byId(c.hands,id).name;
function elementChip(id,extra=''){const e=elementOf(id);return e?`<span class="el-chip" style="--el:${e.color}">${ic(e.assetId)}${nameOf(id)}${extra}</span>`:'';}
const ruleChip=rule=>rule?`<div class="rule-chip"><b>⛓ ${rule.name}</b><span>${rule.text}</span></div>`:'';
const beaterOf=id=>Object.keys(c.affinity.beats).find(k=>c.affinity.beats[k]===id);

/* ── 공용 조각 ── */
function uiIcon(kind){const shapes={book:'<path d="M3 5q5-2 9 1 4-3 9-1v15q-5-2-9 0-4-2-9 0Z"/><path d="M12 6v14M6 9h3m-3 4h3m6-4h3m-3 4h3"/>',cards:'<rect x="5" y="3" width="15" height="18" rx="3"/><path d="M3 6 1 18q0 3 3 3m7-13 4 4-4 4-3-4Z"/>',crown:'<path d="m3 8 4 4 5-7 5 7 4-4-2 11H5Z"/>',people:'<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20q1-6 6-6t6 6m0-6q5 0 8 6"/>'};return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[kind]}</svg>`;}
// 좁은 화면에 맞게 아이콘만 둔다(이름은 aria-label·title).
function toolsNav(){const t=state.phase==='title',b=(a,icon,label)=>`<button data-action="${a}" aria-label="${label}" title="${label}">${uiIcon(icon)}</button>`;return `<nav class="tools compact">${b('hands','crown','족보')}${b('roster','people','동료')}${b('rules','book','규칙')}${t?'':'<button data-action="restart-ask" aria-label="처음부터 다시" title="처음부터 다시">↺</button>'}</nav>`;}
function stageTop(label=''){
 const r=state.run;if(!r)return `<header class="top">${toolsNav()}</header>`;
 const pips=Array.from({length:c.balance.anteCount},(_,a)=>`<span class="pip ${a<r.ante?'done':a===r.ante?'now':''} ${a===c.balance.anteCount-1?'boss':''}"></span>`).join('');
 return `<header class="top"><div class="stage">${pips}<b>앤티 ${Math.min(r.ante+1,c.balance.anteCount)}</b>${label?`<span class="turn">${label}</span>`:''}</div><div class="top-r">${coin(r.gold,'top-gold')}${toolsNav()}</div></header>`;
}
// 메타 재화. 런 밖에 남으므로 브라우저에 저장한다(저장이 막혀 있어도 게임은 동작한다).
const META_KEY='stickerBattle.meta.v1';
const wallet=(()=>{try{return {diamonds:0,...JSON.parse(localStorage.getItem(META_KEY)??'{}')};}catch{return {diamonds:0};}})();
function addDiamonds(n){wallet.diamonds+=n;try{localStorage.setItem(META_KEY,JSON.stringify(wallet));}catch{}}

// 스티커 카드 한 장. opts.slot: 붙일 자리(번호 배지), opts.action: data-action.
function stickerCard(card,{selected=false,slot=null,action='card',i=0,n=1,mini=false,extra=''}={}){
 const s=byId(c.stickers,card.defId),e=s.kind==='element'?byId(c.elements,s.payloadId):null;
 const rot=n>1&&!selected?(i-(n-1)/2)*2.5:0,tint=e?.color??(s.kind==='star'?'#d9a72c':'#7d6aa0');
 return `<button type="button" class="sticker k-${s.kind} ${selected?'sel':''} ${mini?'mini':''} ${card.mod?'m-'+card.mod:''} ${extra}" style="--rot:${rot}deg;--tint:${tint}" data-action="${action}" data-uid="${card.uid}" aria-pressed="${selected}">${ic(s.iconAssetId,'sicon')}<span class="sname">${nameOf(s.nameKey)}</span>${mini?'':`<span class="sdesc">${stickerDesc(s)}</span>`}${modBadge(card.mod)}${slot!=null?`<span class="tbadge">${slot+1}</span>`:''}</button>`;
}
// 장비 배지: 별 Lv, 무기 강화, 속성 Lv(블라인드 상성 표시).
function unitBadges(u,blindElementId=null){
 const e=elementOf(u.elementId),rel=relationOf(u.elementId,blindElementId,c,state.battle?.effect==='invertAffinity');
 const star=u.starLevel?`<span class="lv-star" title="별 Lv${u.starLevel}">★${u.starLevel}</span>`:'';
 const plus=u.weaponId?`<span class="lv-wpn" title="${nameOf(u.weaponId)} 강화 +${u.weaponPlus}">${ic(byId(c.weapons,u.weaponId).assetId)}+${u.weaponPlus}</span>`:'';
 const el=e?`<span class="lv-el ${rel}" style="--el:${e.color}" title="${nameOf(e.id)} Lv${u.elementLevel}">${ic(e.assetId)}<b>${u.elementLevel}</b>${rel!=='neutral'?`<i class="rel">${rel==='advantage'?'▲':'▼'}</i>`:''}</span>`:'';
 return `<span class="badges-l">${star}${plus}</span><span class="badges-r">${el}</span>`;
}
function recipeChip(u){const r=recipeFor(u,c);return r?`<span class="recipe on">${r.name}</span>`:'';}
const kindCls=defId=>`k-${effectKind(defId)}`;
// 원정대 칸. mode: battle(붙이기 대상) · static · shop(팔기·자리 이동)
function unitTile(u,slot,mode='static'){
 // 공격 연출 중에는 그 공격 때의 침묵 대상을 보여준다(공격 뒤에 다음 대상을 새로 정하므로).
 const b=state.battle,silencedSlot=anim?anim.prev.battle?.silencedSlot:b?.silencedSlot,silenced=mode==='battle'&&b?.effect==='silence'&&silencedSlot===slot;
 if(!u){
  if(mode==='shop')return `<div class="punit vacant" data-slot="${slot}"><span class="vacant-mark">+</span><span class="uname">빈 칸</span></div>`;
  return `<div class="punit vacant static" data-slot="${slot}"><span class="vacant-mark">·</span><span class="uname">빈 칸</span></div>`;
 }
 const staged=mode==='battle'?sel.filter(x=>x.slot===slot).map(x=>b.hand.find(h=>h.uid===x.uid)).filter(Boolean):[];
 const tag=mode==='battle'?'button':'div',attrs=mode==='battle'?`type="button" data-action="unit" aria-label="${nameOf(u.characterDefId)}에게 붙이기"`:`data-action="unit-info"`;
 const order=`<span class="order">${slot+1}</span>`;
 const stagedHtml=staged.length?`<span class="staged">${staged.slice(0,3).map(h=>ic(byId(c.stickers,h.defId).iconAssetId)).join('')}${staged.length>3?`<b>+${staged.length-3}</b>`:''}</span>`:'';
 const shop=mode==='shop'?`<span class="tile-ops"><button type="button" data-action="move" data-from="${slot}" data-to="${slot-1}" ${slot===0?'disabled':''} aria-label="왼쪽으로">◀</button><button type="button" data-action="move" data-from="${slot}" data-to="${slot+1}" ${slot===state.run.team.characters.length-1?'disabled':''} aria-label="오른쪽으로">▶</button><button type="button" class="sell" data-action="sell" data-slot="${slot}">팔기 ${coin(sellValue(u,c))}</button></span>`:'';
 return `<${tag} class="punit ${kindCls(u.characterDefId)} ${silenced?'silenced':''} ${staged.length?'staging':''}" ${attrs} data-slot="${slot}">${order}${unitBadges(u,b?.elementId)}<canvas data-render="${u.instanceId}"></canvas><span class="uname">${nameOf(u.characterDefId)}</span>${recipeChip(u)}<span class="ability">${effectText(byId(c.characters,u.characterDefId))}</span>${stagedHtml}${silenced?'<span class="silence-mark">침묵</span>':''}${shop}</${tag}>`;
}
function partyRow(mode){const ch=state.run.team.characters;return `<div class="party" style="--cols:${ch.length}">${ch.map((u,i)=>unitTile(u,i,mode)).join('')}</div>`;}

/* ── 선택(전투) ── */
const isSel=uid=>sel.some(x=>x.uid===uid);
const onlySlot=()=>{const ch=state.run.team.characters,idx=ch.map((u,i)=>u?i:-1).filter(i=>i>=0);return idx.length===1?idx[0]:null;};
function toggleCard(uid){
 if(isSel(uid)){sel=sel.filter(x=>x.uid!==uid);return;}
 if(sel.length>=c.balance.maxPlay){toast(messages.tooMany);return;}
 sel.push({uid,slot:onlySlot()});
}
// 캐릭터를 누르면: 대상이 없는 카드 전부를 그 캐릭터에게. 모두 대상이 있으면 마지막으로 고른 카드를 옮긴다.
function assignTo(slot){
 if(!sel.length)return false;
 const open=sel.filter(x=>x.slot==null);
 if(open.length)open.forEach(x=>x.slot=slot);else sel[sel.length-1].slot=slot;
 return true;
}
const playsFromSel=()=>sel.filter(x=>x.slot!=null).map(x=>({uid:x.uid,targetInstanceId:state.run.team.characters[x.slot].instanceId}));
const allAssigned=()=>sel.length>0&&sel.every(x=>x.slot!=null);
// 미리보기: 모두 대상이 있으면 실제 판정과 같은 함수, 아니면 족보만.
function preview(){
 const b=state.battle;if(!sel.length)return null;
 if(allAssigned())return {...previewAttack(state,playsFromSel(),c),full:true};
 const h=evaluateHand(sel.map(x=>b.hand.find(h=>h.uid===x.uid).defId),state.run.levels,c,{flat:b.effect==='flatHands'});
 return {handId:h.handId,level:h.level,chips:h.chips,mult:h.mult,score:null,full:false};
}

/* ── 커맨드 ── */
function command(type,payload={}){
 const prev=state,r=applyCommand(state,{type,commandId:`ui_${++serial}`,...payload},c);
 if(r.error){toast(messages[r.error]??'다시 시도해주세요.');return false;}
 state=r.state;
 const won=r.events.find(e=>e.type==='BlindWon');if(won)addDiamonds(won.diamonds);
 if(type==='Attack'){sel=[];anim={prev,events:r.events};render();playAttack();return true;}
 if(type==='Discard'){sel=[];render();app.querySelector('.hand')?.classList.add('dealing');return true;}
 if(['SelectBlind','LeaveShop','PickStarter','RestartRun','CashOut'].includes(type))sel=[];
 if(type==='BuyItem'&&state.phase==='deck_pick')pickSel=[];
 render();afterCommand(type,r.events);return true;
}
function afterCommand(type,events){
 for(const e of events){
  if(e.type==='HandLeveled')burst(`${handName(e.handId)} Lv${e.level}!`);
  if(e.type==='CardAdded')toast(`${nameOf(byId(c.stickers,e.card.defId).nameKey)}${e.card.mod?` (${byId(c.mods,e.card.mod).name})`:''} 스티커가 덱에 들어왔어요.`);
  if(e.type==='CharacterJoined'){const el=app.querySelector(`.punit[data-slot="${e.slot}"]`);particles(el);floatText(el,'합류!','up note');}
  if(e.type==='BlindSkipped'){const t=byId(c.tags,e.tagId);burst(`태그: ${t.name}`);toast(t.text);}
  if(e.type==='DeckEdited')toast(e.effect==='mod'?`${e.uids.length}장에 ${byId(c.mods,e.mod).name}!`:e.effect==='remove'?`${e.uids.length}장을 덱에서 뺐어요.`:'복제했어요.');
  if(e.type==='SlotAdded')burst(`칸 ${e.slots}개!`);
  if(e.type==='BlindStarted'){app.querySelector('.hand')?.classList.add('dealing');banner(byId(c.blindKinds,e.kindId).name,`목표 ${fmt(e.target)}`);}
 }
}

/* ── 타이틀 ── */
function renderTitle(){
 const b=c.balance;
 return `<header class="top"><div class="logo"><b>스티커 원정대</b><small>붙여서 키우는 판타지 덱빌딩</small></div>${toolsNav()}</header>
 <main class="title"><div class="title-art">${['char_human_warrior','char_elf_archer','char_dwarf_mage'].map(id=>`<canvas data-def-render="${id}"></canvas>`).join('')}</div>
 <p class="lead">스티커로 족보를 만들어 공격하고,<br>동료와 장비를 키워 보스를 쓰러뜨리세요.</p>
 <ol class="flow"><li><b>공격</b><span>손패 ${b.handSize}장 중 최대 ${b.maxPlay}장을 동료에게 붙여 공격해요. 붙인 스티커는 장비로 남아요.</span></li><li><b>계산</b><span>족보 칩 × 배율에 스티커와 동료 능력이 왼쪽부터 차례로 더해지고 곱해져요.</span></li><li><b>상점</b><span>골드로 동료·족보서·각인을 사서 덱과 원정대를 키워요.</span></li></ol>
 <p class="wallet">보유 ${gem(wallet.diamonds)}</p></main>
 <footer class="dock"><button type="button" class="go" data-action="start">원정 시작</button></footer>`;
}
function offerCard(defId,{action,index,price=null,sold=false,note=''}){
 const d=byId(c.characters,defId);
 return `<button type="button" class="offer ${kindCls(defId)} ${sold?'sold':''}" data-action="${action}" data-index="${index}" ${sold?'disabled':''}><canvas data-def-render="${defId}"></canvas><span class="o-body"><b>${nameOf(defId)}</b><small class="o-tags">${nameOf(d.raceId)} · ${nameOf(d.jobId)}</small><span class="o-text">${abilityText(defId)}</span>${note}</span>${price!=null?`<span class="price">${sold?'합류함':coin(price)}</span>`:''}</button>`;
}
function renderStarter(){
 return stageTop('출발 준비')+`<main class="starter"><h2>첫 동료를 고르세요</h2><p class="lead">종족은 무엇에 반응하는지, 직업은 어떻게 계산하는지를 정해요.</p>
 <div class="offers">${state.starter.map((id,i)=>offerCard(id,{action:'starter',index:i})).join('')}</div></main>`;
}

/* ── 블라인드 선택 ── */
function renderBlindSelect(){
 const r=state.run,cards=c.blindKinds.map((k,i)=>{
  const info=blindInfo(r,c,i),m=monsterOf(info.monsterId),h=state.history.find(x=>x.ante===r.ante&&x.kindId===k.id),now=i===r.blindIndex;
  const tag=info.tagId?byId(c.tags,info.tagId):null;
  return `<article class="bcard b-${k.id} ${now?'now':''} ${h?'past':''}"><header>${k.name}</header><div class="monster-slot">${ic(m.assetId,'monster-art')}</div>
  <div class="b-target"><small>목표</small><b>${fmt(info.target)}</b></div>${elementChip(info.elementId)}
  <div class="b-reward">보상 ${coin(k.gold)}</div>${info.rule?ruleChip(info.rule):tag?`<div class="b-tag"><small>건너뛰면</small><b>${tag.name}</b><span>${tag.text}</span></div>`:''}
  ${h?`<span class="b-stamp">${h.outcome==='skip'?'건너뜀':'격파'}</span>`:''}</article>`;
 }).join('');
 const info=blindInfo(r,c);
 return stageTop('블라인드 선택')+`<main class="blinds"><div class="bcards">${cards}</div>
 <section class="zone"><div class="zone-head"><strong>${uiIcon('people')} 원정대</strong><button type="button" class="link" data-action="deck">${uiIcon('cards')} 덱 ${r.deck.length}장</button></div>${partyRow('static')}</section></main>
 <footer class="dock row">${info.kind.skippable?`<button type="button" class="ghost-go" data-action="skip">건너뛰기<small>${byId(c.tags,info.tagId).name}</small></button>`:''}<button type="button" class="go ${info.kind.id==='boss'?'fight':''}" data-action="select-blind">도전!<small>${info.kind.name} · 목표 ${fmt(info.target)}</small></button></footer>`;
}

/* ── 전투 ── */
function foeZone(damage){
 const b=state.battle,m=monsterOf(b.monsterId),rule=b.ruleId?byId(c.bossRules,b.ruleId):null,hp=Math.max(0,b.target-damage),beater=beaterOf(b.elementId);
 return `<section class="foe-zone ${b.kindId==='boss'?'boss':''}" id="blind-zone"><div class="monster-slot" aria-hidden="true">${ic(m.assetId,'monster-art')}</div>
 <div class="foe-info"><div class="blind-name"><strong>${nameOf(m.nameKey)}</strong><em class="kind-tag">${byId(c.blindKinds,b.kindId).name}</em></div>
 <div class="foe-el">${elementChip(b.elementId)}${beater?`<small>▲ ${nameOf(beater)} 유리</small>`:''}</div>
 <div class="hp" aria-label="몬스터 HP ${hp} / ${b.target}"><i id="hp" style="width:${hp/b.target*100}%"></i><span id="hp-text">HP ${fmt(hp)} / ${fmt(b.target)}</span></div>
 ${ruleChip(rule)}</div></section>`;
}
function scoreBoard(view){
 const b=state.battle;
 const name=view?.handId?`${handName(view.handId)} <small>Lv${view.level}</small>`:'카드를 고르세요';
 const score=view?.score!=null?fmt(view.score):'?';
 return `<section class="duel" id="duel"><div class="hand-name" id="hand-name">${name}</div>
 <div class="formula"><span class="chips"><small>칩</small><b id="chips">${view?fmt(view.chips):0}</b></span><span class="op">×</span><span class="mult"><small>배율</small><b id="mult">${view?fmt(view.mult):0}</b></span><span class="op">=</span><span class="score"><small>${anim?'이번 공격':'예상 점수'}</small><b id="my-score">${anim?'0':score}</b></span></div>
 <div class="counters"><span class="cnt atk"><b>${b.attacksLeft}</b>공격</span><span class="cnt dis"><b>${b.discardsLeft}</b>버리기</span><button type="button" class="cnt deck" data-action="deck"><b>${b.drawPile.length}</b>덱</button>${view&&!view.full&&!anim?'<span class="need">캐릭터를 눌러 붙일 대상을 정하세요</span>':''}</div></section>`;
}
function handDock(){
 const b=state.battle,n=b.hand.length,need=requiredPlay(state,c);
 const canAttack=allAssigned()&&(!need||sel.length===need),canDiscard=sel.length>0&&b.discardsLeft>0;
 if(anim)return `<footer class="dock"><div class="hand resolving"><p class="empty">공격 중… 화면을 누르면 바로 결과를 봐요</p></div><div class="actions" id="anim-actions"></div></footer>`;
 return `<footer class="dock"><div class="hand">${b.hand.map((card,i)=>{const s=sel.find(x=>x.uid===card.uid);return stickerCard(card,{selected:!!s,slot:s?.slot??null,i,n});}).join('')}</div>
 <div class="actions"><button type="button" class="ghost-go discard" data-action="discard" ${canDiscard?'':'disabled'}>버리기<small>${b.discardsLeft}회 남음</small></button><button type="button" class="go fight" data-action="attack" ${canAttack?'':'disabled'}>공격${sel.length?` ${sel.length}장`:''}${need?`<small>정확히 ${need}장</small>`:''}</button></div></footer>`;
}
function renderBattle(){
 const b=state.battle,prevDamage=anim?anim.prev.battle.damage:b.damage;
 const view=anim?{handId:b.lastAttack.handId,level:b.lastAttack.level,chips:0,mult:0,full:true}:preview();
 const played=anim?`<div class="played" id="played">${b.lastAttack.plays.map((p,i)=>stickerCard({uid:p.uid,defId:p.defId,mod:p.mod},{action:'none',mini:true,slot:state.run.team.characters.findIndex(u=>u?.instanceId===p.targetInstanceId),extra:'pending'})).join('')}</div>`:'';
 return stageTop(byId(c.blindKinds,b.kindId).name)+`<main class="battle">${foeZone(prevDamage)}${scoreBoard(view)}${played}<section class="zone">${partyRow('battle')}</section></main>${handDock()}`;
}

/* ── 정산·상점·덱 편집 ── */
function renderCashout(){
 const b=state.battle,co=b.cashout,m=monsterOf(b.monsterId),final=state.run.ante===c.balance.anteCount-1&&b.kindId==='boss';
 return stageTop('정산')+`<main class="cashout"><div class="monster-slot defeated-art">${ic(m.assetId,'monster-art')}</div><h2>격파!</h2><p class="lead">${nameOf(m.nameKey)} · ${fmt(b.damage)} / ${fmt(b.target)}</p>
 <table class="table cash"><tr><td>${byId(c.blindKinds,b.kindId).name} 보상</td><td>${coin(co.blindGold)}</td></tr><tr><td>남은 공격 ${b.attacksLeft}회</td><td>${coin(co.attackGold)}</td></tr><tr><td>이자 (${c.economy.interestPer}골드당 1, 최대 ${c.economy.interestMax})</td><td>${coin(co.interest)}</td></tr><tr class="sum"><td>합계</td><td>${coin(co.total)}</td></tr></table>
 <p class="wallet">다이아몬드 ${gem('+'+b.diamonds)}</p></main>
 <footer class="dock"><button type="button" class="go" data-action="cashout"><span class="go-label">${final?'원정 완료!':`${coin(co.total)} 받고 상점으로`}</span></button></footer>`;
}
const itemSymbol={handLevel:'📖',addSticker:'＋',mod:'✦',remove:'✂',copy:'⧉'};
function renderShop(){
 const sh=state.shop,r=state.run,slot=slotCost(r,c),cost=rerollCost(state,c);
 const chars=sh.characters.map((o,i)=>offerCard(o.defId,{action:'buy-char',index:i,price:o.cost,sold:o.sold,note:sh.half&&!o.sold?'<small class="o-sale">반값</small>':''})).join('');
 const items=sh.items.map((o,i)=>{const it=byId(c.items,o.itemId);return `<button type="button" class="offer item ${o.sold?'sold':''}" data-action="buy-item" data-index="${i}" ${o.sold?'disabled':''}><span class="i-sym">${itemSymbol[it.effect]}</span><span class="o-body"><b>${it.name}</b><span class="o-text">${it.text}</span></span><span class="price">${o.sold?'구매함':coin(o.cost)}</span></button>`;}).join('');
 const next=blindInfo(r,c);
 return stageTop('상점')+`<main class="shop">
 <section class="zone"><div class="zone-head"><strong>${uiIcon('people')} 원정대 <small>왼쪽부터 발동</small></strong><button type="button" class="link" data-action="deck">${uiIcon('cards')} 덱 ${r.deck.length}장</button></div>${partyRow('shop')}
 ${slot!=null?`<button type="button" class="slot-buy" data-action="buy-slot">칸 늘리기 (${r.team.characters.length} → ${r.team.characters.length+1}) ${coin(slot)}</button>`:''}</section>
 <section class="zone"><div class="zone-head"><strong>동료</strong><button type="button" class="link reroll" data-action="reroll">↻ 새로고침 ${cost?coin(cost):'<b>무료</b>'}${sh.freeRerolls>1?` ×${sh.freeRerolls}`:''}</button></div><div class="offers">${chars}</div></section>
 <section class="zone"><div class="zone-head"><strong>물건</strong></div><div class="offers">${items}</div></section></main>
 <footer class="dock"><button type="button" class="go" data-action="leave-shop">다음: ${next.kind.name} <small>목표 ${fmt(next.target)}</small></button></footer>`;
}
const deckSort=(a,b)=>c.stickers.findIndex(s=>s.id===a.defId)-c.stickers.findIndex(s=>s.id===b.defId)||String(a.mod).localeCompare(String(b.mod));
function renderDeckPick(){
 const o=state.shop.items[state.pick.index],it=byId(c.items,o.itemId),deck=[...state.run.deck].sort(deckSort);
 return stageTop('덱 편집')+`<main class="deckpick"><h2>${it.name}</h2><p class="lead">${it.text} · ${pickSel.length}/${it.pick}장 골랐어요</p>
 <div class="deckgrid">${deck.map(card=>stickerCard(card,{action:'pick-card',selected:pickSel.includes(card.uid),mini:true})).join('')}</div></main>
 <footer class="dock row"><button type="button" class="ghost-go" data-action="cancel-pick">취소</button><button type="button" class="go" data-action="confirm-pick" ${pickSel.length?'':'disabled'}><span class="go-label">적용 ${coin(o.cost)}</span></button></footer>`;
}

/* ── 결과 ── */
function renderRunResult(){
 const win=state.run.result==='win',h=state.history.filter(x=>x.outcome!=='skip'),last=h[h.length-1];
 return stageTop()+`<main class="result"><h2 class="${win?'':'lose'}">${win?'원정 성공':'원정 실패'}</h2><p class="lead">${win?`앤티 ${c.balance.anteCount} 보스까지 모두 쓰러뜨렸어요.`:`앤티 ${last.ante+1} ${byId(c.blindKinds,last.kindId).name}에서 ${fmt(last.score)} / ${fmt(last.target)}로 멈췄어요.`}</p>
 <table class="table history">${state.history.map(x=>`<tr class="${x.outcome}"><td>앤티 ${x.ante+1} ${byId(c.blindKinds,x.kindId).name}</td><td>${x.outcome==='skip'?`건너뜀 · ${byId(c.tags,x.tagId).name}`:`${fmt(x.score)} / ${fmt(x.target)}`}</td></tr>`).join('')}</table>
 <p class="wallet">이번 원정 ${gem('+'+(state.run.diamonds??0))} · 보유 ${gem(wallet.diamonds)}</p>
 ${partyRow('static')}</main><footer class="dock"><button type="button" class="go" data-action="restart">다시 원정</button></footer>`;
}

/* ── 신규 유저 안내 ── */
// 상황이 처음 생길 때 한 번만 뜨는 팁. 본 팁은 브라우저에 기억한다.
const TIP_KEY='stickerBattle.tips.v2';
const seenTips=(()=>{try{return new Set(JSON.parse(localStorage.getItem(TIP_KEY)??'[]'));}catch{return new Set();}})();
function saveTips(){try{localStorage.setItem(TIP_KEY,JSON.stringify([...seenTips]));}catch{}}
const battling=()=>state.phase==='battle'&&!anim;
const tips=[
 {id:'attack',when:()=>battling()&&state.battle.attacksUsed===0&&state.run.ante===0&&state.run.blindIndex===0,text:`카드를 눌러 고르고(최대 ${c.balance.maxPlay}장) 공격하세요. 같은 스티커 2장이면 페어! 붙인 스티커는 동료의 장비로 남아요.`},
 {id:'assign',when:()=>battling()&&members().length>1&&sel.length>0&&!allAssigned(),text:'동료가 여럿이면 캐릭터를 눌러 붙일 대상을 정해요. 같은 무기는 강화, 같은 속성은 Lv이 올라요.'},
 {id:'order',when:()=>battling()&&members().length>1,text:'동료는 왼쪽부터 차례로 발동해요. +배율 동료 뒤에 ×배율 동료를 두면 점수가 커져요. 자리는 상점에서 바꿀 수 있어요.'},
 {id:'skip',when:()=>state.phase==='blind_select'&&state.history.length>0,text:'스몰·빅 블라인드는 건너뛰고 태그를 받을 수 있어요. 대신 그 블라인드의 골드와 상점은 없어요.'},
 {id:'shop',when:()=>state.phase==='shop',text:'골드로 동료와 물건을 사요. 쓰지 않은 골드는 5골드마다 이자 1골드를 낳아요.'},
];
let activeTip=null;
function pickTip(){
 if(activeTip&&!activeTip.when()){seenTips.add(activeTip.id);saveTips();activeTip=null;}
 if(!activeTip)activeTip=tips.find(t=>!seenTips.has(t.id)&&t.when())??null;
 return activeTip;
}
function dismissTip(){if(activeTip){seenTips.add(activeTip.id);saveTips();activeTip=null;}render();}

/* ── 렌더 ── */
function render(){
 const p=state.phase;closePop();
 app.innerHTML=p==='title'?renderTitle():p==='starter'?renderStarter():p==='blind_select'?renderBlindSelect():(p==='battle'||anim)?renderBattle():p==='cashout'?renderCashout():p==='shop'?renderShop():p==='deck_pick'?renderDeckPick():renderRunResult();
 const tip=pickTip();if(tip)app.insertAdjacentHTML('beforeend',`<div class="tip" role="note"><p>${tip.text}</p><button type="button" data-action="tip-ok">알겠어요</button></div>`);
 paint(app);decorateUnits();
}
function paint(root){
 for(const canvas of root.querySelectorAll('[data-render]')){const unit=state.run?.team.characters.find(u=>u?.instanceId===canvas.dataset.render);if(unit)renderCharacter(canvas,unit,c);}
 for(const canvas of root.querySelectorAll('[data-def-render]'))renderCharacter(canvas,makeUnit('def_'+canvas.dataset.defRender,canvas.dataset.defRender),c);
}
// 속성 Lv3부터 입자 효과.
function decorateUnits(){
 for(const el of app.querySelectorAll('.punit[data-slot]')){
  const u=state.run?.team.characters[Number(el.dataset.slot)];if(!u?.elementId||u.elementLevel<3)continue;
  const field=document.createElement('span');field.className='element-fx '+u.elementId.replace('element_','')+(u.weaponId?'':' body-fx');field.setAttribute('aria-hidden','true');field.style.setProperty('--element-color',elementOf(u.elementId).color);field.innerHTML='<i></i><i></i><i></i>';el.append(field);
 }
}
function floatText(el,text,cls){if(!el)return;const s=document.createElement('span');s.className='floater '+cls;s.textContent=text;el.append(s);setTimeout(()=>s.remove(),1000);}
function burst(text,loss=false){if(reduced)return;const d=document.createElement('div');d.className='burst'+(loss?' loss':'');d.textContent=text;app.append(d);setTimeout(()=>d.remove(),1100);}
function banner(text,sub=''){if(reduced)return;const d=document.createElement('div');d.className='turn-banner';d.innerHTML=`${text}${sub?`<small>${sub}</small>`:''}`;app.append(d);setTimeout(()=>d.remove(),1000);}
function bump(el,big=false){if(!el)return;el.classList.remove('bump','big','slam');void el.offsetWidth;el.classList.add('bump');if(big)el.classList.add('big');}
function animateFx(el,frames,options){if(reduced){el.remove();return;}const a=el.animate(frames,{easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards',...options});a.finished.catch(()=>{}).finally(()=>el.remove());return a;}
function centerOf(el){const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}
function particles(el,color='#f5c64b',count=10){
 if(reduced||!el)return;const {x,y}=centerOf(el);
 for(let i=0;i<count;i++){const a=i/count*Math.PI*2,d=32+Math.random()*40,n=document.createElement('i');n.className='fx-particle';n.style.cssText=`left:${x}px;top:${y}px;background:${color}`;document.body.append(n);animateFx(n,[{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:`translate(${Math.cos(a)*d}px,${Math.sin(a)*d+15}px) rotate(${i*57}deg) scale(.2)`,opacity:0}],{duration:550+i*15});}
}

/* ── 공격 연출: 족보 → 스티커 → 동료 순서로 칩과 배율을 쌓고, 몬스터 HP를 깎는다 ── */
async function playAttack(){
 const b=state.battle,la=b.lastAttack,$=id=>document.getElementById(id);
 const pend=new Set(),token={skip:false,flush(){this.skip=true;pend.forEach(fn=>fn());pend.clear();}};anim.token=token;
 const wait=ms=>token.skip||reduced?Promise.resolve():new Promise(res=>{const fin=()=>{clearTimeout(t);pend.delete(fin);res();},t=setTimeout(fin,ms);pend.add(fin);});
 const count=async(el,from,to,ms,f=fmt)=>{const n=10;for(let i=1;i<=n&&!token.skip;i++){el.textContent=f(Math.round(from+(to-from)*i/n));await wait(ms/n);}el.textContent=f(to);};
 const chipsEl=$('chips'),multEl=$('mult'),scoreEl=$('my-score'),zone=$('blind-zone'),hpEl=$('hp'),hpText=$('hp-text');
 const tile=slot=>app.querySelector(`.punit[data-slot="${slot}"]`),cards=[...app.querySelectorAll('#played .sticker')];
 const step0=la.steps[0];chipsEl.textContent=fmt(step0.totalChips);multEl.textContent=fmt(step0.totalMult);
 banner(handName(la.handId),`Lv${la.level}`);await wait(520);
 const pace=Math.max(110,320-la.steps.length*9);let ci=-1,lastUid=null;
 for(const s of la.steps.slice(1)){
  if(token.skip)break;
  let src=null;
  if(s.src==='card'){if(s.uid!==lastUid){ci++;lastUid=s.uid;cards[ci]?.classList.remove('pending');cards[ci]?.classList.add('hit');}src=cards[ci];tile(s.slot)?.classList.add('charge');setTimeout(()=>tile(s.slot)?.classList.remove('charge'),300);}
  else{src=tile(s.slot);src?.classList.add('fx-source','charge');setTimeout(()=>src?.classList.remove('fx-source','charge'),320);}
  const parts=[];if(s.chips)parts.push(['chip',`+${fmt(s.chips)}`]);if(s.mult)parts.push(['mul',`+${fmt(s.mult)}`]);if(s.xmult!==1)parts.push(['xmul',`×${fmt(s.xmult)}`]);if(s.note)parts.push(['note',s.label]);
  if(!parts.length&&!s.note){continue;}
  parts.forEach(([k,t],j)=>setTimeout(()=>floatText(src,t,'pt '+k),j*90));
  if(s.chips){chipsEl.textContent=fmt(s.totalChips);bump(chipsEl.parentElement);}
  if(s.mult||s.xmult!==1){multEl.textContent=fmt(s.totalMult);bump(multEl.parentElement,s.xmult!==1);if(s.xmult!==1&&!reduced){app.classList.remove('quake');void app.offsetWidth;app.classList.add('quake');}}
  await wait(pace);
 }
 cards.forEach(el=>{el.classList.remove('pending');el.classList.add('hit');});
 chipsEl.textContent=fmt(la.chips);multEl.textContent=fmt(la.mult);
 await wait(200);
 await count(scoreEl,0,la.score,520);scoreEl.classList.add('slam');if(la.score>=b.target*0.5)$('duel')?.classList.add('blaze');
 await wait(300);
 const before=anim.prev.battle.damage,hp=Math.max(0,b.target-b.damage);
 if(!token.skip&&zone){zone.classList.remove('hit');void zone.offsetWidth;zone.classList.add('hit');floatText(zone,'-'+fmt(la.score),'down dmg');particles(zone.querySelector('.monster-slot'),'#fff3c4',12);}
 if(hpEl){hpEl.style.width=hp/b.target*100+'%';await count(hpText,Math.max(0,b.target-before),hp,500,v=>`HP ${fmt(v)} / ${fmt(b.target)}`);hpText.textContent=`HP ${fmt(hp)} / ${fmt(b.target)}`;}
 if(la.broken.length)toast(`유리 스티커 ${la.broken.length}장이 깨졌어요!`);
 await wait(250);
 const win=state.phase==='cashout',lose=state.phase==='run_result';
 if(win||lose){
  if(win){zone?.classList.add('defeated');particles(zone?.querySelector('.monster-slot'),'#f5c64b',26);}
  else{zone?.classList.add('counter');app.classList.remove('quake');void app.offsetWidth;app.classList.add('quake');}
  app.querySelector('main')?.insertAdjacentHTML('beforeend',`<div class="verdict-layer ${win?'win':'lose'}"><div class="stamp ${win?'win':'lose'}" role="status">${win?'격파!':'패배'}${win?`<small>${gem('+'+b.diamonds)}</small>`:''}</div></div>`);
  const box=$('anim-actions');if(box)box.innerHTML=`<button type="button" class="go" data-action="anim-done">${win?'정산하기':'원정 결과'}</button>`;
  anim.token=null;anim.waiting=true;
 }else{anim=null;render();app.querySelector('.hand')?.classList.add('dealing');}
}

/* ── 말풍선·바텀시트 ── */
let pop=null;
function closePop(){pop?.el.remove();pop=null;}
function openPop(key,anchor,html){
 closePop();if(!anchor)return;
 const el=document.createElement('div');el.className='pop';el.setAttribute('role','tooltip');el.innerHTML=html;app.append(el);
 const a=anchor.getBoundingClientRect(),box=app.getBoundingClientRect(),w=Math.min(290,box.width-20);
 el.style.width=w+'px';const left=Math.max(10,Math.min(box.width-w-10,a.left+a.width/2-w/2-box.left));el.style.left=left+'px';
 let top=a.top-box.top-el.offsetHeight-10;const below=top<8;if(below)top=a.bottom-box.top+10;
 el.style.top=top+'px';el.classList.toggle('below',below);el.style.setProperty('--arrow',Math.max(14,Math.min(w-14,a.left+a.width/2-box.left-left))+'px');
 pop={key,el};
}
function unitPop(slot){
 const u=state.run.team.characters[slot],d=byId(c.characters,u.characterDefId),r=recipeFor(u,c),b=state.battle;
 const rel=b?relationOf(u.elementId,b.elementId,c,b.effect==='invertAffinity'):'neutral';
 return `<b class="pop-title">${slot+1}. ${nameOf(d.id)}</b>
 <div class="pop-row ability-row">${abilityText(d.id)}</div>
 ${r?`<div class="pop-recipe on"><b>${r.name}</b><small>${r.text}</small></div>`:'<div class="pop-row dim">무기와 속성을 함께 붙이면 조합 무기 능력이 생겨요.</div>'}
 <div class="pop-row">무기<em>${u.weaponId?`${nameOf(u.weaponId)} +${u.weaponPlus}`:'없음'}</em></div>
 <div class="pop-row">속성<em class="${rel==='advantage'?'good':rel==='disadvantage'?'bad':''}">${u.elementId?`${nameOf(u.elementId)} Lv${u.elementLevel}${rel==='advantage'?' ▲':rel==='disadvantage'?' ▼':''}`:'없음'}</em></div>
 <div class="pop-row">별<em>Lv${u.starLevel}</em></div>
 ${d.trigger==='growth'?`<div class="pop-row">성장치<em>${growthOf(u)}</em></div>`:''}${u.charge?`<div class="pop-row">누적 배율<em>+${u.charge}</em></div>`:''}
 ${['battle','blind_select'].includes(state.phase)&&state.run.team.characters.length>1?`<div class="pop-moves"><button type="button" data-action="move" data-from="${slot}" data-to="${slot-1}" ${slot===0?'disabled':''}>◀ 왼쪽으로</button><button type="button" data-action="move" data-from="${slot}" data-to="${slot+1}" ${slot===state.run.team.characters.length-1?'disabled':''}>오른쪽으로 ▶</button></div>`:''}`;
}
function openInfo(html){document.getElementById('info-content').innerHTML=html;const d=document.getElementById('info');if(!d.open)d.showModal();d.scrollTop=0;d.focus({preventScroll:true});paint(d);}
function cycleText(){const m=c.affinity.beats,start=Object.keys(m)[0];let k=start,s=[nameOf(k)];do{k=m[k];s.push(nameOf(k));}while(k!==start);return s.join(' > ');}
function showRules(){const b=c.balance,e=c.economy;openInfo(`<h2>원정 규칙</h2><ol>
<li>앤티 ${b.anteCount}개, 앤티마다 스몰·빅·보스 블라인드. 앤티 ${b.anteCount} 보스를 쓰러뜨리면 성공이에요.</li>
<li>블라인드마다 덱을 섞고 손패 ${b.handSize}장. <b>공격 ${b.attacks}회 · 버리기 ${b.discards}회</b>로 몬스터 HP(목표 점수)를 0으로 만들어요.</li>
<li><b>공격</b>: 1~${b.maxPlay}장을 골라 동료에게 붙여요. 붙인 스티커는 장비로 남아요(같은 무기는 강화 +1, 같은 속성은 Lv+1, 다르면 교체).</li>
<li><b>점수</b>: 족보의 칩·배율 → 낸 스티커(왼쪽 동료부터) → 동료 능력(왼쪽부터) 순서. 마지막에 칩 × 배율.</li>
<li><b>스티커</b>: 무기 +${b.weaponChips} 칩(강화마다 +${b.weaponPlusChips}), 속성 +${b.elementChips} 칩과 +Lv 배율, 별 +${b.starChips}×별 Lv 칩.</li>
<li><b>상성</b>: ${cycleText()}. 블라인드를 이기는 속성은 배율 ×${b.advantageMult}, 지는 속성은 배율 0.</li>
<li><b>조합 무기</b>: 무기와 속성이 함께 있으면 진화 능력이 생겨요. 동료 화면에서 9종을 볼 수 있어요.</li>
<li><b>골드</b>: 승리하면 블라인드 보상 + 남은 공격 1회당 ${e.attackGold} + 이자(${e.interestPer}골드당 1, 최대 ${e.interestMax}).</li>
<li><b>건너뛰기</b>: 스몰·빅은 건너뛰고 태그를 받을 수 있어요(그 블라인드의 골드·상점 없음).</li>
<li><b>보스</b>: 앤티마다 규칙 하나(${c.bossRules.map(r=>r.name).join('·')} 중).</li></ol><p class="note">수치는 재미와 균형 확인용 임시값입니다.</p><button type="button" class="ghost help-tips" data-help="tips">처음 안내 다시 보기</button>`);}
function showHands(){
 const lv=state.run?.levels??{},played=state.run?.handsPlayed??{};
 openInfo(`<h2>족보</h2><p class="sub">위에 있을수록 만들기 어렵고 강해요. 족보서로 레벨을 올려요.</p><table class="table hands">${[...c.hands].sort((a,b)=>b.rank-a.rank).map(h=>{const v=handValue(h.id,lv,c);return `<tr><td><b>${h.name}</b> <small>Lv${v.level}</small><br><small>${h.text}</small></td><td><span class="hc">${v.chips}</span> × <span class="hm">${v.mult}</span>${played[h.id]?`<br><small>${played[h.id]}회</small>`:''}</td></tr>`;}).join('')}</table>`);
}
function showRoster(){
 openInfo(`<h2>동료</h2><p class="sub">종족은 무엇에 반응하는지, 직업은 어떻게 계산하는지를 정해요. 전사 ${c.characters.find(d=>d.effect==='chips').cost} · 궁수 ${c.characters.find(d=>d.effect==='mult').cost} · 마법사 ${c.characters.find(d=>d.effect==='xmult').cost} 골드.</p>
 <div class="roster">${c.characters.map(d=>`<article class="${kindCls(d.id)}"><canvas data-def-render="${d.id}"></canvas><b>${nameOf(d.id)}</b><small>${abilityText(d.id)}</small></article>`).join('')}</div>
 <h3 class="sheet-h">조합 무기</h3><p class="sub">무기와 속성을 같은 동료에게 붙이면 기본 능력 다음에 발동해요.</p>
 <div class="recipe-list">${c.weaponRecipes.map(r=>`<article>${ic(r.assetId,'recipe-art')}<b>${r.name}</b><small>${nameOf(r.weaponId)} + ${nameOf(r.elementId)}</small><p>${r.text}</p></article>`).join('')}</div>`);
}
function showDeck(){
 const r=state.run,b=state.phase==='battle'?state.battle:null,group=new Map();
 for(const card of [...r.deck].sort(deckSort)){const k=card.defId+'|'+(card.mod??'');group.set(k,{card,n:(group.get(k)?.n??0)+1});}
 const left=b?new Set(b.drawPile.map(x=>x.uid)):null;
 openInfo(`<h2>덱 ${r.deck.length}장</h2>${b?`<p class="sub">이번 블라인드에 남은 덱 ${b.drawPile.length}장</p>`:''}<div class="deckgrid">${[...group.values()].map(({card,n})=>{const remain=left?r.deck.filter(x=>x.defId===card.defId&&(x.mod??'')===(card.mod??'')&&left.has(x.uid)).length:null;return `<div class="deckcell">${stickerCard(card,{action:'none',mini:true})}<small>${remain!=null?`${remain}/`:''}${n}장</small></div>`;}).join('')}</div>`);
}
function showBlindInfo(){
 const b=state.battle,rule=b.ruleId?byId(c.bossRules,b.ruleId):null,beater=beaterOf(b.elementId),loser=c.affinity.beats[b.elementId];
 openInfo(`<h2>${nameOf(monsterOf(b.monsterId).nameKey)}</h2><table class="table"><tr><td>목표 / 남은 HP</td><td>${fmt(b.target)} / ${fmt(Math.max(0,b.target-b.damage))}</td></tr><tr><td>속성</td><td>${nameOf(b.elementId)}</td></tr><tr><td>▲ 유리 (배율 ×${c.balance.advantageMult})</td><td>${nameOf(beater)}</td></tr><tr><td>▼ 불리 (배율 0)</td><td>${nameOf(loser)}</td></tr>${rule?`<tr><td>⛓ ${rule.name}</td><td>${rule.text}</td></tr>`:''}</table>${b.lastAttack?`<h3 class="sheet-h">지난 공격 ${fmt(b.lastAttack.score)}</h3><table class="table steps-table">${b.lastAttack.steps.map(s=>`<tr><td>${s.src==='hand'?s.label:s.src==='card'?`${s.slot+1}번에게 ${s.label}`:`${s.slot+1}번 ${s.label}`}</td><td>${s.chips?`<span class="hc">+${fmt(s.chips)}</span> `:''}${s.mult?`<span class="hm">+${fmt(s.mult)}</span> `:''}${s.xmult!==1?`<span class="hm">×${fmt(s.xmult)}</span>`:''}${s.src==='hand'?`<span class="hc">${fmt(s.totalChips)}</span> × <span class="hm">${fmt(s.totalMult)}</span>`:''}</td></tr>`).join('')}</table>`:''}`);
}
document.getElementById('info-content').addEventListener('click',e=>{
 if(e.target.closest('[data-help="tips"]')){seenTips.clear();saveTips();activeTip=null;document.getElementById('info').close();render();}
});

/* ── 입력 ── */
let pointer=null,ghost=null,suppressClick=false;
app.addEventListener('click',e=>{
 if(suppressClick){e.preventDefault();return;}
 if(anim?.token){anim.token.flush();e.preventDefault();return;}
 const el=e.target.closest('[data-action]');
 if(pop&&!e.target.closest('.pop'))closePop();
 if(!el||el.disabled)return;
 const a=el.dataset.action,idx=Number(el.dataset.index);
 switch(a){
 case 'tip-ok':dismissTip();break;
 case 'rules':showRules();break;
 case 'hands':showHands();break;
 case 'roster':showRoster();break;
 case 'deck':if(state.run)showDeck();break;
 case 'start':command('StartRun',{seed:crypto.getRandomValues(new Uint32Array(1))[0]});break;
 case 'starter':command('PickStarter',{index:idx});break;
 case 'select-blind':command('SelectBlind');break;
 case 'skip':command('SkipBlind');break;
 case 'card':if(state.phase==='battle'){toggleCard(el.dataset.uid);render();}break;
 case 'unit':{const slot=Number(el.dataset.slot);if(sel.length){assignTo(slot);render();}else openPop('unit'+slot,el,unitPop(slot));break;}
 case 'unit-info':{const slot=Number(el.dataset.slot);if(state.run.team.characters[slot])openPop('unit'+slot,el,unitPop(slot));break;}
 case 'attack':if(!allAssigned()){toast(messages.target);break;}command('Attack',{plays:playsFromSel()});break;
 case 'discard':command('Discard',{uids:sel.map(x=>x.uid)});break;
 case 'anim-done':anim=null;render();break;
 case 'cashout':command('CashOut');break;
 case 'buy-char':command('BuyCharacter',{index:idx});break;
 case 'buy-item':command('BuyItem',{index:idx});break;
 case 'buy-slot':command('BuySlot');break;
 case 'reroll':command('Reroll');break;
 case 'sell':command('SellCharacter',{slot:Number(el.dataset.slot)});break;
 case 'move':command('MoveCharacter',{from:Number(el.dataset.from),to:Number(el.dataset.to)});break;
 case 'leave-shop':command('LeaveShop');break;
 case 'pick-card':{const it=byId(c.items,state.shop.items[state.pick.index].itemId),u=el.dataset.uid;if(pickSel.includes(u))pickSel=pickSel.filter(x=>x!==u);else if(pickSel.length<it.pick)pickSel.push(u);else if(it.pick===1)pickSel=[u];else{toast(`${it.pick}장까지 고를 수 있어요.`);break;}render();break;}
 case 'confirm-pick':command('PickDeckCards',{uids:pickSel});break;
 case 'cancel-pick':command('CancelPick');break;
 case 'restart':command('RestartRun');break;
 case 'restart-ask':openInfo('<h2>처음부터 다시 할까요?</h2><p>지금까지의 원정이 모두 초기화돼요.</p><button type="button" class="go" id="confirm-restart" style="width:100%;margin-top:16px">처음부터 다시</button>');document.getElementById('confirm-restart').onclick=()=>{document.getElementById('info').close();anim=null;sel=[];command('RestartRun');};break;
 }
});
app.addEventListener('click',e=>{if(e.target.closest('#blind-zone')&&!anim&&state.phase==='battle')showBlindInfo();});
// 드래그: 손패 카드를 동료 위에 놓으면 그 카드를 고르고 그 동료에게 붙인다.
app.addEventListener('pointerdown',e=>{const el=e.target.closest('[data-action="card"]');if(!el||e.button!==0||state.phase!=='battle'||anim)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,uid:el.dataset.uid,html:el.outerHTML,dragging:false};});
document.addEventListener('pointermove',e=>{
 if(!pointer||pointer.id!==e.pointerId)return;
 if(!pointer.dragging&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8){pointer.dragging=true;app.setPointerCapture(e.pointerId);ghost=document.createElement('div');ghost.className='dragghost';ghost.innerHTML=pointer.html;document.body.append(ghost);}
 if(!pointer.dragging)return;e.preventDefault();ghost.style.left=`${e.clientX}px`;ghost.style.top=`${e.clientY}px`;
 app.querySelectorAll('.punit.hover').forEach(x=>x.classList.remove('hover'));document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-action="unit"]')?.classList.add('hover');
},{passive:false});
function cancelDrag(){if(pointer&&app.hasPointerCapture(pointer.id))app.releasePointerCapture(pointer.id);pointer=null;ghost?.remove();ghost=null;app.querySelectorAll('.punit.hover').forEach(x=>x.classList.remove('hover'));}
document.addEventListener('pointerup',e=>{
 if(!pointer||pointer.id!==e.pointerId)return;const was=pointer.dragging,uid=pointer.uid;cancelDrag();
 if(!was)return;suppressClick=true;setTimeout(()=>suppressClick=false,0);
 const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-action="unit"]');if(!target)return;
 const slot=Number(target.dataset.slot),cur=sel.find(x=>x.uid===uid);
 if(cur)cur.slot=slot;else if(sel.length<c.balance.maxPlay)sel.push({uid,slot});else toast(messages.tooMany);
 render();
});
document.addEventListener('pointercancel',()=>{if(pointer)cancelDrag();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pop){closePop();return;}if(e.key==='Escape'&&sel.length&&state.phase==='battle'){sel=[];render();}});
app.addEventListener('scroll',()=>closePop(),true);
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('paused',document.hidden);if(document.hidden)cancelDrag();});
render();

return {};})();
