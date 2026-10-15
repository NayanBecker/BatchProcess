const { test } = require('node:test');
const assert = require('node:assert/strict');

test('fixtures recusam bancos protegidos e cleanup sem posse', async () => {
  const { assertTestDatabase, cleanupSchema } = require('../helpers/phase-c-db.cjs');
  for (const name of ['postgres', 'backup_testes', undefined]) {
    assert.throws(() => assertTestDatabase(name), /tcc_framework_test/);
  }
  assert.doesNotThrow(() => assertTestDatabase('tcc_framework_test'));
  await assert.rejects(cleanupSchema({}, 'public'), /posse/);
  await assert.rejects(cleanupSchema({}, 'phase_c_test_forged'), /posse/);
});
