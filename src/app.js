import { createQuestUI } from './quest-ui.js';
import {
  createPuzzle
}
 from './puzzle-service.js';
import {
  getCandidates,getConflicts,getHint
}
 from './engine.js';
import {
  audio
}
 from './audio.js';
import {
  loadState,saveState,freshState,parseBackup,exportText,STORAGE_KEY,getRecoveryText,resetRecovery
}
 from './storage.js';
const loaded=loadState();
let state=loaded.state,saveError=loaded.error;
const root=document.getElementById('app');
const levels=['beginner','easy','medium','hard','expert'];
let size=state.lastMode||9,page='play',noteMode=false,focus=true,quadrant=(()=>{
  const g=state.games.find(g=>g.id===state.active[state.lastMode||9]);return g?Math.floor(Math.floor(g.selected/g.size)/8)*2+Math.floor(g.selected%g.size/8):0
}
)(),paused=!!state.games.find(g=>g.id===state.active[state.lastMode||9])?.paused,autoPaused=false,message='',hint=null,busy=false,dailyDate=today(),journalDifficulty='all',journalAssistance='all',dialogReturn=null,saveTimer;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}
[c]));
const symbol=v=>v?(v<10?String(v):String.fromCharCode(55+v)):'';
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
function today(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function clock(t){
  t=Math.floor(t);
  return `${Math.floor(t/3600)?Math.floor(t/3600)+':':''}${String(Math.floor(t/60)%60).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`
}
function dateLabel(date){
  return new Date(date+'T12:00:00').toLocaleDateString(undefined,{
    weekday:'long',month:'long',day:'numeric'
  }
  )
}
const icons={
  sound:'<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',mute:'<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="m16 9 5 6m0-6-5 6"/>',play:'<path d="m8 5 11 7-11 7Z"/>',pause:'<path d="M8 5v14M16 5v14"/>',undo:'<path d="m8 5-5 5 5 5M3 10h10a7 7 0 0 1 7 7"/>',redo:'<path d="m16 5 5 5-5 5m5-5H11a7 7 0 0 0-7 7"/>',erase:'<path d="m14 4 7 7-10 10H6l-4-4Z"/><path d="m8 11 7 7M11 21h10"/>',pencil:'<path d="m16 3 5 5L7 22l-5 1 1-5Z"/><path d="m13 6 5 5"/>',hint:'<path d="M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7M8 18h8m-7 3h6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-12 4h.01M15 15h.01"/>',book:'<path d="M12 6v15M3 3c4-1 7 0 9 3 2-3 5-4 9-3v16c-4-1-7 0-9 2-2-2-5-3-9-2Z"/>',settings:'<path d="M3 6h5m5 0h8M3 12h10m5 0h3M3 18h3m5 0h10"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>'
}
;
const icon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[k]||icons.pencil}</svg>`;
const game=()=>state.games.find(g=>g.id===state.active[size]);
const questUI=createQuestUI({
  getRun:()=>state.quest,setRun:run=>{state.quest=run},save:()=>persist(),render:()=>render(),sound,
  confirmRestart:start=>showDialog('Start a fresh adventure?', '<p>This ends your current Pencil Quest run. Your Classic and Super pages stay saved.</p>',[
    {text:'Keep this run',action:closeDialog},
    {text:'Start over',primary:true,action:()=>{closeDialog();start()}}
  ])
});

function persist(immediate=true){
  if(!immediate){
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>persist(),500);
    return
  }
  clearTimeout(saveTimer);
  saveError=saveState(state);
  if(saveError)renderError()
}
function renderError(){
  let el=root.querySelector('.error-banner');
  if(saveError){
    if(!el){
      el=document.createElement('div');
      el.className='error-banner';
      el.setAttribute('role','alert');
      root.querySelector('.app')?.prepend(el)
    }
    if(el)el.textContent=saveError
  }
  else el?.remove()
}
function settingsApply(){
  const dark=state.settings.theme==='dark'||state.settings.theme==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark',dark);
  document.documentElement.classList.toggle('reduced',state.settings.reducedMotion);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content',dark?'#28232d':'#f6f2e9');
  audio.setSettings(state.settings);
  if(activeTimer()||page==='quest'&&state.quest?.phase==='battle'&&!document.hidden&&!root.querySelector('dialog[open]'))audio.resume();
  else audio.suspend()
}
function activeTimer(){
  return !busy&&page==='play'&&game()&&game().status==='active'&&!paused&&!autoPaused&&!document.hidden&&!root.querySelector('dialog[open]')
}
function sound(type){
  audio.play(type);
  if(state.settings.haptics&&navigator.vibrate)navigator.vibrate(type==='complete'?[15,30,15]:8)
}
function peer(a,b,n=size){
  let k=Math.sqrt(n);
  return Math.floor(a/n)===Math.floor(b/n)||a%n===b%n||(Math.floor(a/n/k)===Math.floor(b/n/k)&&Math.floor(a%n/k)===Math.floor(b%n/k))
}
function snapshot(g){
  return {
    values:[...g.values],notes:structuredClone(g.notes)
  }
}
function checkpoint(g){
  g.undo.push(snapshot(g));
  if(g.undo.length>200)g.undo.shift();
  g.redo=[]
}
function navigateCell(index){
  const g=game();
  g.selected=index;
  if(size===16&&focus)quadrant=Math.floor(Math.floor(index/size)/8)*2+Math.floor(index%size/8);
  hint=null;
  message=`Row ${Math.floor(index/size)+1} · column ${index%size+1}${g.givens[index]?' · printed clue':''}`;
  persist(false);
  render()
}
function completeCheck(g){
  if(g.values.every((v,i)=>v===g.solution[i])){
    g.status='complete';
    g.completed=Date.now();
    g.undo=[];
    g.redo=[];
    if(g.kind==='journey')state.journey[g.size]=Math.max(state.journey[g.size],(g.journeyStep||1)+1);
    sound('complete');
    message='Beautifully done. Another page finished.';
    hint=null;
    persist();
    render();
    showDialog('A page well spent.',`<p>You completed ${g.size} × ${g.size} · ${cap(g.difficulty)} in <strong>${clock(g.elapsed)}</strong>.</p><p>${g.assisted?'With thoughtful hints. Every step counts.':'Without hints. A little patience goes a long way.'}</p>`,[{
      text:'Enjoy the page',action:closeDialog,primary:true
    }
    ,{
      text:'Another puzzle',action:()=>{
        closeDialog();newGameDialog()
      }
    }
    ]);
    return true
  }
  return false
}
function enter(value){
  const g=game();
  if(!g||busy||paused||autoPaused||g.status!=='active')return;
  if(g.givens[g.selected]){
    message='Choose an open square to write in.';
    render();
    return
  }
  const i=g.selected;
  checkpoint(g);
  if(noteMode&&value){
    g.values[i]=0;
    const a=g.notes[i]||[];
    g.notes[i]=a.includes(value)?a.filter(v=>v!==value):[...a,value].sort((a,b)=>a-b);
    if(!g.notes[i].length)delete g.notes[i]
  }
  else{
    g.values[i]=value;
    delete g.notes[i];
    if(value&&state.settings.cleanup)for(const key of Object.keys(g.notes))if(peer(i,Number(key)))g.notes[key]=g.notes[key].filter(v=>v!==value)
  }
  hint=null;
  sound(value?'write':'erase');
  message=noteMode&&value?'Pencil marks updated.':value?`Wrote ${symbol(value)}.`:'Square erased.';
  persist();
  if(!completeCheck(g))render()
}
function historyMove(which){
  const g=game();
  if(!g||g.status!=='active'||paused||autoPaused||!g[which].length)return;
  const other=which==='undo'?'redo':'undo';
  g[other].push(snapshot(g));
  const s=g[which].pop();
  g.values=s.values;
  g.notes=s.notes;
  hint=null;
  message=which==='undo'?'Last change undone.':'Change restored.';
  persist();
  render()
}
function hintRequest(){
  const g=game();
  if(!g||g.status!=='active'||paused||autoPaused)return;
  const wrong=g.values.findIndex((v,i)=>v&&!g.givens[i]&&v!==g.solution[i]);
  hint=wrong>=0?{
    type:'correction',title:'Review this entry',explanation:`The entry at row ${Math.floor(wrong/size)+1}, column ${wrong%size+1} does not match this puzzle’s unique solution. Erase it, then work from the remaining candidates.`,cells:[wrong],eraseIndex:wrong
  }
  :getHint(g.values,size,g.notes);
  if(hint){
    g.assisted=true;
    const index=hint.index??hint.cells?.[0];
    if(Number.isInteger(index)){
      g.selected=index;
      if(size===16)quadrant=Math.floor(Math.floor(index/16)/8)*2+Math.floor(index%16/8)
    }
    message='A thoughtful nudge. This page is now marked assisted.';
    persist()
  }
  else message='No supported logical step found. Check your entries and pencil marks.';
  render()
}
function hintApply(){
  const g=game();
  if(!hint||!g||g.status!=='active')return;
  checkpoint(g);
  if(Number.isInteger(hint.eraseIndex)){
    g.values[hint.eraseIndex]=0;
    delete g.notes[hint.eraseIndex]
  }
  else if(Number.isInteger(hint.index)&&hint.value){
    g.values[hint.index]=hint.value;
    delete g.notes[hint.index];
    if(state.settings.cleanup)for(const key of Object.keys(g.notes))if(peer(hint.index,Number(key)))g.notes[key]=g.notes[key].filter(v=>v!==hint.value)
  }
  else if(hint.eliminations){
    for(let i=0;i<size*size;i++)if(!g.values[i]&&!g.notes[i]?.length)g.notes[i]=getCandidates(g.values,size,i);
    for(const item of hint.eliminations)if(g.notes[item.index])g.notes[item.index]=g.notes[item.index].filter(v=>!item.values.includes(v))
  }
  else{
    g.undo.pop();
    return
  }
  hint=null;
  g.assisted=true;
  sound('write');
  message='Hint step applied.';
  persist();
  if(!completeCheck(g))render()
}
async function startPuzzle({
  difficulty='beginner',kind='practice',date,journeyStep,seed
}
){
  if(state.games.length>=1000){
    showDialog('Your journal is full.', '<p>This device holds 1,000 saved pages. Export a backup to keep your journal, then clear saved data to start a fresh volume.</p>',[{
      text:'Close',action:closeDialog
    }
    ,{
      text:'Export backup',primary:true,action:()=>exportBackup()
    }
    ]);
    return
  }
  const mode=size;
  busy=true;
  hint=null;
  message='';
  closeDialog();
  page='play';
  render();
  try{
    const puzzle=await createPuzzle({
      size:mode,difficulty,seed:seed||`practice:${Date.now()}:${Math.random().toString(36).slice(2)}`
    }
    );
    const id=`${puzzle.id}:${Date.now()}:${Math.random().toString(36).slice(2,7)}`;
    const g={
      ...puzzle,id,values:[...puzzle.givens],notes:{
      }
      ,undo:[],redo:[],selected:Math.max(0,puzzle.givens.indexOf(0)),elapsed:0,assisted:false,paused:false,status:'active',kind,created:Date.now(),date:date||null,journeyStep:journeyStep||null
    }
    ;
    state.games.push(g);
    state.active[mode]=id;
    state.lastMode=mode;
    size=mode;
    paused=false;
    autoPaused=false;
    focus=true;
    quadrant=Math.floor(Math.floor(g.selected/mode)/8)*2+Math.floor(g.selected%mode/8);
    noteMode=false;
    message=puzzle.difficulty!==difficulty?`This page was rated ${cap(puzzle.difficulty)} by its solving techniques.`:'A square, a number, a little progress.';
    persist()
  }
  catch(error){
    message='The page could not be opened. Please try again.';
    showDialog('Could not open this page.',`<p>${esc(error.message||message)}</p>`,[{
      text:'Close',action:closeDialog,primary:true
    }
    ])
  }
  finally{
    busy=false;
    render()
  }
}
function resume(id){
  const g=state.games.find(g=>g.id===id);
  if(!g)return;
  state.active[g.size]=id;
  state.lastMode=g.size;
  g.paused=false;
  size=g.size;
  page='play';
  paused=false;
  autoPaused=false;
  hint=null;
  quadrant=Math.floor(Math.floor(g.selected/size)/8)*2+Math.floor(g.selected%size/8);
  persist();
  render()
}
function newGameDialog(){
  const g=game();
  showDialog('Turn a fresh page.',`<p>${g?.status==='active'?'Your current page stays in your journal, ready to resume.':'Choose a pace for your next puzzle.'}</p><label for="new-difficulty">Difficulty<select id="new-difficulty">${levels.map(d=>`<option value="${d}" ${g?.difficulty===d?'selected':''}>${cap(d)}</option>`).join('')}</select></label><p>Difficulty follows the techniques needed to solve a unique puzzle.</p>`,[{
    text:'Keep this page',action:closeDialog
  }
  ,{
    text:'Start puzzle',primary:true,action:()=>startPuzzle({
      difficulty:root.querySelector('#new-difficulty').value
    }
    )
  }
  ])
}
function dailyDifficulty(date){
  return levels[(Math.floor(Date.parse(date+'T12:00:00Z')/86400000)+2)%5]
}
function openDaily(){
  const g=state.games.find(g=>g.kind==='daily'&&g.date===dailyDate&&g.size===size);
  if(g){
    resume(g.id);
    return
  }
  startPuzzle({
    difficulty:dailyDifficulty(dailyDate),kind:'daily',date:dailyDate,seed:`daily-v1:${dailyDate}:${size}`
  }
  )
}
function openJourney(step){
  const g=state.games.find(g=>g.kind==='journey'&&g.journeyStep===step&&g.size===size&&g.status==='active');
  if(g){
    resume(g.id);
    return
  }
  startPuzzle({
    difficulty:levels[Math.min(4,Math.floor((step-1)/3))],kind:'journey',journeyStep:step,seed:`journey-v1:${size}:${step}`
  }
  )
}
function boardHTML(g){
  const n=size,k=Math.sqrt(n),count=n===16&&focus?8:n,rs=n===16&&focus?Math.floor(quadrant/2)*8:0,cs=n===16&&focus?quadrant%2*8:0,conflicts=state.settings.conflicts?new Set(getConflicts(g.values,n)):new Set();
  let html=`<div class="board ${n===16?'super':''} ${n===16&&!focus?'overview':''}" role="group" aria-label="${n} by ${n} Sudoku${n===16&&focus?', section '+(quadrant+1)+' of 4':''}" style="grid-template-columns:repeat(${count},1fr)">`;
  for(let r=0;r<count;r++)for(let c=0;c<count;c++){
    const i=(rs+r)*n+cs+c,v=g.values[i],classes=['cell'];
    if(peer(i,g.selected))classes.push('peer');
    if(v&&v===g.values[g.selected])classes.push('same');
    if(!g.givens[i])classes.push('edit');
    if(hint?.cells?.includes(i))classes.push('hint-cell');
    if(i===g.selected)classes.push('selected');
    if(conflicts.has(i))classes.push('wrong');
    if((cs+c+1)%k===0&&c<count-1)classes.push('edge-r');
    if((rs+r+1)%k===0&&r<count-1)classes.push('edge-b');
    if(c===count-1)classes.push('last-r');
    if(r===count-1)classes.push('last-b');
    const notes=g.notes[i]||[];
    html+=`<button class="${classes.join(' ')}" data-cell="${i}" tabindex="${i===g.selected?0:-1}" aria-pressed="${i===g.selected}" aria-label="Row ${rs+r+1}, column ${cs+c+1}, ${v?symbol(v)+(g.givens[i]?', printed clue':', entered'):'empty'+(notes.length?', notes '+notes.map(symbol).join(', '):'')}${conflicts.has(i)?', conflicting value':''}">${v?symbol(v):notes.length?`<span class="cell-notes" aria-hidden="true">${Array.from({length:n},(_,j)=>`<span>${notes.includes(j+1)?symbol(j+1):''}</span>`).join('')}</span>`:''}</button>`
  }
  return html+'</div>'
}
function playHTML(){
  const g=game();
  if(busy)return '<div class="loading-page" role="status"><div class="spinner"></div>Preparing your page…<p class="muted" style="margin-top:12px">A unique puzzle, a thoughtful pace.</p></div>';
  if(!g)return `<span class="badge">A little space to think</span><h2>The first page is yours.</h2><div class="ticket"><h3>${size===9?'Nine squares. One quiet moment.':'A little more room to think.'}</h3><p class="muted">${size===9?'Classic Sudoku with a gentle paper feel.':'16 × 16 Sudoku. Write 1–9 and A–G, with a larger focus view when you need it.'}</p><button class="primary" data-action="new">Start your first puzzle</button></div><p class="notice">Your pages save on this device. Take your time, make pencil notes, and ask for a hint whenever you like.</p>`;
   const blocked=paused||autoPaused||g.status==='complete',kind=g.kind==='daily'?`Daily · ${g.date}`:g.kind==='journey'?`Journey · page ${g.journeyStep}`:g.kind==='replay'?'Replay':'Practice';
  return `<div class="title"><div><h2>${g.status==='complete'?'A page well spent.':size===9?'A quiet moment':'A little more room'}</h2><div class="meta">${cap(g.difficulty)} · ${esc(kind)}${g.assisted?' · assisted':''}</div></div><div class="time"><span id="clock" ${!state.settings.timer?'hidden':''}>${clock(g.elapsed)}</span>${g.status==='active'?`<button class="round" data-action="pause" aria-label="${paused||autoPaused?'Resume':'Pause'} puzzle">${icon(paused||autoPaused?'play':'pause')}</button>`:''}</div></div>${size===16?`<div class="focus"><button data-action="focus">${focus?'Overview':'Focus view'}</button><span>${focus?'Section '+(quadrant+1)+' / 4':'Tap a square to focus'}</span><div class="focusgroup">${['↖','↗','↙','↘'].map((s,q)=>`<button data-quadrant="${q}" aria-label="Focus ${['top left','top right','bottom left','bottom right'][q]}" aria-pressed="${focus&&quadrant===q}">${s}</button>`).join('')}</div></div>`:''}${paused||autoPaused?'<div class="paused"><h3>Take your time.</h3><p class="muted">Your page will be here.</p><button class="primary" data-action="pause">Resume puzzle</button></div>':boardHTML(g)}${g.status==='complete'?`<div class="hint"><h3>Beautifully done.</h3><p>${g.assisted?'Completed with hints.':'Completed without hints.'} Saved in your journal.</p><button class="primary" data-action="new">Turn a fresh page</button></div>`:`<div class="toolbar">${[['undo','Undo',!g.undo.length],['redo','Redo',!g.redo.length],['erase','Erase',false],['notes',noteMode?'Notes on':'Notes off',false],['hint','Hint',false]].map(([a,label,disabled])=>`<button data-action="${a}" ${a==='notes'?`aria-pressed="${noteMode}"`:''} ${disabled||blocked?'disabled':''}>${icon(a==='notes'?'pencil':a)}${label}</button>`).join('')}</div><div class="keypad ${size===16?'superkeys':''}">${Array.from({length:size},(_,i)=>{const v=i+1,remaining=Math.max(0,size-g.values.filter(x=>x===v).length);return `<button data-value="${v}" aria-label="${noteMode?'Toggle note':'Enter'} ${symbol(v)}, ${remaining} remaining" ${blocked?'disabled':''}>${symbol(v)}<small>${remaining}</small></button>`}).join('')}</div>${hint?`<div class="hint" role="status"><h3>${esc(hint.title)}</h3><p>${esc(hint.explanation)}</p>${hint.value||hint.eliminations?.length||Number.isInteger(hint.eraseIndex)?'<button class="primary" data-action="apply-hint">Apply this step</button>':''}<button class="text-button" data-action="dismiss-hint">Close hint</button></div>`:''}<div class="status" aria-live="polite">${esc(message||'A square, a number, a little progress.')}</div><button class="text-button" data-action="new">New puzzle</button>`}`
}
function dailyHTML(){
  const g=state.games.find(g=>g.kind==='daily'&&g.date===dailyDate&&g.size===size),wins=state.games.filter(g=>g.kind==='daily'&&g.status==='complete'&&g.size===size);
  return `<span class="badge">${esc(dateLabel(dailyDate))}</span><h2>Your daily page.</h2><p class="muted" style="margin-top:9px">One little ritual. A fresh puzzle each day.</p><div class="ticket"><span class="badge">${size===9?'Classic · 9 × 9':'Super · 16 × 16'}</span><h3>${dailyDate===today()?'Today’s little challenge.':'A page from the archive.'}</h3><p class="muted">${cap(dailyDifficulty(dailyDate))} · The same unique puzzle for everyone, all day.</p><button class="primary" data-action="daily">${g?.status==='complete'?'View completed page':g?'Continue daily page':'Open daily page'}</button></div><label class="row"><span>Daily archive<small>Choose any earlier date</small></span><input type="date" aria-label="Daily archive date" id="daily-date" value="${dailyDate}" min="2020-01-01" max="${today()}"></label><p class="notice">${wins.length} daily ${wins.length===1?'page':'pages'} finished · ${dailyStreak()} day streak</p><div class="section"><span class="badge">A gently growing challenge</span><h3>Your journey.</h3><p class="muted" style="margin-top:8px">Three pages at each pace, from beginner to expert. Continue at your own rhythm.</p><div class="journey-grid">${Array.from({length:15},(_,i)=>{const step=i+1,unlocked=step<=state.journey[size],done=state.games.some(g=>g.size===size&&g.kind==='journey'&&g.journeyStep===step&&g.status==='complete');return `<button class="journey-node ${step===state.journey[size]?'current':''}" data-journey="${step}" aria-label="Journey page ${step}, ${levels[Math.floor(i/3)]}, ${done?'complete':unlocked?'available':'locked'}" ${!unlocked?'disabled':''}><strong>${done?'✓':step}</strong><small>${cap(levels[Math.floor(i/3)])}</small></button>`}).join('')}</div>${state.journey[size]>15?`<button class="primary" data-journey="${state.journey[size]}">Continue expert journey · page ${state.journey[size]}</button>`:''}</div>`
}
function dailyStreak(){
  const dates=new Set(state.games.filter(g=>g.size===size&&g.kind==='daily'&&g.status==='complete').map(g=>g.date));
  let d=new Date(today()+'T12:00:00'),count=0;
  if(!dates.has(today()))d.setDate(d.getDate()-1);
  for(let i=0;i<36600;i++){
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if(!dates.has(key))break;
    count++;
    d.setDate(d.getDate()-1)
  }
  return count
}
function journalHTML(){
  const games=state.games.filter(g=>g.size===size&&(journalDifficulty==='all'||g.difficulty===journalDifficulty)&&(journalAssistance==='all'||g.assisted===(journalAssistance==='assisted'))),wins=games.filter(g=>g.status==='complete'),active=games.filter(g=>g.status==='active'),times=wins.map(g=>g.elapsed);
  return `<span class="badge">${size===9?'Classic':'Super'} journal</span><h2>A page at a time.</h2><div class="stats-filters"><select id="journal-difficulty" aria-label="Filter by difficulty"><option value="all">All difficulties</option>${levels.map(d=>`<option value="${d}" ${d===journalDifficulty?'selected':''}>${cap(d)}</option>`).join('')}</select><select id="journal-assistance" aria-label="Filter by hint use">${[['all','All pages'],['unassisted','Without hints'],['assisted','With hints']].map(([v,l])=>`<option value="${v}" ${journalAssistance===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="statgrid"><div class="stat"><span class="meta">Completed</span><strong>${wins.length}</strong></div><div class="stat"><span class="meta">Best time</span><strong>${times.length?clock(Math.min(...times)):'—'}</strong></div><div class="stat"><span class="meta">Average time</span><strong>${times.length?clock(times.reduce((a,b)=>a+b,0)/times.length):'—'}</strong></div><div class="stat"><span class="meta">Daily streak</span><strong>${dailyStreak()} <span style="font-size:14px">days</span></strong></div></div><p class="notice">${wins.length} of ${games.length} pages completed (${games.length?Math.round(wins.length/games.length*100):0}%) · ${wins.filter(g=>!g.assisted).length} wins without hints · ${wins.filter(g=>g.assisted).length} with hints · ${active.length} pages in progress. Streak includes all daily ${size} × ${size} wins.</p><h3 class="section">Your pages</h3>${games.length?`<div class="history-list">${[...games].sort((a,b)=>b.created-a.created).map(g=>`<div class="row"><div>${cap(g.difficulty)} · ${g.kind==='daily'?esc(g.date):g.kind==='journey'?'Journey '+g.journeyStep:cap(g.kind)}<small>${g.status==='complete'?'Finished':'In progress'} · ${clock(g.elapsed)} · ${g.assisted?'with hints':'without hints'}<br>${new Date(g.created).toLocaleDateString()}</small></div><div class="history-actions"><button data-resume="${esc(g.id)}">${g.status==='complete'?'View':'Resume'}</button>${g.status==='complete'?`<button data-replay="${esc(g.id)}">Replay</button>`:''}</div></div>`).join('')}</div>`:`<div class="ticket"><h3>The next page is yours.</h3><p class="muted">${state.games.some(g=>g.size===size)?'No pages match these filters.':'Your finished puzzles and saved pages will live here.'}</p><button class="primary" data-action="new">Open a fresh page</button></div>`}`
}
function toggleRow(key,title,subtitle){
  return `<label class="row"><span>${title}<small>${subtitle}</small></span><input type="checkbox" data-setting="${key}" ${state.settings[key]?'checked':''}></label>`
}
function settingsHTML(){
  return `<span class="badge">Make yourself comfortable</span><h2>Your kind of quiet.</h2><label class="row"><span>Paper theme<small>A softer page after sunset</small></span><select data-setting="theme" aria-label="Paper theme">${[['auto','Automatic'],['light','Light paper'],['dark','Dark paper']].map(([v,l])=>`<option value="${v}" ${state.settings.theme===v?'selected':''}>${l}</option>`).join('')}</select></label>${toggleRow('timer','Show timer','Leave the clock behind')}${toggleRow('conflicts','Highlight conflicts','Underline repeats in rows, columns, or boxes')}${toggleRow('cleanup','Clean up pencil notes','Remove matching notes after you write')}${toggleRow('sound','Writing sounds','Small sounds for little moments')}<label class="row"><span>Writing volume</span><input type="range" data-setting="sfxVolume" aria-label="Writing sound volume" min="0" max="1" step=".05" value="${state.settings.sfxVolume}"></label><label class="row"><span>Ambience<small>A quiet background while you play</small></span><select data-setting="ambience" aria-label="Ambience">${[['off','Silence'],['rain','Soft rain'],['library','Library hush']].map(([v,l])=>`<option value="${v}" ${state.settings.ambience===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="row"><span>Ambience volume</span><input type="range" data-setting="ambienceVolume" aria-label="Ambience volume" min="0" max="1" step=".05" value="${state.settings.ambienceVolume}"></label>${toggleRow('haptics','Gentle haptics','A brief touch response on supported phones')}${toggleRow('reducedMotion','Reduce motion','Keep things still')}<div class="section"><h3>A page in your pocket.</h3><p class="muted" style="margin-top:8px">${offlineReady?'Offline ready. Your puzzles, daily archive, and journey work without a connection.':offlineIssue?'Offline saving is unavailable in this browser. Try an updated browser with a secure connection.':'Install this app for offline play. Open it online first to prepare your offline pages.'}${updateAvailable?' A new version is ready; close all app tabs and reopen to update.':''}</p><button class="secondary" style="margin-top:12px" data-action="install">Install on your phone</button></div><div class="section"><h3>Your saved pages</h3><p class="notice">Pages save on this device. Export a backup to move them to another browser or keep a copy.</p><div class="row"><button class="secondary" data-action="export">Export backup</button><button class="secondary" data-action="import">Import backup</button></div>${getRecoveryText()!==null?'<button class="text-button danger" data-action="recovery">Export protected recovery file</button>':''}<button class="text-button danger" data-action="clear">Clear all saved data</button></div><button class="text-button" data-action="help">How to play & keyboard shortcuts</button><input id="backup-file" type="file" accept=".json,application/json" hidden>`
}
function render(){
  const active=document.activeElement;
  let restore;
  for(const attr of ['data-qcell','data-qvalue','data-quest','data-cell','data-value','data-action','data-setting','id'])if(active?.hasAttribute(attr)&&root.contains(active)&&!active.closest('dialog')){
    restore=[attr,active.getAttribute(attr)];
    break
  }
  const oldDialog=root.querySelector('dialog');
  const open=oldDialog?.open;
  if(oldDialog){
    oldDialog.close();
    oldDialog.remove()
  }
  root.innerHTML=`<div class="app"><header class="top"><div><h1 class="brand">paper sudoku<span>.</span></h1><small class="tagline">A LITTLE SPACE TO THINK</small></div><button class="round" data-action="sound" aria-label="${state.settings.sound?'Turn writing sounds off':'Turn writing sounds on'}" aria-pressed="${state.settings.sound}">${icon(state.settings.sound?'sound':'mute')}</button></header><div class="modes" aria-label="Puzzle size" ${page==='quest'?'hidden':''}><button data-mode="9" aria-pressed="${size===9}"><span>Classic · 9 × 9</span></button><button data-mode="16" aria-pressed="${size===16}"><span>Super · 16 × 16</span></button></div><main class="main" id="main">${({play:playHTML,quest:()=>questUI.html(),daily:dailyHTML,journal:journalHTML,settings:settingsHTML})[page]()}</main><nav class="footer" aria-label="Main navigation">${[['play','pencil','Play'],['quest','hint','Quest'],['daily','calendar','Daily'],['journal','book','Journal'],['settings','settings','Settings']].map(([p,i,label])=>`<button data-page="${p}" ${page===p?'aria-current="page"':''}>${icon(i)}${label}</button>`).join('')}</nav></div>`;
  if(oldDialog){
    root.append(oldDialog);
    if(open&&!oldDialog.open)oldDialog.showModal()
  }
  renderError();
  settingsApply();
  if(restore&&!open){
    const el=[...root.querySelectorAll(`[${restore[0]}]`)].find(el=>el.getAttribute(restore[0])===restore[1]);
    if(el&&!el.disabled)el.focus({
      preventScroll:true
    }
    )
  }
}
function showDialog(title,content,actions){
  closeDialog();
  dialogReturn=document.activeElement;
  const d=document.createElement('dialog');
  d.className='dialog';
  d.setAttribute('aria-labelledby','dialog-title');
  d.innerHTML=`<h2 id="dialog-title">${esc(title)}</h2>${content}<div class="dialog-actions"></div>`;
  for(const action of actions){
    const b=document.createElement('button');
    b.className=action.primary?'primary':'secondary';
    b.textContent=action.text;
    b.addEventListener('click',action.action);
    d.querySelector('.dialog-actions').append(b)
  }
  d.addEventListener('cancel',()=>{
    setTimeout(()=>closeDialog(),0)
  }
  );
  root.append(d);
  d.showModal();
  settingsApply()
}
function closeDialog(){
  const d=root.querySelector('dialog');
  if(d){
    d.close();
    d.remove();
    dialogReturn?.isConnected&&dialogReturn.focus({
      preventScroll:true
    }
    );
    settingsApply()
  }
}
function exportBackup(raw=false){
  const content=raw?getRecoveryText()||exportText(state):exportText(state),blob=new Blob([content],{
    type:'application/json'
  }
  ),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;
  a.download=`paper-sudoku-${today()}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000)
}
async function importBackup(file){
  if(!file)return;
  try{
    const incoming=parseBackup(await file.text());
    showDialog('Replace your saved pages?',`<p>This backup contains ${incoming.games.length} pages. Importing replaces every page and setting currently saved on this device.</p><p>Export a backup first if you want to keep your current pages.</p>`,[{
      text:'Keep current pages',action:closeDialog
    }
    ,{
      text:'Replace with backup',primary:true,action:()=>{
        state=incoming;resetRecovery();saveError=null;persist();closeDialog();message='Your saved pages have been imported.';page='journal';render()
      }
    }
    ])
  }
  catch(error){
    showDialog('Backup not imported.',`<p>${esc(error.message)}</p>`,[{
      text:'Close',primary:true,action:closeDialog
    }
    ])
  }
}
let offlineReady=false,offlineIssue=false,updateAvailable=false;
for(const [event,key] of [['suduko:offline-ready','ready'],['suduko:offline-unavailable','issue'],['suduko:update-available','update']])window.addEventListener(event,()=>{
  if(key==='ready')offlineReady=true;else if(key==='issue')offlineIssue=true;else updateAvailable=true;if(page==='settings')render()
}
);
let installPrompt;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();installPrompt=e
}
);
async function install(){
  if(installPrompt){
    await installPrompt.prompt();
    installPrompt=null;
    return
  }
  showDialog('A page in your pocket.',`<p>On iPhone or iPad: open this page in Safari, tap Share, then Add to Home Screen.</p><p>On Android: open the browser menu and choose Install app or Add to Home screen.</p><p>On desktop: use the browser’s install icon or app menu. Once opened online, this app is ready for offline play.</p>`,[{
    text:'Got it',primary:true,action:closeDialog
  }
  ])
}
function replay(id){
  const old=state.games.find(g=>g.id===id);
  if(!old)return;
  size=old.size;
  startPuzzle({
    difficulty:old.difficulty,kind:'replay',seed:old.seed
  }
  )
}
const actions={
  new:newGameDialog,pause:()=>{
    if(autoPaused){
      autoPaused=false;
      paused=false
    }
    else paused=!paused;
    if(game()){
      game().paused=paused;
      persist()
    }
    hint=null;
    render()
  }
  ,undo:()=>historyMove('undo'),redo:()=>historyMove('redo'),erase:()=>enter(0),notes:()=>{
    noteMode=!noteMode;
    message=noteMode?'Pencil notes on.':'Writing numbers.';
    render()
  }
  ,hint:hintRequest,'apply-hint':hintApply,'dismiss-hint':()=>{
    hint=null;
    render()
  }
  ,focus:()=>{
    focus=!focus;
    render()
  }
  ,daily:openDaily,sound:()=>{
    state.settings.sound=!state.settings.sound;
    settingsApply();
    sound('tap');
    persist();
    render()
  }
  ,export:()=>exportBackup(),recovery:()=>exportBackup(true),import:()=>root.querySelector('#backup-file').click(),clear:()=>showDialog('Clear every saved page?', '<p>This removes all puzzles, history, journey progress, the Quest run, and settings from this device. Export a backup first to keep a copy.</p>',[{
    text:'Keep my pages',action:closeDialog
  }
  ,{
    text:'Clear all data',primary:true,action:()=>{
      state=freshState();resetRecovery();saveError=null;persist();closeDialog();page='play';message='';render()
    }
  }
  ]),install,help:()=>showDialog('A little guide.',`<p>Fill each row, column, and box with every symbol once. Classic uses 1–9; Super uses 1–9 and A–G.</p><p>Tap an open square, then a number. Turn Notes on for pencil marks. Remaining counts show how many copies of each symbol are still unwritten.</p><p>Hints explain a logical step before you apply it. Asking for a hint marks the page assisted. Classic and Super have no lives or penalties. Quest is a separate adventure with hearts, ink creatures and upgrades; its rules are inside the Quest tab.</p><p>Keyboard: arrow keys move, 1–9 / A–G write, N toggles notes, Delete erases. Ctrl or Cmd + Z undoes; add Shift to redo. Escape pauses.</p><p>In Super mode, Overview shows the whole board. Tap a square to open its focus section, or use the corner buttons to navigate.</p>`,[{
    text:'Back to my page',primary:true,action:closeDialog
  }
  ])
}
;
root.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled||b.closest('dialog'))return;audio.unlock();if(page==='quest'&&questUI.click(b))return;if(b.dataset.mode){
    if(busy)return;size=Number(b.dataset.mode);state.lastMode=size;persist();paused=!!game()?.paused;autoPaused=false;noteMode=false;hint=null;message='';const g=game();quadrant=g?Math.floor(Math.floor(g.selected/size)/8)*2+Math.floor(g.selected%size/8):0;render()
  }
  else if(b.dataset.page){
    if(busy)return;page=b.dataset.page;hint=null;render();window.scrollTo({
      top:0,behavior:'instant'
    }
    )
  }
  else if(b.dataset.cell!==undefined){
    if(paused||autoPaused)return;if(size===16&&!focus){
      focus=true
    }
    navigateCell(Number(b.dataset.cell))
  }
  else if(b.dataset.value)enter(Number(b.dataset.value));else if(b.dataset.quadrant!==undefined){
    quadrant=Number(b.dataset.quadrant);focus=true;const g=game();if(g)g.selected=Math.floor(quadrant/2)*128+quadrant%2*8;render()
  }
  else if(b.dataset.resume)resume(b.dataset.resume);else if(b.dataset.replay)replay(b.dataset.replay);else if(b.dataset.journey)openJourney(Number(b.dataset.journey));else actions[b.dataset.action]?.()
}
);
root.addEventListener('change',e=>{
  const el=e.target;if(el.dataset.setting){
    const key=el.dataset.setting;state.settings[key]=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;settingsApply();persist();if(key==='sound')sound('tap');render()
  }
  else if(el.id==='daily-date'){
    dailyDate=el.value&&el.value<=today()&&el.value>='2020-01-01'?el.value:today();render()
  }
  else if(el.id==='journal-difficulty'){
    journalDifficulty=el.value;render()
  }
  else if(el.id==='journal-assistance'){
    journalAssistance=el.value;render()
  }
  else if(el.id==='backup-file')importBackup(el.files?.[0])
}
);
root.addEventListener('input',e=>{
  if(e.target.type==='range'&&e.target.dataset.setting){
    state.settings[e.target.dataset.setting]=Number(e.target.value);settingsApply();persist(false)
  }
}
);
document.addEventListener('keydown',e=>{
  audio.unlock();if(page==='quest'&&!root.querySelector('dialog[open]')&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){questUI.key(e);return}if(page!=='play'||busy||root.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;const g=game();if(!g)return;const key=e.key.toUpperCase();if((e.ctrlKey||e.metaKey)&&key==='Z'){
    e.preventDefault();historyMove(e.shiftKey?'redo':'undo');return
  }
  if(e.ctrlKey||e.metaKey||e.altKey)return;if(key==='ESCAPE'){
    e.preventDefault();actions.pause();return
  }
  if(paused||autoPaused||g.status!=='active')return;if(/^([1-9]|[A-G])$/.test(key)){
    const val=/^[A-G]$/.test(key)?key.charCodeAt(0)-55:Number(key);if(val<=size){
      e.preventDefault();enter(val)
    }
  }
  else if(key==='BACKSPACE'||key==='DELETE'){
    e.preventDefault();enter(0)
  }
  else if(key==='N'){
    e.preventDefault();actions.notes()
  }
  else if(key.startsWith('ARROW')){
    e.preventDefault();const r=Math.floor(g.selected/size),c=g.selected%size;const index=key==='ARROWUP'?((r+size-1)%size)*size+c:key==='ARROWDOWN'?((r+1)%size)*size+c:key==='ARROWLEFT'?r*size+(c+size-1)%size:r*size+(c+1)%size;navigateCell(index);root.querySelector(`[data-cell="${index}"]`)?.focus({
      preventScroll:true
    }
    )
  }
}
);
let lastTick=performance.now(),lastSave=0;
setInterval(()=>{
  const now=performance.now(),delta=Math.min(2,(now-lastTick)/1000);lastTick=now;if(activeTimer()){
    game().elapsed+=delta;const el=root.querySelector('#clock');if(el)el.textContent=clock(game().elapsed);if(now-lastSave>15000){
      persist();lastSave=now
    }
  }
}
,1000);
document.addEventListener('visibilitychange',()=>{
  lastTick=performance.now();if(document.hidden){
    if(page==='play'&&game()?.status==='active'){
      autoPaused=true;game().paused=true
    }
    audio.suspend();persist()
  }
  else render()
}
);
window.addEventListener('pagehide',()=>persist());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',settingsApply);
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY)return;try{
    const incoming=event.newValue?parseBackup(event.newValue):freshState();resetRecovery();state=incoming;size=state.lastMode||9;paused=true;autoPaused=false;hint=null;noteMode=false;closeDialog();message='Your pages were updated in another tab. Resume when you are ready.';if(game())game().paused=true;render()
  }
  catch{
    loadState();saveError='Another tab wrote an unreadable save. Saving is paused to protect it; export a recovery file in Settings.';render()
  }
}
);
render();
