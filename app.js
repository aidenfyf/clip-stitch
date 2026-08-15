/* ============================================================
   Clip Stitch
   Everything runs client side: canvas compositing into
   MediaRecorder, WebAudio for the music bed. No network calls,
   no upload, nothing stored. Open this file and check.
   ============================================================ */

const ASPECTS = { '9:16':[720,1280], '1:1':[1080,1080], '16:9':[1280,720] };

const LOOKS = {
  spotlight: {
    label:'Spotlight', swatch:'#E8B44A',
    paint(ctx,W,H){
      const g = ctx.createRadialGradient(W/2,H*0.42,0,W/2,H*0.42,Math.max(W,H)*0.8);
      g.addColorStop(0,'#2A2119'); g.addColorStop(1,'#0D0B09');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    },
    text:'#F2EDE4', accent:'#E8B44A', shadow:'rgba(0,0,0,.7)', rim:'rgba(242,237,228,.12)'
  },
  paper: {
    label:'Paper', swatch:'#E4DACA',
    paint(ctx,W,H){
      ctx.fillStyle='#E9E1D3'; ctx.fillRect(0,0,W,H);
      const g = ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'rgba(255,255,255,.5)'); g.addColorStop(1,'rgba(180,165,140,.25)');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    },
    text:'#1E1913', accent:'#B4522F', shadow:'rgba(60,45,25,.35)', rim:'rgba(30,25,19,.14)'
  },
  dusk: {
    label:'Dusk', swatch:'#7C6BE8',
    paint(ctx,W,H){
      const g = ctx.createLinearGradient(0,0,W,H);
      g.addColorStop(0,'#171334'); g.addColorStop(.55,'#2A1F52'); g.addColorStop(1,'#4A2352');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    },
    text:'#F3EFFF', accent:'#9C8BFF', shadow:'rgba(0,0,0,.6)', rim:'rgba(156,139,255,.35)'
  },
  blueprint: {
    label:'Blueprint', swatch:'#5FA8C7',
    paint(ctx,W,H){
      ctx.fillStyle='#10202B'; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle='rgba(95,168,199,.12)'; ctx.lineWidth=Math.max(1,W/900);
      const step = W/14;
      ctx.beginPath();
      for(let x=0;x<=W;x+=step){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
      for(let y=0;y<=H;y+=step){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
      ctx.stroke();
    },
    text:'#DCEEF6', accent:'#5FA8C7', shadow:'rgba(0,0,0,.6)', rim:'rgba(95,168,199,.3)'
  }
};

/* Device chrome sits outside the looks: neutral hardware colors
   that read correctly on every backdrop. Paper gets light chrome. */
const CHROME = {
  paper:   { bar:'#E0D8C8', pill:'rgba(30,25,19,.08)', text:'rgba(30,25,19,.55)' },
  default: { bar:'#1E1C24', pill:'rgba(255,255,255,.09)', text:'rgba(255,255,255,.5)' }
};

const IMAGE_BEAT = 2.6;
const VIDEO_MAX  = 3.8;
const VIDEO_MIN  = 1.4;
const INTRO      = 2.3;
const OUTRO      = 2.4;
const SETTLE     = 0.34;

/* ---------------- state ---------------- */
const media = [];
let aspect = '9:16';
let look = 'spotlight';
let musicOn = true;
let ownAudioBuffer = null;
let ownAudioName = '';
let rendering = false;
let lastUrl = null;

/* ---------------- elements ---------------- */
const $ = id => document.getElementById(id);
const picker=$('picker'), intake=$('intake'), framesEl=$('frames'), countEl=$('count');
const goBtn=$('go'), readout=$('readout'), stage=$('stage'), canvas=$('canvas');
const barFill=$('barFill'), clock=$('clock'), result=$('result'), preview=$('preview');
const saveLink=$('save'), shareBtn=$('share'), againBtn=$('again'), sizeEl=$('size');
const ctx = canvas.getContext('2d');

/* ---------------- look chips ---------------- */
const looksEl = $('looks');
Object.entries(LOOKS).forEach(([key,cfg],i)=>{
  const b=document.createElement('button');
  b.type='button'; b.className='choice'; b.dataset.v=key;
  b.setAttribute('aria-pressed', String(i===0));
  b.innerHTML=`<span class="swatch" style="background:${cfg.swatch}"></span>${cfg.label}`;
  b.addEventListener('click',()=>{
    look=key;
    [...looksEl.children].forEach(c=>c.setAttribute('aria-pressed',String(c===b)));
  });
  looksEl.appendChild(b);
});

$('aspects').addEventListener('click', e=>{
  const b=e.target.closest('.choice'); if(!b) return;
  aspect=b.dataset.v;
  [...e.currentTarget.children].forEach(c=>c.setAttribute('aria-pressed',String(c===b)));
});

$('music').addEventListener('click', e=>{
  musicOn=!musicOn;
  e.currentTarget.setAttribute('aria-pressed',String(musicOn));
});

/* ---------------- own audio ---------------- */
$('ownAudio').addEventListener('click',()=>$('audioPicker').click());
$('audioPicker').addEventListener('change', async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{
    const AC = window.AudioContext||window.webkitAudioContext;
    const tmp = new AC();
    ownAudioBuffer = await tmp.decodeAudioData(await f.arrayBuffer());
    ownAudioName = f.name;
    tmp.close();
    $('ownAudio').textContent = 'Track: '+f.name.slice(0,22);
    $('musicNote').textContent = 'Using your track instead';
    musicOn = true; $('music').setAttribute('aria-pressed','true');
  }catch(err){
    $('ownAudio').textContent = 'Could not read that file';
  }
});

