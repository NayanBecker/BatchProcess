require('ts-node/register');
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {BatchJobModel}=require('../../src/db/models/BatchJobModel');
const {db}=require('../../src/db/conection');
after(()=>db.destroy());
test('DTO vazio não produz Infinity e BIGINT não vira taxa imprecisa',()=>{
  const base={id:1,job_name:'fixture',status:'completed',batch_size:2,throttle_ms:0,started_at:new Date(0),completed_at:new Date(1000),processed_rows:'0',error_count:0};
  assert.equal(BatchJobModel.toDTO(base).metrics.avgItemDurationMs,0);
  const dto=BatchJobModel.toDTO({...base,processed_rows:'9007199254740993',transactional_state:{cursor:'9007199254740993'}});
  assert.equal(dto.metrics.itemsProcessed,'9007199254740993');
  assert.equal(dto.metrics.itemsPerSecond,null);
  assert.equal(dto.metrics.avgItemDurationMs,null);
  assert.equal(dto.transactionalState.cursor,'9007199254740993');
});
