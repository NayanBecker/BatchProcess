import { BatchJob } from '../core/BatchJob';
import { db } from '../db/conection';

export class AddContactTableJob extends BatchJob<any> {
    tableName = 'contacts_user';

    async processItem(record: any): Promise<void> {
        await db('contacts_user')
            .where({ id: record.id })
            .update({
                contact_email: record.user_email
            });
    }
}