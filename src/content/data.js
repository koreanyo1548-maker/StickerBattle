modules["src/content/data.mjs"]=(()=>{
const {applyArt}=modules["src/content/art.mjs"];

// 수치는 이 표에서만 수정한다. 데이터에는 화면 요소나 로직을 저장하지 않는다. 규칙 설명은 docs/balatro-redesign.md.
const balance=Object.freeze({
 handSize:7,maxPlay:5,attacks:4,discards:3,startSlots:3,maxSlots:5,anteCount:4,
 // 스티커 점수: 무기 칩 = weaponChips + weaponPlusChips × 강화, 속성 = elementChips 칩 + 속성 Lv 배율, 별 칩 = starChips × 별 Lv.
 // 상성: 블라인드를 이기는 속성은 배율이 속성 Lv × advantageMult, 지는 속성은 배율 0.
 weaponChips:10,weaponPlusChips:5,elementChips:5,starChips:5,advantageMult:2,
});
const labels={
 race_human:'인간',race_elf:'엘프',race_orc:'오크',race_dwarf:'드워프',job_warrior:'전사',job_archer:'궁수',job_mage:'마법사',
 weapon_sword:'검',weapon_bow:'활',weapon_staff:'지팡이',element_fire:'불',element_water:'물',element_lightning:'번개',sticker_star:'별',
};
const races=['human','elf','orc','dwarf'].map(v=>({id:`race_${v}`,nameKey:`race_${v}`,iconAssetId:`icon_race_${v}`}));
const jobs=['warrior','archer','mage'].map(v=>({id:`job_${v}`,nameKey:`job_${v}`,iconAssetId:`icon_job_${v}`}));
const weapons=['sword','bow','staff'].map((v,i)=>({id:`weapon_${v}`,nameKey:`weapon_${v}`,assetId:`asset_${v}`,compatibleRigIds:['rig_v1'],symbol:['†','⌒','✦'][i]}));
const elements=['fire','water','lightning'].map((v,i)=>({id:`element_${v}`,nameKey:`element_${v}`,assetId:`asset_${v}`,color:['#d96943','#448cab','#d5a327'][i],symbol:['火','水','ϟ'][i]}));

// 종족 = 무엇에 반응하는지(trigger), 직업 = 어떻게 계산하는지(effect). 수치는 effect별 표 abilityValues[종족][직업].
// pairHand: 같은 스티커 2장 이상이 든 족보면 1회. elementCard·weaponCard: 낸 해당 스티커 1장마다. growth: 자기 성장치 G(강화 + 별 Lv + 속성 Lv).
const raceTriggers={race_human:'pairHand',race_elf:'elementCard',race_orc:'weaponCard',race_dwarf:'growth'};
const jobEffects={job_warrior:'chips',job_archer:'mult',job_mage:'xmult'};
const abilityValues={
 race_human:{job_warrior:30,job_archer:4,job_mage:1.5},
 race_elf:{job_warrior:15,job_archer:2,job_mage:1.15},
 race_orc:{job_warrior:15,job_archer:2,job_mage:1.15},
 // 드워프 마법사: ×(1 + 값 × G)
 race_dwarf:{job_warrior:6,job_archer:1,job_mage:0.1},
};
const jobCosts={job_warrior:4,job_archer:5,job_mage:6};
const characters=races.flatMap(r=>jobs.map(j=>({id:`char_${r.id.slice(5)}_${j.id.slice(4)}`,nameKey:`char_${r.id.slice(5)}_${j.id.slice(4)}`,raceId:r.id,jobId:j.id,trigger:raceTriggers[r.id],effect:jobEffects[j.id],value:abilityValues[r.id][j.id],cost:jobCosts[j.id],visualProfileId:`visual_${r.id.slice(5)}_${j.id.slice(4)}`})));
characters.forEach(c=>labels[c.nameKey]=`${labels[c.raceId]} ${labels[c.jobId]}`);

// 스티커 정의(검·활·지팡이·불·물·번개·별 7종)가 족보 판정의 "같은 스티커" 단위다.
const stickers=[...weapons.map(w=>({id:w.id.replace('weapon_','sticker_'),kind:'weapon',payloadId:w.id,nameKey:w.nameKey,iconAssetId:w.assetId})),...elements.map(e=>({id:e.id.replace('element_','sticker_'),kind:'element',payloadId:e.id,nameKey:e.nameKey,iconAssetId:e.assetId})),{id:'sticker_star',kind:'star',payloadId:null,nameKey:'sticker_star',iconAssetId:'asset_star'}];
const initialDeck=stickers.flatMap(s=>Array(4).fill(s.id));

// 족보: 우선순위(rank)가 높은 것부터 판정한다. 우선순위는 손패 7장에서 만들 수 있는 확률의 역순이다
// (덱 28장 기준: 페어 98% · 투페어 68% · 삼원소·삼무기 각 30% · 트리플 26% · 풀하우스 16% · 포카드 1.3%. 오중은 같은 스티커 5장이 덱에 있어야 함).
// 삼원소·삼무기는 같은 우선순위로, 둘 다 되면 지금 레벨에서 점수가 큰 쪽.
const hands=[
 {id:'five',name:'오중',chips:120,mult:12,perChips:35,perMult:3,rank:9,text:'같은 스티커 5장'},
 {id:'four',name:'포카드',chips:60,mult:7,perChips:30,perMult:3,rank:8,text:'같은 스티커 4장'},
 {id:'fullHouse',name:'풀하우스',chips:40,mult:4,perChips:25,perMult:2,rank:7,text:'같은 스티커 3장 + 2장'},
 {id:'triple',name:'트리플',chips:35,mult:4,perChips:20,perMult:2,rank:6,text:'같은 스티커 3장'},
 {id:'triElement',name:'삼원소',chips:30,mult:3,perChips:20,perMult:2,rank:5,text:'불·물·번개'},
 {id:'triWeapon',name:'삼무기',chips:30,mult:3,perChips:20,perMult:2,rank:5,text:'검·활·지팡이'},
 {id:'twoPair',name:'투페어',chips:20,mult:2,perChips:20,perMult:1,rank:4,text:'같은 스티커 2장 + 2장'},
 {id:'pair',name:'페어',chips:10,mult:2,perChips:15,perMult:1,rank:3,text:'같은 스티커 2장'},
 {id:'single',name:'낱장',chips:5,mult:1,perChips:10,perMult:1,rank:1,text:'그 밖'},
];
// 인간 능력(pairHand)이 반응하는 족보.
const pairHands=['pair','twoPair','triple','fullHouse','four','five'];

// 조합 무기: 무기 + 속성이 같은 캐릭터에 있으면 기본 능력 다음에 발동하는 진화 능력.
// ability: retriggerSelf · chipsPerDiscard(value) · autoEnhance · retriggerRight · elementsSame · retriggerLeft · lastAttackXMult(value) · allDifferentXMult(value) · charge(value)
const weaponRecipes=[
 ['flame_sword','sword','fire','화염검','retriggerSelf',0,'자기 기본 능력을 한 번 더'],
 ['reflux_sword','sword','water','역류검','chipsPerDiscard',20,'남은 버리기 1회당 +20 칩'],
 ['hone_sword','sword','lightning','연마검','autoEnhance',1,'공격할 때마다 자기 무기 강화 +1'],
 ['blast_bow','bow','fire','폭발궁','retriggerRight',0,'오른쪽 캐릭터의 기본 능력을 한 번 더'],
 ['rainbow_bow','bow','water','무지개 활','elementsSame',0,'속성 스티커를 모두 같은 스티커로 쳐요(삼원소는 안 돼요)'],
 ['chain_bow','bow','lightning','연쇄궁','retriggerLeft',0,'왼쪽 캐릭터의 기본 능력을 한 번 더'],
 ['flame_staff','staff','fire','화염 지팡이','lastAttackXMult',3,'블라인드의 마지막 공격이면 ×3'],
 ['balance_staff','staff','water','균형 지팡이','allDifferentXMult',2,'낸 스티커가 모두 다른 종류면 ×2'],
 ['charge_staff','staff','lightning','축적 지팡이','charge',1,'공격할 때마다 영구 +1 배율 누적, 누적만큼 +배율'],
].map(([key,w,e,name,ability,value,text])=>({id:`recipe_${key}`,weaponId:`weapon_${w}`,elementId:`element_${e}`,assetId:`asset_${key}`,name,ability,value,text}));

// 각인: 덱의 스티커 카드 한 장에 붙는 강화. 점수 단계에서 그 카드가 계산될 때 적용한다.
const mods=[
 {id:'shiny',name:'반짝이',chips:30,text:'+30 칩'},
 {id:'holo',name:'홀로',mult:5,text:'+5 배율'},
 {id:'gold',name:'금박',xmult:1.5,text:'×1.5'},
 {id:'glass',name:'유리',xmult:2,breakChance:0.25,text:'×2, 공격 뒤 25% 확률로 깨짐'},
];

const rig={id:'rig_v1',width:512,height:512,outline:8,anchors:{body:{x:0,y:0},weapon:{x:356,y:318},hand:{x:356,y:318},element:{x:386,y:158}},layerOrder:['body','weapon','hand','element']};
// file에 투명 PNG 경로를 넣으면 해당 임시 파츠만 자동 교체된다.
const assets={};
function asset(id,pivot={x:0,y:0}){assets[id]={id,file:null,width:1024,height:1024,pivot,rigId:rig.id,revision:1};return id;}
const visuals={};
characters.forEach(c=>{visuals[c.visualProfileId]={id:c.visualProfileId,rigId:rig.id,bodyAssetId:asset(`${c.id}_body`),frontHandAssetId:asset(`${c.id}_hand`,{x:712,y:636}),anchors:rig.anchors,layerOrder:rig.layerOrder};});
weapons.forEach(w=>asset(w.assetId,{x:712,y:636}));elements.forEach(e=>asset(e.assetId,{x:772,y:316}));asset('asset_star');[...races,...jobs].forEach(d=>asset(d.iconAssetId));asset('asset_background');

// 블라인드: 앤티마다 스몰·빅·보스. 목표 = anteBase[앤티] × 종류 배수. 속성은 런 시작 때 시드로 정한다.
const anteBase=[1000,5000,20000,90000];
const blindKinds=[
 {id:'small',name:'스몰 블라인드',targetMult:1,gold:3,diamonds:2,skippable:true},
 {id:'big',name:'빅 블라인드',targetMult:1.5,gold:4,diamonds:3,skippable:true},
 {id:'boss',name:'보스 블라인드',targetMult:2,gold:5,diamonds:5,skippable:false},
];
// 일반 블라인드는 블라인드 속성의 몬스터, 보스 블라인드는 bossMonsterId.
const monsters=[...elements.map(e=>({id:`monster_${e.id.slice(8)}`,elementId:e.id})),{id:'monster_boss',elementId:null}].map(m=>({...m,nameKey:m.id,assetId:asset(`asset_${m.id}`)}));
const bossMonsterId='monster_boss';
Object.assign(labels,{monster_fire:'불꽃 슬라임',monster_water:'물결 슬라임',monster_lightning:'번개 슬라임',monster_boss:'슬라임 왕'});
asset('asset_reward_back');
applyArt(assets,visuals);
// 상성: 키가 값을 이긴다. 블라인드 속성을 이기는 속성 스티커는 배율 ×advantageMult(덧셈 배율이 커짐), 지는 속성 스티커는 배율을 주지 않는다.
const affinity={beats:{element_fire:'element_lightning',element_lightning:'element_water',element_water:'element_fire'}};
// 보스 규칙: 앤티마다 하나, 런 시작 때 겹치지 않게 시드로 정한다.
const bossRules=[
 {id:'boss_weapon',effect:'weaponSeal',name:'무기 봉인',text:'무기 스티커가 칩을 주지 않아요'},
 {id:'boss_element',effect:'elementSeal',name:'속성 봉인',text:'속성 스티커가 배율을 주지 않아요'},
 {id:'boss_star',effect:'starSeal',name:'별 봉인',text:'별 스티커가 칩을 주지 않아요'},
 {id:'boss_flat',effect:'flatHands',name:'족보 하향',text:'족보 레벨이 모두 1로 계산돼요'},
 {id:'boss_silence',effect:'silence',name:'침묵',text:'공격마다 캐릭터 1명의 능력이 멈춰요'},
 {id:'boss_invert',effect:'invertAffinity',name:'상성 반전',text:'유리와 불리가 뒤바뀌어요'},
 {id:'boss_five',effect:'exactFive',name:'다섯 장',text:'공격은 정확히 5장으로만 해요'},
 {id:'boss_nodiscard',effect:'noDiscard',name:'버리기 금지',text:'버리기를 할 수 없어요'},
];
// 건너뛰기 태그: gold(즉시 골드) · freeRerolls(다음 상점) · halfCharacters(다음 상점 캐릭터 반값) · handLevels(무작위 족보) · shinyCards(덱 무작위 카드)
const tags=[
 {id:'tag_gold',effect:'gold',value:8,name:'투자',text:'골드 +8'},
 {id:'tag_reroll',effect:'freeRerolls',value:2,name:'재고 정리',text:'다음 상점 리롤 2회 무료'},
 {id:'tag_discount',effect:'halfCharacters',value:1,name:'할인',text:'다음 상점 캐릭터 반값'},
 {id:'tag_level',effect:'handLevels',value:2,name:'연구',text:'무작위 족보 Lv +2'},
 {id:'tag_shiny',effect:'shinyCards',value:2,name:'광택',text:'덱의 무작위 스티커 2장 반짝이'},
];
// 상점. 물건 effect: handLevel(무작위 족보 Lv+1) · addSticker(무작위 스티커, 낮은 확률로 각인) · mod(덱 카드 pick장에 각인) · remove(덱 카드 pick장 제거) · copy(덱 카드 1장 복제)
const economy={startGold:4,attackGold:1,interestPer:5,interestMax:5,attackDiamonds:1};
const shopRules={characterOffers:2,itemOffers:2,rerollCost:5,rerollStep:1,slotCosts:[10,15],sellRate:0.5};
const items=[
 {id:'item_hand',effect:'handLevel',cost:3,weight:4,name:'족보서',text:'무작위 족보 Lv +1'},
 {id:'item_sticker',effect:'addSticker',cost:2,weight:3,name:'스티커 한 장',text:'덱에 무작위 스티커 1장 추가'},
 {id:'item_shiny',effect:'mod',mod:'shiny',pick:2,cost:3,weight:2,name:'반짝이 주문서',text:'덱 카드 최대 2장에 반짝이(+30 칩)'},
 {id:'item_holo',effect:'mod',mod:'holo',pick:2,cost:4,weight:2,name:'홀로 주문서',text:'덱 카드 최대 2장에 홀로(+5 배율)'},
 {id:'item_gold',effect:'mod',mod:'gold',pick:1,cost:5,weight:1,name:'금박 주문서',text:'덱 카드 1장에 금박(×1.5)'},
 {id:'item_glass',effect:'mod',mod:'glass',pick:2,cost:3,weight:1,name:'유리 주문서',text:'덱 카드 최대 2장에 유리(×2, 깨질 수 있음)'},
 {id:'item_remove',effect:'remove',pick:2,cost:3,weight:2,name:'지우개',text:'덱 카드 최대 2장 제거'},
 {id:'item_copy',effect:'copy',pick:1,cost:4,weight:2,name:'복사기',text:'덱 카드 1장 복제'},
];
// 스티커 한 장(addSticker)이 각인을 달고 나올 확률.
const addStickerMods=[{mod:null,weight:70},{mod:'shiny',weight:15},{mod:'holo',weight:10},{mod:'gold',weight:5}];

const content={version:'1.0.0',balance,affinity,labels,races,jobs,weapons,elements,characters,stickers,initialDeck,hands,pairHands,weaponRecipes,mods,rig,assets,visuals,anteBase,blindKinds,monsters,bossMonsterId,bossRules,tags,economy,shopRules,items,addStickerMods};
const byId=(list,id)=>list.find(x=>x.id===id);
const nameOf=id=>labels[id]??id??'없음';
function deepFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;}
deepFreeze(content);
const recipeAbilities=['retriggerSelf','chipsPerDiscard','autoEnhance','retriggerRight','elementsSame','retriggerLeft','lastAttackXMult','allDifferentXMult','charge'];
const bossEffects=['weaponSeal','elementSeal','starSeal','flatHands','silence','invertAffinity','exactFive','noDiscard'];
const tagEffects=['gold','freeRerolls','halfCharacters','handLevels','shinyCards'];
const itemEffects=['handLevel','addSticker','mod','remove','copy'];
function validateContent(c=content){
 const check=(v,msg)=>{if(!v)throw Error(`콘텐츠 오류: ${msg}`);};
 const num=v=>Number.isFinite(v)&&v>=0,int=v=>Number.isInteger(v)&&v>=0;
 for(const [key,table] of Object.entries({characters:c.characters,stickers:c.stickers,hands:c.hands,weaponRecipes:c.weaponRecipes,mods:c.mods,weapons:c.weapons,elements:c.elements,races:c.races,jobs:c.jobs,monsters:c.monsters,bossRules:c.bossRules,tags:c.tags,items:c.items,blindKinds:c.blindKinds}))check(new Set(table.map(x=>x.id)).size===table.length,`${key} ID 중복`);
 Object.entries(c.balance).forEach(([k,v])=>check(num(v),`수치 ${k}`));
 const b=c.balance;
 check(b.startSlots>=1&&b.maxSlots>=b.startSlots&&b.maxPlay>=1&&b.maxPlay<=b.handSize&&b.attacks>=1,'전투 수치');
 for(const d of c.characters){
  check(byId(c.races,d.raceId)&&byId(c.jobs,d.jobId)&&c.visuals[d.visualProfileId],'캐릭터 참조');
  check(['pairHand','elementCard','weaponCard','growth'].includes(d.trigger)&&['chips','mult','xmult'].includes(d.effect)&&num(d.value)&&int(d.cost)&&d.cost>0,'캐릭터 능력');
  check(d.effect!=='xmult'||d.trigger==='growth'||d.value>=1,'×배율 능력은 1 이상');
 }
 for(const v of Object.values(c.visuals))check(v.rigId===c.rig.id&&c.assets[v.bodyAssetId]&&c.assets[v.frontHandAssetId],'몸체 rig/파츠');
 for(const w of c.weapons)check(w.compatibleRigIds.includes(c.rig.id)&&c.assets[w.assetId],'무기 rig/이미지');
 for(const s of c.stickers){check(c.assets[s.iconAssetId],'스티커 이미지');check(s.kind==='weapon'?byId(c.weapons,s.payloadId):s.kind==='element'?byId(c.elements,s.payloadId):s.kind==='star','스티커 구성');}
 c.initialDeck.forEach(id=>check(byId(c.stickers,id),'덱 참조'));
 check(c.initialDeck.length>=b.handSize,'덱 크기');
 for(const h of c.hands)check(num(h.chips)&&num(h.mult)&&num(h.perChips)&&num(h.perMult)&&int(h.rank)&&h.name&&h.text,'족보');
 check(c.pairHands.every(id=>byId(c.hands,id)),'인간 족보 참조');
 check(new Set(c.weaponRecipes.map(r=>r.weaponId+':'+r.elementId)).size===c.weaponRecipes.length&&c.weaponRecipes.length===c.weapons.length*c.elements.length,'조합 무기는 무기×속성 한 개씩');
 for(const r of c.weaponRecipes)check(byId(c.weapons,r.weaponId)&&byId(c.elements,r.elementId)&&c.assets[r.assetId]&&recipeAbilities.includes(r.ability)&&num(r.value)&&r.name&&r.text,'조합 무기');
 for(const m of c.mods)check(m.name&&m.text&&(m.chips||m.mult||m.xmult)&&(!m.breakChance||(m.breakChance>0&&m.breakChance<1)),'각인');
 check(c.anteBase.length===b.anteCount&&c.anteBase.every((v,i)=>int(v)&&v>0&&(i===0||v>c.anteBase[i-1])),'앤티 목표');
 check(c.blindKinds.length===3&&c.blindKinds[2].id==='boss'&&!c.blindKinds[2].skippable&&c.blindKinds.every(k=>num(k.targetMult)&&int(k.gold)&&int(k.diamonds)),'블라인드 종류');
 for(const m of c.monsters)check((!m.elementId||byId(c.elements,m.elementId))&&c.assets[m.assetId]&&labels[m.nameKey],'몬스터 참조');
 check(byId(c.monsters,c.bossMonsterId)&&c.elements.every(e=>c.monsters.some(m=>m.elementId===e.id)),'몬스터');
 check(c.bossRules.length>=b.anteCount&&c.bossRules.every(r=>bossEffects.includes(r.effect)&&r.name&&r.text),'보스 규칙');
 check(c.tags.length>0&&c.tags.every(t=>tagEffects.includes(t.effect)&&int(t.value)&&t.value>0&&t.name&&t.text),'태그');
 check(c.items.every(i=>itemEffects.includes(i.effect)&&int(i.cost)&&i.cost>0&&int(i.weight)&&i.weight>0&&(i.effect!=='mod'||byId(c.mods,i.mod))&&(!['mod','remove','copy'].includes(i.effect)||(int(i.pick)&&i.pick>0))),'상점 물건');
 check(c.addStickerMods.every(x=>(x.mod===null||byId(c.mods,x.mod))&&int(x.weight)),'스티커 각인 확률');
 const s=c.shopRules;check(int(s.characterOffers)&&int(s.itemOffers)&&int(s.rerollCost)&&s.slotCosts.length===b.maxSlots-b.startSlots&&s.sellRate>0&&s.sellRate<=1,'상점 규칙');
 check(int(c.economy.startGold)&&int(c.economy.interestPer)&&c.economy.interestPer>0,'경제');
 for(const [k,v] of Object.entries(c.affinity.beats))check(byId(c.elements,k)&&byId(c.elements,v),'상성 참조');
 {const bt=c.affinity.beats,seen=new Set();let k=c.elements[0].id;while(k&&!seen.has(k)){seen.add(k);k=bt[k];}check(k===c.elements[0].id&&seen.size===c.elements.length,'상성은 모든 속성을 한 바퀴 도는 순환');}
 return true;
}

return {balance,affinity,labels,races,jobs,weapons,elements,characters,stickers,initialDeck,hands,pairHands,weaponRecipes,mods,rig,assets,visuals,anteBase,blindKinds,monsters,bossMonsterId,bossRules,tags,economy,shopRules,items,addStickerMods,content,byId,nameOf,validateContent};})();
