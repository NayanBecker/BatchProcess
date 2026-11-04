import {readFileSync} from 'fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {isCanonicalIdentifier as identifier} from './identifiers';
export class ConfigurationError extends Error {}
export type RuntimeJob = import('./sqlDefinition').SqlEntry | {module:string;export:string;table:string};
export function isSqlEntry(entry:RuntimeJob):entry is import('./sqlDefinition').SqlEntry {return 'sqlFile' in entry;}
export interface RuntimeConfig {
 connection:{host:string;port:number;database:string;user:string;passwordEnv:string};
 target:{database:string;dataSchema:string;controlSchema:string};
 jobs:Record<string,RuntimeJob>;
}
export function validateRuntimeConfig(c:RuntimeConfig): RuntimeConfig {
 if(!c || !c.connection || !c.target || !c.jobs) throw new ConfigurationError('Configuração incompleta');
 const {connection:a,target:t}=c;
 if(!a.host||!a.user||!identifier(t.database)||a.database!==t.database||!identifier(t.dataSchema)||!identifier(t.controlSchema)||t.dataSchema===t.controlSchema||t.controlSchema==='public'||t.controlSchema.startsWith('pg_')||t.controlSchema==='information_schema') throw new ConfigurationError('Destino explícito inválido');
 if(!Number.isInteger(a.port)||a.port<1||a.port>65535||!/^[A-Z][A-Z0-9_]*$/.test(a.passwordEnv)||Object.keys(a).some(k=>!['host','port','database','user','passwordEnv'].includes(k))) throw new ConfigurationError('Conexão inválida; use passwordEnv');
 if(Object.keys(c).some(k=>!['connection','target','jobs'].includes(k)) || Object.keys(t).some(k=>!['database','dataSchema','controlSchema'].includes(k))) throw new ConfigurationError('Campos de configuração desconhecidos');
 if(t.dataSchema.startsWith('pg_')||t.dataSchema==='information_schema') throw new ConfigurationError('Schema de domínio reservado');
 if(typeof c.jobs!=='object'||Array.isArray(c.jobs)) throw new ConfigurationError('Catálogo inválido');
 for(const [name,j] of Object.entries(c.jobs)) {
  if(!j||typeof j!=='object'||!/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(name)||!identifier(j.table)) throw new ConfigurationError('Catálogo inválido');
  if(isSqlEntry(j)) {
   if(Object.keys(j).some(k=>!['sqlFile','table','targetTable','operation'].includes(k))||typeof j.sqlFile!=='string'||!j.sqlFile.trim()||j.sqlFile.includes('\0')||j.operation!==undefined&&!['UPDATE','INSERT','DELETE'].includes(j.operation)||j.targetTable!==undefined&&!identifier(j.targetTable)) throw new ConfigurationError('Catálogo SQL inválido');
  } else if(Object.keys(j).some(k=>!['module','export','table'].includes(k))||!/^\.\/jobs\/[A-Za-z][A-Za-z0-9_-]*$/.test(j.module)||!/^[$A-Za-z_][$A-Za-z0-9_]*$/.test(j.export)) throw new ConfigurationError('Catálogo inválido');
 }
 return c;
}
export function readRuntimeConfig(file='batcheman.config.local.json'):RuntimeConfig{
 let text:string;
 try{text=readFileSync(file,'utf8');}catch{throw new ConfigurationError('Configuração não encontrada; copie batcheman.config.example.json para batcheman.config.local.json ou use --config.');}
 let parsed:RuntimeConfig;
 try{parsed=JSON.parse(text);}catch{throw new ConfigurationError('JSON de configuração inválido');}
 return validateRuntimeConfig(parsed);
}
export function readRuntimePassword(runtime:RuntimeConfig,file='batcheman.config.local.json'):string{
 const name=runtime.connection.passwordEnv;
 let password=process.env[name];
 if(password===undefined){
  let text:string|undefined;
  try{text=readFileSync(path.join(path.dirname(path.resolve(file)),'.env'),'utf8');}
  catch(error){
   if((error as NodeJS.ErrnoException).code!=='ENOENT') throw new ConfigurationError('Não foi possível ler o arquivo .env da configuração');
  }
  if(text!==undefined){
   try{password=parseEnv(text)[name];}
   catch{throw new ConfigurationError('Arquivo .env inválido');}
  }
 }
 if(!password) throw new ConfigurationError('Variável indicada em passwordEnv ausente/vazia; defina-a no ambiente ou no arquivo .env ao lado da configuração');
 return password;
}
export function validateRuntimeTarget(runtime:RuntimeConfig,schema:string,dataSchema?:string):string{
 validateRuntimeConfig(runtime);
 if(schema!==runtime.target.controlSchema || dataSchema!==runtime.target.dataSchema) throw new ConfigurationError('Contexto difere do destino configurado');
 return runtime.target.database;
}
export async function assertRuntimeControl(db:any,schema:string):Promise<void>{
 const {rows}=await db.raw(`SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=? AND nspowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user) AND obj_description(oid,'pg_namespace')='batcheman-control-v1'`,[schema]);
 if(rows.length!==1) throw new ConfigurationError('Controle não inicializado/sem posse; use init');
 const expected:Record<string,Record<string,string>>={
  batch_jobs:{id:'int4',job_name:'varchar',status:'varchar',batch_size:'int4',current_id:'int8',processed_rows:'int8',throttle_ms:'int4',created_at:'timestamptz',updated_at:'timestamptz',priority:'int4',tags:'jsonb',scheduled_at:'timestamptz',started_at:'timestamptz',completed_at:'timestamptz',error_count:'int4',worker_id:'varchar',effective_config:'jsonb',transactional_state:'jsonb'},
  batch_job_logs:{id:'int4',job_id:'int4',level:'text',message:'varchar',metadata:'jsonb',created_at:'timestamptz',updated_at:'timestamptz'},
  batch_job_errors:{id:'int4',job_id:'int4',error_message:'varchar',error_stack:'text',record_id:'int8',retry_count:'int4',last_retry_at:'timestamptz',created_at:'timestamptz',updated_at:'timestamptz'}
 };
 const catalog=await db.raw(`SELECT c.relname,c.relkind,c.relrowsecurity,a.attname,t.typname,
 c.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user) AS owned,
 EXISTS(SELECT 1 FROM pg_catalog.pg_trigger g WHERE g.tgrelid=c.oid AND NOT g.tgisinternal)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_rewrite r WHERE r.ev_class=c.oid)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class f ON f.oid=k.confrelid JOIN pg_catalog.pg_namespace fn ON fn.oid=f.relnamespace WHERE k.conrelid=c.oid AND k.contype='f' AND (fn.nspname<>n.nspname OR f.relname NOT IN ('batch_jobs','batch_job_errors','batch_job_logs'))) AS unsafe
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 LEFT JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
 WHERE n.nspname=? AND c.relkind IN ('r','p','v','m','f')`,[schema]);
 const seen:Record<string,Record<string,string>>={};
 for(const r of catalog.rows){
  if(!expected[r.relname]||r.relkind!=='r'||r.relrowsecurity||!r.owned||r.unsafe) throw new ConfigurationError('Controle incompatível');
  (seen[r.relname] ??= {})[r.attname]=r.typname;
 }
 for(const name of Object.keys(expected)) {
  if(!seen[name]||Object.keys(seen[name]).length!==Object.keys(expected[name]).length||Object.entries(expected[name]).some(([col,type])=>seen[name][col]!==type)) throw new ConfigurationError('Controle incompatível');
 }
}
