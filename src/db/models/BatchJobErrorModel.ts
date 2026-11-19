import { isCanonicalIdentifier } from '../../core/identifiers';
import { PersistenceContext } from './BatchJobModel';
import { guardTransactionalConnection } from '../../core/TransactionalOwnership';
function scoped(context?: PersistenceContext) {
    if (!context || !isCanonicalIdentifier(context.schema)) throw new Error('Contexto explícito obrigatório');
    return context.db('batch_job_errors').withSchema(context.schema);
}
import { BatchJobErrorRow } from '../../types';

export class BatchJobErrorModel {
    /**
     * Registra um erro ocorrido durante processamento de um job
     */
    static async create(
        jobId: number,
        error: Error,
        recordId?: number,
        retryCount: number = 0,
        context?: PersistenceContext
    ): Promise<BatchJobErrorRow> {
        if (!context) throw new Error('Contexto explícito obrigatório');
        return context.db.transaction(async trx=>{
        await guardTransactionalConnection(trx,context);
        const [row] = await scoped({...context,db:trx})
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
        });
    }

    /**
     * Busca erros de um job específico
     */
    static async findByJobId(
        jobId: number,
        pagination?: {
            page: number;
            limit: number;
        },
        context?: PersistenceContext
    ): Promise<BatchJobErrorRow[]> {
        const query = scoped(context)
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
    static async countByJobId(jobId: number, context?: PersistenceContext): Promise<number> {
        const result = await scoped(context)
            .where({ job_id: jobId })
            .count('id as count')
            .first();

        return result ? Number(result.count ?? 0) : 0;
    }

    /**
     * Busca últimos erros de todos os jobs (para dashboard)
     */
    static async findRecent(limit: number = 50, context?: PersistenceContext): Promise<(BatchJobErrorRow & { job_name: string })[]> {
        return await scoped(context)
            .join(`${context!.schema}.batch_jobs`, 'batch_job_errors.job_id', 'batch_jobs.id')
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
    static async deleteByJobId(jobId: number, context?: PersistenceContext): Promise<void> {
        if (!context) throw new Error('Contexto explícito obrigatório');
        await context.db.transaction(async trx=>{
            await guardTransactionalConnection(trx,context);
            await scoped({...context,db:trx}).where({job_id:jobId}).del();
        });
    }

    /**
     * Limpa erros muito antigos (retenção)
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
}
