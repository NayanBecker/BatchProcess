
import { validateBatchSize, validateSqlTimeouts, validateThrottleMs } from '../core/jobConfig';

export const fixtureHelp = `Fixture experimental (somente tcc_framework_test; schema phase_c_test_<32 hex>):
  fixture run --database tcc_framework_test --schema SCHEMA --mode A|B --dataset VERSION
      [--batch-size N] [--throttle-ms N] [--statement-timeout-ms N] [--lock-timeout-ms N]
  fixture status|pause|cancel|resume|recover|dispatch|delete --database tcc_framework_test --schema SCHEMA --id N
Resume/recover somente reenfileiram; dispatch executa explicitamente. Run exige tabela teste_socios e migrations já preparadas na fixture.
Shutdown SIGINT/SIGTERM espera lote em voo; modo A não oferece pausa parcial.`;

function integer(value: string, positive = false): number {
    if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('Inteiro inválido');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || (positive && n === 0)) throw new Error('Inteiro inválido');
    return n;
}
export async function fixtureCommand(args: string[]): Promise<unknown> {
    if (!args.length || args[0] === '--help' || args[0] === 'help') return fixtureHelp;
    const [action, ...flags] = args;
    if (['validate','restore'].includes(action)) throw new Error('Ferramenta de resultado retirada do framework');
    const actions = ['run','status','pause','cancel','resume','recover','dispatch','delete'];
    if (!actions.includes(action)) throw new Error('Ação fixture inválida');
    const allowed = action === 'run' ? ['database','schema','mode','dataset','batch-size','throttle-ms','statement-timeout-ms','lock-timeout-ms'] : ['database','schema','id'];
    const options: Record<string,string> = {};
    for (let i = 0; i < flags.length; i += 2) {
        const key = flags[i].replace(/^--/, '');
        if (!flags[i].startsWith('--') || !allowed.includes(key) || key in options || flags[i+1] === undefined || flags[i+1].startsWith('--')) throw new Error('Opção fixture inválida');
        options[key] = flags[i+1];
    }
    if (options.database !== 'tcc_framework_test' || !/^phase_c_test_[a-f0-9]{32}$/.test(options.schema ?? '')) throw new Error('Destino fixture explícito obrigatório: tcc_framework_test');
    const id = action === 'run' ? undefined : integer(options.id ?? '', true);
    const config = action === 'run' ? {
        batchSize:integer(options['batch-size'] ?? '1000', true), throttleMs:integer(options['throttle-ms'] ?? '0')
    } : undefined;
    if (config) {validateBatchSize(config.batchSize);validateThrottleMs(config.throttleMs);}
    if (action === 'run' && (!['A','B'].includes(options.mode) || !options.dataset || options.dataset.length > 200)) throw new Error('Modo A/B e dataset explícitos obrigatórios');
    const statementTimeoutMs = integer(options['statement-timeout-ms'] ?? '0');
    const lockTimeoutMs = integer(options['lock-timeout-ms'] ?? '0');
    validateSqlTimeouts({statementTimeoutMs, lockTimeoutMs});
    // Lazy imports: help and invalid arguments never open a pool.
    const {db}: typeof import('../db/conection') = require('../db/conection');
    const {guardTransactionalConnection}: typeof import('../core/TransactionalOwnership') = require('../core/TransactionalOwnership');
    const {BatchJobModel}: typeof import('../db/models/BatchJobModel') = require('../db/models/BatchJobModel');
    const {JobManager}: typeof import('../core/JobManager') = require('../core/JobManager');
    const {registry}: typeof import('../core/JobRegistry') = require('../core/JobRegistry');
    const {NormalizeSocioNamesJob}: typeof import('../jobs/NormalizeSocioNamesJob') = require('../jobs/NormalizeSocioNamesJob');
    const context = {db, schema:options.schema};
    const manager = JobManager.getInstance({maxConcurrentJobs:1});
    let interrupted = false;
    const signal = () => { interrupted = true; void manager.stop().catch(() => { process.exitCode = 1; }); };
    process.on('SIGINT', signal); process.on('SIGTERM', signal);
    try {
        await db.transaction(trx => guardTransactionalConnection(trx, context.schema));
        if (interrupted) throw new Error('Execução interrompida antes da admissão');
        registry.register('NormalizeSocioNamesJob', NormalizeSocioNamesJob);
        let row;
        switch (action) {
            case 'run': row = await manager.runTransactional('NormalizeSocioNamesJob', context, {
                table:'teste_socios', mode:options.mode as 'A'|'B', dataset:options.dataset, protocol:'3', operation:'EXP-06-v1', statementTimeoutMs, lockTimeoutMs
            }, config); break;
            case 'dispatch': row = await manager.runQueuedTransactional(id!, context); break;
            case 'pause': case 'cancel': row = await BatchJobModel.requestTransactionalControl(id!, action, context); break;
            case 'resume': case 'recover': row = await BatchJobModel.requeueTransactional(id!, context, {recover:action === 'recover'}); break;
            case 'delete': await BatchJobModel.deleteTransactional(id!, context); return {id, deleted:true};
            default: row = await BatchJobModel.findById(id!, context);
        }
        if (!row) throw new Error('Execução fixture não encontrada');
        return BatchJobModel.toDTO(row);
    } finally {
        process.removeListener('SIGINT', signal); process.removeListener('SIGTERM', signal);
        try { await manager.stop(); } finally { await db.destroy(); }
    }
}
