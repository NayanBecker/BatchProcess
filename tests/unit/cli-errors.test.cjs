const {test}=require('node:test');
const assert=require('node:assert/strict');
require('ts-node/register');
const {formatCliError}=require('../../src/cli/index');

test('CLI explains connection and permission failures without printing database error details',()=>{
 const cases={
  '28P01':/autenticação.*passwordEnv/i,
  '28000':/autenticação/i,
  ECONNREFUSED:/conexão.*host.*port/i,
  ENOTFOUND:/host/i,
  ETIMEDOUT:/tempo.*conexão/i,
  '3D000':/banco.*existe/i,
  '42501':/permissão/i,
 };
 for(const [code,expected] of Object.entries(cases)){
  const error=Object.assign(new Error('SECRET password SQL UPDATE private_table'),{code,detail:'SECRET',query:'SECRET'});
  const message=formatCliError(error);
  assert.match(message,expected,code);
  assert.ok(message.includes(code),code);
  assert.doesNotMatch(message,/SECRET|private_table/);
 }
 assert.doesNotMatch(formatCliError(new Error('SECRET')),/SECRET/);
});
