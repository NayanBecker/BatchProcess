import { TransactionalContext, DmlCounts } from '../../core/TransactionalBatchJob';
export async function copySocios(c: TransactionalContext): Promise<DmlCounts> {
    const result = await c.trx.raw('INSERT INTO ??.?? (id,nome,documento) SELECT id,nome,documento FROM ??.?? WHERE id > ? AND id <= ?', [c.schema,'teste_destino',c.schema,c.table,c.lo,c.hi]);
    return {changed:'0',inserted:String(result.rowCount),deleted:'0'};
}
