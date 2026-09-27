"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
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
async function down(knex) {
    await knex.schema.dropTable('batch_jobs');
}
