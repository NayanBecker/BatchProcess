// Compatibility guard for explicit contexts; no laboratory CLI is shipped.
import { isCanonicalIdentifier } from './identifiers';
export interface CloneConfig {
    connection: {host: string; port: number; database: string; user: string; password?: string; passwordEnv?: string};
    target: {database: string; dataSchema: string; controlSchema: string; tables: string[]};
    allowlist: string[]; customSchemas: boolean; maxRows: number; authorizedDisposableBackup?: boolean;
}
export const manualTables = ['teste_socios', 'teste_destino', 'teste_migracao'];
export function validateCloneConfig(input: unknown, confirmation: string): CloneConfig {
    const c = input as CloneConfig;
    if (!c?.connection || !c.target || !Array.isArray(c.allowlist)) throw new Error('configuração explícita do clone obrigatória');
    const {connection: p, target: t} = c;
    if (['postgres','tcc_framework_test'].includes(t.database) || ['postgres','tcc_framework_test'].includes(p.database)) throw new Error('Destino proibido em modo clone/manual');
    if ((t.database === 'backup_testes' || p.database === 'backup_testes') && !(c.authorizedDisposableBackup === true && p.database === 'backup_testes' && t.database === 'backup_testes' && t.dataSchema === 'review_data' && t.controlSchema === 'benchmark_control')) throw new Error('Destino proibido sem opt-in estrito backup_testes privado');
    if (p.passwordEnv !== undefined && (typeof p.passwordEnv !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(p.passwordEnv))) throw new Error('Nome de variável de senha inválido');
    if (p.password !== undefined && (p.passwordEnv !== undefined || t.database === 'backup_testes')) throw new Error('Não serializar segredo: usar variável explícita');
    if (![p.host,p.user,p.database,t.database].every(v => typeof v === 'string' && v.trim().length > 0) || p.database !== t.database || !Number.isInteger(p.port) || p.port < 1 || p.port > 65535) throw new Error('configuração de conexão incompleta');
    if (![t.dataSchema,t.controlSchema].every(v => isCanonicalIdentifier(v) && !['public','information_schema'].includes(v) && !v.startsWith('pg_') && !v.startsWith('phase_c_test_')) || t.dataSchema === t.controlSchema) throw new Error('Schemas seguros e separados obrigatórios');
    if (!isCanonicalIdentifier(t.database)) throw new Error('identificador de database inválido');
    if (c.customSchemas !== true) throw new Error('Schemas customizados exigem opt-in explícito');
    if (!Array.isArray(t.tables) || t.tables.length !== 3 || new Set(t.tables).size !== 3 || !t.tables.every(v => manualTables.includes(v))) throw new Error('Allowlist de tabelas inválida');
    const exact = `${t.database}/${t.dataSchema}/${t.controlSchema}`;
    if (confirmation !== exact || !c.allowlist.includes(exact)) throw new Error('Destino exato, allowlist e confirmação obrigatórios');
    if (!Number.isInteger(c.maxRows) || c.maxRows < 1 || c.maxRows > 1000) throw new Error('Review manual limitado a 1000 linhas; campanha massiva não habilitada');
    return c;
}
export function resolveClonePassword(connection: CloneConfig['connection'], env: NodeJS.ProcessEnv = process.env): string {
    if (!connection.passwordEnv) return connection.password ?? '';
    const value = env[connection.passwordEnv];
    if (!value) throw new Error('Senha indisponível na variável explicitamente configurada');
    return value;
}
