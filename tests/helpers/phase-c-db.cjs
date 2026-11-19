const owned = new WeakMap();
function assertTestDatabase(name) {
  if (name !== 'tcc_framework_test') throw new Error('Fixtures somente em tcc_framework_test');
}
async function cleanupSchema(db, schema) {
  if (!owned.get(db)?.has(schema)) throw new Error('Cleanup recusado: schema sem posse');
  assertTestDatabase(db.client.connectionSettings.database);
  await db.transaction(async trx => {
    const { rows } = await trx.raw('SELECT current_database() AS database');
    assertTestDatabase(rows[0].database);
    await trx.raw('DROP SCHEMA ?? CASCADE', [schema]);
  });
  owned.get(db).delete(schema);
}
async function withFixture(db, check) {
  assertTestDatabase(db.client.connectionSettings.database);
  const schema = `phase_c_test_${require('node:crypto').randomUUID().replaceAll('-', '')}`;
  await db.transaction(async trx => {
    const { rows } = await trx.raw('SELECT current_database() AS database');
    assertTestDatabase(rows[0].database);
    await trx.raw('CREATE SCHEMA ??', [schema]);
  });
  if (!owned.has(db)) owned.set(db, new Set());
  owned.get(db).add(schema);
  try { return await check(schema); }
  finally { await cleanupSchema(db, schema); }
}
module.exports = { assertTestDatabase, cleanupSchema, withFixture };
