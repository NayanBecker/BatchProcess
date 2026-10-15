const {test,after}=require('node:test');const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection');const {withFixture}=require('../helpers/phase-c-db.cjs');after(()=>db.destroy());
test('review rejects FK cascades outside table allowlist before preparation or DML',()=>withFixture(db,async schema=>{
 await db.schema.withSchema(schema).createTable('teste_migracao',t=>{t.bigInteger('id').primary();t.text('uf');t.boolean('migrado');});
 await db.schema.withSchema(schema).createTable('unrelated',t=>{t.bigInteger('id').references('id').inTable(`${schema}.teste_migracao`).onDelete('CASCADE');});
 const {reviewAction}=require('../../src/experiments/reviewRunner');
 await assert.rejects(reviewAction({db,schema},'check',{operation:'EXP-09',dataset:'guard'}),/FK|dependências/);
 assert.equal(await db.schema.withSchema(schema).hasTable('review_snapshots'),false);
}));
