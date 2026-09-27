import { BatchJob } from '../core/BatchJob.js';
import { db } from '../db/conection.js';

export class NormalizeUserEmailsJob extends BatchJob<any> {
    tableName = 'users';

    async processItem(user: any): Promise<void> {
        if (!user.email) return;

        await db('users')
            .where({ id: user.id })
            .update({
                normalized_email: user.email.trim().toUpperCase(),
                update_at: new Date()
            });
    }
}
