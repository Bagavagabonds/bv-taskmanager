// BV Task Board backend (SECURITY_PLAN Phase 2). Bound to the task sheet, deployed as a web app:
// Execute as: Me (cam@bagavagabonds.com) · Who has access: Anyone.
// Phones send {action, payload, token} where token is a Google access token with only "openid email profile".
// This script checks it with Google, checks the Config "team" list, then does the sheet work under a lock.
// Paste this file into Extensions → Apps Script; see backend/DEPLOY.md.

const CLIENT_ID   = '630423801494-aetvklr9sjscvscpe4tlcrlpuh5j7ccm.apps.googleusercontent.com';
const ADMIN_EMAIL = 'cam@bagavagabonds.com';
const APP_URL     = 'https://bagavagabonds.github.io/bv-taskmanager/';
const HEADERS = ['Task ID','Title','Description','Category','Priority','Client','Deadline','Requested By','Assigned To','Created At','Accepted At','Completed At','Duration','Points','Month','_json'];
const CONFIG_KEYS = { // who may write each Config key from the app
  clients:'crew', cats:'crew', projects:'crew', hours:'admin', permissions:'admin', team:'admin',
};
const BACKUP_FOLDER = 'BV Task Board backups', BACKUP_DAYS = 30;

function err(code,msg){ const e=new Error(msg); e.code=code; return e; }

function doPost(e){
  let out;
  try{
    const req=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');
    const handler=ACTIONS[req.action];
    if(!handler)throw err(400,'unknown action');
    const email=verifyToken(req.token);
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const cfg=readConfig(ss);
    const team=parseTeam(cfg.team)||[];
    const me=team.find(m=>m.email.toLowerCase()===email);
    const isAdmin=email===ADMIN_EMAIL;
    if(!me&&!isAdmin)throw err(403,'not on the crew list');
    const ctx={ss,email,isAdmin,name:me?me.name:'Cam',team,cfg};
    out={ok:true,data:handler(ctx,req.payload||{})};
  }catch(x){
    out={ok:false,code:x.code||500,error:String(x.message||x)};
    if(!x.code)console.error(x);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ── AUTH ──
function verifyToken(token){
  if(typeof token!=='string'||token.length<20||token.length>4096)throw err(401,'no token');
  const key='t:'+Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token));
  const cache=CacheService.getScriptCache();
  const hit=cache.get(key);
  if(hit)return hit;
  const r=UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token='+encodeURIComponent(token),{muteHttpExceptions:true});
  if(r.getResponseCode()!==200)throw err(401,'token rejected');
  const info=JSON.parse(r.getContentText());
  // aud check: only tokens issued to OUR app count, not any Google token for this person.
  if(info.aud!==CLIENT_ID||String(info.email_verified)!=='true'||!info.email)throw err(401,'token not for this app');
  const email=String(info.email).toLowerCase();
  const ttl=Math.min(300,parseInt(info.expires_in,10)||0);
  if(ttl>10)cache.put(key,email,ttl);
  return email;
}

// ── SHEET HELPERS ──
function tab(ss,name,headers){
  let sh=ss.getSheetByName(name);
  if(!sh){sh=ss.insertSheet(name);sh.getRange(1,1,1,headers.length).setValues([headers]);}
  return sh;
}
function readConfig(ss){
  const sh=tab(ss,'Config',['key','value']);
  const out={};
  for(const [k,v] of sh.getDataRange().getValues().slice(1)){
    if(!k||v==='')continue;
    try{out[k]=JSON.parse(v);}catch(e){out[k]=v;}
  }
  return out;
}
function writeConfig(ss,key,value){
  const sh=tab(ss,'Config',['key','value']);
  const keys=sh.getRange(1,1,Math.max(sh.getLastRow(),1),1).getValues().map(r=>r[0]);
  const i=keys.indexOf(key);
  const val=typeof value==='string'?value:JSON.stringify(value);
  if(i>0)sh.getRange(i+1,1,1,2).setValues([[key,val]]);
  else sh.getRange(sh.getLastRow()+1,1,1,2).setValues([[key,val]]);
}
function parseTeam(v){ return Array.isArray(v)?v.filter(m=>m&&typeof m.name==='string'&&typeof m.email==='string'):null; }
function crewEmail(team,email){
  const e=String(email||'').trim().toLowerCase();
  const m=e&&team.find(t=>t.email.toLowerCase()===e);
  return m?m.email:null;
}
function userCan(perms,email,flag){ const p=perms&&perms[email]; return !p||p[flag]!==false; }

