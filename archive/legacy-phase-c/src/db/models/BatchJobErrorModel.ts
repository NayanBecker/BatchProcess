import { db } from '../conection';
import { BatchJobErrorRow } from '../../types';

export class BatchJobErrorModel {
    /**
     * Registra um erro ocorrido durante processamento de um job
     */
    static async create(
        jobId: number,
        error: Error,
        recordId?: number,
        retryCount: number = 0
    ): Promise<BatchJobErrorRow> {
        const [row] = await db('batch_job_errors')
            .insert({
                job_id: jobId,
                error_message: error.message,
                error_stack: error.stack || null,
                record_id: recordId || null,
                retry_count: retryCount,
                last_retry_at: retryCount > 0 ? new Date() : null
            })
            .returning('*');

        return row as BatchJobErrorRow;
    }

    /**
     * Busca erros de um job específico
     */
    static async findByJobId(
        jobId: number,
        pagination?: {
            page: number;
            limit: number;
        }
    ): Promise<BatchJobErrorRow[]> {
        const query = db('batch_job_errors')
            .where({ job_id: jobId })
            .orderBy('created_at', 'desc');

        if (pagination) {
            const offset = (pagination.page - 1) * pagination.limit;
            query.limit(pagination.limit).offset(offset);
        }

        return query.select('*') as any;
    }

    /**
     * Conta erros por job
     */
    static async countByJobId(jobId: number): Promise<number> {
        const result = await db('batch_job_errors')
            .where({ job_id: jobId })
            .count('id as count')
            .first();

        return result ? Number(result.count ?? 0) : 0;
    }

    /**
     * Busca últimos erros de todos os jobs (para dashboard)
     */
    static async findRecent(limit: number = 50): Promise<(BatchJobErrorRow & { job_name: string })[]> {
        return await db('batch_job_errors')
            .join('batch_jobs', 'batch_job_errors.job_id', 'batch_jobs.id')
            .select(
                'batch_job_errors.*',
                'batch_jobs.job_name'
            )
            .orderBy('batch_job_errors.created_at', 'desc')
            .limit(limit) as any;
    }

    /**
     * Remove erros de um job (útil para limpeza após retry)
     */
    static async deleteByJobId(jobId: number): Promise<void> {
        await db('batch_job_errors').where({ job_id: jobId }).del();
    }

    /**
     * Limpa erros muito antigos (retenção)
     */
    static async cleanupOlderThan(days: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const result = await db('batch_job_errors')
            .where('created_at', '<', cutoffDate)
            .del();

        return result;
    }
}
