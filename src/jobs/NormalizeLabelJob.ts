import {TransactionalBatchJob,TransactionalContext,DmlCounts} from '../core/TransactionalBatchJob';
/** Synthetic, deterministic UPDATE; no processado flag or research imports. */
export class NormalizeLabelJob extends TransactionalBatchJob {
 async executeBatch({trx,schema,table,lo,hi}:TransactionalContext):Promise<DmlCounts>{
  const result=await trx.raw('UPDATE ??.?? SET normalized_label=upper(trim(label)) WHERE id>?::bigint AND id<=?::bigint AND normalized_label IS DISTINCT FROM upper(trim(label))',[schema,table,lo,hi]);
  return {changed:String(result.rowCount),inserted:'0',deleted:'0'};
 }
}
