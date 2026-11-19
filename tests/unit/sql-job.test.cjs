require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateSqlDefinition,bindSqlDefinition}=require('../../src/core/sqlDefinition');
const knex=require('knex')({client:'pg'});
const entry={sqlFile:'job.sql',table:'teste_cnpj'};
const sql="-- operador\n UPDATE teste_cnpj SET cnpj_novo=LPAD(cnpj_antigo::TEXT,14,'0') WHERE cnpj_novo IS NULL AND cnpj_antigo IS NOT NULL AND id > :inicio AND id <= :fim; -- final";
test('escaped question marks fail closed rather than Knex altering literal backslashes',()=>{
 assert.throws(()=>validateSqlDefinition(sql.replace("'0'", "'\\?'"),entry,'public'));
});
test('SQL catalog accepts file jobs, rejects ambiguous shapes',()=>{
 const {validateRuntimeConfig}=require('../../src/core/runtimeConfig');
 const c=structuredClone(require('../../batcheman.config.example.json'));c.jobs={'cnpj':entry};
 assert.equal(validateRuntimeConfig(c).jobs.cnpj.sqlFile,'job.sql');
 for(const bad of [{...entry,module:'./jobs/X',export:'X'},{...entry,operation:'SELECT'},{...entry,targetTable:'bad;sql'},{...entry,unknown:1}]){
  assert.throws(()=>validateRuntimeConfig({...c,jobs:{cnpj:bad}}));
 }
});
test('model requires SQL snapshot before transactions; guards reject definition/catalog drift',async()=>{
 const {BatchJobModel}=require('../../src/db/models/BatchJobModel');const {assertDurableTarget}=require('../../src/core/TransactionalOwnership');const {SqlJob}=require('../../src/core/SqlJob');
 const c=structuredClone(require('../../batcheman.config.example.json'));c.jobs={cnpj:entry};let opened=0;
 const context={db:{transaction(){opened++;throw Error('opened');}},schema:c.target.controlSchema,dataSchema:'public',runtime:c};
 const spec={table:entry.table,mode:'B',protocol:'batcheman-v1',dataset:'user',operation:'cnpj'};
 const d=validateSqlDefinition(sql,entry,'public');const job=new SqlJob(d);
 await assert.rejects(()=>BatchJobModel.createTransactional('cnpj',job.config,spec,context));assert.equal(opened,0);
 const state={...spec,sqlDefinition:d,target:{database:c.target.database,controlSchema:context.schema,dataSchema:'public'}};
 assert.doesNotThrow(()=>assertDurableTarget(state,context));
 assert.throws(()=>assertDurableTarget({...state,sqlDefinition:{...d,text:sql+' '}},context));
 for(const drift of [{...entry,operation:'DELETE'},{...entry,targetTable:'other'},{module:'./jobs/X',export:'X',table:entry.table}])assert.throws(()=>assertDurableTarget(state,{...context,runtime:{...c,jobs:{cnpj:drift}}}));
});
test('SQL file loader preserves UTF8 BOM and exact bytes and refuses oversized/invalid UTF8',()=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const {readSqlDefinition}=require('../../src/core/sqlDefinition');
 const dir=fs.mkdtempSync(path.join(process.env.TMPDIR,'batcheman-lex-')),file=path.join(dir,'job.sql');
 try{const bytes=Buffer.from('\ufeff'+sql+'\r\n','utf8');fs.writeFileSync(file,bytes);const d=readSqlDefinition(file,entry,'public');assert.equal(d.hash,crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(d.text,bytes.toString('utf8'));
 for(const bad of [Buffer.from([0xc3,0x28]),Buffer.alloc(1024*1024+1,32)]){fs.writeFileSync(file,bad);assert.throws(()=>readSqlDefinition(file,entry,'public'));}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('lexical validation rejects extra statements, missing and unknown actual bindings',()=>{
 for(const bad of [sql+'\n SELECT 1',sql+'\n;',sql.replace(':fim',"':fim'"),sql.replace(':inicio','/* :inicio */ 0'),sql.replace(':fim',':outro'),sql.replace(':fim',':fim:'),sql.replace('UPDATE teste_cnpj','UPDATE other'),sql.replace('UPDATE teste_cnpj','UPDATE other.teste_cnpj'),'BEGIN;'+sql,'WITH x AS (DELETE FROM teste_cnpj) '+sql,sql.replace('; -- final',' RETURNING *'),sql+'\n /* unclosed',sql.replace(':fim',"'unclosed")])assert.throws(()=>validateSqlDefinition(bad,entry,'public'),undefined,bad);
});
test('literal/comment punctuation and names stay byte-preserved, nested comments, dollars, escaped strings',()=>{
 const source="UPDATE teste_cnpj SET cnpj_novo=':fim ? ; '' :unknown' || $$:inicio; ?$$ || E'x\\\' :unknown' /* :unknown /* ; */ ? */ WHERE id>:inicio::bigint AND id<=:fim; -- :extra ?";
 const d=validateSqlDefinition(source,entry,'public');const native=bindSqlDefinition(knex,d,'0','10').toSQL().toNative();
 assert.deepEqual(native.bindings,['0','10']);assert.equal(native.sql,source.replace('id>:inicio::bigint','id>($1)::bigint').replace('id<=:fim','id<=($2)'));
});
test('snapshot checks exact UTF8 hash and immutable metadata, INSERT origin differs from destination',()=>{
 const {assertSqlSnapshot}=require('../../src/core/sqlDefinition');const d=validateSqlDefinition(sql,entry,'public');
 assert.doesNotThrow(()=>assertSqlSnapshot(d,entry,'public'));
 for(const changed of [{...d,text:sql+' '},{...d,hash:'0'.repeat(64)},{...d,table:'other'},{...d,operation:'DELETE'}])assert.throws(()=>assertSqlSnapshot(changed,entry,'public'));
 const insert={sqlFile:'insert.sql',table:'source',targetTable:'dest',operation:'INSERT'};
 assert.equal(validateSqlDefinition('INSERT INTO dest SELECT * FROM source WHERE id>:inicio AND id<=:fim',insert,'public').table,'source');
 assert.throws(()=>validateSqlDefinition('INSERT INTO source SELECT * FROM source WHERE id>:inicio AND id<=:fim',{...insert,targetTable:undefined},'public'));
});
test('SQL accepts approved cast, whitespace and final comments; binds only real values',()=>{
 const d=validateSqlDefinition(sql,entry,'public');assert.equal(d.operation,'UPDATE');assert.equal(d.text,sql);assert.match(d.hash,/^[a-f0-9]{64}$/);
 const q=bindSqlDefinition(knex,d,'9007199254740993','9223372036854775807').toSQL().toNative();
 assert.deepEqual(q.bindings,['9007199254740993','9223372036854775807']);assert.match(q.sql,/cnpj_antigo::TEXT/);assert.match(q.sql,/id > \(\$1\) AND id <= \(\$2\)/);
});
