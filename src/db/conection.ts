import knex from 'knex';

export const db = knex({
    client: 'pg',
    connection: {
        host: "127.0.0.1",
        user: "postgres",
        password: "postgres",
        database: "postgres",
        port: 5432,
    },
    pool: { min: 2, max: 10 }
});