/* ---------------- intake ---------------- */
intake.addEventListener('click',()=>picker.click());
picker.addEventListener('change', e=>ingest([...e.target.files]));

['dragenter','dragover'].forEach(t=>document.addEventListener(t,e=>{
  e.preventDefault(); intake.classList.add('hot');
}));
['dragleave','drop'].forEach(t=>document.addEventListener(t,e=>{
  e.preventDefault(); intake.classList.remove('hot');
}));
document.addEventListener('drop', e=>{
  if(e.dataTransfer?.files?.length) ingest([...e.dataTransfer.files]);
});

async function ingest(files){
  let skipped=0;
  for(const f of files){
    if(f.type.startsWith('image/')){
      const url=URL.createObjectURL(f);
      const el=new Image();
      await new Promise(r=>{ el.onload=r; el.onerror=r; el.src=url; });
      if(el.naturalWidth) media.push({kind:'image', el, url, thumb:url, dur:IMAGE_BEAT});
    } else if(f.type.startsWith('video/')){
      const url=URL.createObjectURL(f);
      const el=document.createElement('video');
      el.src=url; el.muted=true; el.playsInline=true;
      el.setAttribute('playsinline',''); el.preload='auto';
      // a codec the browser can't open may never fire either event - don't hang the whole batch on it
      await new Promise(r=>{
        const to=setTimeout(r,8000);
        el.onloadedmetadata=()=>{ clearTimeout(to); r(); };
        el.onerror=()=>{ clearTimeout(to); r(); };
      });
      if(!el.videoWidth){
        try{ URL.revokeObjectURL(url); }catch(e){}
        skipped++;
        continue;
      }
      const raw = isFinite(el.duration)? el.duration : VIDEO_MAX;
      const dur = Math.max(VIDEO_MIN, Math.min(VIDEO_MAX, raw));
      const thumb = await grabThumb(el);
      media.push({kind:'video', el, url, thumb, dur, src:raw});
    }
  }
  picker.value='';
  paintStrip();
  if(skipped) readout.textContent += ` · ${skipped} unreadable file${skipped>1?'s':''} skipped`;
}

function grabThumb(v){
  return new Promise(res=>{
    const done=()=>{
      try{
        const c=document.createElement('canvas'); c.width=132; c.height=132;
        const x=c.getContext('2d');
        const s=Math.min(v.videoWidth/132, v.videoHeight/132)||1;
        const sw=132*s, sh=132*s;
        x.drawImage(v,(v.videoWidth-sw)/2,(v.videoHeight-sh)/2,sw,sh,0,0,132,132);
        res(c.toDataURL('image/jpeg',0.7));
      }catch(e){ res(''); }
      v.removeEventListener('seeked',done);
    };
    v.addEventListener('seeked',done);
    try{ v.currentTime = Math.min(0.15, (v.duration||1)/4); }catch(e){ res(''); }
    setTimeout(()=>res(''),2500);
  });
}

