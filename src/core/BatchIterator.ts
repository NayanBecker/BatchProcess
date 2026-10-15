import { isCanonicalIdentifier } from './identifiers';
import { Knex } from 'knex';
import { decimalId } from './TransactionalBatchJob';
import { validateBatchSize } from './jobConfig';
export class BatchIterator {
    static async boundary(trx: Knex.Transaction, target: {schema: string; table: string; eligibleOnly?: boolean}, lo: string, highWater: string, size: number) {
        if (![target.schema, target.table].every(isCanonicalIdentifier)) throw new Error('identificador inválido');
        decimalId(lo); decimalId(highWater);
        validateBatchSize(size);
        const query = trx(target.table).withSchema(target.schema).select('id')
            .where('id', '>', lo).andWhere('id', '<=', highWater);
        if (target.eligibleOnly) query.where({migrado:true});
        const ids = await query.orderBy('id').limit(size + 1);
        const batch = ids.slice(0, size);
        return { hi: batch.length ? decimalId(String(batch[batch.length - 1].id)) : lo,
            visited: String(batch.length), final: ids.length <= size };
    }
}
