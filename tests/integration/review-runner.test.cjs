const {test,after}=require('node:test');const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection');const {withFixture}=require('../helpers/phase-c-db.cjs');after(()=>db.destroy());
// Every A/B run starts in its own synthetic fixture, without a reset API.
for(const operation of ['EXP-06','EXP-08','EXP-09']) for(const mode of ['A','B'])
test(`review check/prepare/mark/run ${operation} ${mode}: independent oracle and retained history`,()=>withFixture(db,async schema=>withFixture(db,async control=>{
 await db.schema.withSchema(schema).createTable('teste_socios',t=>{t.bigInteger('id').primary();t.text('nome');t.text('nome_normalizado');t.text('documento');t.boolean('processado');});
 await db.schema.withSchema(schema).createTable('teste_destino',t=>{t.bigInteger('id').primary();t.text('nome');t.text('documento');});
 await db.schema.withSchema(schema).createTable('teste_migracao',t=>{t.bigInteger('id').primary();t.text('uf');t.boolean('migrado');});
 await db('teste_socios').withSchema(schema).insert([{id:'1',nome:'  ana  silva ',nome_normalizado:null,documento:'synthetic',processado:false},{id:'9',nome:null,nome_normalizado:null,documento:null,processado:false}]);
 await db('teste_migracao').withSchema(schema).insert([{id:'1',uf:'SC',migrado:false},{id:'9',uf:'PR',migrado:false}]);
 const {reviewAction}=require('../../src/experiments/reviewRunner');
 const context={db,schema:control,dataSchema:schema};
   const dataset=operation+'-fixture';
   const check=await reviewAction(context,'check',{operation,dataset});
   await assert.rejects(reviewAction(context,'prepare',{operation,dataset,checkToken:'wrong'}),/check/);
   await reviewAction(context,'prepare',{operation,dataset,checkToken:check.checkToken});
   if(operation==='EXP-09') {const check=await reviewAction(context,'check',{operation,dataset});await reviewAction(context,'mark',{operation,dataset,checkToken:check.checkToken});}
     const checked=await reviewAction(context,'check',{operation,dataset});
     const row=await reviewAction(context,'run',{operation,dataset,mode,batchSize:1,checkToken:checked.checkToken});
     assert.equal(row.status,'completed');
     // Test-owned oracle: complete result sets plus unchanged source/other tables.
     const initial=[{id:'1',nome:'  ana  silva ',nome_normalizado:null,documento:'synthetic',processado:false},{id:'9',nome:null,nome_normalizado:null,documento:null,processado:false}];
     const normalized=(await db.raw('SELECT id, UPPER(BTRIM(nome)) AS name FROM jsonb_to_recordset(?::jsonb) AS s(id text,nome text) ORDER BY id',[JSON.stringify(initial)])).rows;
     const expectedSource=operation==='EXP-06'?initial.map(r=>({...r,nome_normalizado:normalized.find(n=>n.id===r.id).name,processado:true})):initial;
     assert.deepEqual(await db('teste_socios').withSchema(schema).orderBy('id'),expectedSource);
     assert.deepEqual(await db('teste_destino').withSchema(schema).orderBy('id'),operation==='EXP-08'?initial.map(({id,nome,documento})=>({id,nome,documento})):[]);
     const migration=[{id:'1',uf:'SC',migrado:false},{id:'9',uf:'PR',migrado:false}];
     assert.deepEqual(await db('teste_migracao').withSchema(schema).orderBy('id'),operation==='EXP-09'?[migration[1]]:migration);
     const saved=await db('review_snapshots').withSchema(control).where({dataset}).first();
     assert.equal(saved.operation,operation);
     assert.deepEqual(saved.snapshot,operation==='EXP-06'?{teste_socios:initial}:operation==='EXP-08'?{teste_socios:initial,teste_destino:[]}:{teste_migracao:migration});
     assert.equal((await db('batch_jobs').withSchema(control).where({id:row.id}).first()).status,'completed');
     const status=await reviewAction(context,'status',{operation,dataset,id:row.id});
     assert.equal(status.status,'completed');
     assert.deepEqual(await reviewAction(context,'errors',{operation,dataset,id:row.id}),[]);
     const logs=await reviewAction(context,'logs',{operation,dataset,id:row.id});
     assert.ok(logs.some(log=>log.message==='completed'));
     // completed certifies execution state, not current domain-data integrity.
     await db('teste_socios').withSchema(schema).where({id:'1'}).update({nome:'synthetic later edit'});
     assert.equal((await reviewAction(context,'status',{operation,dataset,id:row.id})).status,'completed');
     const rerun=await reviewAction(context,'check',{operation,dataset});
     await assert.rejects(reviewAction(context,'run',{operation,dataset,mode,checkToken:rerun.checkToken}),/diverge/);
     assert.equal((await db('batch_jobs').withSchema(control)).length,1);
})));
