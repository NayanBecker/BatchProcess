require('ts-node/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
test('resolução profunda respeita precedência e zeros sem mutar defaults', () => {
  const { resolveJobConfig } = require('../../src/core/jobConfig');
  const job = { batchSize: 10, retryPolicy: { maxRetries: 4, backoffMs: 19 } };
  const result = resolveJobConfig(job, { batchSize: 20, retryPolicy: { maxRetries: 2 } }, { throttleMs: 0, retryPolicy: { maxRetries: 0 } });
  assert.equal(result.batchSize, 20);
  assert.equal(result.throttleMs, 0);
  assert.deepEqual(result.retryPolicy, { maxRetries: 0, backoffMs: 19, jitterMs: 100 });
  assert.equal(job.retryPolicy.maxRetries, 4);
  for (const invalid of [{ batchSize: 0 }, { batchSize: 1.5 }, { throttleMs: -1 }, { retryPolicy: { maxRetries: -1 } }]) {
    assert.throws(() => resolveJobConfig(invalid), /inválid/);
  }
});

test('BatchJob usa resolução profunda e manager valida antes de persistir', async () => {
  const { BatchJob } = require('../../src/core/BatchJob');
  const { registry } = require('../../src/core/JobRegistry');
  const { JobManager } = require('../../src/core/JobManager');
  const { db } = require('../../src/db/conection');
  class Invalid extends BatchJob {
    tableName = 'fixture';
    async validate() { throw new Error('invalid fixture'); }
    async processItem() {}
  }
  registry.register('InvalidFixture', Invalid);
  try {
    const job = new Invalid({ retryPolicy: { maxRetries: 0 } });
    assert.equal(job.config.retryPolicy.backoffMs, 1000);
    const manager = JobManager.getInstance({ maxConcurrentJobs: 1 });
    const { BatchJobModel } = require('../../src/db/models');
    const create = BatchJobModel.create;
    BatchJobModel.create = async () => { throw new Error('persist before validate'); };
    try { await assert.rejects(manager.startJob('InvalidFixture'), /invalid fixture/); }
    finally { BatchJobModel.create = create; }
  } finally { registry.unregister('InvalidFixture'); await db.destroy(); }
});
