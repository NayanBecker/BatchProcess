import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('batch_job_errors', table => {
        table.increments('id').primary();
        table.integer('job_id').notNullable().references('id').inTable('batch_jobs').onDelete('CASCADE');
        table.string('error_message', 1000).notNullable();
        table.text('error_stack');
        table.bigInteger('record_id'); // ID do registro que causou o erro (se aplicável)
        table.integer('retry_count').defaultTo(0);
        table.timestamp('last_retry_at');
        table.timestamps(true, true);
    });

    // Índices para performance
    await knex.schema.table('batch_job_errors', table => {
        table.index(['job_id', 'created_at'], 'idx_job_errors_job_created');
        table.index(['job_id', 'retry_count'], 'idx_job_errors_job_retry');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('batch_job_errors');
}
