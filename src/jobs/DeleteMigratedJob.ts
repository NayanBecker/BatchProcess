import { Knex } from 'knex';
import { TransactionalBatchJob, TransactionalContext } from '../core/TransactionalBatchJob';
import { deleteMigrated } from '../experiments/operations/deleteMigrated';
export class DeleteMigratedJob extends TransactionalBatchJob {
    validateInitial = async (trx: Knex.Transaction, schema: string, table: string) => {
        if (table !== 'teste_migracao') throw new Error('EXP-09 exige teste_migracao');
        if (await trx(table).withSchema(schema).whereRaw("migrado IS DISTINCT FROM COALESCE(uf = 'SC', FALSE)").first('id')) throw new Error('EXP-09 exige marcação SC preparada separadamente');
    };
    executeBatch(c: TransactionalContext) { return deleteMigrated(c); }
}
