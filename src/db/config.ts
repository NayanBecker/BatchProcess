import type { Knex } from 'knex';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';

// src/db e dist/db têm a mesma profundidade; independe do cwd do Knex CLI.
const envFile = process.env.BATCH_ENV_FILE || path.resolve(__dirname, '../../.env');
if (process.env.BATCH_ENV_FILE || existsSync(envFile)) {
    loadEnvFile(envFile); // Variáveis já presentes no processo têm precedência.
}

function required(name: string): string {
    const value = process.env[name];
    if (!value || !value.trim()) throw new Error(`${name} é obrigatório.`);
    return value;
}

function integer(name: string, fallback: number, min: number, max: number): number {
    const raw = process.env[name] ?? String(fallback);
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
        throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}.`);
    }
    return value;
}

/** Fonte única de configuração para a aplicação e as migrations. */
export function databaseConfig(): Knex.Config {
    const database = required('DB_NAME'); // Nunca cair implicitamente no banco postgres.
    const user = required('DB_USER');
    const password = required('DB_PASSWORD');
    const port = integer('DB_PORT', 5432, 1, 65535);
    const min = integer('DB_POOL_MIN', 0, 0, 1000);
    const max = integer('DB_POOL_MAX', 10, 1, 1000);
    if (min > max) throw new Error('DB_POOL_MIN não pode exceder DB_POOL_MAX.');

    return {
        client: 'pg',
        connection: {
            host: process.env.DB_HOST || '127.0.0.1',
            port, user, password, database
        },
        pool: { min, max }
    };
}