function fmtDur(ms){if(!ms||ms<0)return'—';const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;if(h>0)return`${h}h ${m}m`;if(m>0)return`${m}m ${sec}s`;return`${sec}s`;}
function fmtTime(ms){if(!ms)return'—';return Utilities.formatDate(new Date(ms),Session.getScriptTimeZone(),'MMM d, h:mm a');}
function currentMonth(){return Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM');}
function taskPts(t){return({high:3,med:2,low:1}[t.priority]||1)+(t.duration&&t.duration<600000?1:0);}
function taskRow(t){
  const client=[t.client||'',t.project||''].filter(Boolean).join(' · ');
  return[t.id,t.title,t.desc||'',t.category,t.priority,client,t.deadline||'',t.createdBy,t.assignedTo||'',fmtTime(t.createdAt),fmtTime(t.acceptedAt),fmtTime(t.completedAt),t.duration?fmtDur(t.duration):'',t.points||'',currentMonth(),JSON.stringify(t)];
}
function tasksTab(ss){ return tab(ss,'Tasks',HEADERS); }
// Rows as [{row, id, task}], first occurrence of an id wins (same as the old sheetLoad).
function readTasks(ss){
  const sh=tasksTab(ss);
  const last=sh.getLastRow();
  if(last<2)return[];
  const vals=sh.getRange(2,1,last-1,16).getValues();
  const seen={},out=[];
  vals.forEach((r,i)=>{
    let t=null;
    if(r[15]){try{t=JSON.parse(r[15]);}catch(e){}}
    if(!t&&r[0])t={id:String(r[0]),title:r[1]||'',desc:r[2]||'',category:r[3]||'other',priority:r[4]||'med',client:r[5]||'',deadline:r[6]||'',createdBy:r[7]||'',assignedTo:r[8]||'',createdAt:Date.now(),acceptedAt:null,completedAt:null,duration:null,pausedAt:null,accumulatedMs:0,points:parseInt(r[13],10)||null,comments:[]};
    if(t&&t.id&&!seen[t.id]){seen[t.id]=1;out.push({row:i+2,id:t.id,task:t});}
  });
  return out;
}
function withLock(fn){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw err(503,'busy, try again');
  try{return fn();}finally{lock.releaseLock();}
}
function audit(ctx,action,id,summary){
  tab(ctx.ss,'Audit',['when','email','action','task id','summary']).appendRow([new Date(),ctx.email,action,id||'',String(summary||'').slice(0,200)]);
}
function sendMail(to,subject,body,replyTo){
  try{MailApp.sendEmail({to,subject:subject.replace(/[\r\n]+/g,' '),body,name:'BV Task Board',replyTo:replyTo||undefined});}
  catch(e){console.warn('mail',e);}
}
function unionComments(a,b){
  const all=(a||[]).concat(b||[]),seen={},out=[];
  for(const c of all){if(c&&c.id&&!seen[c.id]){seen[c.id]=1;out.push(c);}}
  return out.sort((x,y)=>(x.createdAt||0)-(y.createdAt||0));
}

// ── ACTIONS ──
const ACTIONS={
  // Crew check at sign-in: just the list (the caller already passed the crew check to get here).
  team(ctx){ return ctx.team; },

  load(ctx){ return {tasks:readTasks(ctx.ss).map(x=>x.task),config:ctx.cfg}; },

  // Upsert by id inside the lock: no more "two people post at once and one row gets overwritten".
  saveTask(ctx,{task}){
    if(!task||typeof task!=='object'||typeof task.id!=='string'||!task.id||task.id.length>80)throw err(400,'bad task');
    if(JSON.stringify(task).length>45000)throw err(400,'task too large');
    return withLock(()=>{
      const cfg=readConfig(ctx.ss); // fresh inside the lock
      if(Array.isArray(cfg.deletedIds)&&cfg.deletedIds.indexOf(task.id)>=0)return{skipped:'deleted'};
      const perms=cfg.permissions||{};
      const hit=readTasks(ctx.ss).find(x=>x.id===task.id);
      const old=hit&&hit.task;
      let t;
      if(!old){
        if(!ctx.isAdmin&&!userCan(perms,ctx.email,'canCreate'))throw err(403,'you can\'t post tasks');
        const to=String(task.assignedToEmail||'').toLowerCase();
        if(to&&to!==ctx.email&&!ctx.isAdmin&&!userCan(perms,ctx.email,'canAssignOthers'))throw err(403,'you can only assign tasks to yourself');
        t=Object.assign({},task,{createdBy:ctx.name,createdByEmail:ctx.email});
        t.points=t.completedAt?taskPts(t):null;
      }else if(old.completedAt&&!ctx.isAdmin){
        t=Object.assign({},old,{comments:unionComments(old.comments,task.comments)}); // done tasks: crew can only comment
      }else{
        t=Object.assign({},task,{createdBy:old.createdBy,createdByEmail:old.createdByEmail,createdAt:old.createdAt,comments:unionComments(old.comments,task.comments)});
        if(!ctx.isAdmin)t.points=t.completedAt?taskPts(t):null;
      }
      const sh=tasksTab(ctx.ss);
      let row=hit?hit.row:0;
      if(!row){const col=sh.getRange(1,1,Math.max(sh.getLastRow(),1),1).getValues();row=1;col.forEach((r,i)=>{if(r[0])row=i+1;});row++;}
      sh.getRange(row,1,1,16).setValues([taskRow(t)]);
      audit(ctx,old?'update':'create',t.id,t.title);
      if(!old){
        const to=crewEmail(ctx.team,t.assignedToEmail);
        if(to)sendMail(to,`[BV Tasks] New task: ${t.title}`,`Hi ${t.assignedTo||'there'},\n\nNew task on the Bagavagabonds board:\n\nTitle: ${t.title}\nClient: ${t.client||'General'}\nCategory: ${t.category}\nPriority: ${String(t.priority||'').toUpperCase()}${t.deadline?`\nDeadline: ${t.deadline}`:''}\n${t.desc?`\nDetails: ${t.desc}\n`:''}\nRequested by: ${t.createdBy}\n\n${APP_URL}\n\n— Bagavagabonds Task Board`,ctx.email);
      }
      if(t.completedAt&&!(old&&old.completedAt)){
        const to=crewEmail(ctx.team,t.createdByEmail);
        if(to&&to.toLowerCase()!==ctx.email)sendMail(to,`[BV Tasks] Completed: ${t.title}`,`Hi ${t.createdBy||'there'},\n\nYour task has been completed.\n\nTitle: ${t.title}\nCompleted by: ${ctx.name}\nTime spent: ${t.duration?fmtDur(t.duration):'—'}\nPoints: +${t.points||0}${t.client?`\nClient: ${t.client}`:''}\n${t.desc?`\nDetails: ${t.desc}\n`:''}\n${APP_URL}\n\n— Bagavagabonds Task Board`,ctx.email);
      }
      return{task:t};
    });
  },

  // Same rule as today: any crew member can delete. Row cleared + id tombstoned in one locked step.
  deleteTasks(ctx,{ids}){
    if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(i=>typeof i!=='string'))throw err(400,'bad ids');
    return withLock(()=>{
      const sh=tasksTab(ctx.ss);
      const rows=readTasks(ctx.ss);
      for(const id of ids){const h=rows.find(x=>x.id===id);if(h){sh.getRange(h.row,1,1,16).clearContent();audit(ctx,'delete',id,h.task.title);}}
      const d=readConfig(ctx.ss).deletedIds,deleted=Array.isArray(d)?d:[];
      const next=deleted.concat(ids.filter(i=>deleted.indexOf(i)<0));
      writeConfig(ctx.ss,'deletedIds',next);
      return{deletedIds:next};
    });
  },

  setConfig(ctx,{key,value}){
    const who=CONFIG_KEYS[key];
    if(!who)throw err(400,'unknown key');
    if(who==='admin'&&!ctx.isAdmin)throw err(403,'admin only');
    const ok=key==='team'?parseTeam(value):(key==='clients'||key==='cats')?Array.isArray(value):(value&&typeof value==='object'&&!Array.isArray(value));
    if(!ok)throw err(400,'bad value');
    if(JSON.stringify(value).length>45000)throw err(400,'value too large');
    return withLock(()=>{writeConfig(ctx.ss,key,key==='team'?parseTeam(value):value);audit(ctx,'config',key,'');return{};});
  },

  // Admin: tidy the Tasks tab. Backup tab first, write before clear (same safety as the old client version).
  rewrite(ctx){
    if(!ctx.isAdmin)throw err(403,'admin only');
    return withLock(()=>{
      const sh=tasksTab(ctx.ss);
      const name='Tasks backup '+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HHmmss');
      sh.copyTo(ctx.ss).setName(name);
      const tasks=readTasks(ctx.ss).map(x=>x.task);
      if(!tasks.length)throw err(500,'Sheet read came back empty');
      const st=t=>t.completedAt?2:t.acceptedAt?1:0;
      tasks.sort((a,b)=>st(a)-st(b)||(b.createdAt||0)-(a.createdAt||0));
      sh.getRange(2,1,tasks.length,16).setValues(tasks.map(taskRow));
      const last=tasks.length+1,maxR=sh.getMaxRows(),maxC=sh.getMaxColumns();
      if(maxR>last)sh.getRange(last+1,1,maxR-last,maxC).clearContent();
      if(maxC>16)sh.getRange(2,17,last-1,maxC-16).clearContent();
      audit(ctx,'rewrite','',`${tasks.length} tasks, backup ${name}`);
      return{count:tasks.length,backup:name};
    });
  },
};

// ── NIGHTLY BACKUP ── run setup() once from the editor to install the 2am trigger.
function setup(){
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='nightlyBackup').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('nightlyBackup').timeBased().everyDays(1).atHour(2).create();
  nightlyBackup();
}
function nightlyBackup(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const it=DriveApp.getFoldersByName(BACKUP_FOLDER);
  const folder=it.hasNext()?it.next():DriveApp.createFolder(BACKUP_FOLDER);
  DriveApp.getFileById(ss.getId()).makeCopy(`BV Tasks ${Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd')}`,folder);
  const cutoff=Date.now()-BACKUP_DAYS*864e5,files=folder.getFiles();
  while(files.hasNext()){const f=files.next();if(f.getDateCreated().getTime()<cutoff)f.setTrashed(true);}
}
