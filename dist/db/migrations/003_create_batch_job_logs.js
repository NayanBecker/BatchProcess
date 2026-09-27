"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('batch_job_logs', table => {
        table.increments('id').primary();
        table.integer('job_id').notNullable().references('id').inTable('batch_jobs').onDelete('CASCADE');
        table.enu('level', ['info', 'warn', 'error', 'debug']).notNullable().defaultTo('info');
        table.string('message', 2000).notNullable();
        table.jsonb('metadata'); // Dados estruturados adicionais
        table.timestamps(true, true);
    });
    // Índices para performance
    await knex.schema.table('batch_job_logs', table => {
        table.index(['job_id', 'created_at'], 'idx_job_logs_job_created');
        table.index(['level', 'created_at'], 'idx_job_logs_level_created');
    });
}
async function down(knex) {
    await knex.schema.dropTable('batch_job_logs');
}
