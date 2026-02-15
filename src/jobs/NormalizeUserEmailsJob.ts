import { BatchJob } from '../core/BatchJob';
import { db } from '../db/conection';

export class NormalizeUserEmailsJob extends BatchJob<any> {
    tableName = 'users';

    async processItem(user: any): Promise<void> {
        if (!user.email) return;

        await db('users')
            .where({ id: user.id })
            .update({
                normalized_email: user.email.trim().toLowerCase()
            });
    }
}
