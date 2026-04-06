import { db } from '../conection';
import { BatchJobLogRow, LogLevel } from '../../types';

export class BatchJobLogModel {
    /**
     * Registra log de um job
     */
    static async create(
        jobId: number,
        level: LogLevel,
        message: string,
        metadata?: Record<string, any>
    ): Promise<BatchJobLogRow> {
        const [row] = await db('batch_job_logs')
            .insert({
                job_id: jobId,
                level,
                message,
                metadata: metadata || {}
            })
            .returning('*');

        return row as BatchJobLogRow;
    }

    /**
     * Busca logs de um job com paginação
     */
    static async findByJobId(
        jobId: number,
        pagination?: {
            page: number;
            limit: number;
        },
        levels?: LogLevel[]
    ): Promise<BatchJobLogRow[]> {
        const query = db('batch_job_logs')
            .where({ job_id: jobId });

        if (levels && levels.length > 0) {
            query.whereIn('level', levels);
        }

        query.orderBy('created_at', 'desc');

        if (pagination) {
            const offset = (pagination.page - 1) * pagination.limit;
            query.limit(pagination.limit).offset(offset);
        }

        return query.select('*') as any;
    }

    /**
     * Busca logs recentes de todos os jobs
     */
    static async findRecent(limit: number = 100): Promise<(BatchJobLogRow & { job_name: string })[]> {
        return await db('batch_job_logs')
            .join('batch_jobs', 'batch_job_logs.job_id', 'batch_jobs.id')
            .select(
                'batch_job_logs.*',
                'batch_jobs.job_name'
            )
            .orderBy('batch_job_logs.created_at', 'desc')
            .limit(limit) as any;
    }

    /**
     * Limpa logs muito antigos (retenção)
     */
    static async cleanupOlderThan(days: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const result = await db('batch_job_logs')
            .where('created_at', '<', cutoffDate)
            .del();

        return result;
    }

    /**
     * Conta logs por nível em um período
     */
    static async countByLevel(
        jobId?: number,
        hoursBack: number = 24
    ): Promise<Record<LogLevel, number>> {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hoursBack);

        const baseQuery = db('batch_job_logs')
            .where('created_at', '>=', cutoff);

        if (jobId) {
            baseQuery.where({ job_id: jobId });
        }

        const rows = await baseQuery
            .select('level')
            .count('id as count')
            .groupBy('level');

        const result: Record<LogLevel, number> = {
            info: 0,
            warn: 0,
            error: 0,
            debug: 0
        };

        rows.forEach(row => {
            result[row.level as LogLevel] = parseInt(row.count);
        });

        return result;
    }
}
