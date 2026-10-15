import { validateCloneConfig, resolveClonePassword } from '../experiments/cloneConfig';
export const manualHelp = `Review manual em clone LOCAL (inclusive backup Docker explicitamente autorizado; conexão global não redirecionada):
  manual check-config --config FILE --confirm DB/DATA_SCHEMA/CONTROL_SCHEMA
  manual check|prepare|mark|run --config FILE --confirm TARGET --operation EXP-06|EXP-08|EXP-09 --dataset VERSION
  manual status|pause|cancel|resume|recover|dispatch --config FILE --confirm TARGET --operation EXP-ID --dataset VERSION --id N
  prepare|mark|run exigem --check-token SHA256 retornado pelo check imediatamente anterior.
  run exige --mode A|B [--batch-size N --throttle-ms N --statement-timeout-ms N --lock-timeout-ms N]
  prepare instala controle privado e salva snapshot pequeno; mark é preparação EXP-09 fora DML.
  resume/recover reenfileiram apenas; dispatch executa. Não restaurar para retomar.
  Máximo 1000 linhas por tabela de review. Sem SQL arbitrário, conexão .env ou reset implícito.`;
export async function manualCommand(args: string[]): Promise<unknown> {
    if (!args.length || ['help','--help'].includes(args[0])) return manualHelp;
    const [action,...flags]=args;
    if (['validate','restore'].includes(action)) throw new Error('Ferramenta de resultado retirada do framework');
    if (!['check-config','check','prepare','mark','run','status','list','logs','errors','pause','cancel','resume','recover','dispatch'].includes(action)) throw new Error('Ação manual inválida');
    const allowed=['config','confirm','operation','dataset','id','mode','batch-size','throttle-ms','statement-timeout-ms','lock-timeout-ms','check-token'];
    const options: Record<string,string>={};
    for(let i=0;i<flags.length;i+=2) {
        const key=flags[i].replace(/^--/,'');
        if(!flags[i].startsWith('--')||!allowed.includes(key)||key in options||flags[i+1]===undefined||flags[i+1].startsWith('--')) throw new Error('Opção manual inválida');
        options[key]=flags[i+1];
    }
    if (!options.config) throw new Error('configuração explícita do clone obrigatória antes de conexão');
    const fs: typeof import('fs')=require('fs');
    const config=validateCloneConfig(JSON.parse(fs.readFileSync(options.config,'utf8')),options.confirm ?? '');
    if(action==='check-config') return {valid:true,target:options.confirm,connectionOpened:false};
    if(!['EXP-06','EXP-08','EXP-09'].includes(options.operation)||!options.dataset) throw new Error('Operação/dataset explícitos obrigatórios');
    function integer(key:string): number|undefined {
        if(options[key]===undefined)return undefined;
        const n=Number(options[key]);
        if(!/^(0|[1-9]\d*)$/.test(options[key])||!Number.isSafeInteger(n))throw new Error('Inteiro inválido');
        return n;
    }
    const parameters={operation:options.operation,dataset:options.dataset,id:integer('id'),mode:options.mode as 'A'|'B',batchSize:integer('batch-size'),throttleMs:integer('throttle-ms'),statementTimeoutMs:integer('statement-timeout-ms'),lockTimeoutMs:integer('lock-timeout-ms'),checkToken:options['check-token']};
    // Pure validation before creating even a pool (no credential discovery or global database import).
    const {validateBatchSize, validateSqlTimeouts, validateThrottleMs}: typeof import('../core/jobConfig')=require('../core/jobConfig');
    if(parameters.batchSize!==undefined)validateBatchSize(parameters.batchSize);
    validateSqlTimeouts(parameters);
    if(parameters.throttleMs!==undefined)validateThrottleMs(parameters.throttleMs);
    if(action==='run'&&!['A','B'].includes(parameters.mode))throw new Error('Modo A/B obrigatório');
    if(['prepare','mark','run'].includes(action)&&!/^\w{64}$/.test(parameters.checkToken ?? ''))throw new Error('check/dry-run token obrigatório antes de conexão');
    if(['status','logs','errors','pause','cancel','resume','recover','dispatch'].includes(action)&&(!parameters.id||parameters.id<=0))throw new Error('ID explícito obrigatório');
    const knex: typeof import('knex')=require('knex');
    const {passwordEnv: _passwordEnv, ...connection} = config.connection;
    const password = resolveClonePassword(config.connection);
    const db=knex({client:'pg',connection:{...connection,password:async()=>password},pool:{min:0,max:4}});
    const {JobManager}: typeof import('../core/JobManager')=require('../core/JobManager');
    const manager=JobManager.getInstance({maxConcurrentJobs:1});
    const admission=new AbortController();
    let interrupted=false;
    const signal=()=>{interrupted=true;admission.abort();void manager.stop().catch(()=>{process.exitCode=1;});};
    process.on('SIGINT',signal);process.on('SIGTERM',signal);
    try {
        const {guardTransactionalConnection}: typeof import('../core/TransactionalOwnership')=require('../core/TransactionalOwnership');
        const context={db,schema:config.target.controlSchema,dataSchema:config.target.dataSchema,clone:{config,confirmation:options.confirm}};
        await db.transaction(trx=>guardTransactionalConnection(trx,context));
        if(interrupted)throw new Error('Execução interrompida antes da admissão');
        const {reviewAction}: typeof import('../experiments/reviewRunner')=require('../experiments/reviewRunner');
        return await reviewAction(context,action,{...parameters,signal:admission.signal});
    } finally {
        process.removeListener('SIGINT',signal);process.removeListener('SIGTERM',signal);
        try {await manager.stop();} finally {await db.destroy();}
    }
}
