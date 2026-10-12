const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function cli(...args) {
  return spawnSync(process.execPath, ['-r', 'ts-node/register', 'src/cli/index.ts', ...args], {
    cwd: root, env: { ...process.env, DB_NAME: '', DB_USER: '', DB_PASSWORD: '' },
    encoding: 'utf8', timeout: 20000
  });
}

test('job não registrado é recusado antes de abrir banco ou iniciar worker', () => {
  const result = cli('start', 'AddContactTableJob');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /não encontrado no registry/);
  assert.doesNotMatch(result.stdout, /JobManager.*Iniciando/);
});

test('ID parcialmente numérico é recusado antes de abrir o banco', () => {
  const result = cli('status', '12abc');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ID.*inteiro positivo/);
});

test('catálogo padrão não inclui jobs históricos', () => {
  const result = cli('jobs');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nenhum job encontrado/);
  assert.doesNotMatch(result.stdout, /Add_Contact|NormalizeUser/);
});

test('ajuda da CLI funciona sem configuração de banco', () => {
  const result = cli('--help');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Batch Framework CLI/);
});
