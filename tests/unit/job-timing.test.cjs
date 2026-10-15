require('ts-node/register');const {test}=require('node:test');const assert=require('node:assert/strict');
test('timing separates active, paused and wall; recovery does not invent active downtime',()=>{
 const {transitionTiming,timingMetrics}=require('../../src/core/jobTiming');
 let t=transitionTiming(undefined,'active',100);
 t=transitionTiming(t,'active',150);t=transitionTiming(t,'paused',200);
 assert.deepEqual(timingMetrics(t,100,300),{activeDurationMs:100,pausedDurationMs:100,wallDurationMs:200,timingUncertain:false});
 t=transitionTiming(t,'active',350);t=transitionTiming(t,'terminal',400);
 assert.deepEqual(timingMetrics(t,100,400),{activeDurationMs:150,pausedDurationMs:150,wallDurationMs:300,timingUncertain:false});
 const crashed=transitionTiming(transitionTiming(undefined,'active',100),'unknown',500);
 assert.equal(crashed.activeMs,0);assert.equal(crashed.uncertain,true);
});
