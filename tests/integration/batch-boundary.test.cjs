const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../../src/db/conection');
const { withFixture } = require('../helpers/phase-c-db.cjs');
const { BatchIterator } = require('../../src/core/BatchIterator');
after(() => db.destroy());
test('fronteiras com lacunas, H fixo, BIGINT, vazio e DELETE sem OFFSET', () => withFixture(db, async schema => {
  await db.schema.withSchema(schema).createTable('source', t => { t.bigInteger('id').primary(); t.boolean('remove'); });
  await db('source').withSchema(schema).insert(['1','9','9007199254740993'].map(id => ({id,remove:true})));
  await db.transaction(async trx => {
    const target = {schema, table: 'source'};
    const first = await BatchIterator.boundary(trx, target, '0', '9007199254740993', 2);
    assert.deepEqual(first, { hi: '9', visited: '2', final: false });
    await trx('source').withSchema(schema).where('id','<=',first.hi).delete();
    await trx('source').withSchema(schema).insert({id:'9007199254740994',remove:true});
    const last = await BatchIterator.boundary(trx, target, first.hi, '9007199254740993', 2);
    assert.deepEqual(last, {hi:'9007199254740993',visited:'1',final:true});
    assert.deepEqual(await BatchIterator.boundary(trx,target,last.hi,last.hi,2), {hi:last.hi,visited:'0',final:true});
    await assert.rejects(BatchIterator.boundary(trx,{schema,table:'source;DROP'},'0','9',2), /identificador/);
  });
}));
