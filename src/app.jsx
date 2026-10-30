const { useState, useEffect, useRef, useCallback } = React;

const CONFIG_KEY         = 'bvb_config_v3';
const TASKS_KEY          = 'bvb_tasks_v3';
const SETTINGS_KEY       = 'bvb_settings_v3';
const BADGES_KEY         = 'bvb_badges_v3';
const DEMERITS_KEY       = 'bvb_demerits_v3';
const CUSTOM_CATS_KEY    = 'bvb_custom_cats_v1';
const PROJECTS_KEY       = 'bvb_projects_v1';
const CUSTOM_CLIENTS_KEY = 'bvb_custom_clients_v1';
const CUSTOM_TEAM_KEY    = 'bvb_custom_team_v1';
const MANAGED_CLIENTS_KEY= 'bvb_clients_v2';
const MANAGED_CATS_KEY   = 'bvb_cats_v2';
const DELETED_IDS_KEY    = 'bvb_deleted_v1';
const HOURS_KEY          = 'bvb_hours_v1';
const PERMISSIONS_KEY    = 'bvb_permissions_v1';
const MANUAL_ORDER_KEY   = 'bvb_manual_order_v1';
const COLLAPSED_KEY      = 'bvb_collapsed_v1';
const COLLAPSED_CARDS_KEY= 'bvb_collapsed_cards_v1';
const EXPANDED_ROWS_KEY  = 'bvb_expanded_rows_v1';
const PENDING_SYNC_KEY   = 'bvb_pending_sync_v1';
const SYNC_LOG_KEY       = 'bvb_sync_log_v1';
const TEAM_KEY           = 'bvb_team_v1';
// Stays in code: if it lived in the sheet, any sheet editor could make themselves admin.
const ADMIN_EMAIL        = 'cam@bagavagabonds.com';
const APP_VERSION        = '1.0.0';

const DAY_KEYS   = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DEFAULT_HOURS = {
  mon: '9:00a – 3:00p',
  tue: '9:00a – 3:00p',
  wed: '9:00a – 3:00p',
  thu: 'Remote (mgr)',
  fri: '10:00a – 2:00p',
  sat: 'Closed',
  sun: 'Closed',
};
function todayHours(hours){ const d=new Date().getDay(); return (hours&&hours[DAY_KEYS[d]])||'Closed'; }

// Permissions — default to allow everything; only exceptions are stored.
function userCanCreate(perms,email){ if(!email||!perms)return true; const p=perms[email]; return !p||p.canCreate!==false; }
function userCanAssignOthers(perms,email){ if(!email||!perms)return true; const p=perms[email]; return !p||p.canAssignOthers!==false; }
// Sign-in allowlist. UX gate only — the sheet's sharing is the real lock until the Apps Script backend.
function isCrew(email){ return !!email&&(email.toLowerCase()===ADMIN_EMAIL||TEAM.some(t=>t.email.toLowerCase()===email.toLowerCase())); }
// Email recipients come from TEAM (never raw task/sheet data, which any sheet editor can change); null if not crew.
function crewEmail(email){ const e=String(email||'').trim().toLowerCase(); const m=e&&TEAM.find(t=>t.email.toLowerCase()===e); return m?m.email:null; }

// ── SAFE STORAGE ── (handles quota errors / iOS private mode)
let __storageWarned = false;
function safeStore(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch(e){
    if(!__storageWarned){ __storageWarned = true; window.dispatchEvent(new CustomEvent('bvb-storage-full')); }
    console.warn('localStorage write failed for', key, e);
    return false;
  }
}

const NOTE_COLOR_OPTIONS = [
  {id:'n-y', hex:'#f2e49a', label:'Yellow'},
  {id:'n-o', hex:'#f5cc90', label:'Peach'},
  {id:'n-g', hex:'#c2e098', label:'Green'},
  {id:'n-b', hex:'#a2cff0', label:'Blue'},
  {id:'n-pk',hex:'#f0b0c8', label:'Pink'},
  {id:'n-pu',hex:'#cab8f2', label:'Purple'},
];

const HARDCODED_CONFIG = {
  clientId: '630423801494-aetvklr9sjscvscpe4tlcrlpuh5j7ccm.apps.googleusercontent.com',
  sheetId:  '1g4z73WCjXA2vC-YIh-GVA94S49cm40rqmQFJaQI_l-M',
  apiUrl:   API_URL, // set by build.mjs (backend/DEPLOY.md)
};

// Crew list lives in the sheet's Config tab (key "team"), loaded after sign-in, so names/emails stay out of this public repo.
// Module copy so isCrew/crewEmail work outside React; App keeps it in sync via applyTeam.
let TEAM=(()=>{try{return JSON.parse(localStorage.getItem(TEAM_KEY))||[];}catch(e){return[];}})();
function parseTeam(v){ return Array.isArray(v)?v.filter(m=>m&&typeof m.name==='string'&&typeof m.email==='string'):null; }

// Default only; the real client list is shared through the Config tab (key "clients").
const CLIENTS = ['General / Internal'];

const CATS = [
  {id:'move',label:'Movement'},{id:'pickup',label:'Pick Up'},{id:'dropoff',label:'Drop Off'},
  {id:'receive',label:'Receive'},{id:'clean',label:'Maintenance'},{id:'build',label:'Setup / Build'},
  {id:'paint',label:'Paint'},{id:'pack',label:'Pack'},{id:'check',label:'Audit / Check'},{id:'other',label:'Other'},
];

const THEMES = [
  {id:'theme-e',        label:'Panther',  bg:'#110808', accent:'#d4a820'},
  {id:'theme-c',        label:'Dusk',     bg:'#131320', accent:'#d49038'},
  {id:'theme-cream',    label:'Soleil',   bg:'#f8e8c0', accent:'#c87c08'},
  {id:'theme-fern',     label:'Ravine',   bg:'#060e0e', accent:'#d4a870'},
  {id:'theme-jaguar',   label:'Jaguar',   bg:'#090f08', accent:'#c4843a'},
  {id:'theme-sunfield', label:'Sunfield', bg:'#0c1824', accent:'#e8a830'},
  {id:'theme-atelier',  label:'Atelier',  bg:'#081412', accent:'#c8a870'},
  {id:'theme-foundry',  label:'Foundry',  bg:'#0a0c0c', accent:'#a06838'},
];

const BADGES_DEF = [
  {id:'first',    emoji:'⭐', label:'First task done'},
  {id:'speed',    emoji:'⚡', label:'Speed demon — under 10 min'},
  {id:'five_day', emoji:'🔥', label:'5 tasks in one day'},
  {id:'century',  emoji:'🏆', label:'Centurion — 100 pts total'},
  {id:'mover',    emoji:'🚛', label:'Mover — 5 movement tasks'},
  {id:'cleaner',  emoji:'🧹', label:'Maintenance master'},
  {id:'receiver', emoji:'📦', label:'Receiving pro — 5 receiving tasks'},
  {id:'builder',  emoji:'🔧', label:'Builder — 5 setup tasks'},
  {id:'auditor',  emoji:'📋', label:'Eagle eye — 5 audit tasks'},
  {id:'top_month',emoji:'👑', label:'Top scorer this month'},
];

const NOTE_COLS = ['n-y','n-o','n-g','n-b','n-pk','n-pu'];
const ROTS = ['r1','r2','r3','r4','r2','r3'];

function hexToHsl(hex){let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;const max=Math.max(r,g,b),min=Math.min(r,g,b);let h,s,l=(max+min)/2;if(max===min){h=s=0;}else{const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break;}h/=6;}return[h,s,l];}
function hslToHex(h,s,l){s=Math.max(0,Math.min(1,s));l=Math.max(0,Math.min(1,l));const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q,hr=t=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};const[r,g,b]=s===0?[l,l,l]:[hr(h+1/3),hr(h),hr(h-1/3)];return'#'+[r,g,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');}
function colorIntensity(hex,level){try{const[h,s,l]=hexToHsl(hex);if(level==='low')return hslToHex(h,Math.max(0,s*0.42),Math.min(0.96,l*1.22));if(level==='high')return hslToHex(h,Math.min(1,s*1.55),Math.max(0.1,l*0.76));}catch(e){}return hex;}
function noteStyle(id,priority,noteColor){
  const h=(id||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  // noteColor comes from sheet data and lands in a CSS var — only accept #rrggbb or a known class.
  if(/^#[0-9a-f]{6}$/i.test(noteColor||''))return{col:'',hex:noteColor,rot:ROTS[h%ROTS.length]};
  const col=(NOTE_COLS.includes(noteColor)&&noteColor)||(priority==='high'?['n-o','n-pk']:priority==='med'?['n-y','n-pu']:['n-g','n-b'])[h%2];
  return{col,hex:null,rot:ROTS[h%ROTS.length]};
}
function initials(n){return(n||'?').split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase();}
function fmtDur(ms){if(!ms||ms<0)return'—';const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;if(h>0)return`${h}h ${m}m`;if(m>0)return`${m}m ${sec}s`;return`${sec}s`;}
function fmtTime(ms){if(!ms)return'—';return new Date(ms).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});}
function fmtShort(ms){if(!ms)return'';return new Date(ms).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});}
function isOverdue(dl){return dl&&new Date(dl+'T23:59:59')<new Date();}
function taskPts(task){return({high:3,med:2,low:1}[task.priority]||1)+(task.duration&&task.duration<600000?1:0);}

// ── INLINE IMAGE / LINK RENDERING ─────────────────────────────────────────
// Detect URLs in user-typed text and render them — images as thumbnails, others as links.
// Supports direct image URLs (jpg/png/gif/webp/svg) and Google Drive share links.
// Only Drive links auto-load as images; other image URLs stay plain links so outside hosts can't log viewers' IPs.
function getImageUrl(url){
  const m=url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^"\s]*id=|thumbnail\?[^"\s]*id=)([a-zA-Z0-9_-]{10,})/);
  if(m)return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
  return null;
}
function renderText(text){
  if(!text)return null;
  const parts=text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part,i)=>{
    if(!part)return null;
    if(/^https?:\/\//.test(part)){
      const trailing=part.match(/[.,!?;:)\]"'>]+$/);
      let url=part,tail='';
      if(trailing){tail=trailing[0];url=part.slice(0,-tail.length);}
      const imgSrc=getImageUrl(url);
      if(imgSrc){
        return <React.Fragment key={i}><img src={imgSrc} alt="" className="task-img" loading="lazy" onClick={e=>{e.stopPropagation();window.dispatchEvent(new CustomEvent('bvb-lightbox',{detail:{src:imgSrc,url}}));}} onError={e=>{e.target.style.display='none';}}/>{tail}</React.Fragment>;
      }
      return <React.Fragment key={i}><a href={url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} className="task-link">{url}</a>{tail}</React.Fragment>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

// Auto-pause: timers only run between 8am and 8pm. If a timer was running across a past 8pm
// boundary, we retroactively pause it at that boundary so phantom hours don't accumulate.
function computeAutoPauseTime(task,nowMs){
  if(!task.acceptedAt||task.completedAt||task.pausedAt)return null;
  const acceptedDate=new Date(task.acceptedAt);
  const eightPmSameDay=new Date(acceptedDate);eightPmSameDay.setHours(20,0,0,0);
  let candidate;
  if(acceptedDate.getTime()<eightPmSameDay.getTime()){
    candidate=eightPmSameDay.getTime();
  }else{
    const nextDay=new Date(acceptedDate);nextDay.setDate(nextDay.getDate()+1);nextDay.setHours(20,0,0,0);
    candidate=nextDay.getTime();
  }
  return candidate<nowMs?candidate:null;
}
function currentMonth(){const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;}
function isMobileWidth(){return window.innerWidth<768;}

function sortTasks(arr,sortBy,manualOrder){
  const a=[...arr];
  if(sortBy==='manual'&&Array.isArray(manualOrder)&&manualOrder.length){
    const orderMap=new Map(manualOrder.map((id,i)=>[id,i]));
    return a.sort((x,y)=>{
      const ox=orderMap.get(x.id),oy=orderMap.get(y.id);
      if(ox===undefined&&oy===undefined)return(y.createdAt||0)-(x.createdAt||0);
      if(ox===undefined)return-1;
      if(oy===undefined)return 1;
      return ox-oy;
    });
  }
  if(sortBy==='name')return a.sort((x,y)=>x.title.localeCompare(y.title));
  if(sortBy==='priority'){const p={high:0,med:1,low:2};return a.sort((x,y)=>(p[x.priority]||1)-(p[y.priority]||1));}
  if(sortBy==='assignee')return a.sort((x,y)=>(x.assignedTo||'').localeCompare(y.assignedTo||''));
  if(sortBy==='category')return a.sort((x,y)=>(x.category||'').localeCompare(y.category||''));
  if(sortBy==='client')return a.sort((x,y)=>(x.client||'').localeCompare(y.client||''));
  if(sortBy==='project')return a.sort((x,y)=>(x.project||'').localeCompare(y.project||''));
  return a.sort((x,y)=>(y.createdAt||0)-(x.createdAt||0));
}

function calcAutoBadges(name,tasks){
  const done=tasks.filter(t=>t.completedAt&&t.assignedTo===name);
  const badges=[];
  if(done.length>=1)badges.push('first');
  if(done.some(t=>t.duration&&t.duration<600000))badges.push('speed');
  const byDay={};done.forEach(t=>{const d=new Date(t.completedAt).toDateString();byDay[d]=(byDay[d]||0)+1;});
  if(Object.values(byDay).some(c=>c>=5))badges.push('five_day');
  const pts=done.reduce((a,t)=>a+(t.points||0),0);
  if(pts>=100)badges.push('century');
  if(done.filter(t=>t.category==='move').length>=5)badges.push('mover');
  if(done.filter(t=>t.category==='clean').length>=5)badges.push('cleaner');
  if(done.filter(t=>t.category==='receive').length>=5)badges.push('receiver');
  if(done.filter(t=>t.category==='build').length>=5)badges.push('builder');
  if(done.filter(t=>t.category==='check').length>=5)badges.push('auditor');
  return badges;
}

// ── SOUND ──────────────────────────────────────────────────────────────────
function playSound(type){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const tone=(freq,start,dur,vol=0.3,wave='sine')=>{const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=freq;o.type=wave;g.gain.setValueAtTime(0,ctx.currentTime+start);g.gain.linearRampToValueAtTime(vol,ctx.currentTime+start+0.01);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+start+dur);o.start(ctx.currentTime+start);o.stop(ctx.currentTime+start+dur+0.05);};
    if(type==='post'){tone(660,0,0.12,0.3);tone(880,0.1,0.14,0.28);tone(1100,0.2,0.18,0.25);tone(1320,0.3,0.22,0.2);}
    else if(type==='accept'){tone(200,0,0.04,0.4,'square');tone(400,0.04,0.03,0.2,'square');tone(520,0.1,0.2,0.15);}
    else if(type==='complete'){tone(880,0,0.08,0.5);tone(1320,0.07,0.1,0.4);tone(1760,0.16,0.18,0.35);tone(2200,0.26,0.3,0.28);tone(1100,0.3,0.14,0.2);}
    else if(type==='delete'){const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.type='sine';o.frequency.setValueAtTime(520,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(55,ctx.currentTime+0.22);g.gain.setValueAtTime(0.28,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.22);o.start(ctx.currentTime);o.stop(ctx.currentTime+0.25);}
  }catch(e){}
}

// ── SHEETS ─────────────────────────────────────────────────────────────────
// ── BACKEND ── Apps Script web app (backend/Code.gs). The phone's token only proves who you are; the script
// checks the crew list, does every sheet write under a lock and sends the emails. Plain-text body = no CORS preflight.
async function api(cfg,action,payload){
  const r=await fetch(cfg.apiUrl,{method:'POST',body:JSON.stringify({action,payload,token:cfg.accessToken})});
  const d=await r.json().catch(()=>({ok:false,code:r.status,error:'bad response'}));
  if(!d.ok){
    if(d.code===401)window.dispatchEvent(new CustomEvent('bvb-auth-expired'));
    const e=new Error(d.error||`API ${d.code}`);e.code=d.code;throw e;
  }
  return d.data;
}
// Upsert by id on the server, so a retry can never duplicate a row.
const sheetSave=(cfg,task)=>api(cfg,'saveTask',{task});
const sheetLoad=async cfg=>(await api(cfg,'load')).tasks;
const sheetRewrite=cfg=>api(cfg,'rewrite');
const saveAppConfigKey=(cfg,key,value)=>api(cfg,'setConfig',{key,value});
// Crew check: null = not on the crew list (server 403). Throws on other errors.
async function loadTeam(cfg){
  try{ return parseTeam(await api(cfg,'team'))||[]; }
  catch(e){ if(e.code===403)return null; throw e; }
}

// ── CHA-CHING ──────────────────────────────────────────────────────────────
function ChaChing({onDone}){
  useEffect(()=>{const t=setTimeout(onDone,2400);return()=>clearTimeout(t);},[]);
  const cx=window.innerWidth/2,cy=window.innerHeight/2;
  const coins=Array.from({length:18},(_,i)=>{const a=(i/18)*Math.PI*2,d=120+Math.random()*180;return{tx:Math.cos(a)*d,ty:Math.sin(a)*d-100,rot:(Math.random()-.5)*800,delay:Math.random()*0.4};});
  const bills=Array.from({length:10},(_,i)=>{const a=(i/10)*Math.PI*2+0.3,d=95+Math.random()*150;return{tx:Math.cos(a)*d,ty:Math.sin(a)*d-70,rot:(Math.random()-.5)*580,delay:Math.random()*0.28};});
  return(<div className="chaching-overlay"><div className="chaching-text">CHA-CHING! 💰</div>{coins.map((c,i)=><span key={i} className="coin" style={{left:cx,top:cy,'--tx':`${c.tx}px`,'--ty':`${c.ty}px`,'--rot':`${c.rot}deg`,animationDelay:`${c.delay}s`}}>🪙</span>)}{bills.map((b,i)=><span key={i} className="bill" style={{left:cx,top:cy,'--tx':`${b.tx}px`,'--ty':`${b.ty}px`,'--rot':`${b.rot}deg`,animationDelay:`${b.delay}s`}}>💵</span>)}</div>);
}

// ── TOAST ──────────────────────────────────────────────────────────────────
function Toast({msg,type,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,type==='error'?5500:3200);return()=>clearTimeout(t);},[msg,type]);
  return<div className={`toast ${type}`}>{msg}</div>;
}

