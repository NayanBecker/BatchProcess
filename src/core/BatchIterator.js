"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchIterator = void 0;
const conection_1 = require("../db/conection");
class BatchIterator {
    constructor(jobRow, jobDef) {
        this.jobRow = jobRow;
        this.jobDef = jobDef;
        this.stats = {
            rowsFetched: 0,
            fetchDurationMs: 0
        };
    }
    async fetchBatch() {
        const startTime = Date.now();
        const query = this.jobDef.queryBuilder(this.jobRow.current_id, this.jobRow.batch_size);
        const result = await conection_1.db.raw(query);
        this.stats.rowsFetched = result.rows.length;
        this.stats.fetchDurationMs = Date.now() - startTime;
        this.stats.lastFetchedAt = new Date();
        return result.rows;
    }
    getStats() {
        return { ...this.stats };
    }
    resetStats() {
        this.stats = {
            rowsFetched: 0,
            fetchDurationMs: 0
        };
    }
}
exports.BatchIterator = BatchIterator;
