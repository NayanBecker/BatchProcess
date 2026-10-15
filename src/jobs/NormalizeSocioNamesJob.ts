import { TransactionalBatchJob, TransactionalContext } from '../core/TransactionalBatchJob';
import { normalizeSocioNames } from '../experiments/operations/normalizeSocioNames';
import { Knex } from 'knex';

/** Not auto-registered: experimental fixtures require explicit target and registration. */
export class NormalizeSocioNamesJob extends TransactionalBatchJob {
    validateInitial = async (trx: Knex.Transaction, schema: string, table: string): Promise<void> => {
        const invalid = await trx(table).withSchema(schema).whereRaw('processado IS DISTINCT FROM FALSE')
            .orWhereNotNull('nome_normalizado').first('id');
        if (invalid) throw new Error('Estado inicial EXP-06 exige processado FALSE e nome_normalizado NULL');
    };
    executeBatch(context: TransactionalContext) { return normalizeSocioNames(context); }
}
