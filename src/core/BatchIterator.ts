import { db } from "../db/conection";
import { BatchJob } from "./BatchJob";

export interface BatchIteratorStats {
    rowsFetched: number;
    fetchDurationMs: number;
    lastFetchedAt?: Date;
}

export class BatchIterator<T> {
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
