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


