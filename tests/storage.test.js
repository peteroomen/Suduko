import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, validateState, parseBackup, loadState, saveState, getRecoveryText, resetRecovery, STORAGE_KEY } from '../src/storage.js';
import { generatePuzzle } from '../src/engine.js';
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(size=9){
 const p=generatePuzzle({size,difficulty:'beginner',seed:'storage-test'});
 const state=freshState();
 const g={...p,values:[...p.givens],notes:{},undo:[],redo:[],selected:p.givens.indexOf(0),elapsed:4,assisted:false,paused:false,status:'active',kind:'practice',created:Date.now()};
 state.games.push(g);state.active[size]=g.id;state.lastMode=size;return state;
}
test('valid classic and super saves roundtrip, preserving notes and undo',()=>{
 for(const size of [9,16]){const state=fixture(size),g=state.games[0];g.notes[g.selected]=[1,2];g.undo.push({values:[...g.values],notes:clone(g.notes)});assert.deepEqual(parseBackup(JSON.stringify(state)),state)}
});
test('rejects altered printed clues, notes in printed cells, invalid solution and false completions without changing current state',()=>{
 const current=fixture(),original=clone(current),clue=current.games[0].givens.findIndex(Boolean);
 for(const mutate of [g=>g.values[clue]=0,g=>g.notes[clue]=[1],g=>g.solution[0]=g.solution[1],g=>g.status='complete',g=>g.undo.push({values:g.values.map((v,i)=>i===clue?0:v),notes:{}})]){const data=clone(current);mutate(data.games[0]);assert.throws(()=>parseBackup(JSON.stringify(data)));assert.deepEqual(current,original)}
});
test('rejects unknown schema, oversized journal and invalid settings',()=>{
 const data=fixture();assert.throws(()=>validateState({...data,version:2}));assert.throws(()=>validateState({...data,lastMode:25}));assert.throws(()=>validateState({...data,games:Array(1001).fill(data.games[0])}));assert.throws(()=>validateState({...data,settings:{...data.settings,sfxVolume:4}}))
});
test('unreadable original is protected against autosaves until explicit reset',()=>{
 const store=new Map([[STORAGE_KEY,'{corrupt']]);globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 const result=loadState();assert.ok(result.error);assert.equal(getRecoveryText(),'{corrupt');assert.ok(saveState(freshState()));assert.equal(store.get(STORAGE_KEY),'{corrupt');resetRecovery();assert.equal(saveState(freshState()),null);assert.equal(loadState().error,null)
});
test('quota failures produce a useful persistence error',()=>{
 resetRecovery();globalThis.localStorage={setItem(){throw new Error('QuotaExceededError')}};assert.match(saveState(freshState()),/could not be saved/)
});
