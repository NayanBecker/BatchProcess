import { guardTransactionalConnection, withTransactionalOwnership, validatePersistenceContext } from '../../core/TransactionalOwnership';
import { db } from '../conection';
import { Knex } from 'knex';
import { validateBatchSize, validateSqlTimeouts } from '../../core/jobConfig';
import { decimalId, TransactionalSpec } from '../../core/TransactionalBatchJob';
import { BatchJobRow, JobConfig, JobStatus, JobDTO } from '../../types';

export interface PersistenceContext { db: Knex; schema: string; dataSchema?: string; clone?: {config: import('../../experiments/cloneConfig').CloneConfig; confirmation: string}; }
function table(context?: PersistenceContext) {
    if (context && !/^[a-z_][a-z0-9_]*$/.test(context.schema)) throw new Error('Schema inválido');
    return (context?.db ?? db)('batch_jobs').withSchema(context?.schema ?? 'public');
}

export class BatchJobModel {
    static async requestTransactionalControl(id: number, request: 'pause' | 'cancel', context: PersistenceContext) {
        if (!['pause', 'cancel'].includes(request)) throw new Error('Pedido inválido');
        return context.db.transaction(async trx => {
            await guardTransactionalConnection(trx, context);
            const row = await table({db: trx, schema: context.schema}).where({id}).forUpdate().first();
            if (!row?.transactional_state || row.status !== 'running') throw new Error('Job transacional não está running');
            const [saved] = await table({db: trx, schema: context.schema}).where({id}).update({
                transactional_state: {...row.transactional_state, controlRequest: request}, updated_at: new Date()
            }).returning('*');
            return saved;
        });
    }

    static async deleteTransactional(id: number, context: PersistenceContext): Promise<void> {
        await withTransactionalOwnership(context, id, connection => context.db.transaction(async trx => {
            await guardTransactionalConnection(trx, context);
            const target = table({db: trx, schema: context.schema});
            const row = await target.clone().where({id}).forUpdate().first();
            if (!row?.transactional_state || row.status === 'running') throw new Error('Exclusão exige parada confirmada');
            if (row.status !== 'pending' && row.transactional_state.ownershipProtocol !== 'session-affine-v1') throw new Error('Protocolo de posse não comprovado');
            await target.where({id}).delete();
        }, {connection}));
    }

    static async requeueTransactional(id: number, context: PersistenceContext, options: {recover?: boolean} = {}) {
        return withTransactionalOwnership(context, id, connection => context.db.transaction(async trx => {
            await guardTransactionalConnection(trx, context);
            const row = await table({db: trx, schema: context.schema}).where({id}).forUpdate().first();
            const allowed = options.recover === true ? ['paused', 'running', 'failed'] : ['paused'];
            if (!row?.transactional_state || !allowed.includes(row.status)) throw new Error('Retomada exige pausa confirmada; recuperação automática proibida');
            if (row.transactional_state.ownershipProtocol !== 'session-affine-v1') throw new Error('Recuperação recusada: protocolo de posse não comprovado');
            const [saved] = await table({db: trx, schema: context.schema}).where({id}).update({
                status: 'pending', worker_id: null,
                transactional_state: {...row.transactional_state, controlRequest: null}, updated_at: new Date()
            }).returning('*');
            return saved;
        }, {connection}));
    }
    static async createTransactional(name: string, config: JobConfig, spec: TransactionalSpec, context: PersistenceContext,
        validateInitial?: (trx: Knex.Transaction, schema: string, table: string) => Promise<void>): Promise<BatchJobRow> {
        if (!context) throw new Error('Contexto experimental explícito obrigatório');
        validatePersistenceContext(context);
        const dataSchema = context.dataSchema ?? context.schema;
        if (context.clone && !context.clone.config.target.tables.includes(spec.table)) throw new Error('Tabela não autorizada');
        if (!/^[a-z_][a-z0-9_]*$/.test(spec.table) || spec.table === 'receitafederal_quadrosocietario') throw new Error('Tabela não autorizada');
        if (!['A', 'B'].includes(spec.mode) || !spec.protocol || !spec.dataset || !spec.operation) throw new Error('Metadados experimentais inválidos');
        validateBatchSize(config.batchSize);
        validateSqlTimeouts(spec);
        return context.db.transaction(async trx => {
            await guardTransactionalConnection(trx, context);
            const key = await trx.raw(`SELECT 1 FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
                JOIN pg_catalog.pg_constraint k ON k.conrelid = c.oid
                WHERE n.nspname = ? AND c.relname = ? AND c.relkind = 'r'
                AND a.attname = 'id' AND a.attnotnull AND a.atttypid IN (20, 23)
                AND k.contype IN ('p', 'u') AND k.conkey = ARRAY[a.attnum]::smallint[]`, [dataSchema, spec.table]);
            if (key.rows.length === 0) throw new Error('ID exige chave única inteira NOT NULL');
            const fixtureRows = await trx(spec.table).withSchema(dataSchema).select('id').limit(1001);
            if (fixtureRows.length > (context.clone?.config.maxRows ?? 1000)) throw new Error('Execução experimental limitada a fixtures de 1000 registros');
            if (validateInitial) await validateInitial(trx, dataSchema, spec.table);
            const invalid = await trx(spec.table).withSchema(dataSchema).where('id', '<=', 0).orWhereNull('id').first('id');
            if (invalid) throw new Error('IDs devem ser positivos');
            const max = await trx(spec.table).withSchema(dataSchema).max('id as high').first();
            const highWater = decimalId(String(max?.high ?? '0'));
            const row = await this.create(name, config, {db: trx, schema: context.schema});
            const [saved] = await table({db: trx, schema: context.schema}).where({id: row.id}).update({
                transactional_state: {...spec, highWater, cursor: '0', visited: '0', changed: '0', inserted: '0', deleted: '0', commits: '0'}
            }).returning('*');
            return saved;
        });
    }
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
    static async findById(id: number, context?: PersistenceContext): Promise<BatchJobRow | null> {
        const rows = await table(context)
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
        },
        context?: PersistenceContext
    ): Promise<BatchJobRow> {
        const [row] = await table(context)
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
                effective_config: config,
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
        currentId: number | string,
        processedRows: number | string,
        context?: PersistenceContext
    ): Promise<void> {
        await table(context)
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
    static async pause(jobId: number): Promise<BatchJobRow | undefined> {
        const [row] = await db('batch_jobs')
            .where({ id: jobId, status: 'running' })
            .update({ status: 'paused', updated_at: new Date() })
            .returning('*');
        return row as BatchJobRow | undefined;
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

        const count = Number(row.processed_rows);
        const safeCount = Number.isSafeInteger(count) && count >= 0;
        const itemsPerSecond = !safeCount ? null : durationMs > 0 ? (count / durationMs) * 1000 : 0;

        return {
            id: row.id,
            transactionalState: row.transactional_state,
            job_name: row.job_name,
            status: row.status,
            config: row.effective_config ?? {
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
                itemsPerSecond: itemsPerSecond === null ? null : Number(itemsPerSecond.toFixed(2)),
                errorsCount: row.error_count,
                retriesCount: 0, //TODO: calcular de batch_job_errors
                totalDurationMs: durationMs,
                avgItemDurationMs: row.transactional_state || !safeCount ? null : count > 0 && durationMs > 0 ? durationMs / count : 0
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
