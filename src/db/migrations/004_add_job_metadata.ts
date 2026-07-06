import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Adicionar novos campos à tabela batch_jobs
    await knex.schema.alterTable('batch_jobs', table => {
        table.integer('priority').defaultTo(0).notNullable().after('throttle_ms');
        table.jsonb('tags').defaultTo('[]').notNullable().after('priority');
        table.timestamp('scheduled_at').nullable().after('tags');
        table.timestamp('started_at').nullable().after('scheduled_at');
        table.timestamp('completed_at').nullable().after('started_at');
        table.integer('error_count').defaultTo(0).notNullable().after('completed_at');
        table.string('worker_id', 100).nullable().after('error_count'); // Identificador do worker que executa o job
    });

    // Índices adicionais
    await knex.schema.table('batch_jobs', table => {
        table.index(['status', 'scheduled_at'], 'idx_jobs_status_scheduled');
        table.index(['priority', 'status'], 'idx_jobs_priority_status');
        table.index(['worker_id'], 'idx_jobs_worker_id');
    });
}

export async function down(knex: Knex): Promise<void> {
    // Remover campos adicionados
    await knex.schema.alterTable('batch_jobs', table => {
        table.dropColumn('priority');
        table.dropColumn('tags');
        table.dropColumn('scheduled_at');
        table.dropColumn('worker_id');
    });
}