function paintStrip(){
  framesEl.innerHTML='';
  if(!media.length){
    framesEl.innerHTML='<div class="empty">Strip is empty</div>';
  } else {
    media.forEach((m,i)=>{
      const d=document.createElement('div');
      d.className='frame';
      d.innerHTML=`
        ${m.thumb?`<img src="${m.thumb}" alt="">`:''}
        <span class="tag">${m.kind==='video'?'VID':'IMG'}</span>
        <button class="kill" aria-label="Remove shot ${i+1}">&times;</button>
        <span class="shift">
          <button data-d="-1" aria-label="Move earlier">&#9664;</button>
          <button data-d="1" aria-label="Move later">&#9654;</button>
        </span>`;
      d.querySelector('.kill').onclick=()=>{
        try{ URL.revokeObjectURL(m.url); }catch(e){}
        media.splice(i,1); paintStrip();
      };
      d.querySelectorAll('.shift button').forEach(b=>{
        b.onclick=()=>{
          const j=i+Number(b.dataset.d);
          if(j<0||j>=media.length) return;
          [media[i],media[j]]=[media[j],media[i]];
          paintStrip();
        };
      });
      framesEl.appendChild(d);
    });
  }
  const total = runtime();
  countEl.textContent = media.length===1 ? '1 shot' : media.length+' shots';
  goBtn.disabled = media.length===0 || rendering;
  readout.textContent = media.length
    ? `${fmt(total)} runtime · ${ASPECTS[aspect][0]}×${ASPECTS[aspect][1]}`
    : 'Add footage to start';
}

function runtime(){
  return INTRO + media.reduce((s,m)=>s+m.dur,0) + OUTRO;
}
function fmt(s){
  const m=Math.floor(s/60), r=Math.round(s%60);
  return `${m}:${String(r).padStart(2,'0')}`;
}
function slugName(){
  return (($('name').value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''));
}

/* ---------------- drawing helpers ---------------- */
function rr(c,x,y,w,h,r){
  if(c.roundRect){ c.beginPath(); c.roundRect(x,y,w,h,r); return; }
  c.beginPath();
  c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}
const easeOut = t => 1-Math.pow(1-t,3);
const smooth  = t => t*t*(3-2*t);

function wrap(c,text,maxW){
  const words=text.split(/\s+/).filter(Boolean);
  const lines=[]; let line='';
  for(const w of words){
    const test = line? line+' '+w : w;
    if(c.measureText(test).width>maxW && line){ lines.push(line); line=w; }
    else line=test;
  }
  if(line) lines.push(line);
  return lines;
}

/* Title cards: words rise in one after another, the rule wipes
   through once they land, then the tagline settles underneath. */
function drawCard(c,W,H,cfg,mode,t,dur){
  const p = Math.min(1,t/dur);
  const fadeOut = p>0.88 ? 1-(p-0.88)/0.12 : 1;

  const name = ($('name').value||'Untitled').toUpperCase();
  const line = mode==='intro' ? ($('tagline').value||'') : ($('endline').value||'');

  const big = Math.round(W*(aspect==='16:9'?0.115:0.145));
  const small = Math.round(W*(aspect==='16:9'?0.028:0.038));
  c.font=`800 ${big}px "Big Shoulders Display", Impact, sans-serif`;
  const nameLines = wrap(c,name,W*0.84);
  const gap = big*0.86;
  const blockH = nameLines.length*gap + small*2.6;
  let y = H/2 - blockH/2 + gap*0.78;

  const STAG=0.11, WDUR=0.5;
  let wi=0;
  c.textAlign='left';
  nameLines.forEach(lineText=>{
    const words=lineText.split(' ');
    const widths=words.map(w=>c.measureText(w).width);
    const spaceW=c.measureText(' ').width;
    const lineW=widths.reduce((a,b)=>a+b,0)+spaceW*(words.length-1);
    let x=W/2-lineW/2;
    words.forEach((w,k)=>{
      const wt=Math.min(1,Math.max(0,(t-wi*STAG)/WDUR));
      const e=easeOut(wt);
      c.globalAlpha=Math.max(0,e*fadeOut);
      c.fillStyle=cfg.text;
      c.fillText(w, x, y+(1-e)*big*0.32);
      x+=widths[k]+spaceW;
      wi++;
    });
    y+=gap;
  });

  // accent rule that wipes in once the words have landed
  const ruleW = W*0.5*easeOut(Math.min(1,Math.max(0,(t-0.35)/0.9)));
  c.globalAlpha=Math.max(0,fadeOut);
  c.fillStyle=cfg.accent;
  c.fillRect(W/2-ruleW/2, y-gap*0.32, ruleW, Math.max(2,W*0.004));

  if(line){
    const le=easeOut(Math.min(1,Math.max(0,(t-0.5)/0.6)));
    c.font=`500 ${small}px "Inter", sans-serif`;
    c.fillStyle=cfg.text;
    c.globalAlpha=Math.max(0,le*0.78*fadeOut);
    c.textAlign='center';
    const ls = wrap(c,line,W*0.72);
    let ly = y + small*1.5 + (1-le)*small*0.6;
    ls.forEach(l=>{ c.fillText(l,W/2,ly); ly+=small*1.35; });
  }
  c.globalAlpha=1;
  c.textAlign='left';
}

