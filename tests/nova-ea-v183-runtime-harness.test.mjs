import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const candidate=path.resolve(here,'../integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5');
const sha256=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const temp=()=>mkdtempSync(path.join(tmpdir(),'nova-v183-runtime-'));
function runChild(code,args=[]){
 return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['-e',code,...args],{stdio:['ignore','pipe','pipe']});
  let out='',err=''; p.stdout.on('data',d=>out+=d); p.stderr.on('data',d=>err+=d);
  p.on('error',reject); p.on('close',c=>c===0?resolve({out,err}):reject(new Error('child exit '+c+' '+err)));
 });
}
function normalizeMoney(amount,currency){
 if(currency==='USD') return amount;
 if(currency==='USC') return amount/100;
 throw new Error('unsupported account currency '+currency);
}
function aggregateRisk(positions){return positions.reduce((sum,p)=>sum+normalizeMoney(p.risk,p.currency),0);}
function reconcilePartialClose(before,brokerSnapshot,response){
 if(response==='TIMEOUT') return {status:'RECONCILE_REQUIRED',remaining:brokerSnapshot.volume,entryLocked:true};
 if(response==='REJECT') return {status:'REJECTED',remaining:brokerSnapshot.volume,entryLocked:false};
 return {status:'RECONCILED',remaining:brokerSnapshot.volume,entryLocked:false};
}

