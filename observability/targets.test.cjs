'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {checkTargets}=require('./targets.cjs');
test('base monitoring requires four healthy targets; bounded pilot target may be offline between runs',()=>{
 const base=['prometheus','tcc-committed','postgres','containers-linux-vm'].map(job=>({labels:{job},health:'up'}));
 assert.deepEqual(checkTargets(base),{requiredUp:4,optionalLoad:null});
 assert.deepEqual(checkTargets([...base,{labels:{job:'tcc-phase-e-load'},health:'down'}]),{requiredUp:4,optionalLoad:'down'});
 assert.throws(()=>checkTargets([...base.slice(1)]));assert.throws(()=>checkTargets([...base,{labels:{job:'random'},health:'up'}]));
});