/* Shots: portrait footage gets a phone body, wide footage gets a
   browser window, square-ish stays a plain card. Every beat gets
   a smooth eased push toward the action zone - deeper on clips. */
function drawShot(c,W,H,cfg,m,t,dur,index){
  const el = m.el;
  const nw = m.kind==='image' ? el.naturalWidth : el.videoWidth;
  const nh = m.kind==='image' ? el.naturalHeight : el.videoHeight;
  if(!nw||!nh) return;
  const ar = nw/nh;
  const style = ar<0.8 ? 'phone' : (ar>1.25 ? 'browser' : 'card');
  const chrome = CHROME[look]||CHROME.default;

  const inset = W*0.075;
  const boxW = W-inset*2;
  const boxH = (aspect==='9:16'? H*0.62 : H*0.76);
  const boxY = (aspect==='9:16'? H*0.5-boxH/2 - H*0.02 : H/2-boxH/2);

  // fit the content, leaving room for bezel or browser chrome
  let s;
  if(style==='phone'){
    s = Math.min(boxW*0.86/nw, boxH*0.94/nh);
  } else if(style==='browser'){
    s = Math.min(boxW*0.96/nw, boxH*0.94/(nh+nw*0.052));
  } else {
    s = Math.min(boxW/nw, boxH/nh);
  }
  const dw=nw*s, dh=nh*s;
  const tb = style==='browser'? dw*0.052 : 0;
  const bz = style==='phone'? Math.max(6,dw*0.042) : 0;
  const totalH = dh + tb + bz*2;
  const dx = W/2-dw/2;
  const dy = boxY + boxH/2 - totalH/2 + bz + tb;

  const p = Math.min(1,t/dur);
  const z = smooth(p);
  const push = m.kind==='video' ? 1.02+0.08*z : 1+0.055*z;
  const drift = (index%2? 1:-1) * W*0.012 * p;
  const ent = easeOut(Math.min(1,t/SETTLE));
  const scale = push * (0.945 + 0.055*ent);
  const tilt = (index%2? 1:-1) * (1-ent) * 0.02;   // settles level

  const fx=W/2, fy=boxY+boxH*0.42;                 // action zone sits above center
  c.save();
  c.globalAlpha=ent;
  c.translate(fx+drift, fy+(1-ent)*H*0.018);
  c.rotate(tilt);
  c.scale(scale,scale);
  c.translate(-fx,-fy);

  const rad  = style==='card' ? Math.max(6,W*0.028) : (style==='phone'? dw*0.115 : Math.max(8,dw*0.02));
  const ox = dx - bz;
  const oy = dy - bz - tb;
  const ow = dw + bz*2;
  const oh = dh + bz*2 + tb;
  const orad = style==='phone'? rad+bz : rad;

  // device body casts the shadow
  c.save();
  c.shadowColor=cfg.shadow;
  c.shadowBlur=W*0.075;
  c.shadowOffsetY=W*0.022;
  c.fillStyle = style==='phone' ? '#101013' : (style==='browser' ? chrome.bar : 'rgba(0,0,0,1)');
  rr(c,ox,oy,ow,oh,orad); c.fill();
  c.restore();

  if(style==='phone'){
    c.save();
    rr(c,dx,dy,dw,dh,rad); c.clip();
    try{ c.drawImage(el,dx,dy,dw,dh); }catch(e){}
    const iw=dw*0.28, ih=dw*0.062;
    c.fillStyle='#0A0A0C';
    rr(c,dx+dw/2-iw/2, dy+dw*0.038, iw, ih, ih/2); c.fill();
    c.restore();
    c.strokeStyle='rgba(255,255,255,.07)';
    c.lineWidth=Math.max(1,W*0.0015);
    rr(c,ox+1,oy+1,ow-2,oh-2,orad); c.stroke();
  } else {
    c.save();
    rr(c,ox,oy,ow,oh,orad); c.clip();
    if(style==='browser'){
      const lr=tb*0.16;
      ['#FF5F57','#FEBC2E','#28C840'].forEach((col,i)=>{
        c.fillStyle=col;
        c.beginPath(); c.arc(ox+tb*0.55+i*tb*0.5, oy+tb/2, lr, 0, Math.PI*2); c.fill();
      });
      const pw=ow*0.44, ph=tb*0.52, px=ox+ow/2-pw/2, py=oy+(tb-ph)/2;
      c.fillStyle=chrome.pill;
      rr(c,px,py,pw,ph,ph/2); c.fill();
      c.fillStyle=chrome.text;
      c.font=`400 ${Math.max(9,Math.round(tb*0.34))}px "DM Mono", monospace`;
      c.textAlign='center'; c.textBaseline='middle';
      c.fillText(slugName()||'demo', ox+ow/2, py+ph/2+0.5);
      c.textAlign='left'; c.textBaseline='alphabetic';
    }
    try{ c.drawImage(el,dx,dy,dw,dh); }catch(e){}
    c.restore();
  }

  c.strokeStyle=cfg.rim;
  c.lineWidth=Math.max(1,W*0.0022);
  rr(c,ox,oy,ow,oh,orad); c.stroke();
  c.restore();
  c.globalAlpha=1;
}

