import { db } from '../conection';
import { BatchJobRow, JobConfig, JobStatus, JobDTO } from '../../types';

export class BatchJobModel {
    /**
     * Busca todos os jobs com filtros e paginação
     */
    static async findAll(
        filters?: {
            status?: JobStatus;
            job_name?: string;
            worker_id?: string;
            dateFrom?: Date;
            dateTo?: Date;
        },
        pagination?: {
            page: number;
            limit: number;
        }
    ): Promise<BatchJobRow[]> {
        const query = db('batch_jobs')
            .orderBy('priority', 'desc')
            .orderBy('created_at', 'desc');

        if (filters?.status) {
            query.where('status', filters.status);
        }
        if (filters?.job_name) {
            query.where('job_name', 'like', `%${filters.job_name}%`);
        }
        if (filters?.worker_id) {
            query.where('worker_id', filters.worker_id);
        }
        if (filters?.dateFrom) {
            query.where('created_at', '>=', filters.dateFrom);
        }
        if (filters?.dateTo) {
            query.where('created_at', '<=', filters.dateTo);
        }

        if (pagination) {
            const offset = (pagination.page - 1) * pagination.limit;
            query.limit(pagination.limit).offset(offset);
        }

        return query.select('*') as any;
    }

    /**
     * Busca job por ID
     */
    static async findById(id: number): Promise<BatchJobRow | null> {
        const rows = await db('batch_jobs')
            .where({ id })
            .select('*')
            .limit(1);
        return rows[0] as BatchJobRow || null;
    }

    /**
     * Cria novo job e retorna a row completa
     */
    static async create(
        jobName: string,
        config: Required<JobConfig> & {
            priority?: number;
            tags?: string[];
            scheduled_at?: Date | null;
        }
    ): Promise<BatchJobRow> {
        const [row] = await db('batch_jobs')
            .insert({
                job_name: jobName,
                status: config.scheduled_at ? 'pending' : 'pending',
                batch_size: config.batchSize,
                current_id: 0,
                processed_rows: 0,
                throttle_ms: config.throttleMs,
                priority: config.priority || 0,
                tags: config.tags || [],
                scheduled_at: config.scheduled_at || null,
                error_count: 0,
            })
            .returning('*');
        return row as BatchJobRow;
    }

    /**
     * Atualiza campos de um job
     */
    static async update(id: number, data: Partial<BatchJobRow>): Promise<BatchJobRow> {
        const [row] = await db('batch_jobs')
            .where({ id })
            .update({ ...data, updated_at: new Date() })
            .returning('*');
        return row as BatchJobRow;
    }

    /**
     * Marca job como running (usado pelo worker ao pegar o job)
     * Usa transação com lock otimista
     */
    static async acquireJob(jobId: number, workerId: string): Promise<BatchJobRow | null> {
        return await db.transaction(async trx => {
            // SELECT FOR UPDATE para lock da row
            const job = await trx('batch_jobs')
                .where({ id: jobId, status: 'pending' })
                .forUpdate()
                .first();

            if (!job) {
                return null;
            }

            // Atualiza status e registra worker
            const [updated] = await trx('batch_jobs')
                .where({ id: jobId })
                .update({
                    status: 'running',
                    worker_id: workerId,
                    started_at: new Date(),
                    updated_at: new Date()
                })
                .returning('*');

            return updated as BatchJobRow;
        });
    }

    /**
     * Atualiza progresso (checkpoint)
     */
    static async updateProgress(
        jobId: number,
        currentId: number,
        processedRows: number
    ): Promise<void> {
        await db('batch_jobs')
            .where({ id: jobId })
            .update({
                current_id: currentId,
                processed_rows: processedRows,
                updated_at: new Date()
            });
    }

    /**
     * Marca job como pausado
     */
    static async pause(jobId: number): Promise<BatchJobRow> {
        const [row] = await db('batch_jobs')
            .where({ id: jobId, status: 'running' })
            .update({ status: 'paused', updated_at: new Date() })
            .returning('*');
        return row as BatchJobRow;
    }

    /**
     * Retoma job pausado
     */
    static async resume(jobId: number): Promise<BatchJobRow> {
        const [row] = await db('batch_jobs')
            .where({ id: jobId, status: 'paused' })
            .update({ status: 'running', updated_at: new Date() })
            .returning('*');
        return row as BatchJobRow;
    }

