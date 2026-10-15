require('ts-node/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
test('contrato transacional não exige processItem e rejeita retry/checkpoint esparso', () => {
  const { TransactionalBatchJob, decimalId } = require('../../src/core/TransactionalBatchJob');
  const { registry } = require('../../src/core/JobRegistry');
  class Fixture extends TransactionalBatchJob { async executeBatch() { return { changed: '0', inserted: '0', deleted: '0' }; } }
  registry.register('TxFixture', Fixture);
  try {
    const job = registry.create('TxFixture');
    assert.equal(job.kind, 'transactional');
    assert.equal(job.processItem, undefined);
    assert.equal(job.config.retryPolicy.maxRetries, 0);
    assert.throws(() => new Fixture({ retryPolicy: { maxRetries: 1 } }), /retry/);
    assert.throws(() => new Fixture({ timeout: { enabled: true } }), /statementTimeoutMs/);
    assert.throws(() => new Fixture({ timeout: { totalMs: 100 } }), /total/);
    assert.throws(() => new Fixture({ checkpoint: { saveAfterEveryNBatches: 2 } }), /checkpoint/);
    assert.equal(decimalId('9007199254740993'), '9007199254740993');
    for (const invalid of [9007199254740992, '-1', '01', '1;DROP', '9223372036854775808']) assert.throws(() => decimalId(invalid), /ID/);
  } finally { registry.unregister('TxFixture'); }
});
