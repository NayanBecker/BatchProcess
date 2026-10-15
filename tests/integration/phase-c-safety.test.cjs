const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../../src/db/conection');
const fixtures = require('../helpers/phase-c-db.cjs');
after(() => db.destroy());
test('fixture usa commits reais e limpa schema no sucesso e na falha', async () => {
  for (const fail of [false, true]) {
    let schema;
    const run = () => fixtures.withFixture(db, async s => {
      schema = s;
      await db.schema.withSchema(s).createTable('probe', t => t.integer('id'));
      await db('probe').withSchema(s).insert({ id: 1 });
      assert.equal((await db('probe').withSchema(s)).length, 1);
      if (fail) throw new Error('falha controlada');
    });
    if (fail) await assert.rejects(run(), /falha controlada/); else await run();
    assert.equal((await db.raw('SELECT 1 FROM pg_namespace WHERE nspname = ?', [schema])).rows.length, 0);
  }
});