    /**
     * Completa job
     */
    static async complete(jobId: number): Promise<BatchJobRow> {
        const [row] = await db('batch_jobs')
            .where({ id: jobId })
            .update({
                status: 'completed',
                completed_at: new Date(),
                updated_at: new Date()
            })
            .returning('*');
        return row as BatchJobRow;
    }

    /**
     * Marca job como falho
     */
    static async fail(jobId: number): Promise<BatchJobRow> {
        const [row] = await db('batch_jobs')
            .where({ id: jobId })
            .update({
                status: 'failed',
                completed_at: new Date(),
                updated_at: new Date()
            })
            .returning('*');
        return row as BatchJobRow;
    }

    /**
     * Incrementa contador de erros
     */
    static async incrementErrorCount(jobId: number): Promise<void> {
        await db('batch_jobs')
            .where({ id: jobId })
            .increment('error_count', 1)
            .update({ updated_at: new Date() });
    }

    /**
     * Cancela job (soft delete)
     */
    static async cancel(jobId: number): Promise<BatchJobRow> {
        const [row] = await db('batch_jobs')
            .where({ id: jobId })
            .update({
                status: 'cancelled',
                completed_at: new Date(),
                updated_at: new Date()
            })
            .returning('*');
        return row as BatchJobRow;
    }

    /**
     * Remove job da tabela (hard delete)
     */
    static async delete(jobId: number): Promise<void> {
        await db('batch_jobs').where({ id: jobId }).del();
    }

    /**
     * Busca próximo job pendente para um worker (baseado em prioridade e scheduled_at)
     */
    static async findNextPending(workerId: string): Promise<BatchJobRow | null> {
        const now = new Date();

        const rows = await db('batch_jobs')
            .where({
                status: 'pending'
            })
            .andWhere(builder => {
                builder
                    .whereNull('scheduled_at')
                    .orWhere('scheduled_at', '<=', now);
            })
            .orderBy('priority', 'desc')
            .orderBy('created_at', 'asc')
            .limit(1);

        if (rows.length === 0) {
            return null;
        }

        // Tenta adquirir lock no job (evitar race condition)
        return await this.acquireJob(rows[0].id, workerId);
    }

    /**
     * Conta jobs por status
     */
    static async countByStatus(): Promise<Record<JobStatus, number>> {
        const rows = await db('batch_jobs')
            .select('status')
            .count('id as count')
            .groupBy('status');

        const result: Record<JobStatus, number> = {
            pending: 0,
            running: 0,
            paused: 0,
            completed: 0,
            cancelled: 0,
            failed: 0
        };

        rows.forEach(row => {
            result[row.status as JobStatus] = Number(row.count ?? 0);
        });

        return result;
    }

    /**
     * Converte row para DTO
     */
    static toDTO(row: BatchJobRow): JobDTO {
        // Calcular métricas básicas
        const durationMs = row.started_at && row.completed_at
            ? new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()
            : row.started_at
                ? Date.now() - new Date(row.started_at).getTime()
                : 0;

        const itemsPerSecond = durationMs > 0
            ? (row.processed_rows / durationMs) * 1000
            : 0;

        return {
            id: row.id,
            job_name: row.job_name,
            status: row.status,
            config: {
                batchSize: row.batch_size,
                throttleMs: row.throttle_ms,
                retryPolicy: {
                    maxRetries: 3,
                    backoffMs: 1000
                },
                timeout: {
                    enabled: true,
                    perItemMs: 30000
                },
                checkpoint: {
                    saveAfterEveryNBatches: 1
                },
                priority: row.priority,
                tags: row.tags
            },
            metrics: {
                itemsProcessed: row.processed_rows,
                itemsPerSecond: Number(itemsPerSecond.toFixed(2)),
                errorsCount: row.error_count,
                retriesCount: 0, //TODO: calcular de batch_job_errors
                totalDurationMs: durationMs,
                avgItemDurationMs: durationMs > 0 ? durationMs / row.processed_rows : 0
            },
            tags: row.tags,
            priority: row.priority,
            scheduled_at: row.scheduled_at,
            started_at: row.started_at,
            completed_at: row.completed_at,
            error_count: row.error_count,
            worker_id: row.worker_id,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }
}
