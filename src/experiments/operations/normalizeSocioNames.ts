import { TransactionalContext, DmlCounts } from '../../core/TransactionalBatchJob';

/** EXP-06 protocol v3: NULL remains NULL; internal spaces are preserved. */
export async function normalizeSocioNames(context: TransactionalContext): Promise<DmlCounts> {
    const {trx, schema, table, lo, hi} = context;
    const result = await trx.raw(
        'UPDATE ??.?? SET nome_normalizado = UPPER(TRIM(nome)), processado = TRUE WHERE id > ? AND id <= ? AND processado = FALSE',
        [schema, table, lo, hi]
    );
    return {changed: String(result.rowCount), inserted: '0', deleted: '0'};
}
