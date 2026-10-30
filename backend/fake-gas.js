// Test-only fake of the Apps Script services Code.gs uses. Works in Node (backend/test.mjs) and the browser (local stub).
// store = {tabName: 2D array}; tokens = {accessToken: email}. Not deployed.
function makeFakeGas(store, tokens, opts={}){
  const mail=[];
  const width=(g)=>Math.max(16,...g.map(r=>r.length));
  function sheet(name){
    const g=store[name];
    const lastRow=()=>{for(let i=g.length-1;i>=0;i--)if((g[i]||[]).some(v=>v!==''&&v!=null))return i+1;return 0;};
    const range=(r,c,nr,nc)=>({
      getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>{const v=(g[r-1+i]||[])[c-1+j];return v==null?'':v;})),
      setValues:(vals)=>vals.forEach((row,i)=>{g[r-1+i]=g[r-1+i]||[];row.forEach((v,j)=>{g[r-1+i][c-1+j]=v;});}),
      clearContent:()=>{for(let i=0;i<nr;i++){const row=g[r-1+i];if(row)for(let j=0;j<nc;j++)row[c-1+j]='';}},
    });
    return{
      getRange:range, getLastRow:lastRow,
      getDataRange:()=>range(1,1,Math.max(lastRow(),1),Math.max(2,...g.map(x=>x.length))),
      getMaxRows:()=>Math.max(g.length,1000), getMaxColumns:()=>width(g),
      appendRow:(row)=>{g[lastRow()]=row;},
      copyTo:()=>({setName:(n)=>{store[n]=JSON.parse(JSON.stringify(g));}}),
    };
  }
  const ss={
    getSheetByName:(n)=>store[n]?sheet(n):null,
    insertSheet:(n)=>{store[n]=[];return sheet(n);},
    getId:()=>'fake-sheet',
  };
  const cache={};
  return{
    mail,
    SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    CacheService:{getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v;}})},
    UrlFetchApp:{fetch:(url)=>{
      const tok=decodeURIComponent(url.split('access_token=')[1]||'');
      const email=tokens[tok];
      const body=email?{aud:opts.aud||'630423801494-aetvklr9sjscvscpe4tlcrlpuh5j7ccm.apps.googleusercontent.com',email,email_verified:'true',expires_in:'3000'}:{error:'invalid_token'};
      return{getResponseCode:()=>email?200:400,getContentText:()=>JSON.stringify(body)};
    }},
    MailApp:{sendEmail:(m)=>mail.push(m)},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:(s)=>({setMimeType:()=>({text:s})})},
    Utilities:{
      DigestAlgorithm:{SHA_256:'sha256'},
      computeDigest:(_,s)=>Array.from(String(s)).map(c=>c.charCodeAt(0)),
      base64Encode:(b)=>b.join('.'),
      formatDate:(d,_,f)=>f==='yyyy-MM'?d.toISOString().slice(0,7):d.toISOString(),
    },
    Session:{getScriptTimeZone:()=>'America/Los_Angeles'},
    console,
  };
}
if(typeof module!=='undefined')module.exports={makeFakeGas};