// ── EMAIL AUTOCOMPLETE ─────────────────────────────────────────────────────
function EmailField({value,onChange,team}){
  const [open,setOpen]=useState(false);
  const [sel,setSel]=useState(0);
  const roster=team||TEAM;
  const filtered=value.length>0?roster.filter(t=>t.name.toLowerCase().includes(value.toLowerCase())||t.email.toLowerCase().includes(value.toLowerCase())):[];
  const visible=open&&filtered.length>0;
  const pick=m=>{onChange(m.email);setOpen(false);};
  return(
    <div className="field" style={{position:'relative'}}>
      <label>Assign to — type name or email</label>
      <input value={value} onChange={e=>{onChange(e.target.value);setOpen(true);setSel(0);}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),160)}
        onKeyDown={e=>{if(!visible)return;if(e.key==='ArrowDown'){setSel(s=>Math.min(s+1,filtered.length-1));e.preventDefault();}if(e.key==='ArrowUp'){setSel(s=>Math.max(s-1,0));e.preventDefault();}if(e.key==='Enter'){pick(filtered[sel]);e.preventDefault();}if(e.key==='Escape')setOpen(false);}}
        placeholder="Leave blank for anyone to claim" autoComplete="off"/>
      {visible&&(<div className="ac-list">{filtered.map((m,i)=>(<div key={m.email} className={`ac-item${i===sel?' sel':''}`} onMouseDown={()=>pick(m)}><div className="ac-name">{m.name}</div><div className="ac-email">{m.email}</div></div>))}</div>)}
    </div>
  );
}

// ── COMMENT DRAWER ─────────────────────────────────────────────────────────
function CommentDrawer({task, user, onClose, onAddComment}){
  const [text,setText]=useState('');
  const listRef=useRef(null);
  const comments=task.comments||[];

  useEffect(()=>{
    if(listRef.current)listRef.current.scrollTop=listRef.current.scrollHeight;
  },[comments.length]);

  const post=()=>{
    if(!text.trim())return;
    onAddComment(task.id,text.trim());
    setText('');
  };

  return(
    <div className="comment-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="comment-drawer">
        <div className="comment-header">
          <button className="comment-close" onClick={onClose}>✕</button>
          <div className="comment-task-title">{task.title}</div>
          <div className="comment-sub">
            {CATS.find(c=>c.id===task.category)?.label||task.category}
            {task.client&&task.client!=='General / Internal'?` · ${task.client}`:''}
            {' · '}{comments.length} comment{comments.length!==1?'s':''}
          </div>
        </div>
        <div className="comment-list" ref={listRef}>
          {comments.length===0&&<div className="comment-empty">No comments yet — be the first</div>}
          {comments.map(c=>(
            <div key={c.id} className="comment-item">
              <div className="comment-meta">
                <div className="comment-av">{initials(c.authorName)}</div>
                <span className="comment-author">{c.authorName}</span>
                <span className="comment-time">{fmtShort(c.createdAt)}</span>
              </div>
              <div className="comment-text">{renderText(c.text)}</div>
            </div>
          ))}
        </div>
        <div className="comment-input-row">
          <textarea className="comment-input" value={text} onChange={e=>setText(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();post();}}}
            placeholder="Add a comment" rows={1}/>
          <button className="comment-post-btn" onClick={post} disabled={!text.trim()}>Post</button>
        </div>
      </div>
    </div>
  );
}

