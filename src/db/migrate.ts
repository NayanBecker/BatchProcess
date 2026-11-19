import knex from 'knex';
import config from './knexfile';

const TEST_DATABASE = 'tcc_framework_test';

async function main(): Promise<void> {
    const action = process.argv[2];
    if (!['check', 'latest', 'rollback'].includes(action)) {
        throw new Error('Ação inválida. Use check, latest ou rollback.');
    }
    if (!__filename.endsWith('.ts')) {
        throw new Error('Execute migrations pelo fonte: npm run migrate (histórico em .ts).');
    }
    const connection = config.connection as { database: string };
    if (connection.database !== TEST_DATABASE) {
        throw new Error(`Operações de preparação permitidas apenas em ${TEST_DATABASE}.`);
    }
    if (action === 'rollback' && !process.argv.includes(`--confirm=${TEST_DATABASE}`)) {
        throw new Error(`Rollback remove tabelas/dados. Confirme com --confirm=${TEST_DATABASE}.`);
    }

    const db = knex(config);
    try {
        const { rows } = await db.raw('SELECT current_database() AS database, current_user AS username');
        if (rows[0].database !== TEST_DATABASE) throw new Error('Banco real difere do destino permitido.');
        console.log(`Destino confirmado: ${rows[0].database} (usuário ${rows[0].username}).`);
        if (action === 'check') return;
        const [batch, files] = action === 'latest'
            ? await db.migrate.latest()
            : await db.migrate.rollback();
        console.log(`${action}: lote ${batch}; ${files.length} migration(s).`);
        files.forEach(file => console.log(`  ${file}`));
    } finally {
        await db.destroy();
    }
}

main().catch((error: Error) => {
    console.error(`Erro: ${error.message}`);
    process.exitCode = 1;
});
