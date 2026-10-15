import { Knex } from 'knex';
import { decimalId } from './TransactionalBatchJob';
import { validateBatchSize } from './jobConfig';
import { db } from "../db/conection";
import { BatchJob } from "./BatchJob";

export interface BatchIteratorStats {
    rowsFetched: number;
    fetchDurationMs: number;
    lastFetchedAt?: Date;
}

export class BatchIterator<T> {
    static async boundary(trx: Knex.Transaction, target: {schema: string; table: string}, lo: string, highWater: string, size: number) {
        if (![target.schema, target.table].every(v => /^[a-z_][a-z0-9_]*$/.test(v))) throw new Error('identificador inválido');
        decimalId(lo); decimalId(highWater);
        validateBatchSize(size);
        const ids = await trx(target.table).withSchema(target.schema).select('id')
            .where('id', '>', lo).andWhere('id', '<=', highWater).orderBy('id').limit(size + 1);
        const batch = ids.slice(0, size);
        return { hi: batch.length ? decimalId(String(batch[batch.length - 1].id)) : lo,
            visited: String(batch.length), final: ids.length <= size };
    }

    private stats: BatchIteratorStats = {
        rowsFetched: 0,
        fetchDurationMs: 0
    };

    constructor(
        private jobRow: any,
        private jobDef: BatchJob<T>
    ) { }

    async fetchBatch(): Promise<T[]> {
        const startTime = Date.now();

        const query = this.jobDef.queryBuilder(
            this.jobRow.current_id,
            this.jobRow.batch_size
        );

        const result = await db.raw(query);

        this.stats.rowsFetched = result.rows.length;
        this.stats.fetchDurationMs = Date.now() - startTime;
        this.stats.lastFetchedAt = new Date();

        return result.rows as T[];
    }

    getStats(): BatchIteratorStats {
        return { ...this.stats };
    }

    resetStats(): void {
        this.stats = {
            rowsFetched: 0,
            fetchDurationMs: 0
        };
    }
}
