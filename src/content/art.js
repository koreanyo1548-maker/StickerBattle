modules["src/content/art.mjs"]=(()=>{

const artFiles={"human_archer": "@art:human_archer", "human_mage": "@art:human_mage", "elf_warrior": "@art:elf_warrior", "elf_archer": "@art:elf_archer", "elf_mage": "@art:elf_mage", "sword": "@art:sword", "bow": "@art:bow", "staff": "@art:staff", "fire": "@art:fire", "water": "@art:water", "lightning": "@art:lightning", "star": "@art:star", "background": "@art:background", "human_warrior": "@art:human_warrior", "orc_warrior": "@art:orc_warrior", "orc_archer": "@art:orc_archer", "orc_mage": "@art:orc_mage", "dwarf_warrior": "@art:dwarf_warrior", "dwarf_archer": "@art:dwarf_archer", "dwarf_mage": "@art:dwarf_mage"};
function applyArt(assets,visuals){
 const set=(id,key,opts={})=>Object.assign(assets[id],{file:artFiles[key],revision:3,scale:1,sourceRect:[0,0,1254,1254],...opts});
 const hands={human_warrior:[870,918],human_archer:[876,924],human_mage:[870,932],elf_warrior:[865,918],elf_archer:[864,912],elf_mage:[866,930],orc_warrior:[883,930],orc_archer:[874,924],orc_mage:[880,936],dwarf_warrior:[926,922],dwarf_archer:[893,936],dwarf_mage:[912,943]};
 for(const [key,[hx,hy]] of Object.entries(hands)){
  set(`char_${key}_body`,key,{scale:.34,offset:[23,35]});
  set(`char_${key}_hand`,key,{sourceRect:[hx-54,hy-51,112,102],scale:.34,offset:[-54*.34,-51*.34]});
  visuals[`visual_${key}`].anchors={body:{x:0,y:0},weapon:{x:23+hx*.34,y:35+hy*.34},hand:{x:23+hx*.34,y:35+hy*.34},element:{x:398,y:105}};
 }
 set('asset_sword','sword',{scale:.26,offset:[-627*.26,-1010*.26],rotation:.28});
 set('asset_bow','bow',{scale:.22,offset:[-701*.22,-635*.22],rotation:.15});
 set('asset_staff','staff',{scale:.28,offset:[-627*.28,-993*.28],rotation:.28});
 for(const k of ['fire','water','lightning'])set(`asset_${k}`,k,{scale:.087,offset:[-54.5,-54.5]});

 // 새 아트는 게임 안에 포함한다. 손잡이 기준 좌표는 원본 무기와 동일한 비율이다.
 const evolved={"flame_sword":{"id":"asset_flame_sword","file":"@art:flame_sword","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"reflux_sword":{"id":"asset_reflux_sword","file":"@art:reflux_sword","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"hone_sword":{"id":"asset_hone_sword","file":"@art:hone_sword","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"blast_bow":{"id":"asset_blast_bow","file":"@art:blast_bow","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"rainbow_bow":{"id":"asset_rainbow_bow","file":"@art:rainbow_bow","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"chain_bow":{"id":"asset_chain_bow","file":"@art:chain_bow","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"flame_staff":{"id":"asset_flame_staff","file":"@art:flame_staff","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"balance_staff":{"id":"asset_balance_staff","file":"@art:balance_staff","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"charge_staff":{"id":"asset_charge_staff","file":"@art:charge_staff","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"rank_badge":{"id":"asset_rank_badge","file":"@art:rank_badge","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"rank_warrior":{"id":"asset_rank_warrior","file":"@art:rank_warrior","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"rank_archer":{"id":"asset_rank_archer","file":"@art:rank_archer","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"rank_mage":{"id":"asset_rank_mage","file":"@art:rank_mage","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]},"rank_crest":{"id":"asset_rank_crest","file":"@art:rank_crest","revision":1,"sourceRect":[0,0,1254,1254],"scale":1,"offset":[0,0]}};
 for(const [key,a] of Object.entries(evolved)){
  const baseKey=key.endsWith('_sword')?'sword':key.endsWith('_bow')?'bow':key.endsWith('_staff')?'staff':null;
  if(baseKey){
   const base=assets['asset_'+baseKey],ratio=1254/a.sourceRect[2];
   Object.assign(a,{scale:base.scale*ratio,offset:[...base.offset],rotation:base.rotation});
  }
  assets[a.id]=a;
 }
 for(const [key,[hx,hy]] of Object.entries(hands)){
  const p=visuals['visual_'+key],x=23+hx*.34,y=35+hy*.34;
  const job=key.split('_')[1],dwarf=key.startsWith('dwarf');
  p.rankPose={
   badge:{x:x-104,y:y-49+(dwarf?5:0)},badgeSize:68,
   shoulder:{x:x-185,y:y-88+(job==='archer'?5:0)},shoulderSize:job==='warrior'?119:138,
   crest:{x:0,y:0},crestSize:490
  };
 }

 set('asset_star','star');set('asset_background','background',{sourceRect:[0,0,1536,1024]});
 for(const r of ['human','elf','orc','dwarf'])set(`icon_race_${r}`,`${r}_warrior`,{sourceRect:[200,200,860,540]});
 for(const [j,w] of [['warrior','sword'],['archer','bow'],['mage','staff']])set(`icon_job_${j}`,w);
}

return {artFiles,applyArt};})();
