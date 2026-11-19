import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('batch_jobs', table => {
        table.jsonb('effective_config').nullable();
        table.jsonb('transactional_state').nullable();
    });
}
export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('batch_jobs', table => {
        table.dropColumn('effective_config');
        table.dropColumn('transactional_state');
    });
}
