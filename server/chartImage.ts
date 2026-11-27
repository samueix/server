import zlib from 'zlib';

type Series = { name: string; color: [number,number,number]; values: (number|null)[] };
async function png(w:number,h:number,rgba:Buffer):Promise<Buffer>{
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const chunk=(type:string,data:Buffer)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const t=Buffer.from(type);const crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32(Buffer.concat([t,data]))>>>0);return Buffer.concat([len,t,data,crc]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  const raw=Buffer.alloc((w*4+1)*h);
  for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;rgba.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);} 
  const idat:Buffer = await new Promise((res,rej)=>zlib.deflate(raw,{level:6},(e,b)=>e?rej(e):res(b as Buffer)));
  return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
}
function setPx(buf:Buffer,w:number,h:number,x:number,y:number,c:[number,number,number,number]){
  const xi=Math.round(x), yi=Math.round(y); if(xi<0||yi<0||xi>=w||yi>=h) return; const i=(yi*w+xi)*4;
  const a=c[3]/255, ia=1-a; buf[i]=Math.round(c[0]*a+buf[i]*ia); buf[i+1]=Math.round(c[1]*a+buf[i+1]*ia); buf[i+2]=Math.round(c[2]*a+buf[i+2]*ia); buf[i+3]=255;
}
function line(buf:Buffer,w:number,h:number,x0:number,y0:number,x1:number,y1:number,c:[number,number,number,number]){
  x0=Math.round(x0); y0=Math.round(y0); x1=Math.round(x1); y1=Math.round(y1);
  let dx=Math.abs(x1-x0), sx=x0<x1?1:-1, dy=-Math.abs(y1-y0), sy=y0<y1?1:-1, err=dx+dy;
  for(let i=0;i<5000;i++){setPx(buf,w,h,x0,y0,c); if(x0===x1&&y0===y1) break; const e2=2*err; if(e2>=dy){err+=dy;x0+=sx;} if(e2<=dx){err+=dx;y0+=sy;} }
}
function rect(buf:Buffer,w:number,h:number,x:number,y:number,rw:number,rh:number,c:[number,number,number,number]){
  for(let yy=Math.max(0,Math.floor(y));yy<Math.min(h,Math.ceil(y+rh));yy++) for(let xx=Math.max(0,Math.floor(x));xx<Math.min(w,Math.ceil(x+rw));xx++) setPx(buf,w,h,xx,yy,c);
}
const FONT: Record<string,string[]> = {
'0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['111','001','111','100','111'],'3':['111','001','111','001','111'],'4':['101','101','111','001','001'],'5':['111','100','111','001','111'],'6':['111','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],'9':['111','101','111','001','111'],
'%':['101','001','010','100','101'],'.':['000','000','000','000','010'],':':['000','010','000','010','000'],'-':['000','000','111','000','000'],' ':['000','000','000','000','000'],'/':['001','001','010','100','100'],
'A':['010','101','111','101','101'],'B':['110','101','110','101','110'],'C':['011','100','100','100','011'],'D':['110','101','101','101','110'],'E':['111','100','110','100','111'],'F':['111','100','110','100','100'],'G':['011','100','101','101','011'],'H':['101','101','111','101','101'],'I':['111','010','010','010','111'],'J':['001','001','001','101','010'],'K':['101','101','110','101','101'],'L':['100','100','100','100','111'],'M':['101','111','111','101','101'],'N':['101','111','111','111','101'],'O':['010','101','101','101','010'],'P':['110','101','110','100','100'],'Q':['010','101','101','111','011'],'R':['110','101','110','101','101'],'S':['011','100','010','001','110'],'T':['111','010','010','010','010'],'U':['101','101','101','101','011'],'V':['101','101','101','010','010'],'W':['101','101','111','111','101'],'X':['101','101','010','101','101'],'Y':['101','101','010','010','010'],'Z':['111','001','010','100','111']
};
function drawText(buf:Buffer,w:number,h:number,x:number,y:number,text:string,c:[number,number,number,number],scale=2){
  let cx=x; for(const ch of text.toUpperCase()){const g=FONT[ch]||FONT[' ']; for(let ry=0;ry<5;ry++) for(let rx=0;rx<3;rx++) if(g[ry][rx]==='1') rect(buf,w,h,cx+rx*scale,y+ry*scale,scale,scale,c); cx+=4*scale;}
}

export async function renderLineChartPng(opts:{title:string; series:Series[]; labels?:string[]; yMin?:number; yMax?:number; width?:number; height?:number; ySuffix?:string}):Promise<Buffer>{
  const W=opts.width||900, H=opts.height||360, padL=56, padR=20, padT=44, padB=36;
  const buf=Buffer.alloc(W*H*4,255); for(let i=3;i<buf.length;i+=4) buf[i]=255;
  rect(buf,W,H,0,0,W,H,[18,24,38,255]);
  rect(buf,W,H,padL,padT,W-padL-padR,H-padT-padB,[28,36,52,255]);
  const all=opts.series.flatMap(s=>s.values.filter((v):v is number=>v!=null&&isFinite(v)));
  let yMin=opts.yMin??(all.length?Math.min(...all):0), yMax=opts.yMax??(all.length?Math.max(...all):100);
  if (yMax===yMin) yMax=yMin+1;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  for(let i=0;i<=4;i++){const y=padT+plotH*i/4; line(buf,W,H,padL,y,padL+plotW,y,[55,65,81,255]); const val=(yMax-(yMax-yMin)*i/4); drawText(buf,W,H,4,y-5,`${Math.round(val)}${opts.ySuffix||''}`,[156,163,175,255],1);} 
  drawText(buf,W,H,padL,12,opts.title.slice(0,60),[229,231,235,255],2);
  const n=Math.max(...opts.series.map(s=>s.values.length),1);
  opts.series.forEach((s,si)=>{
    let prev:null|[number,number]=null;
    s.values.forEach((v,idx)=>{ if(v==null||!isFinite(v)){prev=null;return;} const x=padL + (n===1?plotW/2:idx*(plotW/(n-1))); const y=padT + plotH - ((v-yMin)/(yMax-yMin))*plotH; if(prev) line(buf,W,H,prev[0],prev[1],x,y,[...s.color,255]); prev=[x,y]; });
    const lx=padL+si*180, ly=H-20; rect(buf,W,H,lx,ly,10,10,[...s.color,255]); drawText(buf,W,H,lx+14,ly,s.name.slice(0,18),[209,213,219,255],1);
  });
  const labels=opts.labels||[]; const step=Math.max(1,Math.floor(labels.length/6));
  labels.forEach((lb,i)=>{ if(i%step!==0 && i!==labels.length-1) return; const x=padL + (labels.length===1?plotW/2:i*(plotW/(labels.length-1))); drawText(buf,W,H,x-10,H-padB+6,lb.slice(0,5),[156,163,175,255],1); });
  return await png(W,H,buf);
}
