import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createDeExecutionDeadline as create } from './de-execution-deadline.mjs';

test('Delaware deadline expires cooperatively with finite reason', async () => {
  const budget=create({timeoutMs:10});
  try {
    await new Promise(resolve=>budget.signal.addEventListener('abort',resolve,{once:true}));
    assert.equal(budget.signal.reason.code,'DE_EXECUTION_DEADLINE');
    assert.equal(budget.signal.reason.message,'Delaware execution deadline exceeded.');
    assert.throws(()=>budget.check(),error=>error===budget.signal.reason);
  } finally {budget.dispose();}
});

test('Delaware parent and pre-aborted signals retain original reason',()=>{
  const parent=new AbortController(),reason=new Error('caller cancellation');
  const budget=create({signal:parent.signal});parent.abort(reason);
  assert.equal(budget.signal.reason,reason);assert.throws(()=>budget.check(),error=>error===reason);budget.dispose();
  const prior=create({signal:parent.signal});assert.equal(prior.signal.reason,reason);prior.dispose();
});

test('Delaware disposal is idempotent and prevents timer or later parent abort',async()=>{
  const parent=new AbortController(),budget=create({signal:parent.signal,timeoutMs:10});
  budget.dispose();budget.dispose();parent.abort();await delay(20);
  assert.equal(budget.signal.aborted,false);budget.check();
});

test('Delaware rejects invalid deadlines and signals before creating timer',()=>{
  for(const timeoutMs of [0,-1,1.5,NaN,Infinity,1_800_001,Number.MAX_SAFE_INTEGER+1,'10',null])assert.throws(()=>create({timeoutMs}),/Invalid Delaware execution deadline/);
  for(const signal of [null,{},'signal'])assert.throws(()=>create({signal}),/Invalid Delaware execution deadline/);
  const valid=create({timeoutMs:1_800_000});valid.dispose();
});

test('Delaware monotonic check catches expiry before delayed timer callback',()=>{
  const budget=create({timeoutMs:5});
  try {
    const until=performance.now()+12;while(performance.now()<until) { /* Deliberately delay event loop. */ }
    assert.equal(budget.signal.aborted,false);
    assert.throws(()=>budget.check(),error=>error.code==='DE_EXECUTION_DEADLINE');
  } finally {budget.dispose();}
});
