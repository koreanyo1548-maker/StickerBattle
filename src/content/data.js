modules["src/content/data.mjs"]=(()=>{
const {applyArt}=modules["src/content/art.mjs"];

// 수치는 이 표에서만 수정한다. 데이터에는 화면 요소나 로직을 저장하지 않는다. 규칙 설명은 docs/rpg-redesign.md.
const balance=Object.freeze({
 teamSize:3,anteCount:4,handSize:4,attachLimit:2,swapLimit:1,maxRounds:30,
 // 레벨: 별 스티커 1장 = Lv+1(최대 maxLevel). 체력·공격에 levelGrowth^(Lv-1)을 곱한다.
 maxLevel:10,levelGrowth:1.3,
 // 무기: 공격 ×weaponMult, 같은 무기를 또 붙이면 강화 +1(공격 ×weaponPlusMult씩 추가).
 weaponMult:1.2,weaponPlusMult:1.1,
 // 상성: 이기면 공격 ×advantage, 지면 ÷advantage. 몬스터가 때릴 때도 같은 배율이 양방향으로 걸린다.
 advantage:1.5,
 // 적성: 직업에 어울리는 무기가 아니면 그 캐릭터의 공격과 스킬 수치에 mismatchFit을 곱한다.
 mismatchFit:0.5,
});
const labels={
 race_human:'인간',race_elf:'엘프',race_orc:'오크',race_dwarf:'드워프',job_warrior:'전사',job_archer:'궁수',job_mage:'마법사',
 weapon_sword:'검',weapon_bow:'활',weapon_staff:'지팡이',element_fire:'불',element_water:'물',element_lightning:'번개',sticker_star:'별',
};
const races=['human','elf','orc','dwarf'].map(v=>({id:`race_${v}`,nameKey:`race_${v}`,iconAssetId:`icon_race_${v}`}));
// 직업: 기본 체력·공격, 어울리는 무기, 영입 가격. 종족은 지금은 겉모습뿐이다(변주는 나중).
const jobs=[
 {id:'job_warrior',nameKey:'job_warrior',iconAssetId:'icon_job_warrior',hp:120,atk:10,weaponId:'weapon_sword',cost:4},
 {id:'job_archer',nameKey:'job_archer',iconAssetId:'icon_job_archer',hp:80,atk:15,weaponId:'weapon_bow',cost:5},
 {id:'job_mage',nameKey:'job_mage',iconAssetId:'icon_job_mage',hp:70,atk:12,weaponId:'weapon_staff',cost:5},
];
const weapons=['sword','bow','staff'].map((v,i)=>({id:`weapon_${v}`,nameKey:`weapon_${v}`,assetId:`asset_${v}`,compatibleRigIds:['rig_v1'],symbol:['†','⌒','✦'][i]}));
const elements=['fire','water','lightning'].map((v,i)=>({id:`element_${v}`,nameKey:`element_${v}`,assetId:`asset_${v}`,color:['#d96943','#448cab','#d5a327'][i],symbol:['火','水','ϟ'][i]}));
const characters=races.flatMap(r=>jobs.map(j=>({id:`char_${r.id.slice(5)}_${j.id.slice(4)}`,nameKey:`char_${r.id.slice(5)}_${j.id.slice(4)}`,raceId:r.id,jobId:j.id,hp:j.hp,atk:j.atk,cost:j.cost,visualProfileId:`visual_${r.id.slice(5)}_${j.id.slice(4)}`})));
characters.forEach(c=>labels[c.nameKey]=`${labels[c.raceId]} ${labels[c.jobId]}`);

// 스티커 7종. 덱은 별을 많이, 무기·속성은 3장씩.
const stickers=[...weapons.map(w=>({id:w.id.replace('weapon_','sticker_'),kind:'weapon',payloadId:w.id,nameKey:w.nameKey,iconAssetId:w.assetId})),...elements.map(e=>({id:e.id.replace('element_','sticker_'),kind:'element',payloadId:e.id,nameKey:e.nameKey,iconAssetId:e.assetId})),{id:'sticker_star',kind:'star',payloadId:null,nameKey:'sticker_star',iconAssetId:'asset_star'}];
const initialDeck=stickers.flatMap(s=>Array(s.kind==='star'?8:3).fill(s.id));

// 스킬: 무기 + 속성이 함께 있으면 생긴다. 속성이 성격(불 폭발·물 수호·번개 성장), 무기가 액티브 여부(불=검, 물=지팡이, 번개=활이 액티브).
// 레벨은 1로 고정. 쿨타임은 쓴 뒤 쉬는 라운드 수. 수치는 적성 계수 s가 곱해진다(fitOwn·fitAura는 제외).
// damage: 공격 ×mult 피해를 hits번 · heal: 체력 비율이 가장 낮은 동료를 최대 체력의 ratio만큼 회복(다친 동료가 있을 때만 발동)
// atkIfMonsterLow: 몬스터 체력이 threshold 이하면 이 캐릭터 공격 +bonus · auraAtk: 원정대 전체 공격 +bonus · damageReduce: 이 캐릭터가 받는 피해 −ratio
// atkStack: 이 캐릭터 공격이 라운드마다 +perRound씩(최대 max) · fitOwn: 이 캐릭터의 적성 계수를 1로 · fitAura: 원정대 전체의 불일치 계수를 value로
const skills=[
 ['flame_sword','sword','fire','화염검','active',{type:'damage',mult:3,hits:1},3,'몬스터에게 공격 ×3 피해'],
 ['blast_bow','bow','fire','폭발궁','passive',{type:'atkIfMonsterLow',threshold:0.5,bonus:0.4},0,'몬스터 체력이 절반 이하일 때 공격 +40%'],
 ['flame_staff','staff','fire','화염 지팡이','passive',{type:'auraAtk',bonus:0.1},0,'원정대 전체 공격 +10%'],
 ['balance_staff','staff','water','균형 지팡이','active',{type:'heal',ratio:0.4},3,'가장 약한 동료를 최대 체력의 40% 회복'],
 ['reflux_sword','sword','water','역류검','passive',{type:'damageReduce',ratio:0.25},0,'이 캐릭터가 받는 피해 −25%'],
 ['rainbow_bow','bow','water','무지개 활','passive',{type:'fitOwn'},0,'이 캐릭터의 직업·무기 불일치 페널티를 없앰'],
 ['chain_bow','bow','lightning','연쇄궁','active',{type:'damage',mult:1.2,hits:3},3,'공격 ×1.2 피해를 3번 연속으로'],
 ['hone_sword','sword','lightning','연마검','passive',{type:'atkStack',perRound:0.05,max:0.5},0,'이 캐릭터의 공격이 라운드마다 +5%씩 쌓임(최대 +50%)'],
 ['charge_staff','staff','lightning','축적 지팡이','passive',{type:'fitAura',value:0.75},0,'원정대 전체의 불일치 페널티를 절반으로 줄임'],
].map(([key,w,e,name,kind,effect,cooldown,text])=>({id:`skill_${key}`,weaponId:`weapon_${w}`,elementId:`element_${e}`,assetId:`asset_${key}`,name,kind,effect,cooldown,text}));

const rig={id:'rig_v1',width:512,height:512,outline:8,anchors:{body:{x:0,y:0},weapon:{x:356,y:318},hand:{x:356,y:318},element:{x:386,y:158}},layerOrder:['body','weapon','hand','element']};
// file에 투명 PNG 경로를 넣으면 해당 임시 파츠만 자동 교체된다.
const assets={};
function asset(id,pivot={x:0,y:0}){assets[id]={id,file:null,width:1024,height:1024,pivot,rigId:rig.id,revision:1};return id;}
const visuals={};
characters.forEach(c=>{visuals[c.visualProfileId]={id:c.visualProfileId,rigId:rig.id,bodyAssetId:asset(`${c.id}_body`),frontHandAssetId:asset(`${c.id}_hand`,{x:712,y:636}),anchors:rig.anchors,layerOrder:rig.layerOrder};});
weapons.forEach(w=>asset(w.assetId,{x:712,y:636}));elements.forEach(e=>asset(e.assetId,{x:772,y:316}));asset('asset_star');[...races,...jobs].forEach(d=>asset(d.iconAssetId));asset('asset_background');

// 블라인드: 앤티마다 스몰·빅·보스. 몬스터 수치는 12개를 개별로 둔다(순서: 앤티1 스몰·빅·보스, 앤티2 …): [체력, 공격].
// 첫 스몰(앤티1 스몰)은 시작 동료 혼자서 잡을 수 있어야 한다(tools/balance-bot.mjs solo로 확인). 속성은 런 시작 때 시드로 정한다.
const monsterStats=[[110,10],[430,64],[1160,105],[1180,150],[1920,175],[2980,240],[2690,300],[3880,340],[5250,410],[3960,320],[5770,390],[8420,400]];
const blindKinds=[
 {id:'small',name:'스몰 블라인드',gold:4,diamonds:2},
 {id:'big',name:'빅 블라인드',gold:5,diamonds:3},
 {id:'boss',name:'보스 블라인드',gold:6,diamonds:5},
];
// 일반 블라인드는 블라인드 속성의 몬스터, 보스 블라인드는 bossMonsterId.
const monsters=[...elements.map(e=>({id:`monster_${e.id.slice(8)}`,elementId:e.id})),{id:'monster_boss',elementId:null}].map(m=>({...m,nameKey:m.id,assetId:asset(`asset_${m.id}`)}));
const bossMonsterId='monster_boss';
Object.assign(labels,{monster_fire:'불꽃 슬라임',monster_water:'물결 슬라임',monster_lightning:'번개 슬라임',monster_boss:'슬라임 왕'});
asset('asset_reward_back');
applyArt(assets,visuals);
// 상성: 키가 값을 이긴다.
const affinity={beats:{element_fire:'element_lightning',element_lightning:'element_water',element_water:'element_fire'}};
// 시작 동료 고르기: 무작위 3명을 보여 주고 뒤집어 섞은 뒤 고른다. 섞는 횟수는 눈으로 따라갈 수 없을 만큼 많이.
const starterRules={offers:3,swaps:24};
// 경제. 골드는 승리 보상 + 빨리 끝낸 보너스(speedTurns 이내) + 이자.
const economy={startGold:6,speedTurns:3,speedGold:2,interestPer:5,interestMax:3};
// 상점: 동료 영입(직업별 가격), 고정 물건, 새로고침. 회복은 골드를 내고 한 명 또는 전체.
const shopRules={recruitOffers:2,rerollCost:2,rerollStep:1,healOneCost:3,healAllCost:6,healAllRatio:0.4,sellRate:0.5};
const packs=[
 {id:'pack_stickers',name:'스티커 묶음',cost:4,text:'덱에 무작위 스티커 3장',count:3,kinds:'any'},
 {id:'pack_stars',name:'별 묶음',cost:3,text:'덱에 별 2장',count:2,kinds:'star'},
];

const content={version:'2.0.0',balance,affinity,labels,races,jobs,weapons,elements,characters,stickers,initialDeck,skills,rig,assets,visuals,monsterStats,blindKinds,monsters,bossMonsterId,starterRules,economy,shopRules,packs};
const byId=(list,id)=>list.find(x=>x.id===id);
const nameOf=id=>labels[id]??id??'없음';
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;}
deepFreeze(content);
const skillTypes=['damage','heal','atkIfMonsterLow','auraAtk','damageReduce','atkStack','fitOwn','fitAura'];
function validateContent(c=content){
 const check=(v,msg)=>{if(!v)throw Error(`콘텐츠 오류: ${msg}`);};
 const num=v=>Number.isFinite(v)&&v>=0,int=v=>Number.isInteger(v)&&v>=0;
 for(const [key,table] of Object.entries({characters:c.characters,stickers:c.stickers,skills:c.skills,weapons:c.weapons,elements:c.elements,races:c.races,jobs:c.jobs,monsters:c.monsters,blindKinds:c.blindKinds,packs:c.packs}))check(new Set(table.map(x=>x.id)).size===table.length,`${key} ID 중복`);
 Object.entries(c.balance).forEach(([k,v])=>check(num(v),`수치 ${k}`));
 const b=c.balance;
 check(b.teamSize===3&&b.handSize>=b.attachLimit&&b.attachLimit>=1&&b.maxLevel>=1&&b.levelGrowth>=1&&b.mismatchFit>0&&b.mismatchFit<=1,'전투 수치');
 for(const j of c.jobs)check(num(j.hp)&&j.hp>0&&num(j.atk)&&j.atk>0&&byId(c.weapons,j.weaponId)&&int(j.cost)&&j.cost>0,'직업');
 for(const d of c.characters){check(byId(c.races,d.raceId)&&byId(c.jobs,d.jobId)&&c.visuals[d.visualProfileId],'캐릭터 참조');check(num(d.hp)&&num(d.atk),'캐릭터 스탯');}
 for(const v of Object.values(c.visuals))check(v.rigId===c.rig.id&&c.assets[v.bodyAssetId]&&c.assets[v.frontHandAssetId],'몸체 rig/파츠');
 for(const w of c.weapons)check(w.compatibleRigIds.includes(c.rig.id)&&c.assets[w.assetId],'무기 rig/이미지');
 for(const s of c.stickers){check(c.assets[s.iconAssetId],'스티커 이미지');check(s.kind==='weapon'?byId(c.weapons,s.payloadId):s.kind==='element'?byId(c.elements,s.payloadId):s.kind==='star','스티커 구성');}
 c.initialDeck.forEach(id=>check(byId(c.stickers,id),'덱 참조'));
 check(c.initialDeck.length>=b.handSize*2,'덱 크기');
 check(new Set(c.skills.map(r=>r.weaponId+':'+r.elementId)).size===c.skills.length&&c.skills.length===c.weapons.length*c.elements.length,'스킬은 무기×속성 한 개씩');
 for(const s of c.skills){check(byId(c.weapons,s.weaponId)&&byId(c.elements,s.elementId)&&c.assets[s.assetId]&&s.name&&s.text&&skillTypes.includes(s.effect.type),'스킬');check(['active','passive'].includes(s.kind)&&(s.kind==='passive'||int(s.cooldown)&&s.cooldown>0),'스킬 종류·쿨타임');}
 check(c.elements.every(e=>c.skills.filter(s=>s.elementId===e.id&&s.kind==='active').length===1),'속성마다 액티브 1개');
 check(c.monsterStats.length===b.anteCount*c.blindKinds.length&&c.monsterStats.every(([hp,atk])=>int(hp)&&hp>0&&int(atk)&&atk>0),'몬스터 수치 12개');
 check(c.blindKinds.length===3&&c.blindKinds[2].id==='boss'&&c.blindKinds.every(k=>int(k.gold)&&int(k.diamonds)),'블라인드 종류');
 for(const m of c.monsters)check((!m.elementId||byId(c.elements,m.elementId))&&c.assets[m.assetId]&&labels[m.nameKey],'몬스터 참조');
 check(byId(c.monsters,c.bossMonsterId)&&c.elements.every(e=>c.monsters.some(m=>m.elementId===e.id)),'몬스터');
 check(c.starterRules.offers===3&&int(c.starterRules.swaps)&&c.starterRules.swaps>=12,'시작 동료 섞기');
 check(int(c.economy.startGold)&&int(c.economy.interestPer)&&c.economy.interestPer>0,'경제');
 const s=c.shopRules;check(int(s.recruitOffers)&&int(s.rerollCost)&&int(s.healOneCost)&&int(s.healAllCost)&&s.sellRate>0&&s.sellRate<=1&&s.healAllRatio>0&&s.healAllRatio<=1,'상점 규칙');
 check(c.packs.every(p=>int(p.cost)&&p.cost>0&&int(p.count)&&p.count>0&&['any','star'].includes(p.kinds)&&p.name&&p.text),'묶음');
 for(const [k,v] of Object.entries(c.affinity.beats))check(byId(c.elements,k)&&byId(c.elements,v),'상성 참조');
 {const bt=c.affinity.beats,seen=new Set();let k=c.elements[0].id;while(k&&!seen.has(k)){seen.add(k);k=bt[k];}check(k===c.elements[0].id&&seen.size===c.elements.length,'상성은 모든 속성을 한 바퀴 도는 순환');}
 return true;
}

return {balance,affinity,labels,races,jobs,weapons,elements,characters,stickers,initialDeck,skills,rig,assets,visuals,monsterStats,blindKinds,monsters,bossMonsterId,starterRules,economy,shopRules,packs,content,byId,nameOf,validateContent};})();
