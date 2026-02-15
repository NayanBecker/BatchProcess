import { db } from '../db/conection';
import { JobRegistry } from '../core/JobRegistry';
import { BatchExecutor } from '../core/BatchExecutor';

const [, , command, arg] = process.argv;

async function main() {
    if (command === 'start') {
        const jobName = arg;
        const jobDef = new JobRegistry[jobName]();

        const [jobRow] = await db('batch_jobs')
            .insert({ job_name: jobName })
            .returning('*');

        await new BatchExecutor().run(jobRow, jobDef);
    }

    if (command === 'pause') {
        await db('batch_jobs')
            .where({ id: arg })
            .update({ status: 'paused' });
    }

    if (command === 'resume') {
        const jobRow = await db('batch_jobs')
            .where({ id: arg })
            .first();

        const jobDef = new JobRegistry[jobRow.job_name]();
        await new BatchExecutor().run(jobRow, jobDef);
    }
}

main();
