import { Knex } from 'knex';
import { DatabaseConfig } from '../types';

const config: DatabaseConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'postgres',
    poolMin: parseInt(process.env.DB_POOL_MIN || '2'),
    poolMax: parseInt(process.env.DB_POOL_MAX || '10')
};

const knexConfig: Knex.Config = {
    client: 'pg',
    connection: {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database
    },
    pool: {
        min: config.poolMin,
        max: config.poolMax
    },
    migrations: {
        tableName: 'knex_migrations',
        directory: './migrations',
        extension: 'ts'
    },
    seeds: {
        directory: './seeds'
    }
};

export default knexConfig;
