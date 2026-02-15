// Update with your config settings.

// When running the Knex CLI, migrations in this project are written in
// TypeScript. Register `ts-node` so the CLI can require `.ts` files.
try {
  require('ts-node/register');
} catch (e) {
  // ts-node not installed; users should compile migrations to JS first.
}

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {

  development: {
    client: 'postgresql',
    connection: {
      host: '127.0.0.1',
      user: 'postgres',
      password: 'postgres',
      database: 'postgres',
      port: 5432,
    },
    pool: { min: 2, max: 10 }
  },

  staging: {
    client: 'postgresql',
    connection: {
      database: 'my_db',
      user: 'username',
      password: 'password'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  },

  production: {
    client: 'postgresql',
    connection: {
      database: 'my_db',
      user: 'username',
      password: 'password'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  }

};
