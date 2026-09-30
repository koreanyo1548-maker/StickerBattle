modules["src/content/data.mjs"]=(()=>{
const {applyArt}=modules["src/content/art.mjs"];

// 수치는 이 표에서만 수정한다. 데이터에는 화면 요소나 로직을 저장하지 않는다.
const balance = Object.freeze({teamSize:3, teamHp:60, startStars:0, maxStars:3, drawCount:3, attachLimit:2, maxTurns:8, basePower:2, weaponPower:2, starPower:1, pairBonus:2, collectionBonus:3, tripleBonus:5, doubleBonus:4, fullBonus:10, stageCount:3, maxElementStacks:3, elementBoostPercent:50, bodyElementPower:2, affinityPercent:10});
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
const combos=comboAxes.flatMap(axis=>[
 {kind:'pair',threshold:2,priority:1,bonus:balance.pairBonus},
 {kind:axis==='star'?'straight':'collection',threshold:3,priority:2,bonus:balance.collectionBonus},
 {kind:'triple',threshold:3,priority:3,bonus:balance.tripleBonus}
].map(r=>({id:`combo_${axis}_${r.kind}`,axis,kind:r.kind,threshold:r.threshold,priority:r.priority,flatPowerBonus:r.bonus,exclusiveGroup:axis})));
const compoundCombos=[
 {id:'combo_double',kind:'double',axes:['weapon','element','star'],threshold:2,flatPowerBonus:balance.doubleBonus},
 {id:'combo_full',kind:'full',axes:['weapon','element','star'],threshold:3,flatPowerBonus:balance.fullBonus}
];
// 효과 정의와 조합/획득 경로를 분리한다. 추후 완성 무기도 같은 effectId를 참조한다.
const weaponEffects=[
 {id:'effect_flame_sword',condition:'combo',axis:'weapon',kind:'triple',operation:'multiply',value:2},
 {id:'effect_blast_bow',condition:'completeAxes',operation:'multiply',value:1.3},
 {id:'effect_flame_staff',condition:'combo',axis:'star',kind:'triple',operation:'multiply',value:2.5},
 {id:'effect_reflux_sword',condition:'lowerScore',operation:'add',value:15},
 {id:'effect_rainbow_bow',condition:'collections',operation:'add',value:5},
 {id:'effect_balance_staff',condition:'allStars',operation:'add',value:12},
 {id:'effect_hone_sword',condition:'combo',axis:'weapon',kind:'pair',operation:'grow',value:4},
 {id:'effect_chain_bow',condition:'combo',axis:'element',kind:'collection',operation:'grow',value:5},
 {id:'effect_charge_staff',condition:'pairs',operation:'grow',value:2}
];
const weaponRecipes=[
 ['flame_sword','sword','fire','화염검'],['blast_bow','bow','fire','폭발궁'],['flame_staff','staff','fire','화염 지팡이'],
 ['reflux_sword','sword','water','역류검'],['rainbow_bow','bow','water','무지개 활'],['balance_staff','staff','water','균형 지팡이'],
 ['hone_sword','sword','lightning','연마검'],['chain_bow','bow','lightning','연쇄궁'],['charge_staff','staff','lightning','축적 지팡이']
].map(([key,w,e,name])=>({id:`recipe_${key}`,weaponId:`weapon_${w}`,elementId:`element_${e}`,effectId:`effect_${key}`,assetId:`asset_${key}`,name,acquisition:'combination'}));
const initialDeck=stickers.flatMap(s=>Array(s.kind==='star'?6:2).fill(s.id));
const rig={id:'rig_v1',width:512,height:512,outline:8,anchors:{body:{x:0,y:0},weapon:{x:356,y:318},hand:{x:356,y:318},element:{x:386,y:158}},layerOrder:['body','weapon','hand','element']};
// file에 투명 PNG 경로를 넣으면 해당 임시 파츠만 자동 교체된다.
const assets={};
function asset(id,pivot={x:0,y:0}){assets[id]={id,file:null,width:1024,height:1024,pivot,rigId:rig.id,revision:1};return id;}
const visuals={};
characters.forEach(c=>{visuals[c.visualProfileId]={id:c.visualProfileId,rigId:rig.id,bodyAssetId:asset(`${c.id}_body`),frontHandAssetId:asset(`${c.id}_hand`,{x:712,y:636}),anchors:rig.anchors,layerOrder:rig.layerOrder};});
weapons.forEach(w=>asset(w.assetId,{x:712,y:636}));elements.forEach(e=>asset(e.assetId,{x:772,y:316}));asset('asset_star');[...races,...jobs].forEach(d=>asset(d.iconAssetId));asset('asset_background');
applyArt(assets,visuals);
// 상대는 테마 덱(스티커 18장)과 캐릭터 후보로 정체성을 가진다. 행동 규칙은 플레이어와 같다.
function scenario(id,name,pool,counts){
 const deck=Object.entries(counts).flatMap(([k,n])=>Array(n).fill(`sticker_${k}`));
 return {id,name,characterPool:pool.map(v=>`char_${v}`),deck,hp:balance.teamHp};
}
// 전투마다 상성 정체성: 1전 속성(물), 2전 무기(지팡이), 3전 세 축(엘프·검·불)
const allChars=['human','elf','orc','dwarf'].flatMap(r=>['warrior','archer','mage'].map(j=>`${r}_${j}`));
const scenarios=[
 scenario('enemy_1','물결 방랑단',allChars,{sword:2,bow:2,staff:2,water:4,fire:1,lightning:1,star:6}),
 scenario('enemy_2','지팡이 결사',['human_mage','elf_mage','orc_mage','dwarf_mage'],{staff:4,sword:1,bow:1,fire:2,water:2,lightning:2,star:6}),
 scenario('enemy_3','불꽃의 기사단',['elf_warrior','elf_archer','elf_mage'],{sword:4,bow:1,staff:1,fire:4,water:1,lightning:1,star:6})
];
// 캐릭터 카드: 해당 턴에 손패 1장을 캐릭터 카드로 대체한다. 교체는 replaceFromTurn부터.
const characterRules={drawTurns:[1,2,3,7,8],replaceFromTurn:7};
// 상성: 키가 값을 이긴다. 축마다 유리 쌍 1개당 affinityPercent% 가산, 축 배율끼리는 곱한다.
const affinity={beats:{element:{element_fire:'element_lightning',element_lightning:'element_water',element_water:'element_fire'},weapon:{weapon_sword:'weapon_staff',weapon_staff:'weapon_bow',weapon_bow:'weapon_sword'},race:{race_elf:'race_dwarf',race_dwarf:'race_orc',race_orc:'race_human',race_human:'race_elf'}}};
const content={version:'0.7.0',characterRules,affinity,balance,labels,races,jobs,weapons,elements,characters,stickers,comboAxes,combos,compoundCombos,weaponEffects,weaponRecipes,initialDeck,rig,assets,visuals,scenarios};
const byId=(list,id)=>list.find(x=>x.id===id);
const nameOf=id=>labels[id]??id??'없음';
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;}
deepFreeze(content);
function validateContent(c=content){
 const check=(v,msg)=>{if(!v)throw Error(`콘텐츠 오류: ${msg}`);};
 for(const [key,table] of Object.entries({characters:c.characters,stickers:c.stickers,combos:c.combos,compoundCombos:c.compoundCombos,weaponEffects:c.weaponEffects,weaponRecipes:c.weaponRecipes,weapons:c.weapons,elements:c.elements,races:c.races,jobs:c.jobs,scenarios:c.scenarios})){check(new Set(table.map(x=>x.id)).size===table.length,`${key} ID 중복`);}
 Object.entries(c.balance).forEach(([k,v])=>check(Number.isInteger(v)&&v>=0,`수치 ${k}`));
 check(c.balance.teamSize===3&&c.balance.maxStars>=c.balance.startStars,'지원 편성/별 범위');
 for(const d of c.characters){check(byId(c.races,d.raceId)&&byId(c.jobs,d.jobId),'종족/직업 참조');check(Number.isInteger(d.basePower)&&d.basePower>=0,'기본 전투력');check(c.visuals[d.visualProfileId],'외형 참조');}
 for(const v of Object.values(c.visuals)){check(v.rigId===c.rig.id&&c.assets[v.bodyAssetId]&&c.assets[v.frontHandAssetId],'몸체 rig/파츠');}
 for(const w of c.weapons){check(w.compatibleRigIds.includes(c.rig.id)&&c.assets[w.assetId],'무기 rig/이미지');check(Number.isInteger(w.powerBonus)&&w.powerBonus>=0,'무기 전투력');}
 for(const s of c.stickers){check(c.assets[s.iconAssetId],'스티커 이미지');check(s.kind==='weapon'?byId(c.weapons,s.payloadId):s.kind==='element'?byId(c.elements,s.payloadId):s.kind==='star'&&s.starAmount===1,'스티커 구성');}
 for(const rule of c.combos){check(c.comboAxes.includes(rule.axis)&&rule.exclusiveGroup===rule.axis,'족보 축');check([2,3].includes(rule.threshold)&&Number.isInteger(rule.flatPowerBonus)&&rule.flatPowerBonus>=0,'족보 수치');check(['pair','collection','straight','triple'].includes(rule.kind)&&Number.isInteger(rule.priority),'족보 종류/우선순위');}
 for(const rule of c.compoundCombos){check(rule.axes.length===3&&new Set(rule.axes).size===3&&rule.axes.every(a=>['weapon','element','star'].includes(a)),'복합 축');check([2,3].includes(rule.threshold)&&Number.isInteger(rule.flatPowerBonus)&&rule.flatPowerBonus>=0,'복합 수치');}
 for(const effect of c.weaponEffects){check(['combo','completeAxes','lowerScore','collections','allStars','pairs'].includes(effect.condition),'효과 조건');check(['multiply','add','grow'].includes(effect.operation)&&Number.isFinite(effect.value)&&effect.value>0,'효과 연산');if(effect.condition==='combo')check(c.comboAxes.includes(effect.axis)&&['pair','triple','collection','straight'].includes(effect.kind),'효과 족보 조건');}
 check(new Set(c.weaponRecipes.map(r=>r.weaponId+':'+r.elementId)).size===c.weaponRecipes.length,'조합 중복');
 for(const recipe of c.weaponRecipes)check(byId(c.weapons,recipe.weaponId)&&byId(c.elements,recipe.elementId)&&byId(c.weaponEffects,recipe.effectId)&&c.assets[recipe.assetId],'무기 조합 참조');
 check(c.balance.maxElementStacks>0,'속성 중첩 상한');
 c.initialDeck.forEach(id=>check(byId(c.stickers,id),'덱 참조'));
 check(c.scenarios.length===c.balance.stageCount,'전투 수');
 const tables={element:c.elements,weapon:c.weapons,race:c.races};for(const [axis,map] of Object.entries(c.affinity.beats))for(const [k,v] of Object.entries(map))check(byId(tables[axis],k)&&byId(tables[axis],v),'상성 참조');
 check(c.characterRules.drawTurns.every(t=>Number.isInteger(t)&&t>=1&&t<=c.balance.maxTurns)&&Number.isInteger(c.characterRules.replaceFromTurn),'캐릭터 카드 규칙');
 for(const e of c.scenarios){check(e.characterPool.length>0&&e.characterPool.every(id=>byId(c.characters,id)),'적 캐릭터 후보');check(e.deck.length>=c.balance.drawCount&&e.deck.every(id=>byId(c.stickers,id)),'적 덱');check(Number.isInteger(e.hp)&&e.hp>0,'적 체력');}
 return true;
}

return {characterRules,affinity,balance,labels,races,jobs,weapons,elements,characters,stickers,comboAxes,combos,compoundCombos,weaponEffects,weaponRecipes,initialDeck,rig,assets,visuals,scenarios,content,byId,nameOf,validateContent};})();