/* ---------------- music ---------------- */
function bed(ac,dest,dur){
  const master=ac.createGain(); master.connect(dest);
  const now=ac.currentTime;
  master.gain.setValueAtTime(0,now);
  master.gain.linearRampToValueAtTime(0.24,now+1.4);
  master.gain.setValueAtTime(0.24,now+Math.max(1.6,dur-1.8));
  master.gain.linearRampToValueAtTime(0,now+dur);

  const lp=ac.createBiquadFilter(); lp.type='lowpass';
  lp.frequency.setValueAtTime(620,now);
  lp.frequency.linearRampToValueAtTime(1400,now+dur*0.6);
  lp.Q.value=0.6; lp.connect(master);

  const chords=[[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66],[164.81,207.65,246.94]];
  const bar=3.2;
  for(let i=0, t=now; t<now+dur; i++, t+=bar){
    const ch=chords[i%chords.length];
    ch.forEach((f,k)=>{
      const o=ac.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
      o.detune.value = k===1? 7 : (k===2? -5 : 0);
      const g=ac.createGain();
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.1,t+0.7);
      g.gain.linearRampToValueAtTime(0,t+bar);
      o.connect(g); g.connect(lp);
      o.start(t); o.stop(Math.min(t+bar+0.2, now+dur+0.3));
    });
    // sub pulse on the bar
    const s=ac.createOscillator(); s.type='sine'; s.frequency.value=ch[0]/2;
    const sg=ac.createGain();
    sg.gain.setValueAtTime(0,t);
    sg.gain.linearRampToValueAtTime(0.16,t+0.05);
    sg.gain.exponentialRampToValueAtTime(0.001,t+1.1);
    s.connect(sg); sg.connect(master);
    s.start(t); s.stop(Math.min(t+1.3, now+dur+0.3));
  }
}

