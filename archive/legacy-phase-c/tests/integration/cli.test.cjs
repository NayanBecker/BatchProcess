const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { db } = require('../../src/db/conection');
const root = path.resolve(__dirname, '../..');

before(async () => {
  assert.equal(db.client.connectionSettings.database, 'tcc_framework_test');
  const { rows } = await db.raw('SELECT current_database() AS database');
  assert.equal(rows[0].database, 'tcc_framework_test');
  const [{ count }] = await db('batch_jobs').count('* as count');
  assert.equal(Number(count), 0, 'Teste exige banco preparado sem execuções; nenhum registro será apagado.');
});
after(() => db.destroy());

for (const [mode, entry] of [
  ['dev', ['-r', 'ts-node/register', 'src/cli/index.ts']],
  ['compilado', ['dist/cli/index.js']]
]) {
  for (const [args, message] of [
    [['list'], /Nenhum job encontrado/],
    [['status', '1'], /Job não encontrado/],
    [['logs', '1'], /Nenhum log encontrado/]
  ]) {
    test(`${mode}: ${args.join(' ')} trata banco vazio e encerra`, () => {
      const result = spawnSync(process.execPath, [...entry, ...args], {
        cwd: root, env: process.env, encoding: 'utf8', timeout: 12000
      });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, message);
    });
  }
}
