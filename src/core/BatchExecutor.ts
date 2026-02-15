import { db } from "../db/conection";
import { BatchIterator } from "./BatchIterator";


const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

export class BatchExecutor<T> {
    async run(jobRow: any, jobDef: any) {
        await jobDef.validate();

        await db('batch_jobs')
            .where({ id: jobRow.id })
            .update({ status: 'running' });

        while (true) {
            const freshJob = await db('batch_jobs')
                .where({ id: jobRow.id })
                .first();

            if (freshJob.status === 'paused') break;

            const iterator = new BatchIterator(freshJob, jobDef);
            const records = await iterator.fetchBatch() as any[];

            if (records.length === 0) break;

            for (const record of records) {
                await jobDef.processItem(record);
            }

            const lastId = records[records.length - 1].id;

            await db('batch_jobs')
                .where({ id: jobRow.id })
                .update({
                    current_id: lastId,
                    processed_rows: freshJob.processed_rows + records.length,
                    updated_at: new Date()
                });

            await sleep(freshJob.throttle_ms);
        }

        await db('batch_jobs')
            .where({ id: jobRow.id })
            .update({ status: 'completed' });
    }
}