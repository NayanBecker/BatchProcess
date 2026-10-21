#!/usr/bin/env node
import {ConfigurationError} from '../core/runtimeConfig';
class UsageError extends Error {}
export const help = `BatCheman
init [--config path]
jobs list [--config path]
register <name> [--mode monolithic|batch] [--batch-size N] [--throttle N] [--config path]
run <id> [--config path]
status|logs|errors|pause|resume|cancel|recover <id> [--config path]
Mode/batch-size/throttle persist at register; run never changes them.
resume requeues; run executes. recover explicitly recovers a crashed worker.`;
export async function main(args = process.argv.slice(2)) {
 if (!args.length || ['help','--help'].includes(args[0])) { console.log(help); return; }
 const command=args.shift()!;
 if (!['init','jobs','register','run','status','logs','errors','pause','resume','cancel','recover'].includes(command)) throw new UsageError('Comando desconhecido');
 const subject=command==='init'?undefined:args.shift();
 if(command==='jobs' && subject!=='list') throw new UsageError('Use jobs list');
 if(command==='register' && !/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(subject ?? '')) throw new UsageError('Nome inválido');
 if(!['init','jobs','register'].includes(command) && (!/^[1-9][0-9]*$/.test(subject ?? '') || !Number.isSafeInteger(Number(subject)))) throw new UsageError('ID inválido');
 const options:Record<string,string>={};
 while(args.length){
  const key=args.shift()!;const value=args.shift();
  const allowed=command==='register'?['--config','--mode','--batch-size','--throttle']:['--config'];
  if(!allowed.includes(key)||!value||options[key]) throw new UsageError('Opção inválida/duplicada');
  options[key]=value;
 }
 if(options['--mode']&&!['monolithic','batch'].includes(options['--mode'])) throw new UsageError('Modo inválido');
 for(const k of ['--batch-size','--throttle']) if(options[k]&&!/^(0|[1-9][0-9]*)$/.test(options[k])) throw new UsageError('Número inválido');
 const {publicCommand}=require('./public');
 console.log(JSON.stringify(await publicCommand(command,subject,options)));
}
if(require.main===module) void main().catch(e=>{console.error('BatCheman: '+(e instanceof UsageError || e instanceof ConfigurationError ? e.message : 'comando falhou; confira configuração/destino e status/errors. SQL e credenciais omitidos.'));process.exitCode=1;});
