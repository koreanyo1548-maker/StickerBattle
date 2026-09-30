modules["src/content/data.mjs"]=(()=>{
const {applyArt}=modules["src/content/art.mjs"];

// 수치는 이 표에서만 수정한다. 데이터에는 화면 요소나 로직을 저장하지 않는다.
// 레벨 효과는 모두 value + perLevel×(Lv−1) 형태다.
const balance = Object.freeze({teamSize:3, blindCount:4, turnsPerBlind:6, handSize:5, attachLimit:3, basePower:5, weaponPower:5, starPower:3, affinityPerLevel:0.25, comboBonusPerLevel:1, comboMultPerLevel:0.25});
const labels = {
  race_human:'인간', race_elf:'엘프', race_orc:'오크', race_dwarf:'드워프', job_warrior:'전사', job_archer:'궁수', job_mage:'마법사',
  weapon_sword:'검', weapon_bow:'활', weapon_staff:'지팡이', element_fire:'불', element_water:'물', element_lightning:'번개', sticker_star:'별',
};
const races=['human','elf','orc','dwarf'].map(v=>({id:`race_${v}`,nameKey:`race_${v}`,iconAssetId:`icon_race_${v}`}));
const jobs=['warrior','archer','mage'].map(v=>({id:`job_${v}`,nameKey:`job_${v}`,iconAssetId:`icon_job_${v}`}));
const weapons=['sword','bow','staff'].map((v,i)=>({id:`weapon_${v}`,nameKey:`weapon_${v}`,powerBonus:balance.weaponPower,assetId:`asset_${v}`,compatibleRigIds:['rig_v1'],symbol:['†','⌒','✦'][i]}));
const elements=['fire','water','lightning'].map((v,i)=>({id:`element_${v}`,nameKey:`element_${v}`,assetId:`asset_${v}`,color:['#d96943','#448cab','#d5a327'][i],symbol:['火','水','ϟ'][i]}));
const characters=races.flatMap(r=>jobs.map(j=>({id:`char_${r.id.slice(5)}_${j.id.slice(4)}`,nameKey:`char_${r.id.slice(5)}_${j.id.slice(4)}`,raceId:r.id,jobId:j.id,basePower:balance.basePower,visualProfileId:`visual_${r.id.slice(5)}_${j.id.slice(4)}`})));
characters.forEach(c=>labels[c.nameKey]=`${labels[c.raceId]} ${labels[c.jobId]}`);
const stickers=[...weapons.map(w=>({id:w.id.replace('weapon_','sticker_'),kind:'weapon',payloadId:w.id,nameKey:w.nameKey,iconAssetId:w.assetId})),...elements.map(e=>({id:e.id.replace('element_','sticker_'),kind:'element',payloadId:e.id,nameKey:e.nameKey,iconAssetId:e.assetId})),{id:'sticker_star',kind:'star',starAmount:1,nameKey:'sticker_star',iconAssetId:'asset_star'}];
const comboAxes=['race','job','weapon','element','star'];
// 족보 레벨은 levelKind(페어·컬렉션·트리플) 단위로 공유한다. 별 축은 별 레벨로 판정하고 보너스에 별 레벨을 곱한다.
const comboLevelKinds=['pair','collection','triple'];
const combos=comboAxes.flatMap(axis=>{const star=axis==='star';return [
 {kind:'pair',levelKind:'pair',threshold:2,priority:1,bonus:star?3:5},
 {kind:star?'straight':'collection',levelKind:'collection',threshold:3,priority:2,bonus:star?6:10},
 {kind:'triple',levelKind:'triple',threshold:3,priority:3,bonus:star?9:15}
].map(r=>({id:`combo_${axis}_${r.kind}`,axis,kind:r.kind,levelKind:r.levelKind,threshold:r.threshold,priority:r.priority,flatPowerBonus:r.bonus,scaleByStarLevel:star,exclusiveGroup:axis}));});
// 효과 정의와 조합/획득 경로를 분리한다. 추후 완성 무기도 같은 effectId를 참조한다.
// 속성이 연산을 정한다: 불 multiply(배율), 물 add·targetPercent(기초·최종 점수), 번개 accumulate(턴 종료마다 누적).
// 세기 = value + perLevel×(레시피 Lv−1). count가 여러 번이면 multiply는 거듭제곱, 나머지는 곱한다. scaleBy가 있으면 그 값을 곱한다.
const weaponEffects=[
 {id:'effect_flame_sword',condition:'combo',axis:'weapon',kinds:['triple'],operation:'multiply',value:2,perLevel:0.5},
 {id:'effect_blast_bow',condition:'completeAxes',axes:['weapon','element','star'],operation:'multiply',value:1.3,perLevel:0.1},
 {id:'effect_flame_staff',condition:'combo',axis:'star',kinds:['triple'],operation:'multiply',value:2.5,perLevel:0.5},
 {id:'effect_reflux_sword',condition:'always',operation:'targetPercent',value:10,perLevel:5},
 {id:'effect_rainbow_bow',condition:'collections',operation:'add',value:8,perLevel:4},
 {id:'effect_balance_staff',condition:'starBalance',maxGap:1,operation:'add',scaleBy:'starLevelSum',value:3,perLevel:1},
 {id:'effect_hone_sword',condition:'combo',axis:'weapon',kinds:['pair','triple'],operation:'accumulate',value:4,perLevel:2},
 {id:'effect_chain_bow',condition:'combo',axis:'element',kinds:['collection'],operation:'accumulate',value:5,perLevel:2},
 {id:'effect_charge_staff',condition:'always',operation:'accumulate',scaleBy:'maxStarLevel',value:1,perLevel:1}
];
const effectConditions=['combo','completeAxes','always','collections','starBalance'];
const effectOperations=['multiply','add','targetPercent','accumulate'];
const effectScales=['starLevelSum','maxStarLevel'];
const weaponRecipes=[
 ['flame_sword','sword','fire','화염검'],['blast_bow','bow','fire','폭발궁'],['flame_staff','staff','fire','화염 지팡이'],
 ['reflux_sword','sword','water','역류검'],['rainbow_bow','bow','water','무지개 활'],['balance_staff','staff','water','균형 지팡이'],
 ['hone_sword','sword','lightning','연마검'],['chain_bow','bow','lightning','연쇄궁'],['charge_staff','staff','lightning','축적 지팡이']
].map(([key,w,e,name])=>({id:`recipe_${key}`,weaponId:`weapon_${w}`,elementId:`element_${e}`,effectId:`effect_${key}`,assetId:`asset_${key}`,name,acquisition:'combination'}));
const initialDeck=stickers.flatMap(s=>Array(s.kind==='star'?6:2).fill(s.id));
// 붙이기 규칙. 같은 무기 중첩(쌍검 등)은 나중에 'combine'으로 확장한다.
const attachRules={sameWeapon:'reject',otherElement:'replaceAndReset'};
const rig={id:'rig_v1',width:512,height:512,outline:8,anchors:{body:{x:0,y:0},weapon:{x:356,y:318},hand:{x:356,y:318},element:{x:386,y:158}},layerOrder:['body','weapon','hand','element']};
// file에 투명 PNG 경로를 넣으면 해당 임시 파츠만 자동 교체된다.
const assets={};
function asset(id,pivot={x:0,y:0}){assets[id]={id,file:null,width:1024,height:1024,pivot,rigId:rig.id,revision:1};return id;}
const visuals={};
characters.forEach(c=>{visuals[c.visualProfileId]={id:c.visualProfileId,rigId:rig.id,bodyAssetId:asset(`${c.id}_body`),frontHandAssetId:asset(`${c.id}_hand`,{x:712,y:636}),anchors:rig.anchors,layerOrder:rig.layerOrder};});
weapons.forEach(w=>asset(w.assetId,{x:712,y:636}));elements.forEach(e=>asset(e.assetId,{x:772,y:316}));asset('asset_star');[...races,...jobs].forEach(d=>asset(d.iconAssetId));asset('asset_background');
// 블라인드: 목표 점수 하나. 속성은 런 시작 때 시드로 정한다. 몬스터 그림은 아직 없어 속성 아이콘으로 대신한다.
const blinds=[100,400,1200,3500].map((target,i,a)=>({id:`blind_${i+1}`,target,boss:i===a.length-1}));
// 일반 블라인드는 블라인드 속성의 몬스터, 보스 블라인드는 bossMonsterId. 보스 속성도 시드로 정한다.
const monsters=[...elements.map(e=>({id:`monster_${e.id.slice(8)}`,elementId:e.id})),{id:'monster_boss',elementId:null}].map(m=>({...m,nameKey:m.id,assetId:asset(`asset_${m.id}`)}));
const bossMonsterId='monster_boss';
Object.assign(labels,{monster_fire:'불꽃 슬라임',monster_water:'물결 슬라임',monster_lightning:'번개 슬라임',monster_boss:'슬라임 왕'});
asset('asset_reward_back');
applyArt(assets,visuals);
// 캐릭터 카드: 블라인드별 확정 턴에는 손패 1장이 캐릭터 카드가 되고, 그 외 턴은 randomChance 확률.
const characterRules={guaranteedTurns:[[1,2,3],[1],[1],[1]],randomChance:0.2};
// 상성: 키가 값을 이긴다. 캐릭터마다 유리 ×(1+k·Lv), 불리 ÷(1+k·Lv), k=affinityPerLevel.
const affinity={beats:{element_fire:'element_lightning',element_lightning:'element_water',element_water:'element_fire'}};
// 블라인드 사이 보상: 앞면 3장 공개 → 뒤집어 섞기 → 1장 선택. 후보는 보유한 레시피 각각과 족보 종류 3개.
// swaps는 보상 차례(블라인드 1·2·3 이후)별 섞기 교체 횟수.
const rewardRules={offerCount:3,grades:[{id:'low',weight:60,levels:1},{id:'mid',weight:30,levels:2},{id:'high',weight:10,levels:3}],comboKinds:comboLevelKinds,swaps:[3,5,6]};
const content={version:'0.8.0',characterRules,affinity,balance,labels,races,jobs,weapons,elements,characters,stickers,comboAxes,comboLevelKinds,combos,weaponEffects,weaponRecipes,initialDeck,attachRules,rig,assets,visuals,blinds,monsters,bossMonsterId,rewardRules};
const byId=(list,id)=>list.find(x=>x.id===id);
const nameOf=id=>labels[id]??id??'없음';
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;}
deepFreeze(content);
function validateContent(c=content){
 const check=(v,msg)=>{if(!v)throw Error(`콘텐츠 오류: ${msg}`);};
 const num=v=>Number.isFinite(v)&&v>=0;
 for(const [key,table] of Object.entries({characters:c.characters,stickers:c.stickers,combos:c.combos,weaponEffects:c.weaponEffects,weaponRecipes:c.weaponRecipes,weapons:c.weapons,elements:c.elements,races:c.races,jobs:c.jobs,blinds:c.blinds,monsters:c.monsters})){check(new Set(table.map(x=>x.id)).size===table.length,`${key} ID 중복`);}
 Object.entries(c.balance).forEach(([k,v])=>check(num(v),`수치 ${k}`));
 check(c.balance.teamSize===3,'지원 편성');
 for(const d of c.characters){check(byId(c.races,d.raceId)&&byId(c.jobs,d.jobId),'종족/직업 참조');check(num(d.basePower),'기본 전투력');check(c.visuals[d.visualProfileId],'외형 참조');}
 for(const v of Object.values(c.visuals)){check(v.rigId===c.rig.id&&c.assets[v.bodyAssetId]&&c.assets[v.frontHandAssetId],'몸체 rig/파츠');}
 for(const w of c.weapons){check(w.compatibleRigIds.includes(c.rig.id)&&c.assets[w.assetId],'무기 rig/이미지');check(num(w.powerBonus),'무기 전투력');}
 for(const s of c.stickers){check(c.assets[s.iconAssetId],'스티커 이미지');check(s.kind==='weapon'?byId(c.weapons,s.payloadId):s.kind==='element'?byId(c.elements,s.payloadId):s.kind==='star'&&s.starAmount===1,'스티커 구성');}
 for(const rule of c.combos){check(c.comboAxes.includes(rule.axis)&&rule.exclusiveGroup===rule.axis,'족보 축');check([2,3].includes(rule.threshold)&&num(rule.flatPowerBonus),'족보 수치');check(['pair','collection','straight','triple'].includes(rule.kind)&&c.comboLevelKinds.includes(rule.levelKind)&&Number.isInteger(rule.priority),'족보 종류/레벨/우선순위');}
 for(const effect of c.weaponEffects){
  check(effectConditions.includes(effect.condition),'효과 조건');
  check(effectOperations.includes(effect.operation)&&num(effect.value)&&effect.value>0&&num(effect.perLevel),'효과 연산');
  check(!effect.scaleBy||effectScales.includes(effect.scaleBy),'효과 배수 기준');
  if(effect.condition==='combo')check(c.comboAxes.includes(effect.axis)&&effect.kinds.length&&effect.kinds.every(k=>c.combos.some(r=>r.axis===effect.axis&&r.kind===k)),'효과 족보 조건');
  if(effect.condition==='completeAxes')check(effect.axes.every(a=>c.comboAxes.includes(a)),'효과 완성 축');
  if(effect.condition==='starBalance')check(Number.isInteger(effect.maxGap)&&effect.maxGap>=0,'효과 별 균형');
 }
 check(new Set(c.weaponRecipes.map(r=>r.weaponId+':'+r.elementId)).size===c.weaponRecipes.length,'조합 중복');
 for(const recipe of c.weaponRecipes)check(byId(c.weapons,recipe.weaponId)&&byId(c.elements,recipe.elementId)&&byId(c.weaponEffects,recipe.effectId)&&c.assets[recipe.assetId],'무기 조합 참조');
 check(['reject'].includes(c.attachRules.sameWeapon)&&['replaceAndReset'].includes(c.attachRules.otherElement),'붙이기 규칙');
 c.initialDeck.forEach(id=>check(byId(c.stickers,id),'덱 참조'));
 check(c.initialDeck.length>=c.balance.handSize,'덱 크기');
 check(c.blinds.length===c.balance.blindCount&&c.blinds.every((b,i)=>Number.isInteger(b.target)&&b.target>0&&(i===0||b.target>c.blinds[i-1].target)),'블라인드 목표 점수');
 for(const m of c.monsters)check((!m.elementId||byId(c.elements,m.elementId))&&c.assets[m.assetId]&&labels[m.nameKey],'몬스터 참조');
 check(byId(c.monsters,c.bossMonsterId),'보스 몬스터');
 check(c.elements.every(e=>c.monsters.some(m=>m.elementId===e.id)),'속성별 몬스터');
 for(const [k,v] of Object.entries(c.affinity.beats))check(byId(c.elements,k)&&byId(c.elements,v),'상성 참조');
 {const b=c.affinity.beats,seen=new Set();let k=c.elements[0].id;while(k&&!seen.has(k)){seen.add(k);k=b[k];}check(k===c.elements[0].id&&seen.size===c.elements.length,'상성은 모든 속성을 한 바퀴 도는 순환');}
 check(c.characterRules.guaranteedTurns.length===c.balance.blindCount&&c.characterRules.guaranteedTurns.every(ts=>ts.every(t=>Number.isInteger(t)&&t>=1&&t<=c.balance.turnsPerBlind))&&c.characterRules.randomChance>=0&&c.characterRules.randomChance<=1,'캐릭터 카드 규칙');
 const rw=c.rewardRules;
 check(rw.offerCount===3&&rw.grades.every(g=>Number.isInteger(g.weight)&&g.weight>0&&Number.isInteger(g.levels)&&g.levels>0)&&rw.comboKinds.every(k=>c.comboLevelKinds.includes(k)),'보상 규칙');
 check(rw.swaps.length===c.balance.blindCount-1&&rw.swaps.every(n=>Number.isInteger(n)&&n>0),'보상 섞기 횟수');
 return true;
}

return {characterRules,affinity,balance,labels,races,jobs,weapons,elements,characters,stickers,comboAxes,comboLevelKinds,combos,weaponEffects,weaponRecipes,initialDeck,attachRules,rig,assets,visuals,blinds,monsters,bossMonsterId,rewardRules,content,byId,nameOf,validateContent};})();
