modules["src/content/data.mjs"]=(()=>{
const {applyArt}=modules["src/content/art.mjs"];

// 수치는 이 표에서만 수정한다. 데이터에는 화면 요소나 로직을 저장하지 않는다.
// 레벨 효과는 모두 value + perLevel×(Lv−1) 형태다.
const balance = Object.freeze({teamSize:3, blindCount:4, turnsPerBlind:6, handSize:4, attachLimit:2, basePower:5, weaponPower:5, weaponPlusPower:5, starPower:3, t1Power:10, affinityPerLevel:0.25, comboBonusPerLevel:1, comboMultPerLevel:0.25});
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
// 족보(족보 레벨 배율 대상): 무기·속성 축만. 3명 모두 같으면 트리플, 모두 다르면 컬렉션. 페어는 없다.
// 별은 조건에 쓰지 않고 캐릭터 기초 점수에만 쓴다. 종족·직업은 티어(T2·T3)로 판정한다.
const comboAxes=['weapon','element'];
const comboLevelKinds=['collection','triple'];
const combos=comboAxes.flatMap(axis=>[
 {kind:'collection',levelKind:'collection',threshold:3,priority:2,bonus:10},
 {kind:'triple',levelKind:'triple',threshold:3,priority:3,bonus:15}
].map(r=>({id:`combo_${axis}_${r.kind}`,axis,kind:r.kind,levelKind:r.levelKind,threshold:r.threshold,priority:r.priority,flatPowerBonus:r.bonus,exclusiveGroup:axis})));
// 티어. 모두 덧셈은 T1(캐릭터, 10 단위)·T2(종족 조합, 100 단위)·T3(직업 조합, 1000 단위), 곱셈은 T4.
// T2·T3는 원정대에 한 번만 더한다. 같은 티어 안의 수치는 성립률 측정 후 조정한다(임시 시작값).
const tierCombos=[
 {id:'tier_race_collection',tier:2,axis:'race',kind:'collection',power:100,name:'종족 컬렉션'},
 {id:'tier_race_triple',tier:2,axis:'race',kind:'triple',power:200,name:'종족 트리플'},
 {id:'tier_job_collection',tier:3,axis:'job',kind:'collection',power:1000,name:'직업 컬렉션'},
 {id:'tier_job_triple',tier:3,axis:'job',kind:'triple',power:2000,name:'직업 트리플'}
];
// 직업-무기 짝. 상시 보너스는 없고 T4 조건(일치·불일치) 판정에만 쓴다.
const jobWeapon={job_warrior:'weapon_sword',job_archer:'weapon_bow',job_mage:'weapon_staff'};
// T4: 원정대 3명 모두 T1이 있고 아래 조건을 만족하면 성립. 여러 개가 동시에 성립할 수 있고 배율은 서로 곱한다.
// jobWeapon: allMatch(모두 일치)·allMismatch(모두 불일치)·centerMatch(가운데만 일치). 배율은 임시 시작값.
const t4Rules=[
 {id:'t4_orthodox',name:'정통 원정대',race:'triple',job:'collection',jobWeapon:'allMatch',multiplier:4,text:'같은 종족, 서로 다른 직업, 모두 직업에 맞는 무기'},
 {id:'t4_rebels',name:'반역자들',race:'collection',job:'triple',jobWeapon:'allMismatch',multiplier:3,text:'서로 다른 종족, 같은 직업, 모두 직업과 다른 무기'},
 {id:'t4_resonance',name:'원소 공명',race:'collection',job:'collection',elements:'allDifferent',multiplier:2,flipDisadvantage:true,text:'종족·직업·속성이 모두 다름. 불리 상성이 유리로 바뀜'},
 {id:'t4_destiny',name:'운명의 일족',race:'triple',job:'triple',sameRecipe:true,multiplier:5,chance:0.25,chanceMultiplier:2,text:'같은 종족, 같은 직업, 같은 조합 무기. 전투 때 확률로 배율 2배'},
 {id:'t4_formation',name:'진형',race:'collection',job:'collection',jobWeapon:'centerMatch',multiplier:2,attachBonus:1,text:'종족·직업이 모두 다름, 가운데만 직업에 맞는 무기. 성립 중 턴당 붙이기 +1'}
];
// T1: 무기 + 속성 레시피. 조건 없이 성립하고 점수는 t1Power × 레시피 Lv.
const weaponRecipes=[
 ['flame_sword','sword','fire','화염검'],['blast_bow','bow','fire','폭발궁'],['flame_staff','staff','fire','화염 지팡이'],
 ['reflux_sword','sword','water','역류검'],['rainbow_bow','bow','water','무지개 활'],['balance_staff','staff','water','균형 지팡이'],
 ['hone_sword','sword','lightning','연마검'],['chain_bow','bow','lightning','연쇄궁'],['charge_staff','staff','lightning','축적 지팡이']
].map(([key,w,e,name])=>({id:`recipe_${key}`,weaponId:`weapon_${w}`,elementId:`element_${e}`,assetId:`asset_${key}`,name,acquisition:'combination'}));
const initialDeck=stickers.flatMap(s=>Array(s.kind==='star'?6:2).fill(s.id));
// 붙이기 규칙. 같은 무기는 강화 +1(무기 기초 +weaponPlusPower), 다른 무기는 교체하고 강화 +0부터.
// 강화 구간별 무기 그림 변화(쌍검 등)는 나중에 그림과 함께 추가한다.
const attachRules={sameWeapon:'enhance',otherWeapon:'replaceAndReset',otherElement:'replaceAndReset'};
const rig={id:'rig_v1',width:512,height:512,outline:8,anchors:{body:{x:0,y:0},weapon:{x:356,y:318},hand:{x:356,y:318},element:{x:386,y:158}},layerOrder:['body','weapon','hand','element']};
// file에 투명 PNG 경로를 넣으면 해당 임시 파츠만 자동 교체된다.
const assets={};
function asset(id,pivot={x:0,y:0}){assets[id]={id,file:null,width:1024,height:1024,pivot,rigId:rig.id,revision:1};return id;}
const visuals={};
characters.forEach(c=>{visuals[c.visualProfileId]={id:c.visualProfileId,rigId:rig.id,bodyAssetId:asset(`${c.id}_body`),frontHandAssetId:asset(`${c.id}_hand`,{x:712,y:636}),anchors:rig.anchors,layerOrder:rig.layerOrder};});
weapons.forEach(w=>asset(w.assetId,{x:712,y:636}));elements.forEach(e=>asset(e.assetId,{x:772,y:316}));asset('asset_star');[...races,...jobs].forEach(d=>asset(d.iconAssetId));asset('asset_background');
// 블라인드: 목표 점수 하나. 속성은 런 시작 때 시드로 정한다. 몬스터 그림은 아직 없어 속성 아이콘으로 대신한다.
const blinds=[120,600,2000,7000].map((target,i,a)=>({id:`blind_${i+1}`,target,boss:i===a.length-1}));
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
// 보스 규칙: 보스 블라인드에 하나. 런 시작 때 시드로 정하고, 보스 블라인드가 시작될 때 공개한다.
// seal: weapon·t1·star·t2·t3는 해당 점수를 0으로(T4 조건 판정에는 영향 없음), invertAffinity는 유리·불리 반전, freezeCharacters는 캐릭터 카드 없음.
const bossSeals=['weapon','t1','star','t2','t3','invertAffinity','freezeCharacters'];
const bossRules=[
 {id:'rule_seal_weapon',seal:'weapon',name:'무기 봉인',text:'무기 기초 점수(강화 포함)가 0이 돼요'},
 {id:'rule_seal_t1',seal:'t1',name:'조합 무기 봉인',text:'조합 무기(T1) 점수가 0이 돼요'},
 {id:'rule_seal_star',seal:'star',name:'별 봉인',text:'별 기초 점수가 0이 돼요'},
 {id:'rule_seal_t2',seal:'t2',name:'종족 봉인',text:'종족 조합(T2) 점수가 0이 돼요'},
 {id:'rule_seal_t3',seal:'t3',name:'직업 봉인',text:'직업 조합(T3) 점수가 0이 돼요'},
 {id:'rule_invert_affinity',seal:'invertAffinity',name:'상성 반전',text:'유리와 불리가 뒤바뀌어요'},
 {id:'rule_freeze_characters',seal:'freezeCharacters',name:'캐릭터 동결',text:'캐릭터 카드가 나오지 않아요'},
];
// 메타 재화(다이아몬드): 블라인드 클리어 기본 + 남은 턴마다. 조기 전투일수록 더 받는다.
const metaRules={clearDiamonds:10,diamondsPerTurnLeft:1};
const rewardRules={offerCount:3,grades:[{id:'low',weight:60,levels:1},{id:'mid',weight:30,levels:2},{id:'high',weight:10,levels:3}],comboKinds:comboLevelKinds,swaps:[3,5,6]};
const content={version:'0.9.0',characterRules,affinity,balance,labels,races,jobs,weapons,elements,characters,stickers,comboAxes,comboLevelKinds,combos,tierCombos,jobWeapon,t4Rules,weaponRecipes,initialDeck,attachRules,rig,assets,visuals,blinds,monsters,bossMonsterId,bossRules,metaRules,rewardRules};
const byId=(list,id)=>list.find(x=>x.id===id);
const nameOf=id=>labels[id]??id??'없음';
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;}
deepFreeze(content);
function validateContent(c=content){
 const check=(v,msg)=>{if(!v)throw Error(`콘텐츠 오류: ${msg}`);};
 const num=v=>Number.isFinite(v)&&v>=0;
 for(const [key,table] of Object.entries({characters:c.characters,stickers:c.stickers,combos:c.combos,tierCombos:c.tierCombos,t4Rules:c.t4Rules,weaponRecipes:c.weaponRecipes,weapons:c.weapons,elements:c.elements,races:c.races,jobs:c.jobs,blinds:c.blinds,monsters:c.monsters})){check(new Set(table.map(x=>x.id)).size===table.length,`${key} ID 중복`);}
 Object.entries(c.balance).forEach(([k,v])=>check(num(v),`수치 ${k}`));
 check(c.balance.teamSize===3,'지원 편성');
 for(const d of c.characters){check(byId(c.races,d.raceId)&&byId(c.jobs,d.jobId),'종족/직업 참조');check(num(d.basePower),'기본 전투력');check(c.visuals[d.visualProfileId],'외형 참조');}
 for(const v of Object.values(c.visuals)){check(v.rigId===c.rig.id&&c.assets[v.bodyAssetId]&&c.assets[v.frontHandAssetId],'몸체 rig/파츠');}
 for(const w of c.weapons){check(w.compatibleRigIds.includes(c.rig.id)&&c.assets[w.assetId],'무기 rig/이미지');check(num(w.powerBonus),'무기 전투력');}
 for(const s of c.stickers){check(c.assets[s.iconAssetId],'스티커 이미지');check(s.kind==='weapon'?byId(c.weapons,s.payloadId):s.kind==='element'?byId(c.elements,s.payloadId):s.kind==='star'&&s.starAmount===1,'스티커 구성');}
 for(const rule of c.combos){check(c.comboAxes.includes(rule.axis)&&rule.exclusiveGroup===rule.axis,'족보 축');check(rule.threshold===3&&num(rule.flatPowerBonus),'족보 수치');check(['collection','triple'].includes(rule.kind)&&c.comboLevelKinds.includes(rule.levelKind)&&Number.isInteger(rule.priority),'족보 종류/레벨/우선순위');}
 for(const t of c.tierCombos)check([2,3].includes(t.tier)&&['race','job'].includes(t.axis)&&['collection','triple'].includes(t.kind)&&num(t.power)&&t.power>0&&t.name,'티어 조합');
 check(c.tierCombos.filter(t=>t.tier===2).every(t=>t.axis==='race')&&c.tierCombos.filter(t=>t.tier===3).every(t=>t.axis==='job'),'T2 종족, T3 직업');
 check(c.jobs.every(j=>byId(c.weapons,c.jobWeapon[j.id])),'직업-무기 짝');
 for(const r of c.t4Rules){
  check(['collection','triple'].includes(r.race)&&['collection','triple'].includes(r.job)&&num(r.multiplier)&&r.multiplier>=1&&r.name&&r.text,'T4 조건·배율');
  check(!r.jobWeapon||['allMatch','allMismatch','centerMatch'].includes(r.jobWeapon),'T4 직업-무기 조건');
  check(!r.elements||r.elements==='allDifferent','T4 속성 조건');
  check(!r.chance||(r.chance>0&&r.chance<1&&num(r.chanceMultiplier)),'T4 확률');
  check(!r.attachBonus||Number.isInteger(r.attachBonus),'T4 붙이기 보너스');
 }
 check(new Set(c.weaponRecipes.map(r=>r.weaponId+':'+r.elementId)).size===c.weaponRecipes.length,'조합 중복');
 for(const recipe of c.weaponRecipes)check(byId(c.weapons,recipe.weaponId)&&byId(c.elements,recipe.elementId)&&c.assets[recipe.assetId],'무기 조합 참조');
 check(['reject','enhance'].includes(c.attachRules.sameWeapon)&&['replaceAndReset'].includes(c.attachRules.otherWeapon)&&['replaceAndReset'].includes(c.attachRules.otherElement),'붙이기 규칙');
 c.initialDeck.forEach(id=>check(byId(c.stickers,id),'덱 참조'));
 check(c.initialDeck.length>=c.balance.handSize,'덱 크기');
 check(c.blinds.length===c.balance.blindCount&&c.blinds.every((b,i)=>Number.isInteger(b.target)&&b.target>0&&(i===0||b.target>c.blinds[i-1].target)),'블라인드 목표 점수');
 for(const m of c.monsters)check((!m.elementId||byId(c.elements,m.elementId))&&c.assets[m.assetId]&&labels[m.nameKey],'몬스터 참조');
 check(byId(c.monsters,c.bossMonsterId),'보스 몬스터');
 check(c.bossRules.length>0&&c.bossRules.every(r=>bossSeals.includes(r.seal)&&r.name&&r.text),'보스 규칙');
 check(Number.isInteger(c.metaRules.clearDiamonds)&&Number.isInteger(c.metaRules.diamondsPerTurnLeft),'다이아몬드 규칙');
 check(c.elements.every(e=>c.monsters.some(m=>m.elementId===e.id)),'속성별 몬스터');
 for(const [k,v] of Object.entries(c.affinity.beats))check(byId(c.elements,k)&&byId(c.elements,v),'상성 참조');
 {const b=c.affinity.beats,seen=new Set();let k=c.elements[0].id;while(k&&!seen.has(k)){seen.add(k);k=b[k];}check(k===c.elements[0].id&&seen.size===c.elements.length,'상성은 모든 속성을 한 바퀴 도는 순환');}
 check(c.characterRules.guaranteedTurns.length===c.balance.blindCount&&c.characterRules.guaranteedTurns.every(ts=>ts.every(t=>Number.isInteger(t)&&t>=1&&t<=c.balance.turnsPerBlind))&&c.characterRules.randomChance>=0&&c.characterRules.randomChance<=1,'캐릭터 카드 규칙');
 const rw=c.rewardRules;
 check(rw.offerCount===3&&rw.grades.every(g=>Number.isInteger(g.weight)&&g.weight>0&&Number.isInteger(g.levels)&&g.levels>0)&&rw.comboKinds.every(k=>c.comboLevelKinds.includes(k)),'보상 규칙');
 check(rw.swaps.length===c.balance.blindCount-1&&rw.swaps.every(n=>Number.isInteger(n)&&n>0),'보상 섞기 횟수');
 return true;
}

return {characterRules,affinity,balance,labels,races,jobs,weapons,elements,characters,stickers,comboAxes,comboLevelKinds,combos,tierCombos,jobWeapon,t4Rules,weaponRecipes,initialDeck,attachRules,rig,assets,visuals,blinds,monsters,bossMonsterId,bossRules,metaRules,rewardRules,content,byId,nameOf,validateContent};})();
