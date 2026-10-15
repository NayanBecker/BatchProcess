import { isCanonicalIdentifier } from '../../core/identifiers';
import { PersistenceContext } from './BatchJobModel';
import { guardTransactionalConnection } from '../../core/TransactionalOwnership';
function scoped(context?: PersistenceContext) {
    if (!context || !isCanonicalIdentifier(context.schema)) throw new Error('Contexto explícito obrigatório');
    return context.db('batch_job_logs').withSchema(context.schema);
}
import { BatchJobLogRow, LogLevel } from '../../types';

export class BatchJobLogModel {
    /**
     * Registra log de um job
     */
    static async create(
        jobId: number,
        level: LogLevel,
        message: string,
        metadata?: Record<string, any>,
        context?: PersistenceContext
    ): Promise<BatchJobLogRow> {
        if (!context) throw new Error('Contexto explícito obrigatório');
        return context.db.transaction(async trx=>{
        await guardTransactionalConnection(trx,context);
        const [row] = await scoped({...context,db:trx})
            .insert({
                job_id: jobId,
                level,
                message,
                metadata: metadata || {}
            })
            .returning('*');

        return row as BatchJobLogRow;
        });
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
        levels?: LogLevel[],
        context?: PersistenceContext
    ): Promise<BatchJobLogRow[]> {
        const query = scoped(context)
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
    static async findRecent(limit: number = 100, context?: PersistenceContext): Promise<(BatchJobLogRow & { job_name: string })[]> {
        return await scoped(context)
            .join(`${context!.schema}.batch_jobs`, 'batch_job_logs.job_id', 'batch_jobs.id')
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
    static async cleanupOlderThan(days: number, context?: PersistenceContext): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        if (!context) throw new Error('Contexto explícito obrigatório');
        const result = await context.db.transaction(async trx=>{
            await guardTransactionalConnection(trx,context);
            const deleted=await scoped({...context,db:trx}).where('created_at','<',cutoffDate).del().returning('id');
            return deleted.length;
        });

        return result;
    }

    /**
     * Conta logs por nível em um período
     */
    static async countByLevel(
        jobId?: number,
        hoursBack: number = 24,
        context?: PersistenceContext
    ): Promise<Record<LogLevel, number>> {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hoursBack);

        const baseQuery = scoped(context)
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
            result[row.level as LogLevel] = Number(row.count ?? 0);
        });

        return result;
    }
}
