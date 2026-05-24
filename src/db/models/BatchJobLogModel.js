"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchJobLogModel = void 0;
const conection_1 = require("../conection");
class BatchJobLogModel {
    /**
     * Registra log de um job
     */
    static async create(jobId, level, message, metadata) {
        const [row] = await (0, conection_1.db)('batch_job_logs')
            .insert({
            job_id: jobId,
            level,
            message,
            metadata: metadata || {}
        })
            .returning('*');
        return row;
    }
    /**
     * Busca logs de um job com paginação
     */
    static async findByJobId(jobId, pagination, levels) {
        const query = (0, conection_1.db)('batch_job_logs')
            .where({ job_id: jobId });
        if (levels && levels.length > 0) {
            query.whereIn('level', levels);
        }
        query.orderBy('created_at', 'desc');
        if (pagination) {
            const offset = (pagination.page - 1) * pagination.limit;
            query.limit(pagination.limit).offset(offset);
        }
        return query.select('*');
    }
    /**
     * Busca logs recentes de todos os jobs
     */
    static async findRecent(limit = 100) {
        return await (0, conection_1.db)('batch_job_logs')
            .join('batch_jobs', 'batch_job_logs.job_id', 'batch_jobs.id')
            .select('batch_job_logs.*', 'batch_jobs.job_name')
            .orderBy('batch_job_logs.created_at', 'desc')
            .limit(limit);
    }
    /**
     * Limpa logs muito antigos (retenção)
     */
    static async cleanupOlderThan(days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const result = await (0, conection_1.db)('batch_job_logs')
            .where('created_at', '<', cutoffDate)
            .del();
        return result;
    }
    /**
     * Conta logs por nível em um período
     */
    static async countByLevel(jobId, hoursBack = 24) {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hoursBack);
        const baseQuery = (0, conection_1.db)('batch_job_logs')
            .where('created_at', '>=', cutoff);
        if (jobId) {
            baseQuery.where({ job_id: jobId });
        }
        const rows = await baseQuery
            .select('level')
            .count('id as count')
            .groupBy('level');
        const result = {
            info: 0,
            warn: 0,
            error: 0,
            debug: 0
        };
        rows.forEach(row => {
            result[row.level] = parseInt(row.count);
        });
        return result;
    }
}
exports.BatchJobLogModel = BatchJobLogModel;
