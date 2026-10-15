import { createHash } from 'crypto';
// Test-only synthetic fixture setup. Not compiled or exported by the application.
import type { PersistenceContext } from '../../src/db/models/BatchJobModel';
import { guardTransactionalConnection } from '../../src/core/TransactionalOwnership';

const TABLE = 'teste_socios';
const FORMAT = 'phase-c-exp06-fixture-v1';
const DDL = 'id bigint primary key;nome text;nome_normalizado text;processado boolean not null default false';
interface FixtureRow { id: string; nome: string | null; nome_normalizado: null; processado: false }
function fingerprint(rows: unknown[]) {
    return createHash('sha256').update(JSON.stringify({format:FORMAT, table:TABLE, ddl:DDL, rows})).digest('hex');
}
function manifest(rows: any[]) {
    return {format:FORMAT, table:TABLE, ddl:DDL, count:String(rows.length),
        minId:rows[0]?.id ?? null, maxId:rows[rows.length - 1]?.id ?? null,
        nullNames:String(rows.filter(r => r.nome === null).length),
        eligible:String(rows.filter(r => r.processado === false).length), sha256:fingerprint(rows)};
}
/** Small synthetic artifact only: no SQL, database names or arbitrary tables from input. */
export function createFixtureArtifact(input: {id:string; nome:string|null}[]) {
    if (!Array.isArray(input) || input.length > 1000) throw new Error('Fixture limitada a 1000 registros');
    const ids = new Set<string>();
    const rows: FixtureRow[] = input.map((r): FixtureRow => {
        if (!r || typeof r.id !== 'string' || !/^[1-9]\d*$/.test(r.id) || BigInt(r.id) > 9223372036854775807n || ids.has(r.id)) throw new Error('ID fixture inválido/duplicado');
        if (r.nome !== null && (typeof r.nome !== 'string' || r.nome.length > 1000 || r.nome.includes('\0'))) throw new Error('Nome fixture inválido');
        ids.add(r.id);
        return {id:r.id, nome:r.nome, nome_normalizado:null, processado:false};
    }).sort((a,b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
    return {manifest:manifest(rows), rows};
}
function validateArtifact(input: any) {
    if (!input || !Array.isArray(input.rows)) throw new Error('Artefato fixture inválido');
    const expected = createFixtureArtifact(input.rows);
    // Strict canonical format; files may contain only the fixed, generated artifact.
    if (JSON.stringify(input) !== JSON.stringify(expected)) throw new Error('Artefato/checksum/allowlist inválido');
    return expected;
}
/** Restores only the allowlisted table, atomically; refuses schemas with execution history. */
export async function restoreFixture(context: PersistenceContext, input: unknown): Promise<void> {
    const artifact = validateArtifact(input);
    await context.db.transaction(async trx => {
        await guardTransactionalConnection(trx, context.schema);
        const control = await trx('information_schema.tables').where({table_schema:context.schema, table_name:'batch_jobs'}).first();
        if (control) throw new Error('Restauração exige schema sem histórico de execuções');
        await trx.schema.withSchema(context.schema).dropTableIfExists(TABLE); // no CASCADE
        await trx.schema.withSchema(context.schema).createTable(TABLE, t => {
            t.bigInteger('id').primary(); t.text('nome'); t.text('nome_normalizado'); t.boolean('processado').notNullable().defaultTo(false);
        });
        if (artifact.rows.length) await trx(TABLE).withSchema(context.schema).insert(artifact.rows);
        const actual = await trx(TABLE).withSchema(context.schema).select('id','nome','nome_normalizado','processado').orderBy('id');
        if (JSON.stringify(manifest(actual)) !== JSON.stringify(artifact.manifest)) throw new Error('Verificação da restauração falhou');
    });
}
export async function inspectFixture(context: PersistenceContext) {
    return context.db.transaction(async trx => {
        await guardTransactionalConnection(trx, context.schema);
        const columns = await trx('information_schema.columns').where({table_schema:context.schema, table_name:TABLE})
            .orderBy('ordinal_position').select('column_name','data_type','is_nullable','column_default');
        const expected = [
            {column_name:'id', data_type:'bigint', is_nullable:'NO', column_default:null},
            {column_name:'nome', data_type:'text', is_nullable:'YES', column_default:null},
            {column_name:'nome_normalizado', data_type:'text', is_nullable:'YES', column_default:null},
            {column_name:'processado', data_type:'boolean', is_nullable:'NO', column_default:'false'}
        ];
        const constraints = await trx.raw(`SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c
            JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
            WHERE n.nspname=? AND t.relname=? AND c.contype IN ('p','u','f','c')`, [context.schema, TABLE]);
        if (JSON.stringify(columns) !== JSON.stringify(expected) || constraints.rows.length !== 1 || constraints.rows[0].definition !== 'PRIMARY KEY (id)') throw new Error('Schema fixture divergente');
        const rows = await trx(TABLE).withSchema(context.schema).select('id','nome','nome_normalizado','processado').orderBy('id').limit(1001);
        if (rows.length > 1000) throw new Error('Fixture limitada a 1000 registros');
        return manifest(rows);
    });
}
