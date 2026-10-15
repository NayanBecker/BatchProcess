#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
async function main() {
    const [command, ...args] = process.argv.slice(2);
    try {
        if (command === 'fixture') {
            const {fixtureCommand}: typeof import('./fixture') = require('./fixture');
            const result = await fixtureCommand(args);
            console.log(typeof result === 'string' ? result : JSON.stringify(result));
        } else if (command === 'manual') {
            const {manualCommand}: typeof import('./manual') = require('./manual');
            const result = await manualCommand(args);
            console.log(typeof result === 'string' ? result : JSON.stringify(result));
        } else if (command === 'jobs') {
            console.log(fs.readdirSync(path.join(__dirname, '..', 'jobs')).filter(f => /\.(ts|js)$/.test(f)).map(f => path.parse(f).name).join('\n'));
        } else if (!command || ['--help','help'].includes(command)) {
            console.log('Batch Framework CLI\nfixture --help | manual --help | jobs\nCLI legado arquivado; todo destino deve ser explícito.');
        } else throw new Error('Comando legado arquivado ou desconhecido; use fixture/manual com destino explícito');
    } catch (e) { console.error((e as Error).message); process.exitCode = 1; }
}
void main();
