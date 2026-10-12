const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function run(args, database) {
  return spawnSync(process.execPath, ['-r', 'ts-node/register', 'src/db/migrate.ts', ...args], {
    cwd: root, env: { ...process.env, DB_NAME: database, DB_HOST: '127.0.0.1',
      DB_PORT: '1', DB_USER: 'unit_user', DB_PASSWORD: 'unit_dummy' },
    encoding: 'utf8', timeout: 15000
  });
}

test('migrations recusam banco original antes de abrir conexão', () => {
  const result = run(['latest'], 'postgres');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /permitidas apenas em tcc_framework_test/);
});

test('rollback exige confirmação explícita antes de abrir conexão', () => {
  const result = run(['rollback'], 'tcc_framework_test');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--confirm=tcc_framework_test/);
});
