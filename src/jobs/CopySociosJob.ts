import { Knex } from 'knex';
import { TransactionalBatchJob, TransactionalContext } from '../core/TransactionalBatchJob';
import { copySocios } from '../experiments/operations/copySocios';
export class CopySociosJob extends TransactionalBatchJob {
    validateInitial = async (trx: Knex.Transaction, schema: string, table: string) => {
        if (table !== 'teste_socios') throw new Error('EXP-08 exige teste_socios');
        if (await trx('teste_destino').withSchema(schema).first('id')) throw new Error('EXP-08 exige destino vazio; nunca limpar para retomar');
    };
    executeBatch(c: TransactionalContext) { return copySocios(c); }
}
