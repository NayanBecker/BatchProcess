const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../../src/db/conection');
const jobs = require('../../src/db/migrations/001_create_batch_jobs');
const metadata = require('../../src/db/migrations/004_add_job_metadata');


after(() => db.destroy());

// Toda DDL do teste é transacional e isolada em schema temporário lógico.
async function isolated(check) {
  assert.equal(db.client.connectionSettings.database, 'tcc_framework_test');
  const trx = await db.transaction();
  try {
    const { rows } = await trx.raw('SELECT current_database() AS database');
    assert.equal(rows[0].database, 'tcc_framework_test');
    const schema = `phase_a_test_${process.pid}`;
    await trx.raw('CREATE SCHEMA ??', [schema]);
    await trx.raw('SET LOCAL search_path TO ??', [schema]);
    await check(trx, schema);
  } finally {
    await trx.rollback();
  }
}

test('metadata down restaura o schema anterior e permite reaplicar up', () => isolated(async (trx, schema) => {
  await jobs.up(trx);
  const before = await trx('batch_jobs').withSchema(schema).columnInfo();
  await metadata.up(trx);
  await metadata.down(trx);
  const after = await trx('batch_jobs').withSchema(schema).columnInfo();
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
  await metadata.up(trx);
}));