const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

test('build limpo não conserva exemplos ou migration users em dist', () => {
  assert.ok(existsSync(path.join(root, 'dist/cli/index.js')), 'Execute npm run build antes de npm test');
  for (const file of ['dist/jobs/Add_ContactTablejob.js',
    'dist/Jobs_Dones/NormalizeUserEmailsJob.js', 'dist/db/migrations/002_create_users.js']) {
    assert.equal(existsSync(path.join(root, file)), false, file);
  }
});
