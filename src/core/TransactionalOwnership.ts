import { isCanonicalIdentifier } from './identifiers';
import {validateRuntimeTarget, assertRuntimeControl} from './runtimeConfig';
import {isSqlEntry} from './runtimeConfig';
import {assertSqlSnapshot} from './sqlDefinition';
import type { Knex } from 'knex';
import type { PersistenceContext } from '../db/models/BatchJobModel';

export function validatePersistenceContext(context: Pick<PersistenceContext, 'schema' | 'dataSchema' | 'clone' | 'runtime'>): string {
    if (context.runtime) return validateRuntimeTarget(context.runtime, context.schema, context.dataSchema);
    if (context.clone) {
        const {validateCloneConfig} = require('./explicitTargetConfig');
        const c = validateCloneConfig(context.clone.config, context.clone.confirmation);
        if (context.schema !== c.target.controlSchema || context.dataSchema !== c.target.dataSchema) throw new Error('Contexto difere do destino autorizado');
        return c.target.database;
    }
    if (!/^phase_c_test_[a-f0-9]{32}$/.test(context.schema) || (context.dataSchema && !/^phase_c_test_[a-f0-9]{32}$/.test(context.dataSchema))) throw new Error('Contexto experimental explícito obrigatório');
    return 'tcc_framework_test';
}
export function assertDurableTarget(state: import('./TransactionalBatchJob').TransactionalState, context: PersistenceContext) {
    if (!isCanonicalIdentifier(state.table)) throw new Error('identificador de tabela durável inválido');
    if (context.runtime && context.runtime.jobs[state.operation]?.table !== state.table) throw new Error('Tabela durável difere do catálogo configurado');
    if(context.runtime){
        const entry=context.runtime.jobs[state.operation];
        if(isSqlEntry(entry)) assertSqlSnapshot(state.sqlDefinition!,entry,context.dataSchema!);
        else if(state.sqlDefinition) throw new Error('Tipo do catálogo difere do snapshot SQL');
    } else if(state.sqlDefinition) assertSqlSnapshot(state.sqlDefinition,{sqlFile:'snapshot',table:state.table,targetTable:state.sqlDefinition.targetTable,operation:state.sqlDefinition.operation},context.dataSchema??context.schema);
    const target=state.target;
    if (!target || target.database!==validatePersistenceContext(context) || target.controlSchema!==context.schema || target.dataSchema!==(context.dataSchema ?? context.schema)) throw new Error('Destino durável difere do contexto atual');
}
export async function guardTransactionalConnection(db: Knex, target: string | Pick<PersistenceContext, 'schema' | 'dataSchema' | 'clone' | 'runtime'>): Promise<void> {
    const context = typeof target === 'string' ? {schema:target} : target;
    const expected = validatePersistenceContext(context);
    const {rows} = await db.raw('SELECT current_database() AS database');
    if (rows[0].database !== expected) throw new Error(`Destino permitido: ${expected}`);
    if (context.runtime) await assertRuntimeControl(db,context.schema);
    else if (expected === 'backup_testes') await assertBackupSchemaOwnership(db);
}
async function assertBackupSchemaOwnership(db: Knex, connection?: any): Promise<void> {
    const query = db.raw(`SELECT nspname FROM pg_catalog.pg_namespace
        WHERE nspname IN ('review_data','benchmark_control') AND nspowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
        AND obj_description(oid,'pg_namespace')='tcc-backup-review-v1'`);
    const {rows} = await (connection ? query.connection(connection) : query);
    if (rows.length !== 2) throw new Error('Schemas backup sem posse explícita; executar preparação autorizada ou parar');
}

/** Session lock and ALL domain transactions share one physical connection.
 * Losing ownership therefore also kills/rolls back its in-flight transaction;
 * never replace this with an independent lease connection without fencing.
 */
export async function withTransactionalOwnership<T>(context: PersistenceContext, id: number,
    work: (connection: any) => Promise<T>): Promise<T> {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('ID de execução inválido');
    const expected = validatePersistenceContext(context);
    const connection = await context.db.client.acquireConnection();
    const key = `${context.schema}.batch_jobs:${id}`;
    let locked = false;
    try {
        const {rows} = await context.db.raw('SELECT current_database() AS database').connection(connection);
        if (rows[0].database !== expected) throw new Error(`Destino permitido: ${expected}`);
        if (context.runtime) await context.db.transaction(async trx=>assertRuntimeControl(trx,context.schema),{connection});
        else if (expected === 'backup_testes') await assertBackupSchemaOwnership(context.db, connection);
        const result = await context.db.raw('SELECT pg_try_advisory_lock(hashtextextended(?, 0)) AS locked', [key]).connection(connection);
        locked = result.rows[0].locked;
        if (!locked) throw new Error('Job com posse ativa');
        return await work(connection);
    } finally {
        // Destroy rather than pool a session if unlocking cannot be confirmed.
        try {
            if (locked) await context.db.raw('SELECT pg_advisory_unlock(hashtextextended(?, 0))', [key]).connection(connection);
        } catch {
            await context.db.client.destroyRawConnection(connection);
        } finally {
            await context.db.client.releaseConnection(connection);
        }
    }
}
