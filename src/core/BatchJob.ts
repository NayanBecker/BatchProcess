export abstract class BatchJob<T> {
    abstract tableName: string;
    async validate(): Promise<void> { }
    abstract processItem(record: T): Promise<void>;


    queryBuilder(lastId: number, batchSize: number): string {
        return `SELECT * FROM ${this.tableName}
                WHERE id > ${lastId}
                ORDER BY id ASC LIMIT ${batchSize}`;
    }

}