// ── NEW TASK MODAL ─────────────────────────────────────────────────────────
function NewTaskModal({currentUser,onClose,onSave,managedClients,managedCats,projects,onSaveClients,onSaveCats,onSaveProjects,allTeam,initialTask,canAssignOthers=true}){
  const isEdit=!!initialTask;
  const lockedEmail=!canAssignOthers&&!isEdit?(currentUser?.email||''):null;
  const [form,setForm]=useState(isEdit?{
    title:initialTask.title||'',desc:initialTask.desc||'',category:initialTask.category||'other',
    priority:initialTask.priority||'med',deadline:initialTask.deadline||'',
    assignedToEmail:initialTask.assignedToEmail||'',client:initialTask.client||'General / Internal',
    project:initialTask.project||'',noteColor:initialTask.noteColor||'',
    checklist:Array.isArray(initialTask.checklist)?initialTask.checklist.map(it=>({...it})):[],
  }:{title:'',desc:'',category:'other',priority:'med',deadline:'',assignedToEmail:lockedEmail||'',client:'General / Internal',project:'',noteColor:'',checklist:[]});
  const [newChecklistItem,setNewChecklistItem]=useState('');
  const [editMode,setEditMode]=useState(null); // null | 'clients' | 'cats' | 'projects'
  const colorInputRef=useRef(null);
  const hasEyeDropper=typeof EyeDropper!=='undefined';
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const [pickerBase,setPickerBase]=useState(()=>isEdit&&form.noteColor?(form.noteColor.startsWith('#')?form.noteColor:NOTE_COLOR_OPTIONS.find(o=>o.id===form.noteColor)?.hex||''):'');
  const [pickerIntensity,setPickerIntensity]=useState(isEdit?form.priority==='high'?'high':form.priority==='low'?'low':'base':'base');
  const selectBase=hex=>{setPickerBase(hex);setPickerIntensity('base');set('noteColor',hex);set('priority','med');};
  const member=allTeam.find(t=>t.email===form.assignedToEmail);

  const clientProjects=projects[form.client]||[];

  const addChecklistItem=()=>{
    const label=newChecklistItem.trim();if(!label)return;
    const it={id:'cl_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),label,done:false};
    set('checklist',[...(form.checklist||[]),it]);
    setNewChecklistItem('');
  };
  const removeChecklistItem=idx=>set('checklist',(form.checklist||[]).filter((_,i)=>i!==idx));
  const updateChecklistItem=(idx,label)=>set('checklist',(form.checklist||[]).map((it,i)=>i===idx?{...it,label}:it));

  const save=()=>{
    if(!form.title.trim())return;
    const assignedTo=member?.name||(form.assignedToEmail?form.assignedToEmail.split('@')[0]:'');
    const cleanChecklist=(form.checklist||[]).filter(it=>it.label&&it.label.trim()).map(it=>({...it,label:it.label.trim()}));
    if(isEdit){
      onSave({...initialTask,...form,checklist:cleanChecklist,title:form.title.trim(),desc:form.desc.trim(),assignedTo});
    }else{
      onSave({id:'task_'+Date.now(),...form,checklist:cleanChecklist,title:form.title.trim(),desc:form.desc.trim(),assignedTo,
        createdBy:currentUser.name,createdByEmail:currentUser.email,createdAt:Date.now(),
        acceptedAt:null,completedAt:null,duration:null,pausedAt:null,accumulatedMs:0,points:null,comments:[]});
    }
  };

  const editBtnStyle={background:'none',border:'none',cursor:'pointer',fontSize:'10px',color:'var(--text3)',fontFamily:'DM Mono,monospace',padding:'0 0 0 6px',textDecoration:'underline',flexShrink:0};

  if(editMode==='clients'){
    return(
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-title">Edit <span>Clients</span></div>
          <ListEditor items={managedClients} addPlaceholder="Client name…" onSave={list=>{onSaveClients(list);setEditMode(null);}}/>
        </div>
      </div>
    );
  }
  if(editMode==='cats'){
    return(
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-title">Edit <span>Categories</span></div>
          <ListEditor items={managedCats} addPlaceholder="Category name…" asObjects={true} onSave={list=>{onSaveCats(list);setEditMode(null);if(!list.find(c=>c.id===form.category))set('category','other');}}/>
        </div>
      </div>
    );
  }
  if(editMode==='projects'){
    return(
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-title">Edit <span>Projects</span> <span style={{fontSize:13,fontWeight:400,color:'var(--text3)'}}>· {form.client}</span></div>
          <ListEditor items={clientProjects} addPlaceholder="Project name…" onSave={list=>{onSaveProjects(form.client,list);setEditMode(null);if(!list.includes(form.project))set('project','');}}/>
        </div>
      </div>
    );
  }

  return(
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">{isEdit?<>Edit <span>task</span></>:<>Post a <span>task</span></>}</div>
        <div className="field"><label>Title *</label><input value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Build production kit for event" autoFocus/></div>
        <div className="field"><label>Details / instructions</label><textarea value={form.desc} onChange={e=>set('desc',e.target.value)} placeholder="Notes for the crew..."/></div>

        {/* CHECKLIST */}
        <div className="field">
          <label>Checklist <span style={{fontWeight:400,color:'var(--text3)'}}>(optional — steps to check off as crew completes them)</span></label>
          <div className="cl-editor">
            {(form.checklist||[]).map((it,i)=>(
              <div key={it.id||i} className="cl-edit-row">
                <span className="cl-bullet">○</span>
                <input value={it.label} onChange={e=>updateChecklistItem(i,e.target.value)} placeholder="Step..."/>
                <button type="button" className="cl-remove" onClick={()=>removeChecklistItem(i)} title="Remove">✕</button>
              </div>
            ))}
            <div className="cl-add-row">
              <input value={newChecklistItem} onChange={e=>setNewChecklistItem(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addChecklistItem();}}} placeholder="Add a step and press Enter..."/>
              <button type="button" className="cl-add-btn" onClick={addChecklistItem}>+ Add</button>
            </div>
          </div>
        </div>

        {/* NOTE COLOR + PRIORITY */}
        <div className="field">
          <label>Note Color & Priority</label>
          <div className="color-picker-row">
            {NOTE_COLOR_OPTIONS.map(opt=>(
              <button key={opt.id} className={`color-swatch${pickerBase===opt.hex?' selected':''}`}
                style={{background:opt.hex}} title={opt.label}
                onClick={()=>selectBase(opt.hex)}/>
            ))}
            {/* OS color picker — crosshair */}
            <button className={`color-swatch${pickerBase&&!NOTE_COLOR_OPTIONS.find(o=>o.hex===pickerBase)?' selected':''}`}
              style={{background:'var(--bg3)',border:'2px solid var(--border2)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text2)'}}
              title="Custom color" onClick={()=>colorInputRef.current?.click()}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 1 L12 3.5 L5.5 10 L3 10 L3 7.5 Z"/><line x1="3" y1="10" x2="1.5" y2="11.5"/></svg>
            </button>
            <input ref={colorInputRef} type="color" style={{display:'none'}}
              value={pickerBase&&pickerBase.startsWith('#')?pickerBase:'#f5cc90'}
              onChange={e=>selectBase(e.target.value)}/>
            {/* Eyedropper */}
            {hasEyeDropper&&(
              <button className="color-swatch" title="Pick color from screen"
                style={{background:'var(--bg4)',border:'2px dashed var(--border2)',fontSize:'12px',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}
                onClick={async()=>{try{const r=await new EyeDropper().open();selectBase(r.sRGBHex);}catch{}}}>
                ⊕
              </button>
            )}
            {pickerBase&&<button style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:'13px',padding:'0 2px',lineHeight:1,alignSelf:'center'}} title="Clear" onClick={()=>{setPickerBase('');setPickerIntensity('base');set('noteColor','');set('priority','med');}}>✕</button>}
          </div>
          {pickerBase&&(
            <div className="intensity-row">
              {[{id:'low',label:'Low'},{id:'base',label:'Base'},{id:'high',label:'High'}].map(lvl=>{
                const c=lvl.id==='base'?pickerBase:colorIntensity(pickerBase,lvl.id);
                return(
                  <button key={lvl.id} className={`intensity-chip${pickerIntensity===lvl.id?' sel':''}`}
                    style={{background:c}}
                    onClick={()=>{setPickerIntensity(lvl.id);set('noteColor',c);set('priority',lvl.id==='base'?'med':lvl.id);}}>
                    {lvl.label}
                  </button>
                );
              })}
              <span style={{fontSize:9,color:'var(--text3)',fontFamily:'DM Mono,monospace',marginLeft:2,alignSelf:'center'}}>
                {pickerIntensity==='low'?'· low priority':pickerIntensity==='high'?'· high priority':'· medium priority'}
              </span>
            </div>
          )}
        </div>

        {/* CLIENT */}
        <div className="field">
          <label style={{display:'flex',alignItems:'center'}}>
            Client
            <button style={editBtnStyle} onClick={()=>setEditMode('clients')}>✎ edit list</button>
          </label>
          <select value={form.client} onChange={e=>{set('client',e.target.value);set('project','');}}>
            {managedClients.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* PROJECT */}
        {form.client&&(
          <div className="field">
            <label style={{display:'flex',alignItems:'center'}}>
              Project <span style={{fontWeight:400,color:'var(--text3)',marginLeft:4}}>(optional)</span>
              <button style={editBtnStyle} onClick={()=>setEditMode('projects')}>✎ edit list</button>
            </label>
            <select value={form.project} onChange={e=>set('project',e.target.value)}>
              <option value="">— None —</option>
              {clientProjects.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}

        <div className="field-row">
          <div className="field">
            <label style={{display:'flex',alignItems:'center'}}>
              Category
              <button style={editBtnStyle} onClick={()=>setEditMode('cats')}>✎ edit list</button>
            </label>
            <select value={form.category} onChange={e=>set('category',e.target.value)}>
              {managedCats.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          {!pickerBase&&<div className="field"><label>Priority</label><select value={form.priority} onChange={e=>set('priority',e.target.value)}><option value="high">High</option><option value="med">Medium</option><option value="low">Low</option></select></div>}
        </div>
        <div className="field"><label>Deadline (optional)</label><input type="date" value={form.deadline} onChange={e=>set('deadline',e.target.value)}/></div>
        {canAssignOthers
          ? <EmailField value={form.assignedToEmail} onChange={v=>set('assignedToEmail',v)} team={allTeam}/>
          : <div className="field"><label>Assign to</label><div style={{padding:'9px 14px',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'6px',fontSize:'13px',color:'var(--text2)',fontFamily:'DM Mono,monospace'}}>{isEdit?(allTeam.find(t=>t.email===form.assignedToEmail)?.name||form.assignedToEmail||'Unassigned'):(currentUser?.name||currentUser?.email||'You')}</div></div>}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-post" onClick={save} disabled={!form.title.trim()}>{isEdit?'Save changes':'Post task'}</button>
        </div>
      </div>
    </div>
  );
}

// ── TASK CARD ──────────────────────────────────────────────────────────────
function TaskCard({task,onAccept,onComplete,onPause,onResume,onDelete,onComment,onEdit,onMoveUp,onMoveDown,onToggleChecklist,onToggleCollapse,collapsed,pendingSync,fontSize,allCats}){
  const {col,hex,rot}=noteStyle(task.id,task.priority,task.noteColor);
  const isDone=!!task.completedAt;
  const isActive=task.acceptedAt&&!task.completedAt&&!task.pausedAt;
  const isPaused=task.acceptedAt&&!task.completedAt&&!!task.pausedAt;
  const overdue=!isDone&&isOverdue(task.deadline);
  const fs=fontSize||14;
  let elapsed=null;
  if(isActive)elapsed=fmtDur((task.accumulatedMs||0)+(Date.now()-task.acceptedAt));
  if(isPaused)elapsed=fmtDur(task.accumulatedMs||0);
  const commentCount=(task.comments||[]).length;
  const cats=allCats||CATS;
  return(
    <div className={`note ${col} ${rot}${isDone?' is-done':''}`} style={{fontSize:fs+'px',...(hex?{'--note-accent':hex}:{})}}
      draggable={!isDone}
      onDragStart={e=>{e.dataTransfer.setData('taskId',task.id);e.dataTransfer.effectAllowed='move';}}>
      <div className="note-head" onClick={()=>onToggleCollapse&&onToggleCollapse(task.id)} title={collapsed?'Expand':'Collapse'}>
        <div className="ncat" style={{fontSize:(fs*0.57)+'px'}}>
          <span className="note-dot"/>
          <span>{cats.find(c=>c.id===task.category)?.label||task.category}{task.client&&task.client!=='General / Internal'?` · ${task.client}`+(task.project?` › ${task.project}`:''):''}</span>
          {pendingSync&&pendingSync.has(task.id)&&<span className="sync-pending-dot" title="Pending sheet sync — will keep retrying"/>}
        </div>
        <span className={`nprio-badge ${task.priority==='high'?'nph':task.priority==='med'?'npm':'npl'}`} style={{fontSize:(fs*0.57)+'px'}}>{task.priority}</span>
        <div className="ntitle" style={{fontSize:(fs*1)+'px'}}>{task.title}</div>
        <span className={`note-collapse-icon${collapsed?' closed':''}`}>▾</span>
      </div>
      {!collapsed&&<div className="note-body">
      {task.desc&&<div className="ndesc" style={{fontSize:(fs*0.82)+'px'}}>{renderText(task.desc)}</div>}
      {Array.isArray(task.checklist)&&task.checklist.length>0&&(()=>{
        const total=task.checklist.length;
        const done=task.checklist.filter(it=>it.done).length;
        const pct=Math.round((done/total)*100);
        return(
          <div className="cl-card">
            {task.checklist.map(it=>(
              <div key={it.id} className={`cl-card-item${it.done?' done':''}`} onClick={e=>{e.stopPropagation();onToggleChecklist&&onToggleChecklist(task.id,it.id);}} style={{fontSize:(fs*0.78)+'px'}}>
                <span className="cl-card-check">{it.done?'✓':'○'}</span>
                <span className="cl-card-label">{it.label}</span>
              </div>
            ))}
            <div className="cl-card-progress">
              <div className="cl-card-track"><div className="cl-card-fill" style={{width:pct+'%'}}/></div>
              <span className="cl-card-text" style={{fontSize:(fs*0.64)+'px'}}>{done}/{total} · {pct}%</span>
            </div>
          </div>
        );
      })()}
      {task.deadline&&<div className={`ndl${overdue?' overdue':''}`} style={{fontSize:(fs*0.64)+'px'}}>{overdue?'⚠ Overdue: ':'📅 '}{task.deadline}</div>}
      {isActive&&<div className="ntimer" style={{fontSize:(fs*0.71)+'px'}}><div className="npulse"/>{elapsed}</div>}
      {isPaused&&(task.accumulatedMs||0)>0&&<div className="npaused" style={{fontSize:(fs*0.71)+'px'}}>{task.autoPausedAt?'⏸ Auto-paused · ':'⏸ Paused · '}{elapsed}</div>}
      {isPaused&&(task.accumulatedMs||0)===0&&<div className="npaused" style={{fontSize:(fs*0.71)+'px'}}>⏱ Ready — press ▶ Start</div>}
      {isDone&&task.duration&&<div className="done-log" style={{fontSize:(fs*0.64)+'px'}}>✓ {fmtDur(task.duration)} · {task.assignedTo||'—'}</div>}
      {isDone&&task.points&&<div className="pts-badge" style={{fontSize:(fs*0.64)+'px'}}>+{task.points} pts</div>}
      <div className="nbtns">
        {!task.acceptedAt&&!isDone&&<button className="nbtn" style={{fontSize:(fs*0.64)+'px'}} onClick={()=>onAccept(task)}>▶ Accept</button>}
        {isActive&&<button className="nbtn" style={{fontSize:(fs*0.64)+'px'}} onClick={()=>onPause(task)}>⏸ Pause</button>}
        {isPaused&&<button className="nbtn" style={{fontSize:(fs*0.64)+'px'}} onClick={()=>onResume(task)}>{(task.accumulatedMs||0)===0?'▶ Start':'▶ Resume'}</button>}
        {(isActive||isPaused)&&<button className="nbtn" style={{fontSize:(fs*0.64)+'px'}} onClick={()=>onComplete(task)}>✓ Done</button>}
        <button className="nbtn comment" style={{fontSize:(fs*0.64)+'px'}} onClick={()=>onComment(task)}>💬{commentCount>0?` ${commentCount}`:''}</button>
        {!isDone&&<button className="nbtn" style={{fontSize:(fs*0.64)+'px'}} onClick={()=>onEdit(task)}>✎</button>}
        <button className="nbtn danger" style={{fontSize:(fs*0.64)+'px'}} onClick={()=>onDelete(task.id)}>✕</button>
        {onMoveUp&&<button className="nbtn reorder" title="Move up" onClick={()=>onMoveUp(task)}>▲</button>}
        {onMoveDown&&<button className="nbtn reorder" title="Move down" onClick={()=>onMoveDown(task)}>▼</button>}
      </div>
      <div className="by-line" style={{fontSize:(fs*0.64)+'px'}}>{task.assignedTo&&!isDone?`→ ${task.assignedTo} · `:''}{task.createdBy} · {fmtTime(task.createdAt)}</div>
      </div>}
    </div>
  );
}

// ── LIST ROW ───────────────────────────────────────────────────────────────
function ListRow({task,onAccept,onComplete,onPause,onResume,onDelete,onComment,onEdit,onMoveUp,onMoveDown,onToggleChecklist,onToggleExpand,expanded,pendingSync,allCats}){
  const open=!!expanded;
  const isDone=!!task.completedAt;
  const isActive=task.acceptedAt&&!task.completedAt&&!task.pausedAt;
  const isPaused=task.acceptedAt&&!task.completedAt&&!!task.pausedAt;
  const overdue=!isDone&&isOverdue(task.deadline);
  const commentCount=(task.comments||[]).length;

  let elapsed=null;
  if(isActive)elapsed=fmtDur((task.accumulatedMs||0)+(Date.now()-task.acceptedAt));
  if(isPaused)elapsed=fmtDur(task.accumulatedMs||0);

  const priColor=task.priority==='high'?'#cc3333':task.priority==='med'?'#c4682a':'#4a8a4a';
  const dotColor=task.priority==='high'?'#cc3333':task.priority==='med'?'#c4682a':'rgba(255,255,255,0.28)';
  const statusColor=isDone?'#4a8a4a':isActive?'#c4682a':isPaused?'#9a6200':'rgba(255,255,255,0.2)';

  // display name: show assigned if set, otherwise show "unassigned"
  const displayName=task.assignedTo||'';

  return(
    <div className="list-row">
      <div className="list-row-main" onClick={()=>onToggleExpand&&onToggleExpand(task.id)}>
        <div className="lr-dot" style={{background:dotColor}}/>
        <div className={`lr-title${isDone?' is-done':''}`}>{task.title}{pendingSync&&pendingSync.has(task.id)&&<span className="sync-pending-dot" title="Pending sheet sync — will keep retrying"/>}</div>
        {displayName&&<div className="lr-assignee">{displayName}</div>}
        {commentCount>0&&<div className="lr-comment-badge">💬{commentCount}</div>}
        {onMoveUp&&<button className="lr-reorder" title="Move up" onClick={e=>{e.stopPropagation();onMoveUp(task);}}>▲</button>}
        {onMoveDown&&<button className="lr-reorder" title="Move down" onClick={e=>{e.stopPropagation();onMoveDown(task);}}>▼</button>}
        <div className={`lr-expand${open?' open':''}`}>▾</div>
      </div>
      {open&&(
        <div className="list-row-detail">
          {(isActive||isPaused)&&<div className="lrd-timer">{isActive?<><span style={{width:6,height:6,borderRadius:'50%',background:'var(--amber)',display:'inline-block',animation:'pp 1.2s infinite'}}/>Running: {elapsed}</>:(task.accumulatedMs||0)===0?<>⏱ Ready — press ▶ Start</>:<>{task.autoPausedAt?'⏸ Auto-paused: ':'⏸ Paused: '}{elapsed}</>}</div>}
          {task.desc&&<div className="lrd-desc">{renderText(task.desc)}</div>}
          {Array.isArray(task.checklist)&&task.checklist.length>0&&(()=>{
            const total=task.checklist.length;
            const done=task.checklist.filter(it=>it.done).length;
            const pct=Math.round((done/total)*100);
            return(
              <div className="cl-list">
                {task.checklist.map(it=>(
                  <div key={it.id} className={`cl-list-item${it.done?' done':''}`} onClick={()=>onToggleChecklist&&onToggleChecklist(task.id,it.id)}>
                    <span className="cl-list-check">{it.done?'✓':'○'}</span>
                    <span className="cl-list-label">{it.label}</span>
                  </div>
                ))}
                <div className="cl-list-progress">
                  <div className="cl-list-track"><div className="cl-list-fill" style={{width:pct+'%'}}/></div>
                  <span className="cl-list-text">{done}/{total} · {pct}%</span>
                </div>
              </div>
            );
          })()}
          <div className="lrd-meta">
            <span className="lrd-tag">{(allCats||CATS).find(c=>c.id===task.category)?.label||task.category}</span>
            {task.client&&task.client!=='General / Internal'&&<span className="lrd-tag">{task.client}{task.project?` › ${task.project}`:''}</span>}
            <span className="lrd-tag" style={{color:priColor}}>{task.priority} priority</span>
            {task.deadline&&<span className="lrd-tag" style={{color:overdue?'#f08080':'inherit'}}>{overdue?'⚠ ':''}{task.deadline}</span>}
            {task.createdBy&&<span className="lrd-tag">by {task.createdBy}</span>}
          </div>
          {isDone&&<div className="lrd-meta"><span className="lrd-tag" style={{color:'var(--amber)'}}>✓ {fmtDur(task.duration)} · +{task.points||0} pts</span></div>}
          <div className="lrd-btns">
            {!task.acceptedAt&&!isDone&&<button className="lrd-btn primary" onClick={()=>onAccept(task)}>▶ Accept</button>}
            {isActive&&<button className="lrd-btn" onClick={()=>onPause(task)}>⏸ Pause</button>}
            {isPaused&&<button className="lrd-btn primary" onClick={()=>onResume(task)}>{(task.accumulatedMs||0)===0?'▶ Start':'▶ Resume'}</button>}
            {(isActive||isPaused)&&<button className="lrd-btn primary" onClick={()=>onComplete(task)}>✓ Done</button>}
            <button className="lrd-btn" onClick={()=>onComment(task)}>💬 Comments{commentCount>0?` (${commentCount})`:''}</button>
            {!task.completedAt&&<button className="lrd-btn" onClick={()=>onEdit(task)}>✎ Edit</button>}
            <button className="lrd-btn danger" onClick={()=>onDelete(task.id)}>✕ Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LIST EDITOR ────────────────────────────────────────────────────────────
function ListEditor({items,onSave,addPlaceholder,asObjects}){
  // items: string[] (clients/projects) or {id,label}[] (cats, when asObjects=true)
  const toStr=item=>asObjects?item.label:item;
  const [list,setList]=useState(items);
  const [editIdx,setEditIdx]=useState(null);
  const [editVal,setEditVal]=useState('');
  const [newVal,setNewVal]=useState('');
  const inStyle={flex:1,background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:'4px',color:'var(--text)',fontFamily:'DM Mono,monospace',fontSize:'12px',padding:'5px 8px',outline:'none'};
  const startEdit=i=>{setEditIdx(i);setEditVal(toStr(list[i]));};
  const commitEdit=()=>{
    const v=editVal.trim();if(!v){setEditIdx(null);return;}
    setList(prev=>prev.map((item,i)=>{
      if(i!==editIdx)return item;
      return asObjects?{...item,label:v}:v;
    }));
    setEditIdx(null);
  };
  const removeItem=i=>setList(prev=>prev.filter((_,j)=>j!==i));
  const addItem=()=>{
    const v=newVal.trim();if(!v)return;
    const already=list.some(item=>toStr(item).toLowerCase()===v.toLowerCase());
    if(already){setNewVal('');return;}
    const newItem=asObjects?{id:'cat_'+Date.now(),label:v}:v;
    setList(prev=>[...prev,newItem]);
    setNewVal('');
  };
  return(
    <div>
      <button className="le-back" onClick={()=>onSave(list)}>← Back to form</button>
      <div className="le-wrap">
        {list.length===0&&<div className="le-row"><span className="le-label" style={{color:'var(--text3)'}}>No items yet</span></div>}
        {list.map((item,i)=>(
          <div className="le-row" key={i}>
            {editIdx===i?(
              <input value={editVal} onChange={e=>setEditVal(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape')setEditIdx(null);}} autoFocus style={inStyle}/>
            ):(
              <span className="le-label">{toStr(item)}</span>
            )}
            {editIdx===i?(
              <button className="le-icon" onClick={commitEdit}>✓</button>
            ):(
              <button className="le-icon" onClick={()=>startEdit(i)}>✎</button>
            )}
            <button className="le-icon del" onClick={()=>removeItem(i)}>✕</button>
          </div>
        ))}
      </div>
      <div className="le-add">
        <input value={newVal} onChange={e=>setNewVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addItem()} placeholder={addPlaceholder||'Add new…'} style={inStyle}/>
        <button onClick={addItem} className="btn-post" style={{padding:'6px 12px',fontSize:'11px'}}>Add</button>
      </div>
    </div>
  );
}

// ── SIDEBAR ────────────────────────────────────────────────────────────────
function Sidebar({tasks,hours}){
  // Re-render once a day at midnight so the calendar/today indicators stay accurate when left open overnight.
  const [,setDayKey]=useState(()=>new Date().toDateString());
  useEffect(()=>{
    const id=setInterval(()=>{const k=new Date().toDateString();setDayKey(prev=>prev===k?prev:k);},60000);
    return()=>clearInterval(id);
  },[]);
  const now=new Date(),yr=now.getFullYear(),mo=now.getMonth();
  const moName=now.toLocaleString('en-US',{month:'long',year:'numeric'});
  const firstDay=new Date(yr,mo,1).getDay(),dim=new Date(yr,mo+1,0).getDate(),today=now.getDate();
  const taskDays=new Set(tasks.filter(t=>t.deadline&&!t.completedAt).map(t=>new Date(t.deadline+'T12:00:00').getDate()));
  const days=[];for(let i=0;i<firstDay;i++)days.push({e:true});for(let d=1;d<=dim;d++)days.push({d});
  const upcoming=tasks.filter(t=>t.deadline&&!t.completedAt).sort((a,b)=>new Date(a.deadline)-new Date(b.deadline)).slice(0,4);
  const doneToday=tasks.filter(t=>t.completedAt&&new Date(t.completedAt).toDateString()===now.toDateString());
  const active=tasks.filter(t=>t.acceptedAt&&!t.completedAt);
  const avg=doneToday.length?doneToday.reduce((a,t)=>a+(t.duration||0),0)/doneToday.length:0;
  const dotCols=['#f5cc90','#c4682a','#7a1c1c','#c2e098'];
  return(
    <div className="sidebar">
      <div className="cal-mo">{moName}</div>
      <div className="cgrid">
        {['S','M','T','W','T','F','S'].map((d,i)=><div key={i} className="cdn">{d}</div>)}
        {days.map((d,i)=><div key={i} className={`cdd${d.e?' empty':d.d===today?' today':taskDays.has(d.d)?' has-task':''}`}>{d.d||''}</div>)}
      </div>
      <div className="slabel">Hours</div>
      <div className="hrs-list">
        {['mon','tue','wed','thu','fri','sat','sun'].map(k=>{
          const isToday=DAY_KEYS[now.getDay()]===k;
          const val=(hours&&hours[k])||'Closed';
          return(
            <div key={k} className={`hrs-row${isToday?' today':''}`}>
              <span className="hrs-day">{k[0].toUpperCase()+k.slice(1)}</span>
              <span className="hrs-val" title={val}>{val}</span>
            </div>
          );
        })}
      </div>
      <div className="slabel">Due soon</div>
      {upcoming.length===0&&<div style={{fontSize:'9px',color:'var(--text3)',fontFamily:'DM Mono,monospace',fontStyle:'italic'}}>none set</div>}
      {upcoming.map((t,i)=>(<div key={t.id} className="devent"><div className="devtxt"><span className="devdot" style={{background:dotCols[i%4]}}></span>{t.title.slice(0,20)}{t.title.length>20?'…':''}</div><div className="devdate">{t.deadline}</div></div>))}
      <div className="sstat">{doneToday.length}</div><div className="ssub">done today</div>
      <div className="sstat" style={{color:'var(--amber)',fontSize:'17px'}}>{avg>0?fmtDur(avg):'—'}</div><div className="ssub">avg time</div>
      <div className="sstat" style={{fontSize:'17px'}}>{active.length}</div><div className="ssub">active now</div>
    </div>
  );
}

// ── LOG VIEW ───────────────────────────────────────────────────────────────
function LogView({tasks,config,adminUnlocked,allTeam,onUpdate}){
  const done=tasks.filter(t=>t.completedAt);
  const avg=done.length?done.reduce((a,t)=>a+(t.duration||0),0)/done.length:0;
  const today=done.filter(t=>new Date(t.completedAt).toDateString()===new Date().toDateString());
  return(
    <div className="log-view">
      <div className="log-header">
        <div><h2>Task History</h2><p>Full log — who, when, how long, how many points{adminUnlocked&&<span style={{marginLeft:'10px',fontSize:'10px',color:'var(--amber)',fontFamily:'DM Mono,monospace',letterSpacing:'0.08em',textTransform:'uppercase'}}>· admin: completed-by is editable</span>}</p></div>
        {adminUnlocked&&config?.sheetId&&<a className="sheets-btn" target="_blank" rel="noopener" href={`https://docs.google.com/spreadsheets/d/${config.sheetId}`}>↗ Open in Sheets</a>}
      </div>
      <div className="log-stats">
        <div className="stat-card"><div className="stat-label">Total done</div><div className="stat-val">{done.length}</div></div>
        <div className="stat-card"><div className="stat-label">Done today</div><div className="stat-val">{today.length}</div></div>
        <div className="stat-card"><div className="stat-label">Avg time</div><div className="stat-val" style={{fontSize:'18px',paddingTop:'3px'}}>{fmtDur(avg)}</div></div>
        <div className="stat-card"><div className="stat-label">Active now</div><div className="stat-val">{tasks.filter(t=>t.acceptedAt&&!t.completedAt).length}</div></div>
      </div>
      <div className="log-wrap">
        {done.length===0?<div className="no-tasks-msg">no completed tasks yet</div>:(
          <table className="log-table">
            <thead><tr><th>Task</th><th>Client</th><th>Priority</th><th>Requested by</th><th>Completed by</th><th>Completed at</th><th>Duration</th><th>Pts</th></tr></thead>
            <tbody>
              {[...done].sort((a,b)=>b.completedAt-a.completedAt).map(t=>(
                <tr key={t.id}>
                  <td className="tname">{t.title}</td>
                  <td className="tmono">{t.client||'—'}</td>
                  <td><span className={`nprio-badge ${t.priority==='high'?'nph':t.priority==='med'?'npm':'npl'}`} style={{position:'static',display:'inline-block',fontSize:'9px'}}>{t.priority}</span></td>
                  <td className="tmono">{t.createdBy||'—'}</td>
                  <td className="tmono">{adminUnlocked&&onUpdate?(
                    <select className="log-edit-select" value={t.assignedTo||''} onChange={e=>onUpdate(t.id,'assignedTo',e.target.value)} title="Admin: change who completed this task">
                      <option value="">—</option>
                      {(allTeam||[]).map(m=><option key={m.email} value={m.name}>{m.name}</option>)}
                      {t.assignedTo&&!(allTeam||[]).find(m=>m.name===t.assignedTo)&&<option value={t.assignedTo}>{t.assignedTo}</option>}
                    </select>
                  ):(t.assignedTo||'—')}</td>
                  <td className="tmono">{fmtTime(t.completedAt)}</td>
                  <td className="tmono" style={{color:'var(--amber)'}}>{fmtDur(t.duration)}</td>
                  <td className="tmono" style={{color:'var(--amber)',fontWeight:'700'}}>{t.points||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── SCORES VIEW ────────────────────────────────────────────────────────────
function ScoresView({tasks,manualBadges,demerits}){
  const mo=currentMonth();
  const moLabel=new Date().toLocaleString('en-US',{month:'long',year:'numeric'});
  const members=TEAM.map(member=>{
    const done=tasks.filter(t=>t.completedAt&&t.assignedTo===member.name);
    const moDone=done.filter(t=>{const d=new Date(t.completedAt);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`===mo;});
    const demeritTotal=demerits.filter(d=>d.member===member.name).reduce((a,d)=>a+d.pts,0);
    const demeritMo=demerits.filter(d=>{const dm=new Date(d.issuedAt);return d.member===member.name&&`${dm.getFullYear()}-${String(dm.getMonth()+1).padStart(2,'0')}`===mo;}).reduce((a,d)=>a+d.pts,0);
    const totalPts=Math.max(0,done.reduce((a,t)=>a+(t.points||0),0)-demeritTotal);
    const moPts=Math.max(0,moDone.reduce((a,t)=>a+(t.points||0),0)-demeritMo);
    const autoBadges=calcAutoBadges(member.name,tasks);
    const badges=[...new Set([...autoBadges,...(manualBadges[member.name]||[])])];
    return{...member,done:done.length,moDone:moDone.length,totalPts,moPts,badges};
  }).filter(m=>m.done>0).sort((a,b)=>b.moPts-a.moPts);
  const withTopBadge=members.map((m,i)=>({...m,badges:i===0&&m.moPts>0?[...new Set([...m.badges,'top_month'])]:m.badges}));
  const rankEmoji=['🥇','🥈','🥉'];
  return(
    <div className="scores-view">
      <div className="scores-header"><h2>Leaderboard 🏆</h2><div className="month-label">{moLabel}</div></div>
      {withTopBadge.length===0&&<div style={{textAlign:'center',padding:'60px 24px',fontSize:'13px',color:'var(--text3)',fontFamily:'DM Mono,monospace'}}>no completed tasks yet — get to work! 💪</div>}
      <div className="leaderboard">
        {withTopBadge.map((m,i)=>(
          <div key={m.email} className={`player-card${i<3?` rank-${i+1}`:''}`}>
            <div className="player-rank">{rankEmoji[i]||''}</div>
            <div className="player-av">{initials(m.name)}</div>
            <div className="player-name">{m.name}</div>
            <div className="player-pts">{m.moPts}</div>
            <div className="player-pts-label">pts this month</div>
            <div className="player-stats"><div className="pstat">This month: <span>{m.moDone}</span></div><div className="pstat">Total pts: <span>{m.totalPts}</span></div></div>
            {m.badges.length>0&&(<div className="badges-row">{m.badges.map(bid=>{const b=BADGES_DEF.find(x=>x.id===bid);return b?<div key={bid} className="badge">{b.emoji}<div className="badge-tip">{b.label}</div></div>:null;})}</div>)}
          </div>
        ))}
      </div>
      <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'10px',padding:'18px 22px'}}>
        <div style={{fontSize:'10px',fontFamily:'DM Mono,monospace',fontWeight:'800',letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--text3)',marginBottom:'12px'}}>Point values</div>
        <div style={{display:'flex',gap:'20px',flexWrap:'wrap'}}>
          {[['High','3 pts','nph'],['Medium','2 pts','npm'],['Low','1 pt','npl'],['Speed bonus (under 10 min)','+1 pt','']].map(([label,val,cls])=>(
            <div key={label} style={{fontSize:'12px',color:'var(--text2)',fontFamily:'DM Mono,monospace'}}><span className={cls?`nprio-badge ${cls}`:''} style={{position:'static',display:'inline-block',fontSize:'9px',marginRight:'6px'}}>{val}</span>{label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS VIEW ──────────────────────────────────────────────────────────
function SettingsView({settings,onSettings,onSave,onClearTasks,manualBadges,onManualBadges,demerits,onDemerits,showToast,allTeam,customTeam,onAddUser,onRewriteSheet,hours,onHoursChange,permissions,onPermissionsChange,isAdmin,adminUnlocked,onAdminChange,pendingSync,syncLog,tasks,onForceResync,onClearSyncLog}){
  const [draft,setDraft]=useState(settings);
  const [saved,setSaved]=useState(false);
  const [devOpen,setDevOpen]=useState(false);
  const setAdminUnlocked=onAdminChange;
  const [badgeMember,setBadgeMember]=useState(allTeam[0]?.name||'');
  const [demeritMember,setDemeritMember]=useState(allTeam[0]?.name||'');
  const [demeritPts,setDemeritPts]=useState(1);
  const [demeritReason,setDemeritReason]=useState('');
  const [confirmClear,setConfirmClear]=useState(false);
  const [newUserName,setNewUserName]=useState('');
  const [newUserEmail,setNewUserEmail]=useState('');
  const [userMsg,setUserMsg]=useState('');

  const handleFontSize=e=>{const fs=parseInt(e.target.value);setDraft(d=>({...d,fontSize:fs}));onSettings({...settings,...draft,fontSize:fs});};
  const handleTheme=id=>{setDraft(d=>({...d,theme:id}));onSettings({...settings,...draft,theme:id});};
  const handleSave=()=>{onSave(draft);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const tryUnlock=()=>{if(isAdmin)setAdminUnlocked(true);};
  const memberBadges=manualBadges[badgeMember]||[];
  const toggleBadge=bid=>{const cur=manualBadges[badgeMember]||[];const upd=cur.includes(bid)?cur.filter(b=>b!==bid):[...cur,bid];onManualBadges({...manualBadges,[badgeMember]:upd});};
  const issueDemerit=()=>{if(!demeritReason.trim())return;const entry={id:'dm_'+Date.now(),member:demeritMember,pts:demeritPts,reason:demeritReason.trim(),issuedAt:Date.now()};onDemerits([...demerits,entry]);setDemeritReason('');showToast(`Demerit issued to ${demeritMember} (-${demeritPts} pts)`,'');};

  return(
    <div className="settings-view">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'22px'}}>
        <h2>Settings ⚙️</h2>
        <button className="btn-post" style={{padding:'8px 20px',fontSize:'12px'}} onClick={handleSave}>{saved?'✓ Saved!':'Save changes'}</button>
      </div>
      <div className="settings-section">
        <h3>Color Theme</h3>
        <div className="theme-grid">
          {THEMES.map(t=>(<div key={t.id} className={`theme-btn${draft.theme===t.id?' active':''}`} style={{background:t.bg}} onClick={()=>handleTheme(t.id)}><div className="theme-preview" style={{background:`linear-gradient(135deg,${t.bg},${t.accent})`}}/><div className="theme-btn-label" style={{color:t.accent}}>{t.label}</div></div>))}
        </div>
      </div>
      <div className="settings-section">
        <h3>Card Font Size</h3>
        <div className="font-row">
          <label>Small</label>
          <input type="range" className="font-slider" min="11" max="20" value={draft.fontSize||14} onChange={handleFontSize}/>
          <label>Large</label>
          <span className="font-preview">{draft.fontSize||14}px</span>
        </div>
        <div style={{marginTop:'12px',background:'var(--bg3)',borderRadius:'6px',padding:'10px 14px',fontSize:(draft.fontSize||14)+'px',color:'var(--text2)',fontFamily:'Syne,sans-serif'}}>Preview: Move pallet 3 to bay 4</div>
      </div>
      {isAdmin&&<div className="dev-section" style={{borderColor:adminUnlocked?'rgba(196,104,42,0.4)':'var(--border)'}}>
        <div className="dev-header" onClick={()=>!adminUnlocked&&setDevOpen(o=>!o)}>
          <div className="dev-title" style={{color:adminUnlocked?'var(--amber)':'var(--text3)'}}>{adminUnlocked?'🔓 Admin Unlocked':'🔒 Developer Options'}</div>
          {!adminUnlocked&&<span style={{fontSize:'11px',color:'var(--text3)',fontFamily:'DM Mono,monospace'}}>{devOpen?'▲':'▼'}</span>}
        </div>
        {!adminUnlocked&&devOpen&&(
          <div style={{marginTop:'16px'}}>
            <p style={{fontSize:'12px',color:'var(--text2)',fontFamily:'DM Mono,monospace',marginBottom:'12px'}}>Admin controls change things for the whole crew.</p>
            <button className="btn-post" style={{padding:'9px 16px',fontSize:'12px'}} onClick={tryUnlock}>Unlock</button>
          </div>
        )}
        {adminUnlocked&&(
          <div style={{marginTop:'20px',display:'flex',flexDirection:'column',gap:'24px'}}>
            <div className="admin-subsection">
              <div className="admin-sub-label">Award / Revoke Badges</div>
              <div style={{marginBottom:'12px'}}><select value={badgeMember} onChange={e=>setBadgeMember(e.target.value)} style={{background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:'6px',color:'var(--text)',fontFamily:'Syne,sans-serif',fontSize:'13px',padding:'9px 14px',outline:'none'}}>{allTeam.map(m=><option key={m.email} value={m.name}>{m.name}</option>)}</select></div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:'7px'}}>
                {BADGES_DEF.map(b=>{const active=memberBadges.includes(b.id);return(<div key={b.id} className={`badge-toggle${active?' on':''}`} onClick={()=>toggleBadge(b.id)}><span style={{fontSize:'18px'}}>{b.emoji}</span><div><div className="badge-toggle-label" style={{color:active?'var(--amber)':'var(--text)'}}>{b.label}</div><div className="badge-toggle-sub">{active?'awarded ✓':'click to award'}</div></div></div>);})}
              </div>
            </div>
            <div className="admin-subsection">
              <div className="admin-sub-label">Issue Demerit</div>
              <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'flex-end',marginBottom:'14px'}}>
                <div className="field" style={{margin:0}}><label>Member</label><select value={demeritMember} onChange={e=>setDemeritMember(e.target.value)} style={{background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:'6px',color:'var(--text)',fontFamily:'Syne,sans-serif',fontSize:'13px',padding:'9px 14px',outline:'none'}}>{allTeam.map(m=><option key={m.email} value={m.name}>{m.name}</option>)}</select></div>
                <div className="field" style={{margin:0,width:'90px'}}><label>Points</label><select value={demeritPts} onChange={e=>setDemeritPts(parseInt(e.target.value))} style={{background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:'6px',color:'var(--text)',fontFamily:'Syne,sans-serif',fontSize:'13px',padding:'9px 14px',outline:'none'}}>{[1,2,3,5,10].map(n=><option key={n} value={n}>-{n}</option>)}</select></div>
                <div className="field" style={{margin:0,flex:1,minWidth:'160px'}}><label>Reason</label><input value={demeritReason} onChange={e=>setDemeritReason(e.target.value)} onKeyDown={e=>e.key==='Enter'&&issueDemerit()} placeholder="e.g. Late on deadline..."/></div>
                <button className="clear-btn" style={{padding:'9px 14px',fontSize:'12px'}} onClick={issueDemerit}>Issue</button>
              </div>
              {demerits.length>0?(<div style={{background:'var(--bg3)',borderRadius:'7px',overflow:'hidden',border:'1px solid var(--border)'}}>
                {[...demerits].sort((a,b)=>b.issuedAt-a.issuedAt).map(d=>(<div key={d.id} className="demerit-row"><span className="demerit-pts">-{d.pts}</span><span className="demerit-who">{d.member}</span><span className="demerit-reason">{d.reason}</span><span className="demerit-time">{fmtTime(d.issuedAt)}</span><button className="demerit-del" onClick={()=>{if(window.confirm(`Remove ${d.pts}pt demerit from ${d.member}?`))onDemerits(demerits.filter(x=>x.id!==d.id));}}>✕</button></div>))}
              </div>):(<div style={{fontSize:'11px',color:'var(--text3)',fontFamily:'DM Mono,monospace',fontStyle:'italic'}}>No demerits issued</div>)}
            </div>
            <div className="admin-subsection">
              <div className="admin-sub-label">Data</div>
              <p style={{fontSize:'12px',color:'var(--text2)',fontFamily:'DM Mono,monospace',marginBottom:'12px'}}>Clear all local task data. Does not affect your Google Sheet.</p>
              {!confirmClear?<button className="clear-btn" onClick={()=>setConfirmClear(true)}>Clear all tasks</button>:<div style={{display:'flex',gap:'10px',alignItems:'center'}}><span style={{fontSize:'12px',color:'var(--text2)',fontFamily:'DM Mono,monospace'}}>Are you sure?</span><button className="clear-btn" onClick={()=>{onClearTasks();setConfirmClear(false);}}>Yes, clear</button><button className="btn-cancel" onClick={()=>setConfirmClear(false)}>Cancel</button></div>}
              <div style={{marginTop:'16px',paddingTop:'16px',borderTop:'1px solid var(--border)'}}>
                <p style={{fontSize:'12px',color:'var(--text2)',fontFamily:'DM Mono,monospace',marginBottom:'10px'}}>Rewrite Google Sheet — clears all rows and rewrites every task cleanly sorted (Open → Active → Done). Fixes blank rows and scattered entries.</p>
                <button className="btn-post" style={{fontSize:'12px',padding:'8px 16px'}} onClick={onRewriteSheet}>↺ Rewrite Sheet</button>
              </div>
            </div>
            <div className="admin-subsection">
              <div className="admin-sub-label">Team Members</div>
              <div style={{marginBottom:'12px',background:'var(--bg3)',borderRadius:'7px',overflow:'hidden',border:'1px solid var(--border)'}}>
                {allTeam.map(m=>(
                  <div key={m.email} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 14px',borderBottom:'1px solid var(--border)'}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:'var(--crimson-dim)',border:'1px solid var(--amber-dim)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:'800',color:'var(--amber)',fontFamily:'DM Mono,monospace',flexShrink:0}}>{(m.name||'?').split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</div>
                    <div style={{flex:1}}><div style={{fontSize:'12px',fontWeight:'700',color:'var(--text)'}}>{m.name}</div><div style={{fontSize:'10px',color:'var(--text3)',fontFamily:'DM Mono,monospace'}}>{m.email}</div></div>
                    {customTeam.find(ct=>ct.email===m.email)&&<span style={{fontSize:'9px',fontFamily:'DM Mono,monospace',color:'var(--text3)'}}>custom</span>}
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'flex-end'}}>
                <div className="field" style={{margin:0,flex:1,minWidth:'120px'}}><label>Name</label><input value={newUserName} onChange={e=>setNewUserName(e.target.value)} placeholder="First Last"/></div>
                <div className="field" style={{margin:0,flex:2,minWidth:'180px'}}><label>Email</label><input type="email" value={newUserEmail} onChange={e=>setNewUserEmail(e.target.value)} placeholder="name@bagavagabonds.com"/></div>
                <button className="btn-post" style={{padding:'9px 16px',fontSize:'12px'}} onClick={()=>{
                  const n=newUserName.trim(),e=newUserEmail.trim();
                  if(!n||!e){setUserMsg('Name and email required');return;}
                  if(allTeam.find(t=>t.email===e)){setUserMsg('Email already exists');return;}
                  onAddUser(n,e);setNewUserName('');setNewUserEmail('');setUserMsg(`✓ ${n} added`);setTimeout(()=>setUserMsg(''),2500);
                }}>Add</button>
              </div>
              {userMsg&&<div style={{fontSize:'11px',fontFamily:'DM Mono,monospace',color:userMsg.startsWith('✓')?'#8fce8f':'#f08080',marginTop:'8px'}}>{userMsg}</div>}
            </div>
            <div className="admin-subsection">
              <div className="admin-sub-label">Warehouse Hours</div>
              <p style={{fontSize:'12px',color:'var(--text2)',fontFamily:'DM Mono,monospace',marginBottom:'12px'}}>Shown in the top bar. Leave a day blank to display "Closed".</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'8px'}}>
                {DAY_KEYS.map((k,i)=>(
                  <div key={k} className="field" style={{margin:0,display:'flex',alignItems:'center',gap:'8px'}}>
                    <label style={{margin:0,minWidth:'36px'}}>{DAY_LABELS[i]}</label>
                    <input value={hours?.[k]||''} onChange={e=>onHoursChange({...hours,[k]:e.target.value})} placeholder="e.g. 9:00a – 3:00p"/>
                  </div>
                ))}
              </div>
              <button className="btn-cancel" style={{fontSize:'11px',marginTop:'10px'}} onClick={()=>{if(window.confirm('Reset all hours to defaults?'))onHoursChange({...DEFAULT_HOURS});}}>Reset to defaults</button>
            </div>
            <div className="admin-subsection">
              <div className="admin-sub-label">Permissions</div>
              <p style={{fontSize:'12px',color:'var(--text2)',fontFamily:'DM Mono,monospace',marginBottom:'12px'}}>Defaults are on for everyone. Toggle off to restrict. Syncs to all devices.</p>
              <div style={{background:'var(--bg3)',borderRadius:'7px',overflow:'hidden',border:'1px solid var(--border)'}}>
                <div style={{display:'flex',alignItems:'center',gap:'10px',padding:'7px 14px',borderBottom:'1px solid var(--border)',background:'var(--bg2)'}}>
                  <div style={{flex:1,fontSize:'9px',fontWeight:'800',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text3)',fontFamily:'DM Mono,monospace'}}>Member</div>
                  <div style={{width:'90px',textAlign:'center',fontSize:'9px',fontWeight:'800',letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text3)',fontFamily:'DM Mono,monospace'}}>Create</div>
                  <div style={{width:'90px',textAlign:'center',fontSize:'9px',fontWeight:'800',letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text3)',fontFamily:'DM Mono,monospace'}}>Assign others</div>
                </div>
                {allTeam.map(m=>{
                  const p=permissions?.[m.email]||{};
                  const canC=p.canCreate!==false;
                  const canA=p.canAssignOthers!==false;
                  const toggle=(key,val)=>{
                    const next={...permissions};
                    const cur={...(next[m.email]||{})};
                    cur[key]=val;
                    // Drop entry if both flags are back to default (true)
                    if(cur.canCreate!==false&&cur.canAssignOthers!==false){delete next[m.email];}
                    else{next[m.email]=cur;}
                    onPermissionsChange(next);
                  };
                  return(
                    <div key={m.email} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 14px',borderBottom:'1px solid var(--border)'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'12px',fontWeight:'700',color:'var(--text)'}}>{m.name}</div>
                        <div style={{fontSize:'10px',color:'var(--text3)',fontFamily:'DM Mono,monospace',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.email}</div>
                      </div>
                      <label style={{width:'90px',display:'flex',justifyContent:'center',cursor:'pointer'}}>
                        <input type="checkbox" checked={canC} onChange={e=>toggle('canCreate',e.target.checked)} style={{cursor:'pointer',width:'16px',height:'16px',accentColor:'var(--amber)'}}/>
                      </label>
                      <label style={{width:'90px',display:'flex',justifyContent:'center',cursor:'pointer'}}>
                        <input type="checkbox" checked={canA} onChange={e=>toggle('canAssignOthers',e.target.checked)} style={{cursor:'pointer',width:'16px',height:'16px',accentColor:'var(--amber)'}}/>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="admin-subsection">
              <div className="admin-sub-label">Sync Diagnostics</div>
              <p style={{fontSize:'12px',color:'var(--text2)',fontFamily:'DM Mono,monospace',marginBottom:'12px'}}>What the app knows about its sync state. The pending queue lists tasks whose latest local change hasn't been confirmed in the sheet yet.</p>
              <div style={{display:'flex',gap:'18px',flexWrap:'wrap',marginBottom:'14px'}}>
                <div><div style={{fontSize:'10px',color:'var(--text3)',fontFamily:'DM Mono,monospace',letterSpacing:'0.08em',textTransform:'uppercase'}}>Pending</div><div style={{fontSize:'22px',fontWeight:800,color:pendingSync?.size>0?'var(--amber)':'var(--text2)'}}>{pendingSync?.size||0}</div></div>
                <div><div style={{fontSize:'10px',color:'var(--text3)',fontFamily:'DM Mono,monospace',letterSpacing:'0.08em',textTransform:'uppercase'}}>Log entries</div><div style={{fontSize:'22px',fontWeight:800,color:'var(--text2)'}}>{syncLog?.length||0}</div></div>
              </div>
              {pendingSync&&pendingSync.size>0&&<div style={{background:'var(--bg3)',borderRadius:'6px',padding:'10px 14px',marginBottom:'12px',border:'1px solid var(--border)'}}>
                <div style={{fontSize:'10px',color:'var(--text3)',fontFamily:'DM Mono,monospace',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:'6px'}}>Pending tasks</div>
                {[...pendingSync].map(id=>{const t=(tasks||[]).find(x=>x.id===id);return <div key={id} style={{fontSize:'11px',color:'var(--text2)',fontFamily:'DM Mono,monospace',padding:'3px 0'}}>{t?t.title:`(orphaned id: ${id})`}</div>;})}
              </div>}
              <div style={{display:'flex',gap:'10px',marginBottom:'14px'}}>
                <button className="btn-post" style={{fontSize:'12px',padding:'8px 14px'}} onClick={onForceResync}>↻ Force resync pending</button>
                <button className="btn-cancel" style={{fontSize:'12px'}} onClick={onClearSyncLog}>Clear log</button>
              </div>
              {syncLog&&syncLog.length>0&&<div style={{background:'var(--bg3)',borderRadius:'6px',padding:'10px 14px',border:'1px solid var(--border)',maxHeight:'260px',overflowY:'auto'}}>
                <div style={{fontSize:'10px',color:'var(--text3)',fontFamily:'DM Mono,monospace',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:'8px'}}>Recent events</div>
                {syncLog.slice(0,30).map((e,i)=>{
                  const t=(tasks||[]).find(x=>x.id===e.taskId);
                  const statusColor=e.status.includes('fail')?'#f08080':e.status.includes('confirm')||e.status.includes('append')||e.status.includes('updated')?'#8fce8f':'var(--amber)';
                  return <div key={i} style={{fontSize:'10px',fontFamily:'DM Mono,monospace',color:'var(--text2)',padding:'3px 0',borderBottom:i<syncLog.length-1?'1px solid var(--border)':'none'}}>
                    <span style={{color:'var(--text3)'}}>{new Date(e.at).toLocaleTimeString('en-US',{hour12:false})}</span>
                    {' · '}
                    <span style={{color:statusColor,fontWeight:700}}>{e.status}</span>
                    {' · '}
                    <span>{t?t.title.slice(0,40):e.taskId}</span>
                    {e.detail&&<span style={{color:'#f08080'}}> · {e.detail}</span>}
                  </div>;
                })}
              </div>}
            </div>
            <button className="btn-cancel" style={{fontSize:'12px',alignSelf:'flex-start'}} onClick={()=>setAdminUnlocked(false)}>🔒 Lock admin panel</button>
          </div>
        )}
      </div>}
      <div style={{textAlign:'center',padding:'12px 0 24px',fontSize:'10px',color:'var(--text3)',fontFamily:'DM Mono,monospace',letterSpacing:'0.08em'}}>
        BV Task Board · v{APP_VERSION}
      </div>
    </div>
  );
}

// ── AUTH SCREEN ────────────────────────────────────────────────────────────
function AuthScreen({onSignIn,restoring,error}){
  return(
    <div className="auth-screen">
      <div className="auth-dots"/>
      <div className="auth-card">
        <div className="auth-badge">BV</div>
        <div className="auth-title">Bagavagabonds<br/>Task Board</div>
        <div className="auth-sub">Assign tasks from anywhere.<br/>Warehouse crew gets notified instantly.</div>
        {restoring
          ?<button className="auth-btn" disabled style={{opacity:0.6}}><div className="spinner" style={{width:'14px',height:'14px',borderWidth:'2px'}}/> Restoring session...</button>
          :<button className="auth-btn" onClick={onSignIn}>Sign in with Google</button>
        }
        {error&&<div className="auth-note" style={{color:'#f08080'}}>{error}</div>}
        <div className="auth-note">use your @bagavagabonds.com account</div>
      </div>
    </div>
  );
}

// ── MAIN APP ───────────────────────────────────────────────────────────────
function App(){
  const getSaved = key => { try{return JSON.parse(localStorage.getItem(key));}catch{return null;} };

  // Auth: store token + expiry for session persistence
  const [config,setConfig]=useState(()=>{
    const saved=getSaved(CONFIG_KEY);
    const tokenValid=saved?.accessToken&&saved?.tokenExpiry&&saved.tokenExpiry>Date.now()+30000;
    return{...HARDCODED_CONFIG,accessToken:tokenValid?saved.accessToken:null,tokenExpiry:tokenValid?saved.tokenExpiry:null};
  });
  const [user,setUser]=useState(null);
  const [restoring,setRestoring]=useState(()=>{
    const saved=getSaved(CONFIG_KEY);
    return!!(saved?.accessToken&&saved?.tokenExpiry&&saved.tokenExpiry>Date.now()+30000);
  });
  const [tasks,setTasks]=useState(()=>getSaved(TASKS_KEY)||[]);
  const [settings,setSettings]=useState(()=>getSaved(SETTINGS_KEY)||{theme:'theme-foundry',fontSize:14,viewMode:isMobileWidth()?'list':'cards'});
  const [hours,setHours]=useState(()=>getSaved(HOURS_KEY)||DEFAULT_HOURS);
  const [permissions,setPermissions]=useState(()=>getSaved(PERMISSIONS_KEY)||{});
  const isAdmin=!!user?.email&&user.email.toLowerCase()===ADMIN_EMAIL;
  const [adminOpen,setAdminUnlocked]=useState(false);
  const adminUnlocked=isAdmin&&adminOpen;
  // Pending sync queue — task IDs whose latest local change hasn't been confirmed in the sheet yet.
  const [pendingSync,setPendingSync]=useState(()=>new Set(getSaved(PENDING_SYNC_KEY)||[]));
  // Recent sync events (success, failed, confirmed). Capped at 50 for diagnostic visibility.
  const [syncLog,setSyncLog]=useState(()=>getSaved(SYNC_LOG_KEY)||[]);
  const pendingSyncRef=useRef(pendingSync);
  useEffect(()=>{pendingSyncRef.current=pendingSync;},[pendingSync]);
  // In-flight = a syncTask call is mid-flight RIGHT NOW for this task ID. Used to suppress
  // poll-triggered retries that would otherwise double-append the same task. Ephemeral — not persisted.
  const inFlightSyncRef=useRef(new Set());
  const [manualBadges,setManualBadges]=useState(()=>getSaved(BADGES_KEY)||{});
  const [demerits,setDemerits]=useState(()=>getSaved(DEMERITS_KEY)||[]);
  const [view,setView]=useState('board');
  const [viewMode,setViewMode]=useState(()=>(getSaved(SETTINGS_KEY)||{}).viewMode||(isMobileWidth()?'list':'cards'));
  const [filterMine,setFilterMine]=useState(false);
  const [showNew,setShowNew]=useState(false);
  const [toast,setToast]=useState(null);
  const [authError,setAuthError]=useState('');
  const [syncing,setSyncing]=useState(false);
  const [loading,setLoading]=useState(false);
  const [showMenu,setShowMenu]=useState(false);
  const [chaChing,setChaChing]=useState(false);
  const [dragOver,setDragOver]=useState(null);

  const [commentTask,setCommentTask]=useState(null);
  const [editTask,setEditTask]=useState(null);
  const [sortBy,setSortByRaw]=useState('date');
  const [manualOrder,setManualOrder]=useState(()=>{
    const saved=getSaved(MANUAL_ORDER_KEY);
    if(Array.isArray(saved))return saved;
    // Migrate old map format ({taskId: number}) to array
    if(saved&&typeof saved==='object')return Object.entries(saved).sort(([,a],[,b])=>a-b).map(([id])=>id);
    return [];
  });
  const [collapsed,setCollapsed]=useState(()=>getSaved(COLLAPSED_KEY)||{open:false,inprog:false,done:false});
  const toggleCollapsed=k=>setCollapsed(prev=>({...prev,[k]:!prev[k]}));
  const [collapsedCards,setCollapsedCards]=useState(()=>new Set(getSaved(COLLAPSED_CARDS_KEY)||[]));
  const toggleCardCollapse=id=>setCollapsedCards(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const isSectionCompacted=items=>{if(items.length<=1)return false;return items.slice(1).every(t=>collapsedCards.has(t.id));};
  const compactSection=items=>{
    if(items.length===0)return;
    const rest=items.slice(1).map(t=>t.id);
    const alreadyCompact=rest.length>0&&rest.every(id=>collapsedCards.has(id));
    setCollapsedCards(prev=>{
      const next=new Set(prev);
      if(alreadyCompact){for(const t of items)next.delete(t.id);}
      else{next.delete(items[0]?.id);for(const id of rest)next.add(id);}
      return next;
    });
  };
  // List-view row expansion (default is collapsed, opposite of cards) — lifted from ListRow so section chevron can drive it.
  const [expandedRows,setExpandedRows]=useState(()=>new Set(getSaved(EXPANDED_ROWS_KEY)||[]));
  const toggleRowExpand=id=>setExpandedRows(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const isListSectionCompacted=items=>{
    if(items.length===0)return false;
    const firstId=items[0].id;
    if(!expandedRows.has(firstId))return false;
    return items.slice(1).every(t=>!expandedRows.has(t.id));
  };
  const compactListSection=items=>{
    if(items.length===0)return;
    const firstId=items[0].id;
    setExpandedRows(prev=>{
      const wasCompacted=prev.has(firstId)&&items.slice(1).every(t=>!prev.has(t.id));
      const next=new Set(prev);
      for(const t of items)next.delete(t.id);
      if(!wasCompacted)next.add(firstId);
      return next;
    });
  };
  const setSortBy=newSort=>{ setSortByRaw(newSort); if(newSort!=='manual')setManualOrder([]); };
  const [statusFilter,setStatusFilter]=useState('all');
  const [managedCats,setManagedCats]=useState(()=>getSaved(MANAGED_CATS_KEY)||[...CATS]);
  const [projects,setProjects]=useState(()=>getSaved(PROJECTS_KEY)||{});
  const [managedClients,setManagedClients]=useState(()=>getSaved(MANAGED_CLIENTS_KEY)||[...CLIENTS]);
  const [customTeam,setCustomTeam]=useState(()=>getSaved(CUSTOM_TEAM_KEY)||[]);
  const [deletedIds,setDeletedIds]=useState(()=>new Set(getSaved(DELETED_IDS_KEY)||[]));
  const [refreshing,setRefreshing]=useState(false);
  const tokenRef=useRef(null);
  const pollRef=useRef(null);
  const configRef=useRef(config);
  const deletedIdsRef=useRef(deletedIds);
  const pushingHoursRef=useRef(false);
  const pushingPermsRef=useRef(false);
  const pushingClientsRef=useRef(false);
  const pushingCatsRef=useRef(false);
  const pushingProjectsRef=useRef(false);
  const pushingDeletedRef=useRef(false);
  const tasksRef=useRef(tasks);
  useEffect(()=>{tasksRef.current=tasks;},[tasks]);
  const userRef=useRef(user);
  useEffect(()=>{userRef.current=user;},[user]);
  const [lightbox,setLightbox]=useState(null);
  const [reconnectNeeded,setReconnectNeeded]=useState(false);
  useEffect(()=>{
    const h=e=>setLightbox(e.detail);
    window.addEventListener('bvb-lightbox',h);
    const esc=e=>{if(e.key==='Escape')setLightbox(null);};
    window.addEventListener('keydown',esc);
    return()=>{window.removeEventListener('bvb-lightbox',h);window.removeEventListener('keydown',esc);};
  },[]);
  useEffect(()=>{configRef.current=config;},[config]);
  useEffect(()=>{deletedIdsRef.current=deletedIds;},[deletedIds]);

  const [team,setTeam]=useState(TEAM);
  const applyTeam=list=>{TEAM=list;safeStore(TEAM_KEY,list);setTeam(list);};
  const allTeam=[...team,...customTeam];

  useEffect(()=>{safeStore(TASKS_KEY,tasks);},[tasks]);
  useEffect(()=>{safeStore(SETTINGS_KEY,{...settings,viewMode});},[settings,viewMode]);
  useEffect(()=>{safeStore(BADGES_KEY,manualBadges);},[manualBadges]);
  useEffect(()=>{safeStore(DEMERITS_KEY,demerits);},[demerits]);
  useEffect(()=>{safeStore(MANAGED_CATS_KEY,managedCats);},[managedCats]);
  useEffect(()=>{safeStore(DELETED_IDS_KEY,[...deletedIds]);},[deletedIds]);
  useEffect(()=>{safeStore(PROJECTS_KEY,projects);},[projects]);
  useEffect(()=>{safeStore(MANAGED_CLIENTS_KEY,managedClients);},[managedClients]);
  useEffect(()=>{safeStore(CUSTOM_TEAM_KEY,customTeam);},[customTeam]);
  useEffect(()=>{safeStore(HOURS_KEY,hours);},[hours]);
  useEffect(()=>{safeStore(PERMISSIONS_KEY,permissions);},[permissions]);
  useEffect(()=>{safeStore(MANUAL_ORDER_KEY,manualOrder);},[manualOrder]);
  useEffect(()=>{safeStore(COLLAPSED_KEY,collapsed);},[collapsed]);
  useEffect(()=>{safeStore(COLLAPSED_CARDS_KEY,[...collapsedCards]);},[collapsedCards]);
  useEffect(()=>{safeStore(EXPANDED_ROWS_KEY,[...expandedRows]);},[expandedRows]);
  useEffect(()=>{safeStore(PENDING_SYNC_KEY,[...pendingSync]);},[pendingSync]);
  useEffect(()=>{safeStore(SYNC_LOG_KEY,syncLog);},[syncLog]);
  useEffect(()=>{const h=document.documentElement;THEMES.forEach(t=>h.classList.remove(t.id));h.classList.add(settings.theme||'theme-foundry');},[settings.theme]);

  // ── Try to restore session from stored token ──
  useEffect(()=>{
    if(!config?.accessToken||user)return;
    (async()=>{
      try{
        const pr=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:`Bearer ${config.accessToken}`}});
        if(!pr.ok)throw new Error('token invalid');
        const p=await pr.json();
        const ok=await crewCheck(config,p.email);
        if(!ok){rejectNonCrew(config.accessToken,p.email);setRestoring(false);return;}
        const member=TEAM.find(t=>t.email===p.email);
        setUser({name:member?.name||p.name,email:p.email});
        setRestoring(false);
      }catch{
        // Token invalid, clear it
        setConfig(c=>({...c,accessToken:null,tokenExpiry:null}));
        setRestoring(false);
      }
    })();
  },[]);

  // ── Load Google Sign-In ──
  useEffect(()=>{
    if(!config)return;
    const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;
    s.onload=()=>{
      if(!window.google||!config)return;
      tokenRef.current=window.google.accounts.oauth2.initTokenClient({
        client_id:config.clientId,
        // Identity only: Sheets and Gmail powers live in the backend. Don't fold in older broader grants.
        scope:'openid email profile',include_granted_scopes:false,
        callback:async resp=>{
          // Silent re-auth failure: Google session expired, revoked, or third-party cookies blocked.
          // Don't kick the user out — show a non-disruptive reconnect banner. They can keep reading.
          if(resp.error){
            if(userRef.current)setReconnectNeeded(true);
            return;
          }
          if(resp.access_token){
            const expiry=Date.now()+((resp.expires_in||3600)*1000);
            const c={...HARDCODED_CONFIG,accessToken:resp.access_token,tokenExpiry:expiry};
            // Silent re-auth path: user is already signed in (and was crew-checked), just refresh the token quietly.
            if(configRef.current?.accessToken&&userRef.current){setConfig(c);safeStore(CONFIG_KEY,c);setReconnectNeeded(false);return;}
            const pr=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:`Bearer ${resp.access_token}`}});
            const p=await pr.json();
            // Check before storing the token so non-crew tokens never reach the sync/poll effects.
            const ok=await crewCheck(c,p.email);
            if(!ok){rejectNonCrew(resp.access_token,p.email);return;}
            setConfig(c);safeStore(CONFIG_KEY,c);
            setReconnectNeeded(false);setAuthError('');
            const member=TEAM.find(t=>t.email===p.email);
            const uname=member?.name||p.name;
            setUser({name:uname,email:p.email});
            showToast('Loading tasks...','success');
            setLoading(true);
            try{
              const sheetTasks=await sheetLoad(c);
              if(sheetTasks.length>0){setTasks(sheetTasks);safeStore(TASKS_KEY,sheetTasks);showToast(`Signed in as ${uname} · ${sheetTasks.length} tasks loaded`,'success');}
              else{showToast(`Signed in as ${uname}`,'success');}
            }catch{showToast('Signed in — using local data','success');}
            setLoading(false);
          }
        }
      });
    };
    document.head.appendChild(s);
    return()=>{try{document.head.removeChild(s);}catch{}};
  },[config?.clientId]);

  // A network hiccup falls back to the cached list.
  const crewCheck=async(c,email)=>{let t;try{t=await loadTeam(c);}catch(e){t=TEAM;}if(!t)return false;applyTeam(t);return isCrew(email);};
  const rejectNonCrew=(token,email)=>{
    try{if(window.google&&token)window.google.accounts.oauth2.revoke(token);}catch(e){}
    try{localStorage.removeItem(CONFIG_KEY);}catch(e){}
    setConfig(p=>({...p,accessToken:null,tokenExpiry:null}));setUser(null);
    setAuthError(`${email||'That account'} isn't on the BV crew list. Ask Cam to add you.`);
  };
  const handleSignIn=()=>tokenRef.current?tokenRef.current.requestAccessToken():showToast('Google API loading — try again','error');
  const handleReconnect=()=>{
    if(!tokenRef.current){showToast('Google API still loading — try again','error');return;}
    // Default behavior — uses existing Google session if possible, only prompts if needed.
    try{ tokenRef.current.requestAccessToken(); }
    catch(e){showToast('Reconnect failed — please refresh the page','error');}
  };

  // Proactive token refresh — silently refresh ~5 min before expiry so 401s rarely happen at all.
  useEffect(()=>{
    if(!config?.accessToken||!config?.tokenExpiry||!tokenRef.current)return;
    const leadMs=5*60*1000;
    const delay=Math.max(0,config.tokenExpiry-Date.now()-leadMs);
    const t=setTimeout(()=>{
      try{ tokenRef.current?.requestAccessToken({prompt:'none'}); }catch(e){/* reactive path will handle */}
    },delay);
    return()=>clearTimeout(t);
  },[config?.tokenExpiry]);
  const showToast=(msg,type='')=>setToast({msg,type});

  const logSync=(taskId,status,detail)=>{
    setSyncLog(prev=>[{taskId,status,detail:detail||null,at:Date.now()},...prev].slice(0,50));
  };

  const syncTask=async(task,isNew=false)=>{
    if(!configRef.current?.accessToken||!configRef.current?.sheetId)return false;
    setSyncing(true);
    inFlightSyncRef.current.add(task.id);
    // Mark as pending immediately — survives reloads, gets verified on every refresh.
    setPendingSync(prev=>{const n=new Set(prev);n.add(task.id);return n;});
    let ok=false,lastErr='';
    for(let i=0;i<3&&!ok;i++){
      try{
        if(i>0)await new Promise(r=>setTimeout(r,i*1500));
        await sheetSave(configRef.current,task);
        ok=true;
      }catch(e){
        lastErr=e?.message||String(e);
        if(i===2){showToast('Sync failed — will keep retrying','error');logSync(task.id,'failed',lastErr);}
      }
    }
    if(ok){
      setPendingSync(prev=>{const n=new Set(prev);n.delete(task.id);return n;});
      logSync(task.id,isNew?'appended':'updated');
    }
    inFlightSyncRef.current.delete(task.id);
    setSyncing(false);
    return ok;
  };

  const handleNewTask=async task=>{
    setShowNew(false);setTasks(prev=>[task,...prev]);
    playSound('post');showToast('Task posted! 🎯','success');
    await syncTask(task,true);
    // The backend emails the assignee; it only emails crew addresses.
    if(task.assignedToEmail&&!crewEmail(task.assignedToEmail))showToast(`Task posted — no email sent: ${task.assignedToEmail} isn't on the crew list`,'');
  };

  const handleAccept=async task=>{
    const now=Date.now();
    const updated=tasks.map(t=>t.id===task.id?{...t,acceptedAt:now,accumulatedMs:0,pausedAt:now,autoPausedAt:null,assignedTo:t.assignedTo||user?.name||'Unknown'}:t);
    setTasks(updated);playSound('accept');showToast('Claimed — press ▶ Start when ready','success');
    await syncTask(updated.find(t=>t.id===task.id));
  };

  const handlePause=async task=>{
    const now=Date.now();const elapsed=(task.accumulatedMs||0)+(now-task.acceptedAt);
    const updated=tasks.map(t=>t.id===task.id?{...t,pausedAt:now,accumulatedMs:elapsed}:t);
    setTasks(updated);showToast('Task paused ⏸','');
  };

  const handleResume=async task=>{
    const now=Date.now();
    const isFirstStart=(task.accumulatedMs||0)===0;
    const updated=tasks.map(t=>t.id===task.id?{...t,pausedAt:null,acceptedAt:now,autoPausedAt:null}:t);
    setTasks(updated);playSound('accept');
    showToast(isFirstStart?'Timer started ⏱':'Resumed ▶','success');
    await syncTask(updated.find(t=>t.id===task.id));
  };

  // Force a retry of every task currently in the pending sync queue.
  const handleForceResync=async()=>{
    if(!configRef.current?.accessToken){showToast('Not signed in — cannot sync','error');return;}
    const ids=[...pendingSyncRef.current];
    if(!ids.length){showToast('Nothing pending — all synced ✓','success');return;}
    showToast(`Retrying ${ids.length} pending tasks...`,'');
    for(const id of ids){
      const t=tasksRef.current.find(x=>x.id===id);
      if(!t){setPendingSync(prev=>{const n=new Set(prev);n.delete(id);return n;});continue;}
      logSync(id,'force-retry');
      try{
        await sheetSave(configRef.current,t);
        setPendingSync(prev=>{const n=new Set(prev);n.delete(id);return n;});
        logSync(id,'force-appended');
      }catch(e){
        logSync(id,'force-failed',e?.message||'');
      }
    }
    showToast('Force-resync complete','success');
  };
  const handleClearSyncLog=()=>setSyncLog([]);

  // Admin-only: edit a single field on a task (used by the History view for fixing "Completed by")
  const handleHistoryUpdate=async(taskId,field,value)=>{
    const t=tasksRef.current.find(x=>x.id===taskId);
    if(!t)return;
    const updated={...t,[field]:value};
    setTasks(prev=>prev.map(x=>x.id===taskId?updated:x));
    await syncTask(updated);
  };

  const handleToggleChecklist=async(taskId,itemId)=>{
    const t=tasksRef.current.find(x=>x.id===taskId);
    if(!t)return;
    const checklist=(t.checklist||[]).map(it=>it.id===itemId?{...it,done:!it.done}:it);
    const updated={...t,checklist};
    setTasks(prev=>prev.map(x=>x.id===taskId?updated:x));
    await syncTask(updated);
  };

  const handleDismissAutoPause=async id=>{
    const updated=tasks.map(t=>t.id===id?{...t,autoPausedAt:null}:t);
    setTasks(updated);
    await syncTask(updated.find(t=>t.id===id));
  };

  const handleComplete=async task=>{
    const now=Date.now();
    const runMs=task.pausedAt?0:(now-task.acceptedAt);
    const total=(task.accumulatedMs||0)+runMs;
    const pts=taskPts({...task,duration:total});
    const updated=tasks.map(t=>t.id===task.id?{...t,completedAt:now,duration:total,pausedAt:null,points:pts}:t);
    setTasks(updated);setChaChing(true);playSound('complete');
    showToast(`Done! +${pts} pts · ${fmtDur(total)} 💰`,'success');
    const finished=updated.find(t=>t.id===task.id);
    await syncTask(finished); // backend emails the creator if someone else completed it
  };

  const handleDelete=async id=>{
    const newDeleted=new Set(deletedIds);newDeleted.add(id);
    setDeletedIds(newDeleted);
    setTasks(prev=>prev.filter(t=>t.id!==id));
    setManualOrder(prev=>{const i=prev.indexOf(id);return i===-1?prev:prev.filter(x=>x!==id);});
    playSound('delete');
    if(configRef.current?.accessToken){
      pushingDeletedRef.current=true;
      try{
        await api(configRef.current,'deleteTasks',{ids:[id]});
      }catch(e){/* silent — local state already updated */}
      finally{setTimeout(()=>{pushingDeletedRef.current=false;},1500);}
    }
  };
  const handleClearTasks=()=>{setTasks([]);showToast('All tasks cleared','');};
  const handleClearCompleted=async()=>{
    const completed=tasks.filter(t=>t.completedAt);
    if(!completed.length)return;
    const ids=new Set(completed.map(t=>t.id));
    const newDeleted=new Set([...deletedIds,...ids]);
    setDeletedIds(newDeleted);
    setTasks(prev=>prev.filter(t=>!t.completedAt));
    setManualOrder(prev=>{const filtered=prev.filter(id=>!ids.has(id));return filtered.length===prev.length?prev:filtered;});
    showToast('Cleared completed tasks','success');
    playSound('delete');
    if(configRef.current?.accessToken){
      pushingDeletedRef.current=true;
      try{
        await api(configRef.current,'deleteTasks',{ids:[...ids]});
      }catch(e){/* silent */}
      finally{setTimeout(()=>{pushingDeletedRef.current=false;},1500);}
    }
  };
  const handleSheetRewrite=async()=>{
    if(!config?.accessToken){showToast('Not connected to Sheets','error');return;}
    if(!window.confirm('Rewrite the Tasks sheet? A backup tab is made first.'))return;
    showToast('Backing up and rewriting sheet…','');
    try{const r=await sheetRewrite(configRef.current);showToast(`Sheet rewritten · ${r.count} tasks · backup: ${r.backup} ✓`,'success');doRefresh(configRef.current,true);}
    catch(e){showToast(`Rewrite stopped: ${e.message}. No rows were cleared.`,'error');}
  };
  const handleEditSave=async updated=>{
    setTasks(prev=>prev.map(t=>t.id===updated.id?updated:t));
    setEditTask(null);
    await syncTask(updated);
  };
  const handleSaveClients=async list=>{
    setManagedClients(list);
    if(!configRef.current?.accessToken)return;
    pushingClientsRef.current=true;
    try{ await saveAppConfigKey(configRef.current,'clients',list); }
    catch(e){ showToast('Clients saved locally — sheet sync failed','error'); }
    finally{ setTimeout(()=>{pushingClientsRef.current=false;},1500); }
  };
  const handleSaveCats=async list=>{
    setManagedCats(list);
    if(!configRef.current?.accessToken)return;
    pushingCatsRef.current=true;
    try{ await saveAppConfigKey(configRef.current,'cats',list); }
    catch(e){ showToast('Categories saved locally — sheet sync failed','error'); }
    finally{ setTimeout(()=>{pushingCatsRef.current=false;},1500); }
  };
  const handleSaveProjects=async(client,list)=>{
    const next={...projects,[client]:list};
    setProjects(next);
    if(!configRef.current?.accessToken)return;
    pushingProjectsRef.current=true;
    try{ await saveAppConfigKey(configRef.current,'projects',next); }
    catch(e){ showToast('Projects saved locally — sheet sync failed','error'); }
    finally{ setTimeout(()=>{pushingProjectsRef.current=false;},1500); }
  };
  const handleAddUser=(name,email)=>{if(!allTeam.find(t=>t.email===email))setCustomTeam(prev=>[...prev,{name,email}]);};

  const handlePermissionsChange=async(newPerms)=>{
    setPermissions(newPerms);
    if(!config?.accessToken)return;
    pushingPermsRef.current=true;
    try{ await saveAppConfigKey(configRef.current,'permissions',newPerms); }
    catch(e){ showToast('Permissions saved locally — sheet sync failed','error'); }
    finally{ setTimeout(()=>{pushingPermsRef.current=false;},1500); }
  };

  const handleHoursChange=async(newHours)=>{
    setHours(newHours);
    if(!config?.accessToken)return;
    pushingHoursRef.current=true;
    try{
      await saveAppConfigKey(configRef.current,'hours',newHours);
    }catch(e){
      showToast('Hours saved locally — sheet sync failed','error');
    }finally{
      // Small delay so an in-flight poll doesn't overwrite us between push and refetch
      setTimeout(()=>{pushingHoursRef.current=false;},1500);
    }
  };

  const doRefresh=async(cfg,silent=false)=>{
    if(!cfg?.accessToken||!cfg?.sheetId)return;
    if(!silent)setRefreshing(true);
    try{
      // Fetch sheet + config in parallel so we have the latest deletedIds BEFORE doing the merge.
      // Previously the merge ran with stale local deletedIds, which let ghosts slip through.
      const {tasks:sheetTasks,config:appCfg}=await api(cfg,'load');
      const sheetTeam=parseTeam(appCfg.team);
      if(sheetTeam&&JSON.stringify(sheetTeam)!==JSON.stringify(TEAM))applyTeam(sheetTeam);
      const sheetDeleted=(!pushingDeletedRef.current&&Array.isArray(appCfg.deletedIds))?appCfg.deletedIds:[];
      // Build the authoritative deletedIds set for THIS refresh — union of local + sheet's set.
      const effectiveDeleted=new Set([...deletedIdsRef.current,...sheetDeleted]);
      if(sheetTasks.length>0){
        const unionComments=(localT,sheetT)=>{
          const sheetIds=new Set((sheetT.comments||[]).map(c=>c.id));
          const extras=(localT.comments||[]).filter(c=>!sheetIds.has(c.id));
          if(!extras.length)return sheetT.comments||[];
          return [...(sheetT.comments||[]),...extras].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
        };
        const sheetIdSet=new Set(sheetTasks.map(t=>t.id));
        const localCurrent=tasksRef.current||[];
        // ─── PENDING SYNC RECONCILIATION ───
        // Anything in our pending queue that's now in the sheet → confirmed, remove from queue.
        // Anything in our pending queue that's STILL not in the sheet → retry the append.
        const toConfirm=[];
        const toRetry=[];
        for(const id of pendingSyncRef.current){
          // Skip tasks whose syncTask is currently mid-flight — don't double-append.
          if(inFlightSyncRef.current.has(id))continue;
          if(sheetIdSet.has(id)){
            toConfirm.push(id);
          }else{
            const t=localCurrent.find(x=>x.id===id);
            if(t&&!effectiveDeleted.has(id))toRetry.push(t);
            else toConfirm.push(id); // gone locally or marked deleted — drop from queue
          }
        }
        // Also catch ORPHANS that aren't in the pending queue (legacy or cross-device).
        // Any local task created recently that's not in sheet → treat as pending retry.
        // Same in-flight guard as above.
        const recentOrphans=localCurrent.filter(t=>
          !sheetIdSet.has(t.id)&&
          !effectiveDeleted.has(t.id)&&
          !pendingSyncRef.current.has(t.id)&&
          !inFlightSyncRef.current.has(t.id)&&
          t.createdAt&&(Date.now()-t.createdAt)<24*3600*1000
        );
        if(toConfirm.length){
          setPendingSync(prev=>{const n=new Set(prev);for(const id of toConfirm)n.delete(id);return n;});
          for(const id of toConfirm)logSync(id,'confirmed-via-poll');
        }
        if(toRetry.length){
          setPendingSync(prev=>{const n=new Set(prev);for(const t of toRetry)n.add(t.id);return n;});
        }
        if(recentOrphans.length){
          setPendingSync(prev=>{const n=new Set(prev);for(const t of recentOrphans)n.add(t.id);return n;});
        }
        // Do the task merge.
        setTasks(local=>{
          const visible=sheetTasks.filter(t=>!effectiveDeleted.has(t.id));
          const sheetMapInner=new Map(visible.map(t=>[t.id,t]));
          const localOnly=local.filter(t=>!sheetMapInner.has(t.id)&&!effectiveDeleted.has(t.id));
          const merged=visible.map(st=>{
            const lt=local.find(t=>t.id===st.id);
            if(!lt)return st;
            const activeTimer=lt.acceptedAt&&!lt.completedAt&&!lt.pausedAt;
            const base=activeTimer?lt:st;
            return{...base,comments:unionComments(lt,st)};
          });
          return[...merged,...localOnly];
        });
        // Fire the retries (don't await — they update pendingSync via syncTask).
        const allRetries=[...toRetry,...recentOrphans];
        if(cfg?.accessToken&&allRetries.length>0){
          for(const t of allRetries){
            logSync(t.id,'retry-poll');
            sheetSave(cfg,t).then(()=>{
              setPendingSync(prev=>{const n=new Set(prev);n.delete(t.id);return n;});
              logSync(t.id,'retry-appended');
            }).catch(e=>{
              logSync(t.id,'retry-failed',e?.message||'');
            });
          }
        }
        setCommentTask(prev=>{
          if(!prev)return null;
          const sheetVer=sheetTasks.find(t=>t.id===prev.id);
          if(!sheetVer)return prev;
          return{...sheetVer,comments:unionComments(prev,sheetVer)};
        });
        if(!silent)showToast(`Refreshed — ${sheetTasks.length} tasks${allRetries.length?` (+${allRetries.length} re-syncing)`:''}`,'success');
      }else{
        if(!silent)showToast('Sheet appears empty — keeping local data','');
      }
      // Apply config updates AFTER tasks have been merged with the proper deletedIds.
      if(!pushingHoursRef.current&&appCfg.hours&&typeof appCfg.hours==='object'){
        setHours(prev=>JSON.stringify(prev)===JSON.stringify(appCfg.hours)?prev:appCfg.hours);
      }
      if(!pushingPermsRef.current&&appCfg.permissions&&typeof appCfg.permissions==='object'){
        setPermissions(prev=>JSON.stringify(prev)===JSON.stringify(appCfg.permissions)?prev:appCfg.permissions);
      }
      if(!pushingClientsRef.current&&Array.isArray(appCfg.clients)){
        setManagedClients(prev=>JSON.stringify(prev)===JSON.stringify(appCfg.clients)?prev:appCfg.clients);
      }
      if(!pushingCatsRef.current&&Array.isArray(appCfg.cats)){
        setManagedCats(prev=>JSON.stringify(prev)===JSON.stringify(appCfg.cats)?prev:appCfg.cats);
      }
      if(!pushingProjectsRef.current&&appCfg.projects&&typeof appCfg.projects==='object'){
        setProjects(prev=>JSON.stringify(prev)===JSON.stringify(appCfg.projects)?prev:appCfg.projects);
      }
      if(sheetDeleted.length>0){
        setDeletedIds(prev=>{
          let changed=false;const merged=new Set(prev);
          for(const id of sheetDeleted){if(!merged.has(id)){merged.add(id);changed=true;}}
          return changed?merged:prev;
        });
      }
    }catch{if(!silent)showToast('Refresh failed','error');}
    if(!silent)setRefreshing(false);
  };

  // immediate refresh on sign-in/restore + 2-minute background poll
  useEffect(()=>{
    if(!config?.accessToken)return;
    doRefresh(configRef.current,true);
    pollRef.current=setInterval(()=>doRefresh(configRef.current,true),120000);
    return()=>clearInterval(pollRef.current);
  },[config?.accessToken]);

  const handleSignOut=()=>{
    if(pendingSync.size&&!window.confirm(`${pendingSync.size} task(s) haven't reached the sheet yet and will be lost. Sign out anyway?`))return;
    // Wipe cached crew data on shared devices (effects persist the empties). Settings, badges, demerits stay: they're per-device only.
    setTasks([]);setPendingSync(new Set());setSyncLog([]);setPermissions({});applyTeam([]);
    setUser(null);setShowMenu(false);setConfig(p=>({...p,accessToken:null,tokenExpiry:null}));try{localStorage.removeItem(CONFIG_KEY);}catch(e){}if(window.google)window.google.accounts.oauth2.revoke(config?.accessToken||'');};

  // Storage-full toast (one-time, always listening)
  useEffect(()=>{
    const onStorageFull=()=>showToast('Browser storage is full — local changes may not save','error');
    window.addEventListener('bvb-storage-full',onStorageFull);
    return()=>window.removeEventListener('bvb-storage-full',onStorageFull);
  },[]);

  // Auto-pause timers running across the 8pm boundary (runs immediately + every minute)
  useEffect(()=>{
    if(!user)return;
    const check=()=>{
      const now=Date.now();
      const updates=[];
      for(const t of tasksRef.current){
        const pauseTime=computeAutoPauseTime(t,now);
        if(pauseTime!=null)updates.push({id:t.id,pauseTime});
      }
      if(!updates.length)return;
      setTasks(prev=>prev.map(t=>{
        const u=updates.find(x=>x.id===t.id);
        if(!u)return t;
        const elapsed=(t.accumulatedMs||0)+(u.pauseTime-t.acceptedAt);
        return{...t,pausedAt:u.pauseTime,accumulatedMs:elapsed,autoPausedAt:u.pauseTime};
      }));
      if(configRef.current?.accessToken){
        for(const u of updates){
          const t=tasksRef.current.find(x=>x.id===u.id);
          if(!t)continue;
          const elapsed=(t.accumulatedMs||0)+(u.pauseTime-t.acceptedAt);
          const updated={...t,pausedAt:u.pauseTime,accumulatedMs:elapsed,autoPausedAt:u.pauseTime};
          syncTask(updated);
        }
      }
    };
    check();
    const id=setInterval(check,60000);
    return()=>clearInterval(id);
  },[user]);

  // Auth-expired + visibility resume (only when signed in)
  useEffect(()=>{
    if(!config?.accessToken)return;
    let handled=false;
    const onAuthExpired=()=>{
      if(handled)return;handled=true;
      // Try silent re-auth first — uses the user's existing Google session, no UI prompt.
      if(tokenRef.current){
        try{ tokenRef.current.requestAccessToken({prompt:'none'}); return; }
        catch(e){/* fall through to reconnect banner */}
      }
      // Don't kick to sign-in screen — show a banner; user can keep reading cached data.
      if(userRef.current)setReconnectNeeded(true);
    };
    const onVisible=()=>{if(document.visibilityState==='visible')doRefresh(configRef.current,true);};
    window.addEventListener('bvb-auth-expired',onAuthExpired);
    document.addEventListener('visibilitychange',onVisible);
    return()=>{
      window.removeEventListener('bvb-auth-expired',onAuthExpired);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[config?.accessToken]);

  const handleAddComment=async(taskId,text)=>{
    const comment={id:'c_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),text,authorName:user.name,authorEmail:user.email,createdAt:Date.now()};
    // Optimistic local update so the user sees their comment instantly
    const optimistic=tasks.map(t=>t.id===taskId?{...t,comments:[...(t.comments||[]),comment]}:t);
    setTasks(optimistic);
    const optimisticTask=optimistic.find(t=>t.id===taskId);
    setCommentTask(optimisticTask);
    // Read-merge-write: re-fetch from sheet right before syncing so we don't
    // clobber a comment another device posted in the same window.
    let toSync=optimisticTask;
    if(config?.accessToken){
      try{
        const fresh=await sheetLoad(configRef.current);
        const sheetVer=fresh.find(t=>t.id===taskId);
        if(sheetVer){
          const sheetIds=new Set((sheetVer.comments||[]).map(c=>c.id));
          const localExtras=(optimisticTask.comments||[]).filter(c=>!sheetIds.has(c.id));
          const merged=[...(sheetVer.comments||[]),...localExtras].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
          toSync={...optimisticTask,...sheetVer,comments:merged,
            acceptedAt:optimisticTask.acceptedAt,pausedAt:optimisticTask.pausedAt,
            accumulatedMs:optimisticTask.accumulatedMs,completedAt:optimisticTask.completedAt};
          setTasks(prev=>prev.map(t=>t.id===taskId?toSync:t));
          setCommentTask(prev=>prev&&prev.id===taskId?toSync:prev);
        }
      }catch(e){/* fall back to plain optimistic sync */}
    }
    await syncTask(toSync);
  };

  const handleDrop=(e,col)=>{
    e.preventDefault();
    const id=e.dataTransfer.getData('taskId');if(!id)return;
    const task=tasks.find(t=>t.id===id);if(!task)return;
    const now=Date.now();let updated=tasks;
    if(col==='open')updated=tasks.map(t=>t.id===id?{...t,acceptedAt:null,completedAt:null,pausedAt:null,accumulatedMs:0,points:null}:t);
    else if(col==='inprog'&&!task.acceptedAt)updated=tasks.map(t=>t.id===id?{...t,acceptedAt:now,accumulatedMs:0,pausedAt:now,autoPausedAt:null,assignedTo:t.assignedTo||user?.name||'Unknown'}:t);
    setTasks(updated);setDragOver(null);
  };

  // Filter tasks for Mine view
  const filterFn=t=>!filterMine||(t.assignedTo===user?.name||t.createdBy===user?.name);

  const openTasks=sortTasks(tasks.filter(t=>!t.acceptedAt&&!t.completedAt&&filterFn(t)),sortBy,manualOrder);
  const inProgTasks=sortTasks(tasks.filter(t=>t.acceptedAt&&!t.completedAt&&filterFn(t)),sortBy,manualOrder);
  const doneTasks=sortTasks(tasks.filter(t=>t.completedAt&&filterFn(t)),sortBy==='date'?'date':sortBy,manualOrder);

  const moveTask=(task,direction)=>{
    const sameCol=t=>task.completedAt?!!t.completedAt:(task.acceptedAt&&!task.completedAt)?(!!t.acceptedAt&&!t.completedAt):(!t.acceptedAt&&!t.completedAt);
    const colTasks=sortTasks(tasks.filter(t=>sameCol(t)&&filterFn(t)),sortBy,manualOrder);
    const idx=colTasks.findIndex(t=>t.id===task.id);
    const swap=direction==='up'?idx-1:idx+1;
    if(idx<0||swap<0||swap>=colTasks.length)return;
    const order=[...manualOrder];
    const aId=colTasks[idx].id, bId=colTasks[swap].id;
    // If either task isn't yet in the order array, seed all visible column tasks in their current display order.
    if(order.indexOf(aId)===-1||order.indexOf(bId)===-1){
      colTasks.forEach(t=>{ if(order.indexOf(t.id)===-1)order.push(t.id); });
    }
    const aIdx=order.indexOf(aId), bIdx=order.indexOf(bId);
    [order[aIdx],order[bIdx]]=[order[bIdx],order[aIdx]];
    setManualOrder(order);
    if(sortBy!=='manual')setSortByRaw('manual');
  };

  const cardProps={onAccept:handleAccept,onComplete:handleComplete,onPause:handlePause,onResume:handleResume,onDelete:handleDelete,onComment:setCommentTask,onEdit:setEditTask,onMoveUp:t=>moveTask(t,'up'),onMoveDown:t=>moveTask(t,'down'),onToggleChecklist:handleToggleChecklist,onToggleCollapse:toggleCardCollapse,onToggleExpand:toggleRowExpand,pendingSync,fontSize:settings.fontSize||14,allCats:managedCats};

  if(restoring||(!user&&config?.accessToken))return <div className={settings.theme||'theme-foundry'}><AuthScreen onSignIn={handleSignIn} restoring={true}/></div>;
  if(!user)return <div className={settings.theme||'theme-foundry'}><AuthScreen onSignIn={handleSignIn} restoring={false} error={authError}/></div>;
  if(loading)return(
    <div className={settings.theme||'theme-foundry'} style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',flexDirection:'column',gap:'16px'}}>
      <div className="spinner" style={{width:'28px',height:'28px',borderWidth:'3px'}}/>
      <div style={{fontSize:'13px',fontFamily:'DM Mono,monospace',color:'var(--text2)'}}>Loading tasks from Sheets...</div>
    </div>
  );

  const NAV=[{k:'board',icon:'⊞',label:'Board'},{k:'log',icon:'📋',label:'History'},{k:'scores',icon:'🏆',label:'Scores'},{k:'settings',icon:'⚙️',label:'Settings'}];

  return(
    <div className={`app ${settings.theme||'theme-foundry'}`} onClick={()=>showMenu&&setShowMenu(false)}>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="tb-badge">BV</div>
        <span className="tb-logo">Bagavagabonds</span>
        <div className="tb-sep"/>
        <span className="tb-sub">Warehouse Ops</span>
        <div className="tb-right">
          {syncing?<div className="sync-row"><div className="spinner"/><span>syncing</span></div>:config?.sheetId?<div className="sync-row"><div className="sync-dot"/><span>synced</span></div>:null}
          {NAV.map(v=>(<button key={v.k} className={`tb-tab${view===v.k?' active':''}`} onClick={()=>setView(v.k)}>{v.icon} {v.label}</button>))}
          {userCanCreate(permissions,user.email)&&<button className="new-btn" onClick={()=>setShowNew(true)}>+ New task</button>}
          <div className="tb-av" onClick={e=>{e.stopPropagation();setShowMenu(!showMenu);}}>
            {initials(user.name)}
            {showMenu&&(
              <div className="user-menu" onClick={e=>e.stopPropagation()}>
                <div className="user-info"><div className="user-name">{user.name}</div><div className="user-email">{user.email}</div><span className="user-role">crew</span></div>
                <button className="menu-item danger" onClick={handleSignOut}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RECONNECT BANNER — silent re-auth failed; user can keep reading, click to retry */}
      {reconnectNeeded&&(
        <div className="reconnect-banner">
          <div className="reconnect-banner-msg">⚠ Connection to Google lost. Your changes won't sync until you reconnect.</div>
          <button className="primary" onClick={handleReconnect}>Reconnect</button>
          <button onClick={()=>setReconnectNeeded(false)}>Dismiss</button>
        </div>
      )}

      {/* RESUME BANNER — any of my tasks auto-paused recently */}
      {(()=>{
        const mine=tasks.filter(t=>t.autoPausedAt&&!t.completedAt&&t.assignedTo===user?.name).sort((a,b)=>b.autoPausedAt-a.autoPausedAt);
        if(!mine.length)return null;
        const top=mine[0];const more=mine.length-1;
        return(
          <div className="resume-banner">
            <div className="resume-banner-msg">▶ <b>{top.title}</b> auto-paused at {fmtShort(top.autoPausedAt)} — pick it back up?{more>0?` (+${more} more)`:''}</div>
            <button className="primary" onClick={()=>handleResume(top)}>Resume</button>
            <button onClick={()=>handleDismissAutoPause(top.id)}>Dismiss</button>
          </div>
        );
      })()}

      {/* BOARD VIEW */}
      {view==='board'&&(
        <div className="body-layout">
          <Sidebar tasks={tasks} hours={hours}/>
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight:0}}>
            {/* VIEW CONTROLS */}
            <div className="view-controls">
              <div className="toggle-group">
                <button className={`toggle-btn${viewMode==='cards'?' active':''}`} onClick={()=>setViewMode('cards')}>⊞ Cards</button>
                <button className={`toggle-btn${viewMode==='list'?' active':''}`} onClick={()=>setViewMode('list')}>≡ List</button>
              </div>
              <div className="vc-sep"/>
              <div className="toggle-group">
                <button className={`toggle-btn${!filterMine?' active':''}`} onClick={()=>setFilterMine(false)}>All</button>
                <button className={`toggle-btn mine${filterMine?' active mine':''}`} onClick={()=>setFilterMine(true)}>Mine</button>
              </div>
              <div className="toggle-group vc-status">
                <button className={`toggle-btn${statusFilter==='all'?' active':''}`} onClick={()=>setStatusFilter('all')}>All</button>
                <button className={`toggle-btn${statusFilter==='open'?' active':''}`} onClick={()=>setStatusFilter('open')}>Open</button>
                <button className={`toggle-btn${statusFilter==='inprog'?' active':''}`} onClick={()=>setStatusFilter('inprog')}>Active</button>
                <button className={`toggle-btn${statusFilter==='done'?' active':''}`} onClick={()=>setStatusFilter('done')}>Done</button>
              </div>
              <div className="vc-sep"/>
              <select className="sort-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
                <option value="date">↓ Date</option>
                <option value="name">A–Z Name</option>
                <option value="priority">Priority</option>
                <option value="assignee">Assignee</option>
                <option value="category">Category</option>
                <option value="client">Client</option>
                <option value="project">Project</option>
                {sortBy==='manual'&&<option value="manual">↕ Custom</option>}
              </select>
              <button className="refresh-btn" onClick={()=>doRefresh(config)} disabled={refreshing}>
                {refreshing?<div className="spinner" style={{width:'10px',height:'10px',borderWidth:'1.5px'}}/>:'↻'} Refresh
              </button>
              <div className="vc-count" style={{marginLeft:'auto',fontSize:'9px',fontFamily:'DM Mono,monospace',color:'var(--text3)'}}>
                {filterMine?`Showing your tasks`:`${tasks.length} tasks total`}
              </div>
            </div>

            {/* CARDS MODE */}
            {viewMode==='cards'&&(
              <div className="board-wrap">
                <div className="board">
                  {[
                    {k:'open',  label:'Open',       color:'#7a1c1c',items:openTasks},
                    {k:'inprog',label:'In Progress', color:'#9a6200',items:inProgTasks},
                    {k:'done',  label:'Done',        color:'#285014',items:doneTasks},
                  ].filter(col=>statusFilter==='all'||statusFilter===col.k).map(col=>(
                    <div key={col.k} className={`col-wrap${dragOver===col.k?' drag-over':''}`}
                      onDragOver={e=>{e.preventDefault();setDragOver(col.k);}} onDragLeave={()=>setDragOver(null)} onDrop={e=>handleDrop(e,col.k)}>
                      <div className="col-head" onClick={()=>compactSection(col.items)} title={isSectionCompacted(col.items)?'Expand all':'Compact all (keeps top task expanded)'}>
                        <div className="cdot" style={{background:col.color}}/>
                        <span className="clabel">{col.label}</span>
                        <span className="ccount">{col.items.length}</span>
                        {col.k==='done'&&doneTasks.length>0&&<button className="trash-done-btn" onClick={e=>{e.stopPropagation();handleClearCompleted();}} title="Clear all completed">🗑️</button>}
                        <span className={`col-collapse${isSectionCompacted(col.items)?' closed':' open'}`}>▾</span>
                      </div>
                      <div className="col-body">
                        {col.items.length===0&&<div className="col-empty">{col.k==='done'?'nothing done yet':col.k==='inprog'?'nothing active':'all clear'}</div>}
                        {col.items.map(t=><TaskCard key={t.id} task={t} collapsed={collapsedCards.has(t.id)} {...cardProps}/>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LIST MODE */}
            {viewMode==='list'&&(
              <div className="board-wrap">
                <div className="list-view">
                  {[
                    {k:'open',  label:'Open',       color:'#cc3333',items:openTasks},
                    {k:'inprog',label:'In Progress', color:'#c4682a',items:inProgTasks},
                    {k:'done',  label:'Done',        color:'#4a8a4a',items:doneTasks},
                  ].filter(col=>statusFilter==='all'||statusFilter===col.k).map(col=>(
                    <div key={col.k}>
                      <div className="list-section-head" onClick={()=>compactListSection(col.items)} title={isListSectionCompacted(col.items)?'Collapse top':'Expand top task'}>
                        <div className="list-section-dot" style={{background:col.color}}/>
                        <span className="list-section-label">{col.label}</span>
                        <span className="list-section-count">{col.items.length}</span>
                        {col.k==='done'&&doneTasks.length>0&&<button className="trash-done-btn" onClick={e=>{e.stopPropagation();handleClearCompleted();}} title="Clear all completed">🗑️</button>}
                        <span className={`col-collapse${isListSectionCompacted(col.items)?' closed':' open'}`} style={{marginLeft:'auto'}}>▾</span>
                      </div>
                      {col.items.length===0&&<div style={{fontSize:'11px',color:'var(--text3)',fontFamily:'DM Mono,monospace',padding:'8px 4px 16px',fontStyle:'italic'}}>{col.k==='done'?'nothing done yet':col.k==='inprog'?'nothing active':'all clear'}</div>}
                      {col.items.map(t=><ListRow key={t.id} task={t} expanded={expandedRows.has(t.id)} {...cardProps}/>)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {view==='log'&&<div style={{flex:1,overflowY:'auto'}}><LogView tasks={tasks} config={config} adminUnlocked={adminUnlocked} allTeam={allTeam} onUpdate={handleHistoryUpdate}/></div>}
      {view==='scores'&&<div style={{flex:1,overflowY:'auto'}}><ScoresView tasks={tasks} manualBadges={manualBadges} demerits={demerits}/></div>}
      {view==='settings'&&<div style={{flex:1,overflowY:'auto'}}><SettingsView settings={settings} onSettings={setSettings} onSave={s=>{setSettings(s);showToast('Settings saved ✓','success');}} onClearTasks={handleClearTasks} manualBadges={manualBadges} onManualBadges={setManualBadges} demerits={demerits} onDemerits={setDemerits} showToast={showToast} allTeam={allTeam} customTeam={customTeam} onAddUser={handleAddUser} onRewriteSheet={handleSheetRewrite} hours={hours} onHoursChange={handleHoursChange} permissions={permissions} onPermissionsChange={handlePermissionsChange} isAdmin={isAdmin} adminUnlocked={adminUnlocked} onAdminChange={setAdminUnlocked} pendingSync={pendingSync} syncLog={syncLog} tasks={tasks} onForceResync={handleForceResync} onClearSyncLog={handleClearSyncLog}/></div>}

      {/* MOBILE NAV */}
      <nav className="mobile-nav">
        {NAV.map(v=>(<button key={v.k} className={`mobile-nav-btn${view===v.k?' active':''}`} onClick={()=>setView(v.k)}><span className="mobile-nav-icon">{v.icon}</span><span className="mobile-nav-label">{v.label}</span></button>))}
      </nav>

      {/* MOBILE FAB */}
      <button className="mobile-fab" onClick={()=>setShowNew(true)}>+</button>

      {/* MODALS / OVERLAYS */}
      {showNew&&<NewTaskModal currentUser={user} onClose={()=>setShowNew(false)} onSave={handleNewTask} managedClients={managedClients} managedCats={managedCats} projects={projects} onSaveClients={handleSaveClients} onSaveCats={handleSaveCats} onSaveProjects={handleSaveProjects} allTeam={allTeam} canAssignOthers={userCanAssignOthers(permissions,user.email)}/>}
      {editTask&&<NewTaskModal currentUser={user} onClose={()=>setEditTask(null)} onSave={handleEditSave} managedClients={managedClients} managedCats={managedCats} projects={projects} onSaveClients={handleSaveClients} onSaveCats={handleSaveCats} onSaveProjects={handleSaveProjects} allTeam={allTeam} initialTask={editTask} canAssignOthers={userCanAssignOthers(permissions,user.email)}/>}
      {commentTask&&<CommentDrawer task={commentTask} user={user} onClose={()=>setCommentTask(null)} onAddComment={handleAddComment}/>}
      {lightbox&&(
        <div className="lightbox-overlay" onClick={()=>setLightbox(null)}>
          <img src={lightbox.src} alt="" className="lightbox-img" onClick={e=>e.stopPropagation()}/>
          <button className="lightbox-close" onClick={()=>setLightbox(null)}>✕</button>
          <a href={lightbox.url} target="_blank" rel="noopener noreferrer" className="lightbox-open" onClick={e=>e.stopPropagation()}>Open original ↗</a>
        </div>
      )}
      {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
      {chaChing&&<ChaChing onDone={()=>setChaChing(false)}/>}
    </div>
  );
}

// Clickjacking guard: GitHub Pages can't send frame-ancestors, so refuse to render inside a frame.
if(window.top===window.self)ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
