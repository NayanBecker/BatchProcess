const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function probe(overrides = {}) {
  return spawnSync(process.execPath, ['-r', 'ts-node/register', '-e', `
    const assert = require('node:assert/strict');
    const { db } = require('./src/db/conection');
    const config = require('./src/db/knexfile').default;
    assert.equal(db.client.config.connection.database, process.env.DB_NAME);
    for (const key of ['host', 'port', 'user', 'password', 'database']) {
      assert.equal(db.client.connectionSettings[key], config.connection[key], key);
    }
    assert.deepEqual(db.client.config.pool, config.pool);
    db.destroy();
  `], {
    cwd: root,
    env: { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: '5432',
      DB_NAME: 'unit_config_target', DB_USER: 'unit_user', DB_PASSWORD: 'unit_dummy',
      DB_POOL_MIN: '0', DB_POOL_MAX: '3', ...overrides },
    encoding: 'utf8', timeout: 15000
  });
}

test('runtime e migrations usam a mesma configuração de ambiente', () => {
  const result = probe();
  assert.equal(result.status, 0, result.stderr);
});

for (const [name, overrides, expected] of [
  ['banco explícito obrigatório', { DB_NAME: '' }, /DB_NAME.*obrigat/],
  ['usuário obrigatório', { DB_USER: '' }, /DB_USER.*obrigat/],
  ['senha obrigatória', { DB_PASSWORD: '' }, /DB_PASSWORD.*obrigat/],
  ['porta inválida', { DB_PORT: 'abc' }, /DB_PORT.*inteiro/],
  ['pool inválido', { DB_POOL_MIN: '5', DB_POOL_MAX: '2' }, /DB_POOL_MIN.*DB_POOL_MAX/]
]) {
  test(name, () => {
    const result = probe(overrides);
    assert.equal(result.status, 1);
    assert.match(result.stderr, expected);
    assert.doesNotMatch(result.stderr, /unit_dummy/);
  });
}

test('carrega arquivo explícito e preserva a precedência do ambiente', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-config-'));
  const envFile = path.join(dir, '.env');
  fs.writeFileSync(envFile, 'DB_NAME=from_file\nDB_USER=file_user\nDB_PASSWORD=unit_dummy\n');
  try {
    const result = spawnSync(process.execPath, ['-r', 'ts-node/register', '-e', `
      const assert = require('node:assert/strict');
      delete process.env.DB_NAME;
      delete process.env.DB_PASSWORD;
      process.chdir(require('node:os').tmpdir());
      const { databaseConfig } = require(${JSON.stringify(path.join(root, 'src/db/config'))});
      const config = databaseConfig();
      assert.equal(config.connection.database, 'from_file');
      assert.equal(config.connection.user, 'environment_user');
      assert.equal(config.connection.password, 'unit_dummy');
    `], { cwd: root, env: { ...process.env, BATCH_ENV_FILE: envFile,
      DB_USER: 'environment_user' }, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
