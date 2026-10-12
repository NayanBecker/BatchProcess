import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('users', table => {
        table.bigIncrements('id').primary();

        table.string('email').notNullable();
        table.string('normalized_email').nullable();

        table.timestamp('created_at').defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('users');
}
