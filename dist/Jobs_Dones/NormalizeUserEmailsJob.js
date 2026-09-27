"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NormalizeUserEmailsJob = void 0;
const BatchJob_js_1 = require("../core/BatchJob.js");
const conection_js_1 = require("../db/conection.js");
class NormalizeUserEmailsJob extends BatchJob_js_1.BatchJob {
    constructor() {
        super(...arguments);
        this.tableName = 'users';
    }
    async processItem(user) {
        if (!user.email)
            return;
        await (0, conection_js_1.db)('users')
            .where({ id: user.id })
            .update({
            normalized_email: user.email.trim().toUpperCase(),
            update_at: new Date()
        });
    }
}
exports.NormalizeUserEmailsJob = NormalizeUserEmailsJob;
