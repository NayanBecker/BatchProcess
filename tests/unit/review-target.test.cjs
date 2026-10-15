require('ts-node/register');const {test}=require('node:test');const assert=require('node:assert/strict');
test('manual controls and reads check durable target before dispatching model/manager operations',async()=>{
 const {reviewAction}=require('../../src/experiments/reviewRunner');const {BatchJobModel}=require('../../src/db/models');
 const schema=`phase_c_test_${'a'.repeat(32)}`,other=`phase_c_test_${'b'.repeat(32)}`;
 const trx={raw:async sql=>({rows:sql.includes('current_database')?[{database:'tcc_framework_test'}]:[]})};
 const db={transaction:async cb=>cb(trx)};
 const original=BatchJobModel.findById;
 BatchJobModel.findById=async()=>({id:1,status:'running',transactional_state:{table:'teste_socios',operation:'EXP-06',dataset:'identity',target:{database:'tcc_framework_test',controlSchema:schema,dataSchema:schema}}});
 try {for(const action of ['status','pause','cancel','resume','recover','dispatch'])await assert.rejects(reviewAction({db,schema,dataSchema:other},action,{operation:'EXP-06',dataset:'identity',id:1}),/Destino durável/,action);}
 finally {BatchJobModel.findById=original;}
});
