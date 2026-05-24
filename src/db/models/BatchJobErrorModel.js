"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchJobErrorModel = void 0;
const conection_1 = require("../conection");
class BatchJobErrorModel {
    /**
     * Registra um erro ocorrido durante processamento de um job
     */
    static async create(jobId, error, recordId, retryCount = 0) {
        const [row] = await (0, conection_1.db)('batch_job_errors')
            .insert({
            job_id: jobId,
            error_message: error.message,
            error_stack: error.stack || null,
            record_id: recordId || null,
            retry_count: retryCount,
            last_retry_at: retryCount > 0 ? new Date() : null
        })
            .returning('*');
        return row;
    }
    /**
     * Busca erros de um job específico
     */
    static async findByJobId(jobId, pagination) {
        const query = (0, conection_1.db)('batch_job_errors')
            .where({ job_id: jobId })
            .orderBy('created_at', 'desc');
        if (pagination) {
            const offset = (pagination.page - 1) * pagination.limit;
            query.limit(pagination.limit).offset(offset);
        }
        return query.select('*');
    }
    /**
     * Conta erros por job
     */
    static async countByJobId(jobId) {
        const result = await (0, conection_1.db)('batch_job_errors')
            .where({ job_id: jobId })
            .count('id as count')
            .first();
        return result ? parseInt(result.count) : 0;
    }
    /**
     * Busca últimos erros de todos os jobs (para dashboard)
     */
    static async findRecent(limit = 50) {
        return await (0, conection_1.db)('batch_job_errors')
            .join('batch_jobs', 'batch_job_errors.job_id', 'batch_jobs.id')
            .select('batch_job_errors.*', 'batch_jobs.job_name')
            .orderBy('batch_job_errors.created_at', 'desc')
            .limit(limit);
    }
    /**
     * Remove erros de um job (útil para limpeza após retry)
     */
    static async deleteByJobId(jobId) {
        await (0, conection_1.db)('batch_job_errors').where({ job_id: jobId }).del();
    }
    /**
     * Limpa erros muito antigos (retenção)
     */
    static async cleanupOlderThan(days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const result = await (0, conection_1.db)('batch_job_errors')
            .where('created_at', '<', cutoffDate)
            .del();
        return result;
    }
}
exports.BatchJobErrorModel = BatchJobErrorModel;
