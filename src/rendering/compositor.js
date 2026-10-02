modules["src/rendering/compositor.mjs"]=(()=>{
const {byId}=modules["src/content/data.mjs"];
const {skillOf}=modules["src/domain/rules.mjs"];

const cache=new Map(),images=new Map();
const surface=()=>{const cv=document.createElement('canvas');cv.width=512;cv.height=512;return cv;};
const renderRequests=new WeakMap();
const CACHE_LIMIT=96;
const starTier=lv=>lv>=5?3:lv>=3?2:lv>=1?1:0;
// 무기 광채는 속성 Lv2부터, Lv4에서 최대.
// 스킬이 생기면 광채가 켜지고, 레벨이 오를수록 강해진다(최대 4).
const glowLevel=u=>u.weaponId&&u.elementId?Math.min(2+Math.floor(((u.level??1)-1)/4),4):0;
// 무기 강화 빛은 +1부터, +5에서 최대.
const plusGlow=u=>u.weaponId?Math.min(u.weaponPlus??0,5):0;
function composeVisual(unit,c){
 const def=byId(c.characters,unit.characterDefId),profile=c.visuals[def.visualProfileId];
 const recipe=skillOf(unit,c);
 const entries={body:profile.bodyAssetId,weapon:unit.weaponId?(recipe?.assetId??byId(c.weapons,unit.weaponId).assetId):null,hand:profile.frontHandAssetId,element:unit.elementId?byId(c.elements,unit.elementId).assetId:null};
 const result=profile.layerOrder.filter(layer=>entries[layer]).map(layer=>({layer,asset:c.assets[entries[layer]],anchor:profile.anchors[layer],unit,def}));
 const ornament=(layer,id,anchor,scale)=>({layer,asset:{...c.assets[id],scale:scale*1254/c.assets[id].sourceRect[2]},anchor,unit,def});
 // 신체 원화 좌표 기준 부착점. 종족·직업별 보정은 아트 테이블에서 관리한다.
 // 별 Lv 구간: 1 이상 배지, 3 이상 어깨 장식, 5 이상 후면 문장.
 const pose=profile.rankPose,tier=starTier((unit.level??1)-1);
 if(tier>=3)result.unshift(ornament('crest','asset_rank_crest',pose.crest,pose.crestSize/1254));
 const bodyEnd=result.findIndex(e=>e.layer==='body')+1;
 const front=[];
 if(tier>=2)front.push(ornament('rank','asset_rank_'+def.jobId.replace('job_',''),pose.shoulder,pose.shoulderSize/1254));
 if(tier>=1)front.push(ornament('badge','asset_rank_badge',pose.badge,pose.badgeSize/1254));
 result.splice(bodyEnd,0,...front);
 return result;
}

function polygon(ctx,points,fill){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.stroke();}
function circle(ctx,x,y,r,fill){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.stroke();}
// 2단계용 기하학 프록시. 정식 아트는 AssetDef.file로 교체한다.
function placeholder(ctx,entry,c){
 const {layer,unit,def}=entry;ctx.lineWidth=8;ctx.lineJoin='round';ctx.strokeStyle='#342937';
 const palette={job_warrior:'#bb6955',job_archer:'#719777',job_mage:'#8970a5'},color=palette[def.jobId],skin=def.raceId==='race_elf'?'#e8dcaf':'#f2cda5';
 if(layer==='body'){
  polygon(ctx,[[205,377],[248,377],[243,441],[187,441]],'#665363');polygon(ctx,[[263,377],[307,377],[323,441],[266,441]],'#665363');
  polygon(ctx,[[207,253],[298,253],[329,394],[180,394]],color);
  polygon(ctx,[[201,275],[163,324],[189,343],[225,300]],color);circle(ctx,165,332,20,skin);
  polygon(ctx,[[296,275],[356,299],[355,331],[285,314]],color);
  if(def.raceId==='race_elf'){polygon(ctx,[[158,177],[116,151],[165,223]],skin);polygon(ctx,[[320,180],[363,153],[322,224]],skin);}
  circle(ctx,243,190,86,skin);
  polygon(ctx,[[160,170],[146,133],[190,133],[197,88],[226,120],[261,87],[278,124],[319,112],[331,159],[291,145],[279,177],[239,147],[207,171],[188,145]],color);
  circle(ctx,212,194,24,'#fffaf0');circle(ctx,271,194,24,'#fffaf0');ctx.fillStyle='#342937';ctx.fillRect(214,190,6,13);ctx.fillRect(267,190,6,13);
  ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(235,231);ctx.lineTo(249,231);ctx.stroke();
  ctx.fillStyle='#fff7e6';ctx.font='bold 34px sans-serif';ctx.textAlign='center';ctx.fillText(c.labels[def.jobId].slice(0,1),251,338);
 }else if(layer==='hand'){circle(ctx,356,318,20,skin);}
 else if(layer==='weapon'){
  if(unit.weaponId==='weapon_sword'){
   polygon(ctx,[[345,303],[345,188],[361,160],[377,188],[370,303]],'#c5d3d5');polygon(ctx,[[333,290],[386,290],[386,307],[333,307]],'#dfb45b');polygon(ctx,[[351,306],[367,306],[367,365],[351,365]],'#896844');
  }else if(unit.weaponId==='weapon_bow'){
   ctx.strokeStyle='#986c48';ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(364,210);ctx.quadraticCurveTo(454,311,364,402);ctx.stroke();ctx.strokeStyle='#342937';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(364,210);ctx.lineTo(364,402);ctx.stroke();
  }else{ctx.strokeStyle='#986c48';ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(359,397);ctx.lineTo(367,224);ctx.stroke();ctx.strokeStyle='#342937';polygon(ctx,[[367,163],[394,198],[367,231],[340,198]],'#78b4c7');}
 }else if(layer==='element'){
  const e=byId(c.elements,unit.elementId);circle(ctx,386,158,35,e.color);ctx.fillStyle='#fff';ctx.font='bold 38px sans-serif';ctx.textAlign='center';ctx.fillText(e.symbol,386,171);
 }
}
async function imageFor(file){
 if(!images.has(file))images.set(file,new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error(`이미지 로드 실패: ${file}`));im.src=file;}));return images.get(file);
}
async function renderCharacter(canvas,unit,c){
 const request={};renderRequests.set(canvas,request);
 const entries=composeVisual(unit,c);
 const key=JSON.stringify([entries.map(e=>[e.asset.id,e.asset.revision,e.anchor,e.asset.scale]),unit.elementId,glowLevel(unit),plusGlow(unit)]);
 if(!cache.has(key)){
  if(cache.size>=CACHE_LIMIT)cache.delete(cache.keys().next().value);
  cache.set(key,(async()=>{
   const cv=surface(),ctx=cv.getContext('2d');let fallback=false;
   for(const entry of entries){
    if(entry.asset.file){try{
     const image=await imageFor(entry.asset.file),a=entry.asset;ctx.save();ctx.translate(entry.anchor.x,entry.anchor.y);ctx.rotate(a.rotation??0);
     if(entry.layer==='weapon'&&glowLevel(unit)>=2){
      ctx.shadowColor=byId(c.elements,unit.elementId).color;ctx.shadowBlur=glowLevel(unit)*7;
     }else if(entry.layer==='weapon'&&plusGlow(unit)>=1){
      ctx.shadowColor='#f5c64b';ctx.shadowBlur=4+plusGlow(unit)*4;
     }
     const [sx,sy,sw,sh]=a.sourceRect,[dx,dy]=a.offset??[0,0];ctx.drawImage(image,sx,sy,sw,sh,dx,dy,sw*a.scale,sh*a.scale);ctx.restore();
    }catch{placeholder(ctx,entry,c);fallback=true;}}
    else{placeholder(ctx,entry,c);fallback=true;}
   }
   const outline=surface(),ox=outline.getContext('2d');
   for(let i=0;i<32;i++){const a=i*Math.PI/16;ox.drawImage(cv,Math.cos(a)*c.rig.outline,Math.sin(a)*c.rig.outline);}
   ox.globalCompositeOperation='source-in';ox.fillStyle='#fff';ox.fillRect(0,0,512,512);
   const final=surface(),fx=final.getContext('2d');fx.shadowColor='#30243730';fx.shadowBlur=6;fx.shadowOffsetY=4;fx.drawImage(outline,0,0);fx.shadowColor='transparent';fx.drawImage(cv,0,0);
   return {canvas:final,fallback};
  })());
 }
 const result=await cache.get(key);
 if(!canvas.isConnected||renderRequests.get(canvas)!==request)return;
 canvas.width=512;canvas.height=512;canvas.getContext('2d').drawImage(result.canvas,0,0);
 if(result.fallback){canvas.title='일부 이미지를 불러오지 못해 임시 도형으로 표시합니다.';cache.delete(key);}
 if(canvas.dataset.evolve==='yes'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  canvas.animate([{opacity:.55,transform:'scale(.94)'},{opacity:1,transform:'scale(1.08)'},{opacity:1,transform:'scale(1)'}],{duration:480,easing:'ease-out'});
  delete canvas.dataset.evolve;
 }
}

async function renderAsset(canvas,asset){
 try{const im=await imageFor(asset.file);if(!canvas.isConnected)return;canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d'),[x,y,w,h]=asset.sourceRect;const scale=120/Math.max(w,h);ctx.drawImage(im,x,y,w,h,(128-w*scale)/2,(128-h*scale)/2,w*scale,h*scale);}catch{canvas.title='이미지 로드 실패';}
}

return {composeVisual,renderCharacter,renderAsset};})();
