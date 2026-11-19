import {TransactionalBatchJob,TransactionalContext,DmlCounts,decimalId} from './TransactionalBatchJob';
import {SqlDefinition,bindSqlDefinition,assertSqlSnapshot} from './sqlDefinition';
import {JobConfigInput} from './jobConfig';
/** Registered immutable SQL. Never reads a file, imports global DB, or appends RETURNING. */
export class SqlJob extends TransactionalBatchJob {
 constructor(readonly definition:SqlDefinition,config:JobConfigInput={}){super(config);}
 async validate(){await super.validate();const d=this.definition;assertSqlSnapshot(d,{sqlFile:'snapshot',table:d.table,targetTable:d.targetTable,operation:d.operation},d.dataSchema);}
 async executeBatch({trx,schema,table,lo,hi}:TransactionalContext):Promise<DmlCounts>{
  const d=this.definition;
  if(schema!==d.dataSchema||table!==d.table)throw new Error('Contexto SQL difere do snapshot');
  decimalId(lo);decimalId(hi);
  // pg_catalog first prevents operator tables shadowing built-ins; domain names remain unqualified.
  await trx.raw('SET LOCAL search_path TO pg_catalog, ??',[schema]);
  await trx.raw('SET LOCAL standard_conforming_strings TO on');
  const result=await bindSqlDefinition(trx,d,lo,hi);
  if(Array.isArray(result)||result.command!==d.operation||!Number.isSafeInteger(result.rowCount)||result.rowCount<0)throw new Error('CommandComplete SQL inesperado');
  return {changed:d.operation==='UPDATE'?String(result.rowCount):'0',inserted:d.operation==='INSERT'?String(result.rowCount):'0',deleted:d.operation==='DELETE'?String(result.rowCount):'0'};
 }
}
