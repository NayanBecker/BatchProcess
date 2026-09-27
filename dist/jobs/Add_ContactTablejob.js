"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddContactTableJob = void 0;
const BatchJob_1 = require("../core/BatchJob");
const conection_1 = require("../db/conection");
class AddContactTableJob extends BatchJob_1.BatchJob {
    constructor() {
        super(...arguments);
        this.tableName = 'contacts_user';
    }
    async processItem(record) {
        await (0, conection_1.db)('contacts_user')
            .where({ id: record.id })
            .update({
            contact_email: record.user_email
        });
    }
}
exports.AddContactTableJob = AddContactTableJob;
