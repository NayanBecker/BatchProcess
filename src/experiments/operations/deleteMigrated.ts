import { Knex } from 'knex';
import { TransactionalContext, DmlCounts } from '../../core/TransactionalBatchJob';
/** Preparation, never called by executeBatch or inside the measured operation. */
export async function markDeleteTargets(trx: Knex.Transaction, schema: string, table: string): Promise<number> {
    if (table !== 'teste_migracao') throw new Error('EXP-09 exige teste_migracao');
    if (await trx(table).withSchema(schema).whereRaw('migrado IS DISTINCT FROM FALSE').first('id')) throw new Error('Preparação EXP-09 exige migrado FALSE');
    return trx(table).withSchema(schema).where({uf:'SC'}).update({migrado:true});
}
export async function deleteMigrated(c: TransactionalContext): Promise<DmlCounts> {
    const result = await c.trx.raw('DELETE FROM ??.?? WHERE id > ? AND id <= ? AND migrado = TRUE', [c.schema,c.table,c.lo,c.hi]);
    return {changed:'0',inserted:'0',deleted:String(result.rowCount)};
}
