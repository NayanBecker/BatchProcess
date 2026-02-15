import { db } from '../db/conection';
import { BatchJob } from './BatchJob';

export class BatchIterator<T> {
    constructor(
        private jobRow: any,
        private jobDef: BatchJob<T>
    ) { }

    async fetchBatch(): Promise<T[]> {
        const query = this.jobDef.queryBuilder(
            this.jobRow.current_id,
            this.jobRow.batch_size
        );

        const result = await db.raw(query);
        return result.rows;
    }
}