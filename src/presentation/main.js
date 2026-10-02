modules["src/presentation/main.mjs"]=(()=>{
const {content,byId,nameOf,validateContent}=modules["src/content/data.mjs"];
const {defOf,maxHpOf,makeUnit,skillOf,fitOf,relationMult}=modules["src/domain/rules.mjs"];
const {initialState,blindInfo,forecastRound,previewAttach,rerollCost,sellValue,hurt,applyCommand}=modules["src/application/game.mjs"];
const {renderCharacter}=modules["src/rendering/compositor.mjs"];

validateContent();
const c=content,app=document.getElementById('app');
document.documentElement.style.setProperty('--art-background',`url("${c.assets.asset_background.file}")`);
// 그림은 CSS 클래스로 한 번만 등록한다. 매 렌더마다 대용량 data URI를 복제하지 않기 위함.
(()=>{const ids=[...c.weapons.map(w=>w.assetId),...c.elements.map(e=>e.assetId),'asset_star',...c.skills.map(r=>r.assetId),...c.monsters.map(m=>m.assetId),'asset_reward_back'];const st=document.createElement('style');st.textContent=ids.map(id=>`.ic-${id}{background-image:url("${c.assets[id].file}")}`).join('');document.head.append(st);})();

// sel: 고른 손패 카드 uid. swapMode: 자리 바꾸기 중이면 swapFrom에 먼저 고른 칸. anim: 전투 라운드 연출 중이면 {prev, token}.
let state=initialState(),sel=null,swapMode=false,swapFrom=null,serial=0,toastTimer,anim=null,shuffleRun=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const messages={target:'붙일 캐릭터를 골라 주세요.',card:'사용할 수 없는 카드예요.',same:'이미 같은 속성이 붙어 있어요.',maxLevel:'이미 최대 레벨이에요.',limit:'이번 턴 붙이기를 다 썼어요.',swapLimit:'이번 턴 자리 바꾸기를 이미 썼어요.',gold:'골드가 모자라요.',full:'빈 칸이 없어요. 동료를 팔아 칸을 비워 주세요.',lastCharacter:'마지막 동료는 팔 수 없어요.',phase:'지금은 할 수 없어요.',rig:'이 캐릭터에게 맞지 않는 무기예요.',duplicate:'이미 처리한 행동이에요.'};
const fmt=v=>Number.isInteger(v)?v.toLocaleString('en-US'):String(Number(v.toFixed(2)));
const ic=(assetId,cls='')=>`<i class="ic ic-${assetId} ${cls}" aria-hidden="true"></i>`;
const coin=(n,cls='')=>`<span class="coin ${cls}"><i aria-hidden="true"></i>${n}</span>`;
const gem=(n,cls='')=>`<span class="gem ${cls}"><i aria-hidden="true">◆</i>${n}</span>`;
const elementOf=id=>id?byId(c.elements,id):null;
const monsterOf=id=>byId(c.monsters,id);
const beaterOf=id=>Object.keys(c.affinity.beats).find(k=>c.affinity.beats[k]===id);
const view=()=>anim?anim.prev:state;
const teamOf=()=>view().run.team.characters;
const members=()=>teamOf().filter(Boolean);
function toast(text){const el=document.getElementById('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}

/* ── 문장 ── */
const jobWeaponName=defId=>nameOf(byId(c.jobs,defOf({characterDefId:defId},c).jobId).weaponId);
function skillLine(s){return `${s.kind==='active'?`액티브 · 쿨타임 ${s.cooldown}`:'패시브'} — ${s.text}`;}
function stickerDesc(s){const b=c.balance;return s.kind==='weapon'?`공격 ×${b.weaponMult}·같은 무기는 강화`:s.kind==='element'?'상성 · 스킬 재료':'레벨 +1';}
function elementChip(id,extra=''){const e=elementOf(id);return e?`<span class="el-chip" style="--el:${e.color}">${ic(e.assetId)}${nameOf(id)}${extra}</span>`:'';}

/* ── 공용 조각 ── */
function uiIcon(kind){const shapes={book:'<path d="M3 5q5-2 9 1 4-3 9-1v15q-5-2-9 0-4-2-9 0Z"/><path d="M12 6v14M6 9h3m-3 4h3m6-4h3m-3 4h3"/>',cards:'<rect x="5" y="3" width="15" height="18" rx="3"/><path d="M3 6 1 18q0 3 3 3m7-13 4 4-4 4-3-4Z"/>',crown:'<path d="m3 8 4 4 5-7 5 7 4-4-2 11H5Z"/>',people:'<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20q1-6 6-6t6 6m0-6q5 0 8 6"/>',swap:'<path d="M4 8h14l-3-3m3 3-3 3M20 16H6l3-3m-3 3 3 3"/>'};return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[kind]}</svg>`;}
// 좁은 화면에 맞게 아이콘만 둔다(이름은 aria-label·title).
function toolsNav(){const t=state.phase==='title',b=(a,icon,label)=>`<button data-action="${a}" aria-label="${label}" title="${label}">${uiIcon(icon)}</button>`;return `<nav class="tools compact">${b('skills','crown','스킬')}${b('roster','people','동료')}${b('rules','book','규칙')}${t?'':'<button data-action="restart-ask" aria-label="처음부터 다시" title="처음부터 다시">↺</button>'}</nav>`;}
function stageTop(label=''){
 const r=state.run;if(!r)return `<header class="top">${toolsNav()}</header>`;
 const pips=Array.from({length:c.balance.anteCount},(_,a)=>`<span class="pip ${a<r.ante?'done':a===r.ante?'now':''} ${a===c.balance.anteCount-1?'boss':''}"></span>`).join('');
 return `<header class="top"><div class="stage">${pips}<b>앤티 ${Math.min(r.ante+1,c.balance.anteCount)}</b>${label?`<span class="turn">${label}</span>`:''}</div><div class="top-r">${coin(r.gold,'top-gold')}${toolsNav()}</div></header>`;
}
// 메타 재화. 런 밖에 남으므로 브라우저에 저장한다(저장이 막혀 있어도 게임은 동작한다).
const META_KEY='stickerBattle.meta.v1';
const wallet=(()=>{try{return {diamonds:0,...JSON.parse(localStorage.getItem(META_KEY)??'{}')};}catch{return {diamonds:0};}})();
function addDiamonds(n){wallet.diamonds+=n;try{localStorage.setItem(META_KEY,JSON.stringify(wallet));}catch{}}

// 손패 스티커 한 장.
function stickerCard(card,{selected=false,i=0,n=1,mini=false,action='card'}={}){
 const s=byId(c.stickers,card.defId),e=s.kind==='element'?byId(c.elements,s.payloadId):null;
 const rot=n>1&&!selected?(i-(n-1)/2)*3:0,tint=e?.color??(s.kind==='star'?'#d9a72c':'#7d6aa0');
 return `<button type="button" class="sticker k-${s.kind} ${selected?'sel':''} ${mini?'mini':''}" style="--rot:${rot}deg;--tint:${tint}" data-action="${action}" data-uid="${card.uid}" aria-pressed="${selected}">${ic(s.iconAssetId,'sicon')}<span class="sname">${nameOf(s.nameKey)}</span>${mini?'':`<span class="sdesc">${stickerDesc(s)}</span>`}</button>`;
}

/* ── 원정대 칸 ── */
const orderTag=(slot)=>`<span class="order"><b>공격 ${slot+1}</b><b class="def">피격 ${c.balance.teamSize-slot}</b></span>`;
function badges(u,monsterEl){
 const e=elementOf(u.elementId),rel=monsterEl&&u.elementId?relationMult(u.elementId,monsterEl,c):1;
 const star=u.level>1?`<span class="lv-star" title="레벨 ${u.level}">Lv${u.level}</span>`:'';
 const plus=u.weaponId?`<span class="lv-wpn" title="${nameOf(u.weaponId)}${u.weaponPlus?` 강화 +${u.weaponPlus}`:''}">${ic(byId(c.weapons,u.weaponId).assetId)}${u.weaponPlus?`+${u.weaponPlus}`:''}</span>`:'';
 const el=e?`<span class="lv-el ${rel>1?'advantage':rel<1?'disadvantage':''}" style="--el:${e.color}" title="${nameOf(e.id)}">${ic(e.assetId)}${rel>1?'<i class="rel">▲</i>':rel<1?'<i class="rel">▼</i>':''}</span>`:'';
 return `<span class="badges-l">${star}${plus}</span><span class="badges-r">${el}</span>`;
}
// 붙이기 미리보기: 이 스티커를 이 캐릭터에게 붙이면 이번 라운드 피해가 얼마나 바뀌는지.
function previewFor(slot){
 const v=state,b=v.battle,u=v.run.team.characters[slot];
 if(!sel||!b||!u)return null;
 const next=previewAttach(v,sel,u.instanceId,c);if(!next)return {reason:true};
 const dealt=f=>f.events.filter(e=>e.type==='attack').reduce((n,e)=>n+e.total,0),base=forecastRound(v,c),after=forecastRound(v,c,next);
 const card=b.hand.find(x=>x.uid===sel),st=byId(c.stickers,card.defId),gained=skillOf(next[slot],c);
 return {delta:dealt(after)-dealt(base),level:st.kind==='star'?next[slot].level:null,skill:gained&&gained.id!==skillOf(u,c)?.id?gained.name:null};
}
function unitTile(u,slot,mode='static'){
 const v=view(),b=v.battle,team=v.run.team.characters,n=c.balance.teamSize;
 const swapCls=swapMode&&swapFrom===slot?'swap-from':swapMode?'swap-target':'';
 if(!u){
  if(mode==='battle')return `<button type="button" class="punit vacant ${swapCls}" data-action="unit" data-slot="${slot}" aria-label="빈 칸 ${slot+1}">${orderTag(slot)}<span class="vacant-mark">·</span><span class="uname">빈 칸</span></button>`;
  return `<div class="punit vacant static" data-slot="${slot}"><span class="vacant-mark">·</span><span class="uname">빈 칸</span></div>`;
 }
 const max=maxHpOf(u,c),pct=Math.max(0,Math.min(100,u.hp/max*100)),sk=skillOf(u,c),fit=fitOf(u,team,c);
 const pv=mode==='battle'&&!anim?previewFor(slot):null;
 const badge=pv?(pv.reason?`<span class="delta no">불가</span>`:`<span class="delta ${pv.delta>0?'up':''}">${pv.delta>0?`+${fmt(pv.delta)}`:'±0'}${pv.level?` · Lv${pv.level}`:''}${pv.skill?` · ${pv.skill}!`:''}</span>`):'';
 const skillChip=sk?`<span class="skillchip ${sk.kind==='active'?(u.skillCd>0?'cool':'ready'):'passive'}" title="${skillLine(sk)}">${sk.name}${sk.kind==='active'?(u.skillCd>0?` · 쿨 ${u.skillCd}`:' ●'):''}</span>`:'';
 const tag=mode==='battle'?'button':'div',attrs=mode==='battle'?`type="button" data-action="unit" aria-label="${nameOf(u.characterDefId)}"`:`data-action="unit-info"`;
 const ops=mode==='shop'?`<span class="tile-ops"><button type="button" data-action="move" data-from="${slot}" data-to="${slot-1}" ${slot===0?'disabled':''} aria-label="왼쪽으로">◀</button><button type="button" data-action="move" data-from="${slot}" data-to="${slot+1}" ${slot===n-1?'disabled':''} aria-label="오른쪽으로">▶</button>${hurt(u,c)?`<button type="button" class="heal" data-action="heal" data-slot="${slot}">치료 ${coin(c.shopRules.healOneCost)}</button>`:''}<button type="button" class="sell" data-action="sell" data-slot="${slot}">팔기 ${coin(sellValue(u,c))}</button></span>`:'';
 return `<${tag} class="punit k-${defOf(u,c).jobId.slice(4)} ${swapCls} ${sel&&mode==='battle'&&!pv?.reason?'ok':''} ${pv?.reason?'no':''}" ${attrs} data-slot="${slot}" data-max="${max}">${mode==='battle'?orderTag(slot):''}${badges(u,b?.monster.elementId??null)}${badge}<canvas data-render="${u.instanceId}"></canvas><span class="uname">${nameOf(u.characterDefId)}</span><span class="uhp" data-hp><i style="width:${pct}%"></i><b>${u.hp}/${max}</b></span>${skillChip}${fit<1?`<span class="fit-warn">무기 안 맞음 ×${fmt(fit)}</span>`:''}${ops}</${tag}>`;
}
const partyRow=mode=>`<div class="party">${teamOf().map((u,i)=>unitTile(u,i,mode)).join('')}</div>`;

/* ── 타이틀·시작 동료 ── */
function renderTitle(){
 const b=c.balance;
 return `<header class="top"><div class="logo"><b>스티커 원정대</b><small>붙여서 키우는 자동 전투 RPG</small></div>${toolsNav()}</header>
 <main class="title"><div class="title-art">${['char_human_warrior','char_elf_archer','char_dwarf_mage'].map(id=>`<canvas data-def-render="${id}"></canvas>`).join('')}</div>
 <p class="lead">동료 셋을 한 줄로 세우고 스티커로 키워서<br>몬스터를 쓰러뜨리세요.</p>
 <ol class="flow"><li><b>붙이기</b><span>매 턴 스티커 ${b.handSize}장 중 ${b.attachLimit}장을 동료에게 붙여요. 별은 레벨, 무기는 공격, 속성은 상성이에요.</span></li><li><b>전투</b><span>누르면 자동으로 싸워요. 앞에서부터 공격하고, 몬스터는 맨 뒤 동료부터 때려요.</span></li><li><b>상점</b><span>체력은 이어져요. 골드로 치료하고 새 동료를 영입하세요. 쓰러진 동료는 스티커와 함께 사라져요.</span></li></ol>
 <p class="wallet">보유 ${gem(wallet.diamonds)}</p></main>
 <footer class="dock"><button type="button" class="go" data-action="start">원정 시작</button></footer>`;
}
function starterFace(defId){
 const d=byId(c.characters,defId);
 return `<canvas data-def-render="${defId}"></canvas><b class="rtitle">${nameOf(defId)}</b><span class="rstat">체력 ${d.hp} · 공격 ${d.atk}</span><small>어울리는 무기 ${jobWeaponName(defId)}</small>`;
}
function starterCards(){
 const st=state.starter,ph=state.phase,animating=ph==='starter_pick'&&!!shuffleRun;
 // reveal: 제시 순서대로 앞면. 섞는 동안은 제시 순서에서 시작(연출이 최종 자리로 옮긴다). 그 뒤: 섞인 자리(order)에 뒷면, 고른 뒤에는 모두 앞면.
 const at=ph==='starter_reveal'||animating?st.options.map((_,k)=>k):st.order;
 return `<div class="shell ${ph}" id="shell">${at.map((offerIndex,slot)=>{
  const faceUp=ph==='starter_reveal'||animating||ph==='starter_done',picked=ph==='starter_done'&&st.picked===slot;
  return `<button type="button" class="rcard ${faceUp?'':'down'} ${picked?'picked':ph==='starter_done'?'missed':''}" style="--slot:${slot}" data-action="pick" data-slot="${slot}" data-offer="${offerIndex}" ${ph==='starter_pick'?'':'tabindex="-1"'} aria-label="${ph==='starter_pick'?`${slot+1}번 카드 고르기`:''}"><span class="rinner"><span class="rfront">${starterFace(st.options[offerIndex])}</span><span class="rback">${ic('asset_reward_back','rback-art')}</span></span></button>`;
 }).join('')}</div>`;
}
function renderStarter(){
 const ph=state.phase,lead=ph==='starter_reveal'?'무작위로 고른 동료 셋이에요. 한 명을 데려갈 수 있어요.':ph==='starter_pick'?'카드를 하나 골라 뒤집으세요.':'첫 동료가 정해졌어요!';
 let dock='';
 if(ph==='starter_reveal')dock='<footer class="dock"><button type="button" class="go" data-action="shuffle">뒤집어 섞기</button></footer>';
 else if(ph==='starter_done')dock=`<footer class="dock"><p class="got">${nameOf(state.run.team.characters[0].characterDefId)} 합류!</p><button type="button" class="go" data-action="begin">원정 시작</button></footer>`;
 return stageTop('출발 준비')+`<main class="reward starter"><h2>첫 동료 고르기</h2><p class="lead" id="starter-lead">${lead}</p>${starterCards()}</main>${dock}`;
}

/* ── 블라인드 선택 ── */
function renderBlindSelect(){
 const r=state.run,now=r.blindIndex;
 const cards=c.blindKinds.map((k,i)=>{
  const info=blindInfo(r,c,i),m=monsterOf(info.monsterId),done=state.history.some(h=>h.ante===r.ante&&h.kindId===k.id&&h.outcome==='win'),beater=beaterOf(info.elementId);
  return `<article class="bcard b-${k.id} ${i===now?'now':''} ${done?'past':''}"><header>${k.name}</header><div class="monster-slot">${ic(m.assetId,'monster-art')}</div>
  <div class="b-stats"><span>체력 <b>${fmt(info.hp)}</b></span><span>공격 <b>${fmt(info.atk)}</b></span></div>${elementChip(info.elementId)}${beater?`<small class="b-beat">▲ ${nameOf(beater)} 유리</small>`:''}
  <div class="b-reward">보상 ${coin(k.gold)}</div>${done?'<span class="b-stamp">격파</span>':''}</article>`;
 }).join('');
 const info=blindInfo(r,c);
 return stageTop('다음 전투')+`<main class="blinds"><div class="bcards">${cards}</div>
 <section class="zone"><div class="zone-head"><strong>${uiIcon('people')} 원정대 <small>공격은 왼쪽부터, 맞는 건 오른쪽부터</small></strong><button type="button" class="link" data-action="deck">${uiIcon('cards')} 덱 ${r.deck.length}장</button></div>${partyRow('static')}</section></main>
 <footer class="dock"><button type="button" class="go ${info.kind.id==='boss'?'fight':''}" data-action="select-blind">도전!<small>${info.kind.name} · 체력 ${fmt(info.hp)}</small></button></footer>`;
}

/* ── 전투 ── */
const dealtOf=f=>f.events.filter(e=>e.type==='attack').reduce((n,e)=>n+e.total,0);
function foeZone(){
 const v=view(),b=v.battle,m=monsterOf(b.monsterId),hp=b.monster.hp,max=b.monster.maxHp,beater=beaterOf(b.elementId);
 return `<section class="foe-zone ${b.kindId==='boss'?'boss':''}" id="blind-zone" data-action="foe-info"><div class="monster-slot" aria-hidden="true">${ic(m.assetId,'monster-art')}</div>
 <div class="foe-info"><div class="blind-name"><strong>${nameOf(m.nameKey)}</strong><em class="kind-tag">${byId(c.blindKinds,b.kindId).name}</em></div>
 <div class="foe-el">${elementChip(b.elementId)}${beater?`<small>▲ ${nameOf(beater)} 유리</small>`:''}<span class="foe-atk">공격 <b>${fmt(b.monster.atk)}</b></span></div>
 <div class="hp" aria-label="몬스터 체력 ${hp} / ${max}"><i id="hp" style="width:${hp/max*100}%"></i><span id="hp-text">${fmt(hp)} / ${fmt(max)}</span></div></div></section>`;
}
// 지금 전투하면 일어날 일: 우리가 주는 피해, 몬스터가 때릴 대상.
function forecastBox(){
 const v=state,f=forecastRound(v,c),b=v.battle,dealt=dealtOf(f),after=Math.max(0,b.monster.hp-dealt);
 const counter=f.events.find(e=>e.type==='counter'),heal=f.events.filter(e=>e.type==='heal'),skills=f.events.filter(e=>(e.type==='attack'||e.type==='heal')&&e.skillId).map(e=>byId(c.skills,e.skillId).name);
 const target=counter&&v.run.team.characters[counter.slot];
 return `<section class="forecast" id="forecast"><div class="f-row"><span class="f-label">예상 피해</span><b class="f-dealt">${fmt(dealt)}</b><small>${f.won?'<em class="win">이번 라운드에 쓰러뜨려요!</em>':`몬스터 체력 ${fmt(b.monster.hp)} → ${fmt(after)}`}</small></div>
 ${counter?`<div class="f-row cnt"><span class="f-label">반격</span><b class="f-take">${target?nameOf(target.characterDefId):''}에게 ${fmt(counter.dmg)}</b><small>${counter.killed?'<em class="lose">쓰러져요!</em>':`체력 ${counter.hp + 0} 남음`}</small></div>`:''}
 ${skills.length?`<div class="f-skills">${skills.map(n=>`<span class="skillchip ready">${n} 발동</span>`).join('')}</div>`:''}</section>`;
}
function hintText(){
 const b=state.battle;
 if(sel&&!b.hand.some(x=>x.uid===sel))sel=null;
 if(swapMode)return swapFrom==null?'바꿀 두 칸 중 첫 번째를 누르세요':'바꿀 두 번째 칸을 누르세요';
 const card=sel&&b.hand.find(x=>x.uid===sel);
 if(card){const s=byId(c.stickers,card.defId);return `<b>${nameOf(s.nameKey)}</b> ${stickerDesc(s)} — 붙일 캐릭터를 누르세요`;}
 if(b.attachesLeft<=0)return '다 붙였어요. 전투를 누르세요';
 return `스티커를 눌러 고르고 캐릭터에 붙이세요 (${b.attachesLeft}번 남음)`;
}
function handDock(){
 const b=state.battle;
 if(anim)return `<footer class="dock"><div class="hand resolving"><p class="empty">전투 중… 화면을 누르면 바로 결과를 봐요</p></div><div class="actions" id="anim-actions"></div></footer>`;
 return `<footer class="dock"><div class="hand-head"><span class="turn-chip">턴 ${b.turn}</span><span class="hint ${sel?'card-tip':''}" id="hint">${hintText()}</span><span class="uses" aria-label="남은 붙이기 ${b.attachesLeft}회">${Array.from({length:c.balance.attachLimit},(_,i)=>`<i class="${i<b.attachesLeft?'on':''}"></i>`).join('')}</span></div>
 <div class="hand">${b.hand.length?b.hand.map((card,i,arr)=>stickerCard(card,{selected:sel===card.uid,i,n:arr.length})).join(''):'<p class="empty">손패가 없어요</p>'}</div>
 <div class="actions"><button type="button" class="ghost-go swapbtn ${swapMode?'on':''}" data-action="swap-mode" ${b.swapsLeft>0?'':'disabled'}>${uiIcon('swap')} 자리 바꾸기<small>${b.swapsLeft}회 남음</small></button><button type="button" class="go fight" data-action="fight">전투!</button></div></footer>`;
}
function renderBattle(){
 const b=view().battle;
 return stageTop(byId(c.blindKinds,b.kindId).name)+`<main class="battle">${foeZone()}${anim?'':forecastBox()}<section class="zone">${partyRow('battle')}</section></main>${handDock()}`;
}

/* ── 정산·상점 ── */
function renderCashout(){
 const b=state.battle,co=b.cashout,m=monsterOf(b.monsterId),final=state.run.ante===c.balance.anteCount-1&&b.kindId==='boss',e=c.economy;
 return stageTop('정산')+`<main class="cashout"><div class="monster-slot defeated-art">${ic(m.assetId,'monster-art')}</div><h2>격파!</h2><p class="lead">${nameOf(m.nameKey)} · ${b.turn}턴 만에</p>
 <table class="table cash"><tr><td>${byId(c.blindKinds,b.kindId).name} 보상</td><td>${coin(co.blindGold)}</td></tr><tr><td>${e.speedTurns}턴 안에 끝냄</td><td>${coin(co.speedGold)}</td></tr><tr><td>이자 (${e.interestPer}골드당 1, 최대 ${e.interestMax})</td><td>${coin(co.interest)}</td></tr><tr class="sum"><td>합계</td><td>${coin(co.total)}</td></tr></table>
 <p class="wallet">다이아몬드 ${gem('+'+b.diamonds)}</p></main>
 <footer class="dock"><button type="button" class="go" data-action="cashout"><span class="go-label">${final?'원정 완료!':`${coin(co.total)} 받고 상점으로`}</span></button></footer>`;
}
function offerCard(o,i){
 const d=byId(c.characters,o.defId),free=state.run.team.characters.some(u=>!u);
 return `<button type="button" class="offer k-${d.jobId.slice(4)} ${o.sold?'sold':''}" data-action="buy-char" data-index="${i}" ${o.sold?'disabled':''}><canvas data-def-render="${o.defId}"></canvas><span class="o-body"><b>${nameOf(o.defId)}</b><span class="o-text">체력 ${d.hp} · 공격 ${d.atk}</span><small class="o-tags">어울리는 무기 ${jobWeaponName(o.defId)}${free?'':' · 빈 칸 없음'}</small></span><span class="price">${o.sold?'합류함':coin(o.cost)}</span></button>`;
}
function renderShop(){
 const sh=state.shop,r=state.run,next=blindInfo(r,c),any=r.team.characters.some(u=>hurt(u,c));
 return stageTop('상점')+`<main class="shop">
 <section class="zone"><div class="zone-head"><strong>${uiIcon('people')} 원정대</strong><button type="button" class="link" data-action="deck">${uiIcon('cards')} 덱 ${r.deck.length}장</button></div>${partyRow('shop')}
 <button type="button" class="slot-buy" data-action="heal-all" ${any?'':'disabled'}>전체 치료 (+${Math.round(c.shopRules.healAllRatio*100)}%) ${coin(c.shopRules.healAllCost)}</button></section>
 <section class="zone"><div class="zone-head"><strong>동료 영입</strong><button type="button" class="link reroll" data-action="reroll">↻ 새로고침 ${coin(rerollCost(state,c))}</button></div><div class="offers">${sh.recruits.map(offerCard).join('')}</div></section>
 <section class="zone"><div class="zone-head"><strong>스티커</strong></div><div class="offers">${c.packs.map(p=>`<button type="button" class="offer item" data-action="buy-pack" data-pack="${p.id}"><span class="i-sym">${p.kinds==='star'?'★':'＋'}</span><span class="o-body"><b>${p.name}</b><span class="o-text">${p.text}</span></span><span class="price">${coin(p.cost)}</span></button>`).join('')}</div></section></main>
 <footer class="dock"><button type="button" class="go" data-action="leave-shop">다음: ${next.kind.name} <small>체력 ${fmt(next.hp)} · 공격 ${fmt(next.atk)}</small></button></footer>`;
}

/* ── 결과 ── */
function renderRunResult(){
 const win=state.run.result==='win',h=state.history,last=h[h.length-1];
 return stageTop()+`<main class="result"><h2 class="${win?'':'lose'}">${win?'원정 성공':'원정 실패'}</h2><p class="lead">${win?`앤티 ${c.balance.anteCount} 보스까지 모두 쓰러뜨렸어요.`:`앤티 ${last.ante+1} ${byId(c.blindKinds,last.kindId).name}에서 원정대가 쓰러졌어요.`}</p>
 <table class="table history">${h.map(x=>`<tr class="${x.outcome}"><td>앤티 ${x.ante+1} ${byId(c.blindKinds,x.kindId).name}</td><td>${x.outcome==='win'?`${x.turns}턴`:'패배'}</td></tr>`).join('')}</table>
 <p class="wallet">이번 원정 ${gem('+'+(state.run.diamonds??0))} · 보유 ${gem(wallet.diamonds)}</p>
 ${members().length?partyRow('static'):''}</main><footer class="dock"><button type="button" class="go" data-action="restart">다시 원정</button></footer>`;
}

/* ── 신규 유저 안내 ── */
const TIP_KEY='stickerBattle.tips.v3';
const seenTips=(()=>{try{return new Set(JSON.parse(localStorage.getItem(TIP_KEY)??'[]'));}catch{return new Set();}})();
function saveTips(){try{localStorage.setItem(TIP_KEY,JSON.stringify([...seenTips]));}catch{}}
const battling=()=>state.phase==='battle'&&!anim;
const tips=[
 {id:'attack',when:()=>battling()&&state.battle.turn===1&&state.run.ante===0&&state.run.blindIndex===0,text:`스티커를 눌러 고르고 캐릭터를 눌러 붙이세요(${c.balance.attachLimit}번). 별은 레벨, 무기는 공격이에요. 다 붙였으면 전투!`},
 {id:'swap',when:()=>battling()&&members().length>1,text:'몬스터는 맨 오른쪽(피격 1번)부터 때려요. 위험한 동료는 "자리 바꾸기"로 순서를 바꿔 피해를 돌리세요. 한 턴에 한 번이에요.'},
 {id:'skill',when:()=>battling()&&members().some(u=>skillOf(u,c)),text:'무기와 속성이 함께 붙으면 스킬이 생겨요. 액티브는 쓰고 나면 쿨타임이 돌고, 패시브는 늘 켜져 있어요.'},
 {id:'fit',when:()=>state.phase==='battle'&&!anim&&members().some(u=>fitOf(u,teamOf(),c)<1),text:'직업에 어울리지 않는 무기를 들면 공격과 스킬이 줄어요. 전사는 검, 궁수는 활, 마법사는 지팡이예요.'},
 {id:'element',when:()=>battling()&&members().some(u=>u.elementId),text:'속성은 상성만 정해요. 몬스터를 이기는 속성은 공격 ×1.5, 지는 속성은 몬스터의 반격이 더 아파요.'},
 {id:'shop',when:()=>state.phase==='shop',text:'체력은 전투가 끝나도 이어져요. 골드로 치료하고, 쓰러진 자리에는 새 동료를 영입하세요. 쓰러진 동료의 스티커는 사라져요.'},
];
let activeTip=null;
function pickTip(){
 if(activeTip&&!activeTip.when()){seenTips.add(activeTip.id);saveTips();activeTip=null;}
 if(!activeTip&&!sel&&!swapMode)activeTip=tips.find(t=>!seenTips.has(t.id)&&t.when())??null;
 return activeTip;
}
function dismissTip(){if(activeTip){seenTips.add(activeTip.id);saveTips();activeTip=null;}render();}

/* ── 렌더 ── */
function render(){
 const p=state.phase;closePop();
 app.innerHTML=p==='title'?renderTitle():p.startsWith('starter_')?renderStarter():p==='blind_select'?renderBlindSelect():p==='battle'||anim?renderBattle():p==='cashout'?renderCashout():p==='shop'?renderShop():renderRunResult();
 const tip=pickTip();if(tip)app.insertAdjacentHTML('beforeend',`<div class="tip" role="note"><p>${tip.text}</p><button type="button" data-action="tip-ok">알겠어요</button></div>`);
 paint(app);decorateUnits();
}
function paint(root){
 for(const canvas of root.querySelectorAll('[data-render]')){const unit=view().run?.team.characters.find(u=>u?.instanceId===canvas.dataset.render);if(unit)renderCharacter(canvas,unit,c);}
 for(const canvas of root.querySelectorAll('[data-def-render]'))renderCharacter(canvas,makeUnit('def_'+canvas.dataset.defRender,canvas.dataset.defRender,c),c);
}
// 레벨 3부터 속성 입자 효과.
function decorateUnits(){
 for(const el of app.querySelectorAll('.punit[data-slot]')){
  const u=view().run?.team.characters[Number(el.dataset.slot)];if(!u?.elementId||u.level<3)continue;
  const field=document.createElement('span');field.className='element-fx '+u.elementId.replace('element_','')+(u.weaponId?'':' body-fx');field.setAttribute('aria-hidden','true');field.style.setProperty('--element-color',elementOf(u.elementId).color);field.innerHTML='<i></i><i></i><i></i>';el.append(field);
 }
}
function floatText(el,text,cls){if(!el)return;const s=document.createElement('span');s.className='floater '+cls;s.textContent=text;el.append(s);setTimeout(()=>s.remove(),1000);}
function burst(text,loss=false){if(reduced)return;const d=document.createElement('div');d.className='burst'+(loss?' loss':'');d.textContent=text;app.append(d);setTimeout(()=>d.remove(),1100);}
function banner(text,sub=''){if(reduced)return;const d=document.createElement('div');d.className='turn-banner';d.innerHTML=`${text}${sub?`<small>${sub}</small>`:''}`;app.append(d);setTimeout(()=>d.remove(),1000);}
function animateFx(el,frames,options){if(reduced){el.remove();return;}const a=el.animate(frames,{easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards',...options});a.finished.catch(()=>{}).finally(()=>el.remove());return a;}
function centerOf(el){const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}
function particles(el,color='#f5c64b',count=10){
 if(reduced||!el)return;const {x,y}=centerOf(el);
 for(let i=0;i<count;i++){const a=i/count*Math.PI*2,d=32+Math.random()*40,n=document.createElement('i');n.className='fx-particle';n.style.cssText=`left:${x}px;top:${y}px;background:${color}`;document.body.append(n);animateFx(n,[{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:`translate(${Math.cos(a)*d}px,${Math.sin(a)*d+15}px) rotate(${i*57}deg) scale(.2)`,opacity:0}],{duration:550+i*15});}
}

/* ── 커맨드 ── */
function command(type,payload={}){
 const prev=state,r=applyCommand(state,{type,commandId:`ui_${++serial}`,...payload},c);
 if(r.error){toast(messages[r.error]??'다시 시도해주세요.');return false;}
 state=r.state;
 const won=r.events.find(e=>e.type==='BlindWon');if(won)addDiamonds(won.diamonds);
 if(type==='ShuffleStarter')shuffleRun={skip:false};
 if(type==='Attach')sel=null;
 if(type==='Fight'){sel=null;swapMode=false;swapFrom=null;anim={prev,token:null};render();playRound();return true;}
 if(['SelectBlind','PickStarter','RestartRun','CashOut','LeaveShop','BeginJourney'].includes(type)){sel=null;swapMode=false;swapFrom=null;}
 render();afterCommand(type,r.events);return true;
}
function afterCommand(type,events){
 for(const e of events){
  if(e.type==='Attached'){
   const el=app.querySelector(`.punit[data-slot="${e.slot}"]`);particles(el);
   const u=state.run.team.characters[e.slot];
   if(e.kind==='star')floatText(el,`Lv${u.level}!`,'up note');
   if(e.skillId){const s=byId(c.skills,e.skillId);burst(`${s.name} 완성!`);}
  }
  if(e.type==='CharacterJoined'){const el=app.querySelector(`.punit[data-slot="${e.slot}"]`);particles(el);floatText(el,'합류!','up note');}
  if(e.type==='CardsAdded')toast(`스티커 ${e.cards.length}장이 덱에 들어왔어요.`);
  if(e.type==='Healed'){burst('치료!');}
  if(e.type==='BlindStarted'){app.querySelector('.hand')?.classList.add('dealing');const info=blindInfo(state.run,c);banner(byId(c.blindKinds,e.kindId).name,`체력 ${fmt(info.hp)}`);}
  if(e.type==='StarterPicked'){const el=app.querySelector('.rcard.picked');particles(el,'#f5c64b',22);if(el&&!reduced)el.animate([{transform:'translateY(-18px) rotateY(180deg) scale(1.1)'},{transform:'translateY(-18px) rotateY(0) scale(1.1)'}],{duration:450,easing:'ease-out'});}
  if(e.type==='StarterShuffled')playStarterShuffle();
 }
}

/* ── 시작 동료 섞기: 뒤집고, 한 곳에 모아 마구 흔든 뒤 펼친다. 어느 카드가 어디로 가는지 눈으로 따라갈 수 없다 ── */
async function playStarterShuffle(){
 const shell=app.querySelector('#shell'),cards=[...app.querySelectorAll('.rcard')],st=state.starter,lead=document.getElementById('starter-lead');
 const token=shuffleRun??{skip:false};shuffleRun=token;let timer=null;
 const finish=()=>{
  clearInterval(timer);
  // 최종 자리 확정: order[p]번 후보가 p번 자리. 연출을 건너뛰어도 같은 결과.
  cards.forEach(el=>{el.getAnimations().forEach(a=>a.cancel());el.style.zIndex='';const p=st.order.indexOf(Number(el.dataset.offer));el.style.setProperty('--slot',p);el.dataset.slot=String(p);el.classList.add('down');});
  shuffleRun=null;shell?.classList.add('ready');if(lead)lead.textContent='카드를 하나 골라 뒤집으세요.';
 };
 if(reduced){finish();return;}
 const wait=ms=>token.skip?Promise.resolve():new Promise(res=>setTimeout(res,ms));
 const rand=(a,b)=>a+Math.random()*(b-a);
 await wait(350);if(token.skip)return finish();
 cards.forEach(el=>el.classList.add('down'));await wait(600);if(token.skip)return finish();
 shell?.style.setProperty('--swap-ms','460ms');cards.forEach((el,i)=>{el.style.setProperty('--slot',1);el.style.zIndex=String(i+1);});await wait(520);if(token.skip)return finish();
 // 흔들기: 카드마다 서로 다른 무작위 경로로 빠르게, 쌓이는 순서도 계속 뒤섞는다.
 cards.forEach(el=>el.animate(Array.from({length:22},()=>({transform:`translate(${rand(-80,80)}px,${rand(-34,34)}px) rotate(${rand(-28,28)}deg) scale(${rand(.92,1.05)})`})),{duration:1700,easing:'linear'}));
 timer=setInterval(()=>{const z=[...cards.keys()].sort(()=>Math.random()-.5);cards.forEach((el,i)=>el.style.zIndex=String(z[i]+1));},70);
 await wait(1700);if(token.skip)return finish();
 clearInterval(timer);cards.forEach(el=>el.getAnimations().forEach(a=>a.cancel()));
 // 펼치기
 cards.forEach(el=>{const p=st.order.indexOf(Number(el.dataset.offer));el.style.setProperty('--slot',p);el.dataset.slot=String(p);});
 await wait(520);finish();
}

/* ── 전투 연출: 앞에서부터 차례로 공격하고, 몬스터가 맨 뒤 동료부터 반격한다 ── */
async function playRound(){
 const b=state.battle,events=b.lastRound.events,$=id=>document.getElementById(id);
 const pend=new Set(),token={skip:false,flush(){this.skip=true;pend.forEach(fn=>fn());pend.clear();}};anim.token=token;
 const wait=ms=>token.skip||reduced?Promise.resolve():new Promise(res=>{const fin=()=>{clearTimeout(t);pend.delete(fin);res();},t=setTimeout(fin,ms);pend.add(fin);});
 const zone=$('blind-zone'),hpEl=$('hp'),hpText=$('hp-text'),max=b.monster.maxHp;
 const tile=slot=>app.querySelector(`.punit[data-slot="${slot}"]`);
 const setMonster=hp=>{if(hpEl)hpEl.style.width=hp/max*100+'%';if(hpText)hpText.textContent=`${fmt(hp)} / ${fmt(max)}`;};
 const setUnit=(slot,hp)=>{const el=tile(slot);if(!el)return;const m=Number(el.dataset.max);const bar=el.querySelector('.uhp');if(bar){bar.firstElementChild.style.width=Math.max(0,hp/m*100)+'%';bar.lastElementChild.textContent=`${Math.max(0,hp)}/${m}`;}};
 const charge=el=>{if(!el||reduced)return;el.classList.add('charge');setTimeout(()=>el.classList.remove('charge'),420);};
 await wait(350);
 for(const e of events){
  if(token.skip)break;
  if(e.type==='attack'){
   const el=tile(e.slot);charge(el);
   if(e.skillId){floatText(el,byId(c.skills,e.skillId).name+'!','up note');await wait(260);}
   let hp=Number(hpText?.textContent.split('/')[0].replace(/,/g,''));
   for(const h of e.hits){
    if(token.skip)break;
    hp=Math.max(0,hp-h);floatText(zone,'-'+fmt(h),'down dmg');zone?.classList.remove('hit');void zone?.offsetWidth;zone?.classList.add('hit');particles(zone?.querySelector('.monster-slot'),'#fff3c4',6);setMonster(hp);
    await wait(e.hits.length>1?230:420);
   }
   setMonster(e.monsterHp);
  }else if(e.type==='heal'){
   const el=tile(e.slot);charge(el);floatText(el,byId(c.skills,e.skillId).name+'!','up note');await wait(260);
   floatText(tile(e.target),'+'+e.amount,'up');setUnit(e.target,e.hp);await wait(420);
  }else if(e.type==='counter'){
   zone?.classList.remove('counter');void zone?.offsetWidth;zone?.classList.add('counter');await wait(260);
   const el=tile(e.slot);floatText(el,'-'+e.dmg,'down');setUnit(e.slot,e.hp);el?.classList.add('hurt');
   if(!reduced){app.classList.remove('quake');void app.offsetWidth;app.classList.add('quake');}
   if(e.killed){el?.classList.add('ko');particles(el,'#ff7a68',16);}
   await wait(e.killed?700:480);
  }else if(e.type==='monsterDown'){zone?.classList.add('defeated');particles(zone?.querySelector('.monster-slot'),'#f5c64b',26);await wait(300);}
 }
 // 건너뛰었더라도 끝 상태로 맞춘다.
 setMonster(b.monster.hp);
 const t=state.run.team.characters;t.forEach((u,i)=>{if(u)setUnit(i,u.hp);});
 if(state.phase==='battle'){anim=null;render();app.querySelector('.hand')?.classList.add('dealing');return;}
 const win=state.phase==='cashout';
 if(!win){app.querySelectorAll('.punit').forEach(el=>el.classList.add('ko'));}
 app.querySelector('main')?.insertAdjacentHTML('beforeend',`<div class="verdict-layer ${win?'win':'lose'}"><div class="stamp ${win?'win':'lose'}" role="status">${win?'격파!':'전멸'}${win?`<small>${gem('+'+b.diamonds)}</small>`:''}</div></div>`);
 const box=$('anim-actions');if(box)box.innerHTML=`<button type="button" class="go" data-action="anim-done">${win?'정산하기':'원정 결과'}</button>`;
 anim.token=null;anim.waiting=true;
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
 const v=view(),team=v.run.team.characters,u=team[slot],d=defOf(u,c),sk=skillOf(u,c),fit=fitOf(u,team,c),b=v.battle,job=byId(c.jobs,d.jobId);
 const rel=b&&u.elementId?relationMult(u.elementId,b.monster.elementId,c):1;
 return `<b class="pop-title">${nameOf(d.id)} <small>Lv${u.level}</small></b>
 <div class="pop-row">체력<em>${u.hp} / ${maxHpOf(u,c)}</em></div>
 <div class="pop-row">기본 공격<em>${d.atk} × ${fmt(c.balance.levelGrowth**(u.level-1))}(레벨)${u.weaponId?` × ${fmt(c.balance.weaponMult*c.balance.weaponPlusMult**u.weaponPlus)}(무기)`:''}</em></div>
 <div class="pop-row">무기<em>${u.weaponId?`${nameOf(u.weaponId)} +${u.weaponPlus}`:'없음'} <small>(어울리는 무기 ${nameOf(job.weaponId)})</small></em></div>
 <div class="pop-row">속성<em class="${rel>1?'good':rel<1?'bad':''}">${u.elementId?`${nameOf(u.elementId)}${rel>1?' ▲ 유리':rel<1?' ▼ 불리':''}`:'없음'}</em></div>
 ${fit<1?`<div class="pop-row bad">무기가 직업에 안 맞아 공격·스킬 ×${fmt(fit)}</div>`:''}
 ${sk?`<div class="pop-recipe on"><b>${sk.name}</b><small>${skillLine(sk)}</small></div>`:'<div class="pop-row dim">무기와 속성을 함께 붙이면 스킬이 생겨요.</div>'}`;
}
function openInfo(html){document.getElementById('info-content').innerHTML=html;const d=document.getElementById('info');if(!d.open)d.showModal();d.scrollTop=0;d.focus({preventScroll:true});paint(d);}
function cycleText(){const m=c.affinity.beats,start=Object.keys(m)[0];let k=start,s=[nameOf(k)];do{k=m[k];s.push(nameOf(k));}while(k!==start);return s.join(' > ');}
function showRules(){const b=c.balance,e=c.economy;openInfo(`<h2>원정 규칙</h2><ol>
<li>앤티 ${b.anteCount}개, 앤티마다 스몰·빅·보스 블라인드. 앤티 ${b.anteCount} 보스를 쓰러뜨리면 성공이에요.</li>
<li>전투는 턴제 자동 전투예요. 매 턴 스티커 ${b.handSize}장을 받아 <b>${b.attachLimit}장까지 붙이고</b>, 자리를 <b>${b.swapLimit}번 바꾼 뒤</b> 전투를 눌러요.</li>
<li>전투 한 라운드: <b>왼쪽(공격 1번)부터</b> 차례로 공격하고, 몬스터는 <b>맨 오른쪽(피격 1번)부터</b> 살아 있는 동료 한 명을 때려요. 양쪽이 살아 있으면 다음 턴이에요.</li>
<li>체력은 전투가 끝나도 이어져요. 쓰러진 동료는 <b>붙은 스티커와 함께 사라지고</b> 칸이 비어요. 모두 쓰러지면 원정이 끝나요.</li>
<li><b>별</b> 스티커는 레벨 +1(최대 ${b.maxLevel}). 체력과 공격에 레벨마다 ×${b.levelGrowth}가 곱해져요.</li>
<li><b>무기</b> 스티커는 공격 ×${b.weaponMult}. 같은 무기를 또 붙이면 강화로 ×${b.weaponPlusMult}씩 더 올라요(다른 무기는 교체).</li>
<li><b>속성</b> 스티커는 상성만 정해요. ${cycleText()}. 이기면 공격 ×${b.advantage}, 지면 ÷${b.advantage}이고, 몬스터가 때릴 때도 같아요.</li>
<li><b>적성</b>: 전사는 검, 궁수는 활, 마법사는 지팡이가 어울려요. 다른 무기를 들면 공격과 스킬이 ×${b.mismatchFit}가 돼요.</li>
<li><b>스킬</b>: 무기와 속성이 함께 붙으면 생겨요(스킬 화면 참고). 액티브는 쓰고 나면 쿨타임, 스킬이 바뀌면 바로 쓸 수 있어요.</li>
<li><b>골드</b>: 승리 보상 + ${c.economy.speedTurns}턴 안에 끝내면 보너스 + 이자(${e.interestPer}골드당 1, 최대 ${e.interestMax}). 상점에서 치료·영입·스티커를 사요.</li></ol><p class="note">수치는 재미와 균형 확인용 임시값입니다.</p><button type="button" class="ghost help-tips" data-help="tips">처음 안내 다시 보기</button>`);}
function showSkills(){
 openInfo(`<h2>스킬</h2><p class="sub">무기와 속성을 같은 동료에게 붙이면 생겨요. 속성이 성격을, 무기가 액티브 여부를 정해요. 직업에 안 맞는 무기면 수치가 ×${c.balance.mismatchFit}예요.</p>
 <div class="recipe-list">${[...c.skills].sort((a,b)=>c.elements.findIndex(e=>e.id===a.elementId)-c.elements.findIndex(e=>e.id===b.elementId)||(a.kind==='active'?-1:1)).map(s=>`<article class="${s.kind}">${ic(s.assetId,'recipe-art')}<b>${s.name}</b><small>${nameOf(s.weaponId)} + ${nameOf(s.elementId)}</small><p><em>${s.kind==='active'?`액티브 · 쿨 ${s.cooldown}`:'패시브'}</em> ${s.text}</p></article>`).join('')}</div>`);
}
function showRoster(){
 openInfo(`<h2>동료</h2><p class="sub">직업이 체력·공격과 어울리는 무기를 정해요. 종족은 지금은 겉모습뿐이에요. 영입 가격: ${c.jobs.map(j=>`${nameOf(j.id)} ${j.cost}`).join(' · ')}.</p>
 <div class="roster">${c.jobs.map(j=>`<article class="k-${j.id.slice(4)}"><b>${nameOf(j.id)}</b><small>체력 ${j.hp} · 공격 ${j.atk}</small><small>어울리는 무기 ${nameOf(j.weaponId)}</small></article>`).join('')}</div>
 <div class="roster chars">${c.characters.map(d=>`<article><canvas data-def-render="${d.id}"></canvas><b>${nameOf(d.id)}</b></article>`).join('')}</div>`);
}
function showDeck(){
 const r=state.run,b=state.phase==='battle'?state.battle:null,group=new Map();
 for(const card of r.deck)group.set(card.defId,(group.get(card.defId)??0)+1);
 const left=b?b.drawPile.reduce((m,x)=>m.set(x.defId,(m.get(x.defId)??0)+1),new Map()):null;
 openInfo(`<h2>덱 ${r.deck.length}장</h2>${b?`<p class="sub">뽑을 더미 ${b.drawPile.length}장. 다 쓰면 버린 카드를 섞어 다시 써요.</p>`:'<p class="sub">전투마다 덱 전체를 섞어서 시작해요.</p>'}<div class="deckgrid">${c.stickers.filter(s=>group.has(s.id)).map(s=>`<div class="deckcell">${stickerCard({uid:s.id,defId:s.id},{mini:true,action:'none'})}<small>${left?`${left.get(s.id)??0}/`:''}${group.get(s.id)}장</small></div>`).join('')}</div>`);
}
function showFoe(){
 const b=state.battle,m=monsterOf(b.monsterId),beater=beaterOf(b.elementId),loser=c.affinity.beats[b.elementId];
 openInfo(`<h2>${nameOf(m.nameKey)}</h2><table class="table"><tr><td>체력</td><td>${fmt(b.monster.hp)} / ${fmt(b.monster.maxHp)}</td></tr><tr><td>공격</td><td>${fmt(b.monster.atk)}</td></tr><tr><td>속성</td><td>${nameOf(b.elementId)}</td></tr><tr><td>▲ 유리 (공격 ×${c.balance.advantage})</td><td>${nameOf(beater)}</td></tr><tr><td>▼ 불리 (공격 ÷${c.balance.advantage})</td><td>${nameOf(loser)}</td></tr></table><p class="note">몬스터는 ${nameOf(b.elementId)} 속성이라 ${nameOf(loser)} 속성 동료에게는 피해가 ×${c.balance.advantage}, ${nameOf(beater)} 속성 동료에게는 ÷${c.balance.advantage}로 들어와요.</p>`);
}
document.getElementById('info-content').addEventListener('click',e=>{
 if(e.target.closest('[data-help="tips"]')){seenTips.clear();saveTips();activeTip=null;document.getElementById('info').close();render();}
});

/* ── 입력 ── */
let pointer=null,ghost=null,suppressClick=false;
function attachTo(slot){
 const u=state.run.team.characters[slot];
 if(!u){toast(messages.target);return;}
 if(!command('Attach',{uid:sel,targetInstanceId:u.instanceId})){sel=null;render();}
}
app.addEventListener('click',e=>{
 if(suppressClick){e.preventDefault();return;}
 if(shuffleRun){shuffleRun.skip=true;e.preventDefault();return;}
 if(anim?.token){anim.token.flush();e.preventDefault();return;}
 const el=e.target.closest('[data-action]');
 if(pop&&!e.target.closest('.pop'))closePop();
 if(!el||el.disabled)return;
 const a=el.dataset.action,idx=Number(el.dataset.index);
 switch(a){
 case 'tip-ok':dismissTip();break;
 case 'rules':showRules();break;
 case 'skills':showSkills();break;
 case 'roster':showRoster();break;
 case 'deck':if(state.run)showDeck();break;
 case 'foe-info':if(state.phase==='battle'&&!anim)showFoe();break;
 case 'start':command('StartRun',{seed:crypto.getRandomValues(new Uint32Array(1))[0]});break;
 case 'shuffle':command('ShuffleStarter');break;
 case 'pick':if(state.phase==='starter_pick'&&!shuffleRun)command('PickStarter',{position:Number(el.dataset.slot)});break;
 case 'begin':command('BeginJourney');break;
 case 'select-blind':command('SelectBlind');break;
 case 'card':{if(state.phase!=='battle')break;if(state.battle.attachesLeft<=0){toast(messages.limit);break;}swapMode=false;swapFrom=null;sel=sel===el.dataset.uid?null:el.dataset.uid;render();break;}
 case 'unit':{
  const slot=Number(el.dataset.slot);
  if(swapMode){
   if(swapFrom==null){if(!state.run.team.characters[slot]){toast('옮길 동료를 먼저 눌러 주세요.');break;}swapFrom=slot;render();}
   else if(swapFrom===slot){swapFrom=null;render();}
   else{const from=swapFrom;swapMode=false;swapFrom=null;command('SwapSlots',{a:from,b:slot});}
   break;
  }
  if(sel){closePop();attachTo(slot);break;}
  if(state.run.team.characters[slot])openPop('unit'+slot,el,unitPop(slot));
  break;
 }
 case 'unit-info':{const slot=Number(el.dataset.slot);if(state.run.team.characters[slot])openPop('unit'+slot,el,unitPop(slot));break;}
 case 'swap-mode':{if(state.battle.swapsLeft<=0){toast(messages.swapLimit);break;}swapMode=!swapMode;swapFrom=null;sel=null;render();break;}
 case 'fight':command('Fight');break;
 case 'anim-done':anim=null;render();break;
 case 'cashout':command('CashOut');break;
 case 'buy-char':command('BuyCharacter',{index:idx});break;
 case 'buy-pack':command('BuyPack',{packId:el.dataset.pack});break;
 case 'heal':command('HealUnit',{slot:Number(el.dataset.slot)});break;
 case 'heal-all':command('HealAll');break;
 case 'reroll':command('Reroll');break;
 case 'sell':command('SellCharacter',{slot:Number(el.dataset.slot)});break;
 case 'move':command('MoveCharacter',{from:Number(el.dataset.from),to:Number(el.dataset.to)});break;
 case 'leave-shop':command('LeaveShop');break;
 case 'restart':command('RestartRun');break;
 case 'restart-ask':openInfo('<h2>처음부터 다시 할까요?</h2><p>지금까지의 원정이 모두 초기화돼요.</p><button type="button" class="go" id="confirm-restart" style="width:100%;margin-top:16px">처음부터 다시</button>');document.getElementById('confirm-restart').onclick=()=>{document.getElementById('info').close();anim=null;sel=null;swapMode=false;command('RestartRun');};break;
 }
});
// 드래그: 손패 카드를 캐릭터 위에 놓으면 그 카드를 고르고 그 캐릭터에게 붙인다.
app.addEventListener('pointerdown',e=>{const el=e.target.closest('[data-action="card"]');if(!el||e.button!==0||state.phase!=='battle'||anim||state.battle.attachesLeft<=0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,uid:el.dataset.uid,html:el.outerHTML,dragging:false};});
document.addEventListener('pointermove',e=>{
 if(!pointer||pointer.id!==e.pointerId)return;
 if(!pointer.dragging&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8){pointer.dragging=true;app.setPointerCapture(e.pointerId);swapMode=false;swapFrom=null;sel=pointer.uid;render();ghost=document.createElement('div');ghost.className='dragghost';ghost.innerHTML=pointer.html;document.body.append(ghost);}
 if(!pointer.dragging)return;e.preventDefault();ghost.style.left=`${e.clientX}px`;ghost.style.top=`${e.clientY}px`;
 app.querySelectorAll('.punit.hover').forEach(x=>x.classList.remove('hover'));document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-action="unit"]')?.classList.add('hover');
},{passive:false});
function cancelDrag(){if(pointer&&app.hasPointerCapture(pointer.id))app.releasePointerCapture(pointer.id);pointer=null;ghost?.remove();ghost=null;app.querySelectorAll('.punit.hover').forEach(x=>x.classList.remove('hover'));}
document.addEventListener('pointerup',e=>{
 if(!pointer||pointer.id!==e.pointerId)return;const was=pointer.dragging;cancelDrag();
 if(!was)return;suppressClick=true;setTimeout(()=>suppressClick=false,0);
 const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-action="unit"]');
 if(target)attachTo(Number(target.dataset.slot));else{sel=null;render();}
});
document.addEventListener('pointercancel',()=>{if(pointer){cancelDrag();sel=null;render();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pop){closePop();return;}if(e.key==='Escape'&&(sel||swapMode)&&state.phase==='battle'){sel=null;swapMode=false;swapFrom=null;render();}});
app.addEventListener('scroll',()=>closePop(),true);
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('paused',document.hidden);if(document.hidden)cancelDrag();});
render();

return {};})();
