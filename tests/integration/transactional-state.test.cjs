const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../../src/db/conection');
const { withFixture } = require('../helpers/phase-c-db.cjs');
const jobs = require('../../src/db/migrations/001_create_batch_jobs');
const metadata = require('../../src/db/migrations/004_add_job_metadata');
const { BatchJobModel } = require('../../src/db/models/BatchJobModel');
const { resolveJobConfig } = require('../../src/core/jobConfig');
after(() => db.destroy());
test('estado transacional up/down/up preserva legado e BIGINT; config persistida igual DTO', () => withFixture(db, async schema => {
  const migration = require('../../src/db/migrations/005_add_transactional_state');
  await db.transaction(async trx => {
    await trx.raw('SET LOCAL search_path TO ??', [schema]);
    await jobs.up(trx); await metadata.up(trx);
    await trx('batch_jobs').insert({ job_name: 'old', current_id: '9007199254740993', processed_rows: '19' });
    await migration.up(trx); await migration.down(trx); await migration.up(trx);
  });
  const context = { db, schema };
  const config = resolveJobConfig({ batchSize: 2, throttleMs: 0, retryPolicy: { maxRetries: 0 } });
  const row = await BatchJobModel.create('fixture', config, context);
  const loaded = await BatchJobModel.findById(row.id, context);
  assert.deepEqual(loaded.effective_config, config);
  assert.deepEqual(BatchJobModel.toDTO(loaded).config, config);
  const old = await db('batch_jobs').withSchema(schema).where({job_name: 'old'}).first();
  assert.equal(old.current_id, '9007199254740993');
  assert.equal(old.processed_rows, '19');
  await assert.rejects(db.transaction(async trx => {
    await BatchJobModel.updateProgress(row.id, '9007199254740995', '9007199254740994', {db: trx, schema});
    throw new Error('rollback');
  }), /rollback/);
  assert.equal((await BatchJobModel.findById(row.id, context)).current_id, '0');
}));
