"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NormalizeUserEmailsJob = void 0;
const BatchJob_1 = require("../core/BatchJob");
const conection_1 = require("../db/conection");
class NormalizeUserEmailsJob extends BatchJob_1.BatchJob {
    constructor() {
        super(...arguments);
        this.tableName = 'users';
    }
    async processItem(user) {
        if (!user.email)
            return;
        await (0, conection_1.db)('users')
            .where({ id: user.id })
            .update({
            normalized_email: user.email.trim().toUpperCase(),
            update_at: new Date()
        });
    }
}
exports.NormalizeUserEmailsJob = NormalizeUserEmailsJob;