function pickMime(){
  const opts=[
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  for(const m of opts){
    if(window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

/* ---------------- render ---------------- */
goBtn.addEventListener('click', render);
againBtn.addEventListener('click', ()=>{ result.classList.remove('on'); });

async function render(){
  if(rendering || !media.length) return;
  rendering=true; goBtn.disabled=true; goBtn.textContent='Rendering…';
  result.classList.remove('on'); stage.classList.add('on');

  const [W,H]=ASPECTS[aspect];
  canvas.width=W; canvas.height=H;
  const cfg=LOOKS[look];

  try{ await document.fonts.ready; }catch(e){}

  // unlock video playback inside the tap gesture
  for(const m of media){
    if(m.kind==='video'){
      try{ m.el.muted=true; await m.el.play(); m.el.pause(); m.el.currentTime=0; }catch(e){}
    }
  }

  // timeline
  const beats=[{type:'intro',dur:INTRO}];
  media.forEach((m,i)=>beats.push({type:'shot',m,i,dur:m.dur}));
  beats.push({type:'outro',dur:OUTRO});
  const total = beats.reduce((s,b)=>s+b.dur,0);
  let acc=0;
  beats.forEach(b=>{ b.start=acc; acc+=b.dur; });

  // audio
  const AC = window.AudioContext||window.webkitAudioContext;
  const ac = new AC();
  if(ac.state==='suspended'){ try{ await ac.resume(); }catch(e){} }
  const dest = ac.createMediaStreamDestination();
  if(musicOn){
    if(ownAudioBuffer){
      const src=ac.createBufferSource(); src.buffer=ownAudioBuffer; src.loop=true;
      const g=ac.createGain();
      g.gain.setValueAtTime(0,ac.currentTime);
      g.gain.linearRampToValueAtTime(0.6,ac.currentTime+1.2);
      g.gain.setValueAtTime(0.6,ac.currentTime+Math.max(1.4,total-1.6));
      g.gain.linearRampToValueAtTime(0,ac.currentTime+total);
      src.connect(g); g.connect(dest); src.start();
    } else {
      bed(ac,dest,total);
    }
  } else {
    // silent track keeps the muxer happy
    const g=ac.createGain(); g.gain.value=0;
    const o=ac.createOscillator(); o.connect(g); g.connect(dest); o.start();
  }

  // recorder
  const stream = canvas.captureStream(30);
  dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  const mime = pickMime();
  let rec;
  try{
    rec = new MediaRecorder(stream, mime? {mimeType:mime, videoBitsPerSecond:3_500_000} : undefined);
  }catch(e){
    readout.textContent='This browser cannot record video';
    rendering=false; goBtn.disabled=false; goBtn.textContent='Make trailer';
    return;
  }
  const chunks=[];
  rec.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };

  const finished = new Promise(res => { rec.onstop = res; });
  rec.start(200);

  const t0 = performance.now();
  let active = -1;

  await new Promise(done=>{
    function frame(){
      const t=(performance.now()-t0)/1000;
      if(t>=total){ done(); return; }

      const bi = beats.findIndex(b=> t>=b.start && t<b.start+b.dur);
      const b = beats[bi] || beats[beats.length-1];

      if(bi!==active){
        if(active>=0 && beats[active]?.type==='shot' && beats[active].m.kind==='video'){
          try{ beats[active].m.el.pause(); }catch(e){}
        }
        if(b.type==='shot' && b.m.kind==='video'){
          try{ b.m.el.currentTime=0; b.m.el.play(); }catch(e){}
        }
        active=bi;
      }

      cfg.paint(ctx,W,H);
      const local = t-b.start;
      if(b.type==='shot') drawShot(ctx,W,H,cfg,b.m,local,b.dur,b.i);
      else drawCard(ctx,W,H,cfg,b.type,local,b.dur);

      barFill.style.width = (t/total*100).toFixed(1)+'%';
      clock.textContent = fmt(t);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  media.forEach(m=>{ if(m.kind==='video'){ try{ m.el.pause(); }catch(e){} } });
  rec.stop();
  await finished;
  try{ ac.close(); }catch(e){}

  const type = (mime||'video/webm').split(';')[0];
  const blob = new Blob(chunks,{type});
  if(lastUrl){ try{ URL.revokeObjectURL(lastUrl); }catch(e){} }
  const url = URL.createObjectURL(blob);
  lastUrl = url;
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const base = slugName()||'trailer';

  preview.src=url;
  // park the preview on a real frame (the opening fades in from black),
  // then restart from 0 on the first play
  preview._poster = true;
  preview.onloadedmetadata = ()=>{ if(preview._poster){ try{ preview.currentTime = Math.min(1.2, (preview.duration||2)/2); }catch(e){} } };
  preview.onplay = ()=>{ if(preview._poster){ preview._poster = false; try{ preview.currentTime = 0; }catch(e){} } };
  saveLink.href=url;
  saveLink.download=`${base}.${ext}`;
  sizeEl.textContent = `${(blob.size/1048576).toFixed(1)} MB · ${ext.toUpperCase()}`;
  stage.classList.remove('on');
  result.classList.add('on');
  result.scrollIntoView({behavior:'smooth',block:'center'});

  shareBtn.onclick = async ()=>{
    const file = new File([blob], `${base}.${ext}`, {type});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      try{ await navigator.share({files:[file], title:$('name').value||'Trailer'}); }
      catch(e){}
    } else {
      saveLink.click();
    }
  };

  rendering=false; goBtn.disabled=false; goBtn.textContent='Make trailer';
  paintStrip();
}

/* ---------------- boot ---------------- */
$('aspects').addEventListener('click',paintStrip);
paintStrip();
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
