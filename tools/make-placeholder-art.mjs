// 임시 그림(몬스터 4종, 보상 카드 뒷면)과 교체용 가이드 이미지를 만든다.
// 실행: NODE_PATH=$(npm root -g) node tools/make-placeholder-art.mjs   (playwright + chromium 필요)
// 결과: assets/art/monster_*.webp, assets/art/reward_back.webp, docs/art-guides/*.png
// 규격은 docs/art-spec.md와 같아야 한다. 정식 그림으로 바꿀 때는 같은 파일 이름·캔버스·기준점을 지킨다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');

// 규격. docs/art-spec.md의 표와 같은 값.
export const SPEC = {
  monster: { w: 1254, h: 1254, groundY: 1165, centerX: 627, safe: [127, 115, 1127, 1165] },
  rewardBack: { w: 600, h: 840, radius: 48, safe: [48, 48, 552, 792] },
};

const drawCode = String.raw`
const OUT='#2c1c17';
function ctx2(w,h){const cv=document.createElement('canvas');cv.width=w;cv.height=h;const x=cv.getContext('2d');x.lineJoin='round';x.lineCap='round';return [cv,x];}
function blob(x,cx,ground,w,h,wob){
 // 바닥이 평평한 물방울형 몸통. wob: 정수리 뾰족함
 const l=cx-w/2,r=cx+w/2,top=ground-h;
 x.beginPath();x.moveTo(l+w*.08,ground);
 x.bezierCurveTo(l-w*.06,ground-h*.12,l-w*.02,ground-h*.62,cx-w*.22,top+h*.18);
 x.bezierCurveTo(cx-w*.1,top+h*.02,cx,top-wob,cx,top-wob);
 x.bezierCurveTo(cx,top-wob,cx+w*.1,top+h*.02,cx+w*.22,top+h*.18);
 x.bezierCurveTo(r+w*.02,ground-h*.62,r+w*.06,ground-h*.12,r-w*.08,ground);
 x.closePath();
}
function fillStroke(x,fill,lw=26){x.fillStyle=fill;x.fill();x.strokeStyle=OUT;x.lineWidth=lw;x.stroke();}
function eyes(x,cx,y,gap,r,angry){
 for(const s of [-1,1]){x.beginPath();x.arc(cx+s*gap,y,r,0,Math.PI*2);fillStroke(x,'#fffaf0',18);
  x.fillStyle=OUT;x.beginPath();x.ellipse(cx+s*gap-s*r*.12,y+r*.1,r*.16,r*.3,0,0,Math.PI*2);x.fill();
  if(angry){x.strokeStyle=OUT;x.lineWidth=22;x.beginPath();x.moveTo(cx+s*(gap+r*.9),y-r*1.25);x.lineTo(cx+s*(gap-r*.7),y-r*.8);x.stroke();}}
}
function mouth(x,cx,y,w){x.strokeStyle=OUT;x.lineWidth=18;x.beginPath();x.moveTo(cx-w/2,y);x.quadraticCurveTo(cx,y+w*.35,cx+w/2,y);x.stroke();}
function shine(x,cx,top,w){x.fillStyle='rgba(255,255,255,.55)';x.beginPath();x.ellipse(cx-w*.26,top+w*.32,w*.07,w*.14,-.5,0,Math.PI*2);x.fill();}
function shadow(x,cx,ground,w,color){x.fillStyle=color;x.beginPath();x.ellipse(cx,ground-40,w*.36,40,0,Math.PI,0,true);x.fill();}
function flame(x,cx,base,s,fill,core){
 x.beginPath();x.moveTo(cx-s*.5,base);x.bezierCurveTo(cx-s*.7,base-s*.6,cx-s*.2,base-s*.7,cx-s*.25,base-s*1.2);
 x.bezierCurveTo(cx+s*.05,base-s*.9,cx+s*.15,base-s*1.1,cx+s*.1,base-s*1.55);
 x.bezierCurveTo(cx+s*.6,base-s*1.1,cx+s*.75,base-s*.5,cx+s*.5,base);x.closePath();fillStroke(x,fill,22);
 x.beginPath();x.moveTo(cx-s*.22,base);x.bezierCurveTo(cx-s*.3,base-s*.4,cx,base-s*.5,cx+s*.02,base-s*.85);x.bezierCurveTo(cx+s*.3,base-s*.5,cx+s*.32,base-s*.2,cx+s*.22,base);x.closePath();x.fillStyle=core;x.fill();
}
function bolt(x,cx,cy,s,fill){const p=[[.1,-1],[-.45,.08],[-.02,.08],[-.18,1],[.45,-.12],[.02,-.12]];x.beginPath();p.forEach(([a,b],i)=>i?x.lineTo(cx+a*s,cy+b*s):x.moveTo(cx+a*s,cy+b*s));x.closePath();fillStroke(x,fill,20);}
function drop(x,cx,cy,s,fill){x.beginPath();x.moveTo(cx,cy-s);x.bezierCurveTo(cx+s*.2,cy-s*.5,cx+s*.62,cy-s*.05,cx+s*.62,cy+s*.3);x.arc(cx,cy+s*.3,s*.62,0,Math.PI);x.bezierCurveTo(cx-s*.62,cy-s*.05,cx-s*.2,cy-s*.5,cx,cy-s);x.closePath();fillStroke(x,fill,20);}
function crown(x,cx,base,w){const h=w*.55;x.beginPath();x.moveTo(cx-w/2,base);x.lineTo(cx-w/2,base-h*.6);x.lineTo(cx-w/4,base-h*.25);x.lineTo(cx,base-h);x.lineTo(cx+w/4,base-h*.25);x.lineTo(cx+w/2,base-h*.6);x.lineTo(cx+w/2,base);x.closePath();fillStroke(x,'#f5c64b',22);
 for(const [dx,col] of [[-w*.28,'#d96943'],[0,'#448cab'],[w*.28,'#d5a327']]){x.beginPath();x.arc(cx+dx,base-h*.2,w*.07,0,Math.PI*2);fillStroke(x,col,12);}}
const S=window.SPEC;
window.drawMonster=function(kind){
 const {w:W,h:H,groundY:G,centerX:CX}=S.monster,[cv,x]=ctx2(W,H);
 const cfg={fire:{body:'#e8744a',dark:'#b8502f',w:820,h:640},water:{body:'#5aa7c8',dark:'#397f9f',w:840,h:620},lightning:{body:'#e8c040',dark:'#b8922a',w:800,h:650},boss:{body:'#8a67b0',dark:'#644786',w:980,h:800}}[kind];
 const top=G-cfg.h;
 if(kind==='fire'){flame(x,CX-150,top+150,230,'#f08a3c','#ffd766');flame(x,CX+170,top+160,200,'#f08a3c','#ffd766');flame(x,CX,top+110,330,'#e8563a','#ffd766');}
 if(kind==='lightning'){bolt(x,CX-250,top+40,150,'#fff08a');bolt(x,CX+250,top+40,150,'#fff08a');}
 blob(x,CX,G,cfg.w,cfg.h,kind==='water'?140:60);fillStroke(x,cfg.body);
 // 아래쪽 음영
 x.save();blob(x,CX,G,cfg.w,cfg.h,kind==='water'?140:60);x.clip();x.fillStyle=cfg.dark;x.beginPath();x.ellipse(CX,G+20,cfg.w*.62,cfg.h*.28,0,0,Math.PI*2);x.fill();x.restore();
 blob(x,CX,G,cfg.w,cfg.h,kind==='water'?140:60);x.strokeStyle=OUT;x.lineWidth=26;x.stroke();
 shine(x,CX,top,cfg.w);
 const ey=G-cfg.h*.52;
 eyes(x,CX,ey,cfg.w*.17,cfg.w*.1,kind!=='water');
 mouth(x,CX,ey+cfg.w*.2,cfg.w*.16);
 if(kind==='water'){drop(x,CX-cfg.w*.36,G-cfg.h*.78,70,'#8fd0ea');drop(x,CX+cfg.w*.38,G-cfg.h*.62,55,'#8fd0ea');}
 if(kind==='boss'){crown(x,CX,top+60,300);
  // 세 속성 문장
  flame(x,CX-330,G-60,120,'#e8563a','#ffd766');drop(x,CX+330,G-150,70,'#5aa7c8');bolt(x,CX+360,G-560,80,'#e8c040');}
 return cv.toDataURL('image/webp',.9);
};
window.drawRewardBack=function(){
 const {w:W,h:H,radius:R}=S.rewardBack,[cv,x]=ctx2(W,H);
 const rr=(p,col,lw)=>{x.beginPath();x.roundRect(p,p,W-2*p,H-2*p,Math.max(8,R-p));if(col){x.fillStyle=col;x.fill();}if(lw){x.strokeStyle=OUT;x.lineWidth=lw;x.stroke();}};
 rr(10,'#4a3a6e',20);rr(44,null,0);x.strokeStyle='#f5c64b';x.lineWidth=10;x.stroke();
 x.save();rr(52,null,0);x.clip();x.strokeStyle='rgba(255,255,255,.07)';x.lineWidth=18;for(let i=-H;i<W+H;i+=64){x.beginPath();x.moveTo(i,0);x.lineTo(i+H,H);x.stroke();}x.restore();
 // 가운데 별 문장
 const cx=W/2,cy=H/2,o=150,inn=64;x.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?inn:o;x.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}x.closePath();fillStroke(x,'#f5c64b',20);
 x.beginPath();x.arc(cx,cy,34,0,Math.PI*2);fillStroke(x,'#fff3c4',14);
 x.fillStyle='#f5c64b';x.font='bold 64px sans-serif';x.textAlign='center';x.fillText('?',cx,H-110);
 return cv.toDataURL('image/webp',.9);
};
// 교체용 가이드: 임시 그림 위에 캔버스 경계, 안전 영역, 기준선, 기준점을 겹친다.
window.drawGuide=function(kind,dataUrl){
 return new Promise(res=>{const im=new Image();im.onload=()=>{
  const s=kind==='rewardBack'?S.rewardBack:S.monster,[cv,x]=ctx2(s.w,s.h);
  x.fillStyle='#eee';x.fillRect(0,0,s.w,s.h);for(let i=0;i<s.w;i+=40)for(let j=(i/40)%2*40;j<s.h;j+=80){x.fillStyle='#d8d8d8';x.fillRect(i,j,40,40);}
  x.drawImage(im,0,0);
  x.strokeStyle='#e0473b';x.lineWidth=6;x.setLineDash([24,14]);x.strokeRect(3,3,s.w-6,s.h-6);
  x.strokeStyle='#3a86d8';x.strokeRect(s.safe[0],s.safe[1],s.safe[2]-s.safe[0],s.safe[3]-s.safe[1]);x.setLineDash([]);
  x.font='bold 34px sans-serif';x.fillStyle='#3a86d8';x.fillText('안전 영역 '+(s.safe[2]-s.safe[0])+'×'+(s.safe[3]-s.safe[1]),s.safe[0]+12,s.safe[1]+44);
  x.fillStyle='#e0473b';x.fillText('캔버스 '+s.w+'×'+s.h+' 투명 배경',16,s.h-18);
  if(kind!=='rewardBack'){
   x.strokeStyle='#2a9d5c';x.lineWidth=5;x.beginPath();x.moveTo(0,s.groundY);x.lineTo(s.w,s.groundY);x.moveTo(s.centerX,0);x.lineTo(s.centerX,s.h);x.stroke();
   x.fillStyle='#2a9d5c';x.fillText('바닥선 y='+s.groundY,s.w-330,s.groundY-14);x.fillText('중심선 x='+s.centerX,s.centerX+12,60);
   x.beginPath();x.arc(s.centerX,s.groundY,16,0,Math.PI*2);x.fill();x.fillText('기준점 ('+s.centerX+', '+s.groundY+')',s.centerX+24,s.groundY+44);
  }
  res(cv.toDataURL('image/png'));};im.src=dataUrl;});
};`;

const b64 = url => Buffer.from(url.split(',')[1], 'base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.evaluate(`window.SPEC=${JSON.stringify(SPEC)};${drawCode}`);
mkdirSync(join(root, 'docs/art-guides'), { recursive: true });
for (const kind of ['fire', 'water', 'lightning', 'boss']) {
  const url = await page.evaluate(k => window.drawMonster(k), kind);
  writeFileSync(join(root, `assets/art/monster_${kind}.webp`), b64(url));
  if (kind === 'fire') writeFileSync(join(root, 'docs/art-guides/monster-guide.png'), b64(await page.evaluate(u => window.drawGuide('monster', u), url)));
}
const back = await page.evaluate(() => window.drawRewardBack());
writeFileSync(join(root, 'assets/art/reward_back.webp'), b64(back));
writeFileSync(join(root, 'docs/art-guides/reward-back-guide.png'), b64(await page.evaluate(u => window.drawGuide('rewardBack', u), back)));
await browser.close();
console.log('done');
