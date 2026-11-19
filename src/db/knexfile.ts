import type { Knex } from 'knex';
import path from 'node:path';
import { databaseConfig } from './config';

const knexConfig: Knex.Config = {
    ...databaseConfig(),
    migrations: {
        tableName: 'knex_migrations',
        directory: path.resolve(__dirname, '../../src/db/migrations'),
        extension: 'ts',
        loadExtensions: ['.ts']
    }
};

export default knexConfig;
