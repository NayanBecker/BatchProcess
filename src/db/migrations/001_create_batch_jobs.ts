import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('batch_jobs', table => {
        table.increments('id').primary();
        table.string('job_name').notNullable();
        table.string('status').notNullable().defaultTo('pending');
        table.integer('batch_size').defaultTo(1000);
        table.bigInteger('current_id').defaultTo(0);
        table.bigInteger('processed_rows').defaultTo(0);
        table.integer('throttle_ms').defaultTo(500);
        table.timestamps(true, true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('batch_jobs');
}
