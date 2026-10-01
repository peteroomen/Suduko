export const STORAGE_KEY = 'paper-sudoku-v1';
export const defaults = {
  theme:'auto',sound:false,ambience:'off',sfxVolume:.6,ambienceVolume:.3,timer:true,conflicts:true,cleanup:true,haptics:false,reducedMotion:false
}
;
export function freshState(){
  return {
    version:1,settings:{
      ...defaults
    }
    ,active:{
      9:null,16:null
    }
    ,lastMode:9,games:[],journey:{
      9:1,16:1
    }
  }
}
const difficulties=['beginner','easy','medium','hard','expert'];
let recoveryText=null;
export const getRecoveryText=()=>recoveryText;
export function resetRecovery(){
  recoveryText=null
}
const fail=()=>{
  throw new Error('This is not a valid Paper Sudoku backup. Your existing pages have not changed.')
}
;
function valuesOK(a,n){
  return Array.isArray(a)&&a.length===n*n&&a.every(v=>Number.isInteger(v)&&v>=0&&v<=n)
}
function notesOK(notes,n){
  return notes&&typeof notes==='object'&&!Array.isArray(notes)&&Object.entries(notes).every(([i,a])=>/^\d+$/.test(i)&&Number(i)<n*n&&Array.isArray(a)&&a.length<=n&&new Set(a).size===a.length&&a.every(v=>Number.isInteger(v)&&v>0&&v<=n))
}
function snapshotOK(s,n){
  return s&&valuesOK(s.values,n)&&notesOK(s.notes,n)&&Object.entries(s.notes).every(([i,a])=>!a.length||!s.values[Number(i)])
}
function solvedGrid(a,n){
  const k=Math.sqrt(n);
  for(let x=0;x<n;x++){
    const row=new Set(),col=new Set(),box=new Set();
    for(let y=0;y<n;y++){
      row.add(a[x*n+y]);
      col.add(a[y*n+x]);
      box.add(a[(Math.floor(x/k)*k+Math.floor(y/k))*n+(x%k)*k+y%k])
    }
    if(row.size!==n||col.size!==n||box.size!==n||row.has(0)||col.has(0)||box.has(0))return false
  }
  return true
}
export function validateState(data){
   if(!data||data.version!==1||!Array.isArray(data.games)||data.games.length>1000||!data.settings||!data.active||!data.journey)fail();
   if(data.lastMode===undefined)data.lastMode=9;
  if(![9,16].includes(data.lastMode))fail();
   const s=data.settings;
   if(!['auto','light','dark'].includes(s.theme)||!['off','rain','library'].includes(s.ambience))fail();
   for(const key of ['sound','timer','conflicts','cleanup','haptics','reducedMotion'])if(typeof s[key]!=='boolean')fail();
   for(const key of ['sfxVolume','ambienceVolume'])if(typeof s[key]!=='number'||s[key]<0||s[key]>1)fail();
   const ids=new Set();
   for(const g of data.games){
     const n=g.size;
    if(![9,16].includes(n)||typeof g.id!=='string'||g.id.length>180||ids.has(g.id)||!difficulties.includes(g.difficulty)||!valuesOK(g.givens,n)||!valuesOK(g.solution,n)||!solvedGrid(g.solution,n)||!snapshotOK(g,n))fail();
    ids.add(g.id);
     if(g.givens.some((v,i)=>v&&(v!==g.solution[i]||v!==g.values[i])))fail();
     if(!Number.isInteger(g.selected)||g.selected<0||g.selected>=n*n||!Number.isFinite(g.elapsed)||g.elapsed<0||g.elapsed>315360000||typeof g.assisted!=='boolean'||!['practice','daily','journey','replay'].includes(g.kind)||!['active','complete'].includes(g.status)||typeof g.seed!=='string'||g.seed.length>180||!Number.isFinite(g.created)||g.created<0)fail();
     if(g.kind==='daily'&&(!/^\d{4}-\d{2}-\d{2}$/.test(g.date)||!Number.isFinite(Date.parse(g.date))))fail();
     if(g.paused!==undefined&&typeof g.paused!=='boolean')fail();
     if(g.status==='complete'&&(!Number.isFinite(g.completed)||!g.values.every((v,i)=>v===g.solution[i])))fail();
     if(!Array.isArray(g.undo)||!Array.isArray(g.redo)||g.undo.length>300||g.redo.length>300||![...g.undo,...g.redo].every(x=>snapshotOK(x,n)&&g.givens.every((v,i)=>!v||x.values[i]===v)))fail();
     if(g.rating&&(!['object'].includes(typeof g.rating)||typeof g.rating.label!=='string'||g.rating.label.length>140))fail();
  }
   for(const n of [9,16]){
    if(data.active[n]!==null&&!data.games.some(g=>g.id===data.active[n]&&g.size===n))fail();
    if(!Number.isInteger(data.journey[n])||data.journey[n]<1||data.journey[n]>10000)fail()
  }
   // Keep only known settings; imported data cannot introduce executable preferences.
   data.settings=Object.fromEntries(Object.keys(defaults).map(k=>[k,s[k]]));
  return data;
}
export function loadState(){
  let raw;
  try{
    raw=localStorage.getItem(STORAGE_KEY);
    return {
      state:raw?validateState(JSON.parse(raw)):freshState(),error:null
    }
  }
  catch(error){
    recoveryText=raw||null;
    return {
      state:freshState(),error:'Your saved pages could not be read. The original save is protected. Export the recovery file in Settings, then import a valid backup or clear data to enable saving.'
    }
  }
}
export function saveState(state){
  if(recoveryText!==null)return 'Saving is paused to protect an unreadable save. Export the recovery file in Settings, then import a backup or clear data.';
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    return null
  }
  catch(error){
    return 'Your latest changes could not be saved on this device. Storage may be full or unavailable. Export a backup now to keep this page.'
  }
}
export function parseBackup(raw){
  if(typeof raw!=='string'||raw.length>8000000)fail();
  return validateState(JSON.parse(raw))
}
export function exportText(state){
  return JSON.stringify(state,null,2)
}