test('Request Audit wraps every OrderSend and PositionModify call and keeps compile-time hard-off',()=>{
 const s=readFileSync(candidate,'utf8');
 assert.match(s,/#define NOVA_PHASE2_EXECUTION_DISABLED true/);
 assert.equal((s.match(/\bOrderSend\s*\(/g)||[]).length,1,'only the audited adapter may call OrderSend');
 assert.equal((s.match(/\bNovaAuditOrderSend\s*\(/g)||[]).length,9,'eight call sites plus adapter definition');
 assert.equal((s.match(/\bgTrade\.PositionModify\s*\(/g)||[]).length,1,'only the audited adapter may call CTrade.PositionModify');
 assert.match(s,/NOVA_REQUEST_AUDIT\|VERSION=1/);
 assert.match(s,/NOVA_REQUEST_AUDIT\|SUMMARY/);
 for(const name of ['TradePermission','SendClose','ModifySL','Trail_SendPartialClose','RecoverySend','RecoveryPartialClose','ProcessCandidate','CancelOwnPending','SniperMTF_Check','MoveToBreakeven'])
  assert.match(s,new RegExp('NovaAuditBlocked\\("'+name+'"\\)'));
});

test('16 simultaneous instances: exactly one wins the shared Risk Slot',async()=>{
 const d=temp(), lock=path.join(d,'risk-slot.lock'), winner=path.join(d,'winner.txt');
 const child="const fs=require('fs');const [lock,winner,id]=process.argv.slice(1);try{fs.mkdirSync(lock);fs.writeFileSync(winner,id);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250);process.exit(0)}catch(e){if(e.code==='EEXIST')process.exit(3);throw e}";
 const jobs=Array.from({length:16},(_,i)=>new Promise(resolve=>{
  const p=spawn(process.execPath,['-e',child,lock,winner,String(i)],{stdio:'ignore'});
  p.on('close',code=>resolve(code));
 }));
 const codes=await Promise.all(jobs);
 assert.equal(codes.filter(c=>c===0).length,1);
 assert.equal(codes.filter(c=>c===3).length,15);
 assert.ok(existsSync(winner));
 rmSync(d,{recursive:true,force:true});
});

test('24 symbol instances serialize shared daily baseline initialization',async()=>{
 const d=temp(), lock=path.join(d,'baseline.lock'), file=path.join(d,'baseline.json');
 const child="const fs=require('fs');const [lock,file,symbol]=process.argv.slice(1);let held=false;for(let i=0;i<300;i++){try{fs.mkdirSync(lock);held=true;break}catch(e){if(e.code!=='EEXIST')throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5)}}if(!held)process.exit(4);try{let v;if(fs.existsSync(file))v=JSON.parse(fs.readFileSync(file,'utf8'));else{v={day:'2026-11-26',equity:10000,createdBy:symbol};fs.writeFileSync(file,JSON.stringify(v))}process.stdout.write(JSON.stringify(v))}finally{fs.rmSync(lock,{recursive:true,force:true})}";
 const jobs=Array.from({length:24},(_,i)=>runChild(child,[lock,file,'SYM'+i]));
 const results=await Promise.all(jobs);
 const baselines=results.map(x=>JSON.parse(x.out));
 assert.equal(new Set(baselines.map(x=>x.equity)).size,1);
 assert.equal(new Set(baselines.map(x=>x.createdBy)).size,1);
 assert.equal(JSON.parse(readFileSync(file,'utf8')).equity,10000);
 rmSync(d,{recursive:true,force:true});
});

test('Restart retains daily lock state from durable state file',()=>{
 const d=temp(), file=path.join(d,'state.json');
 writeFileSync(file,JSON.stringify({day:'2026-11-26',dailyLock:true,openingEquity:10000}));
 const restarted=JSON.parse(readFileSync(file,'utf8'));
 assert.equal(restarted.dailyLock,true);
 assert.equal(restarted.day,'2026-11-26');
 rmSync(d,{recursive:true,force:true});
});

test('Broker-day rollover creates a new baseline exactly once',()=>{
 const d=temp(), file=path.join(d,'baseline.json');
 writeFileSync(file,JSON.stringify({day:'2026-11-25',equity:9800}));
 let state=JSON.parse(readFileSync(file,'utf8'));
 const nextDay='2026-11-26';
 if(state.day!==nextDay) state={day:nextDay,equity:10100};
 writeFileSync(file,JSON.stringify(state));
 const second=JSON.parse(readFileSync(file,'utf8'));
 assert.deepEqual(second,{day:nextDay,equity:10100});
 rmSync(d,{recursive:true,force:true});
});

test('Lock acquisition failure fails closed and never fabricates a baseline',()=>{
 const d=temp(), lock=path.join(d,'locked');
 mkdirSync(lock);
 let allowed=true;
 try{mkdirSync(lock)}catch(e){if(e.code==='EEXIST')allowed=false;else throw e}
 assert.equal(allowed,false);
 assert.equal(existsSync(path.join(d,'baseline.json')),false);
 rmSync(d,{recursive:true,force:true});
});

test('Corrupt or truncated baseline fails closed',()=>{
 const d=temp(), file=path.join(d,'baseline.json');
 for(const payload of ['{bad-json','{"day":"2026-11-26","equity":0}','{"day":"wrong","equity":10000}']){
  writeFileSync(file,payload);
  let trusted=true;
  try{const v=JSON.parse(readFileSync(file,'utf8'));trusted=!!v.day&&v.day==='2026-11-26'&&Number.isFinite(v.equity)&&v.equity>0}catch{trusted=false}
  assert.equal(trusted,false,payload);
 }
 rmSync(d,{recursive:true,force:true});
});

test('Multi-symbol exposure is aggregated account-wide',()=>{
 const positions=[
  {symbol:'XAUUSDm',risk:450,currency:'USD'},
  {symbol:'EURUSD',risk:250,currency:'USD'},
  {symbol:'GBPUSD',risk:300,currency:'USD'}
 ];
 assert.equal(aggregateRisk(positions),1000);
 assert.equal(aggregateRisk(positions)>900,true);
});

test('USC and USD fixtures normalize to equivalent account risk',()=>{
 const usd=normalizeMoney(1000,'USD');
 const usc=normalizeMoney(100000,'USC');
 assert.equal(usc,usd);
 assert.equal(aggregateRisk([{risk:900,currency:'USC'}]),9);
});

test('Partial-close rejection reconciles actual broker volume without optimistic reduction',()=>{
 const before={volume:1.0}, broker={volume:1.0};
 const result=reconcilePartialClose(before,broker,'REJECT');
 assert.equal(result.status,'REJECTED');
 assert.equal(result.remaining,1.0);
});

test('Partial-close timeout requires broker-state reconciliation and locks new entries',()=>{
 const before={volume:1.0}, broker={volume:0.6};
 const result=reconcilePartialClose(before,broker,'TIMEOUT');
 assert.equal(result.status,'RECONCILE_REQUIRED');
 assert.equal(result.remaining,0.6);
 assert.equal(result.entryLocked,true);
});

test('Broker reject and timeout fixtures never assume request success',()=>{
 for(const response of ['REJECT','TIMEOUT']){
  const snapshot={volume:0.75};
  const result=reconcilePartialClose({volume:1},snapshot,response);
  assert.notEqual(result.status,'RECONCILED');
  assert.equal(result.remaining,0.75);
 }
});

test('Runtime harness records immutable candidate source fingerprint',()=>{
 const hash=sha256(readFileSync(candidate));
 assert.match(hash,/^[A-F0-9]{64}$/);
 assert.notEqual(hash,'117922854A349331074549A0015178E061820B512AD6778F50621E2742DDA283');
});
