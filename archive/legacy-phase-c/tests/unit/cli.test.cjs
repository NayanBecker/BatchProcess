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
  assert.match(result.stdout, /NormalizeSocioNamesJob/);
  assert.doesNotMatch(result.stdout, /Add_Contact|NormalizeUser/);
});

test('start legado recusa job transacional antes de abrir banco/polling',()=>{
  const result=cli('start','NormalizeSocioNamesJob');
  assert.equal(result.status,1);assert.match(result.stderr,/fixture/);
  assert.doesNotMatch(result.stdout,/JobManager.*Iniciando/);
});
test('fixture help e parâmetros inválidos não abrem banco',()=>{
  const help=cli('fixture','--help');assert.equal(help.status,0,help.stderr);assert.match(help.stdout,/tcc_framework_test/);
  const invalid=cli('fixture','run','--database','postgres','--schema','public');
  assert.equal(invalid.status,1);assert.match(invalid.stderr,/Destino fixture/);
  const unknown=cli('fixture','run','--sql','DROP');assert.equal(unknown.status,1);assert.match(unknown.stderr,/Opção fixture/);
});
test('ajuda da CLI funciona sem configuração de banco', () => {
  const result = cli('--help');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Batch Framework CLI/);
});
