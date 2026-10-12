#!/usr/bin/env node

/**
 * CLI do Batch Framework (modo local)
 *
 * Opera diretamente no banco usando JobManager e BatchExecutor.
 *
 * Uso:
 *   npm run dev start <job_name>
 *   npm run dev pause <job_id>
 *   npm run dev resume <job_id>
 *   npm run dev list
 *   npm run dev logs <job_id>
 *   npm run dev status <job_id>
 */
import fs from 'fs';
import path from 'path';
import * as JobRegistry from '../core/JobRegistry';
import type { JobManager } from '../core/JobManager';

const [, , command, arg] = process.argv;
let database: import('knex').Knex | undefined;

async function main() {
    try {
        switch (command) {
            case 'start':
                if (!arg) {
                    console.error('❌ Uso: npm run dev start <job_name>');
                    process.exit(1);
                }
                await createJob(arg);
                break;

            case 'pause':
                if (!arg) {
                    console.error('❌ Uso: npm run dev pause <job_id>');
                    process.exit(1);
                }
                await pauseJob(parseJobId(arg));
                break;

            case 'resume':
                if (!arg) {
                    console.error('❌ Uso: npm run dev resume <job_id>');
                    process.exit(1);
                }
                await resumeJob(parseJobId(arg));
                break;

            case 'list':
                await listJobs();
                break;

            case 'logs':
                if (!arg) {
                    console.error('❌ Uso: npm run dev logs <job_id>');
                    process.exit(1);
                }
                await getLogs(parseJobId(arg));
                break;

            case 'status':
                if (!arg) {
                    console.error('❌ Uso: npm run dev status <job_id>');
                    process.exit(1);
                }
                await getStatus(parseJobId(arg));
                break;

            case 'jobs':
                await listAvailableJobs();
                break;

            default:
                console.log(`
Batch Framework CLI

Comandos disponíveis:
  start <job_name>     Inicia um novo job
  pause <job_id>       Pausa um job em execução
  resume <job_id>      Retoma um job pausado
  list                 Lista todos os jobs
  status <job_id>      Mostra detalhes de um job
  logs <job_id>        Mostra logs de um job
  jobs                 Lista jobs disponíveis no registry

Exemplos:
  npm run dev -- jobs
  npm run dev -- list
  npm run dev -- status 1

Os exemplos históricos estão desativados. Novos jobs serão adicionados após os ajustes.
                `);
        }
    } catch (error: any) {
        console.error(`❌ Erro: ${error.message}`);
        process.exitCode = 1;
        // start mantém o worker contínuo; em falha preserva a saída imediata anterior.
        if (command === 'start') process.exit(1);
    } finally {
        if (command !== 'start' && database) await database.destroy();
    }
}

// =====================
// FUNÇÕES DA CLI
// =====================

function parseJobId(value: string): number {
    const id = Number(value);
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) {
        throw new Error('ID deve ser um inteiro positivo.');
    }
    return id;
}

async function createJob(jobName: string): Promise<void> {
    console.log(`🚀 Criando job "${jobName}" localmente...`);
    await registerJobsFromDisk();
    if (!JobRegistry.has(jobName)) {
        throw new Error(`Job "${jobName}" não encontrado no registry`);
    }

    const manager = getOrCreateManager();
    // Garantir que o JobManager está rodando para dispatch
    if (!manager.getIsRunning()) {
        await manager.start();
    }

    const dto = await manager.startJob(jobName, { immediate: true });

    console.log(`✅ Job criado com sucesso!`);
    console.log(`   ID: ${dto.id}`);
    console.log(`   Status: ${dto.status}`);
    console.log('   Processamento iniciado localmente. Veja logs no console.');
}

async function pauseJob(jobId: number): Promise<void> {
    console.log(`⏸️  Pausando job ${jobId} localmente...`);
    const manager = getOrCreateManager();
    const dto = await manager.pauseJob(jobId);
    console.log(`✅ Job ${jobId} pausado (status=${dto.status})`);
}

async function resumeJob(jobId: number): Promise<void> {
    console.log(`▶️  Retomando job ${jobId} localmente...`);
    const manager = getOrCreateManager();
    const dto = await manager.resumeJob(jobId);
    console.log(`✅ Job ${jobId} retomado (status=${dto.status})`);
}

async function listJobs(): Promise<void> {
    console.log('📋 Listando jobs locais...\n');
    const manager = getOrCreateManager();
    const result = await manager.listJobs({ limit: 50 });
    const jobs = result.jobs;

    if (jobs.length === 0) {
        console.log('Nenhum job encontrado.');
        return;
    }

    console.table(jobs.map((j: any) => ({
        ID: j.id,
        Nome: j.job_name,
        Status: j.status,
        Processados: j.metrics.itemsProcessed,
        Erros: j.error_count,
        Criado: new Date(j.created_at).toLocaleString()
    })));
}

async function getStatus(jobId: number): Promise<void> {
    console.log(`🔍 Status do job ${jobId} localmente:\n`);
    const manager = getOrCreateManager();
    const job = await manager.getJobStatus(jobId);
    if (!job) {
        console.log('Job não encontrado.');
        return;
    }
    console.log(JSON.stringify(job, null, 2));
}

async function getLogs(jobId: number): Promise<void> {
    console.log(`📜 Logs do job ${jobId} localmente:\n`);
    const manager = getOrCreateManager();
    const logs = await manager.getJobLogs(jobId, { page: 1, limit: 50 });

    if (!logs || logs.length === 0) {
        console.log('Nenhum log encontrado.');
        return;
    }

    logs.forEach((log: any) => {
        const date = new Date(log.created_at).toLocaleString();
        console.log(`[${date}] [${log.level.toUpperCase()}] ${log.message}`);
    });
}

async function listAvailableJobs(): Promise<void> {
    console.log('📦 Jobs disponíveis:\n');

    const jobs = loadJobs();
    if (jobs.length === 0) {
        console.log('Nenhum job encontrado.');
        return;
    }

    console.table(jobs);
}

/**
 * Lista os jobs disponíveis em src/jobs sem registrar nada no registry
 */
function loadJobs(): Array<{ id: number; job: string }> {
    const jobsDir = path.join(__dirname, '..', 'jobs');
    if (!fs.existsSync(jobsDir)) return [];

    const allFiles = fs.readdirSync(jobsDir);
    const tsFiles = allFiles.filter(f => f.endsWith('.ts'));
    const jsFiles = allFiles.filter(f => f.endsWith('.js'));
    const files = tsFiles.length > 0 ? tsFiles : jsFiles;

    return files.map((file, index) => ({
        id: index + 1,
        job: path.parse(file).name
    }));
}

/**
 * Carrega os jobs do diretório e registra as classes exportadas no registry local
 */
async function registerJobsFromDisk(): Promise<void> {
    const jobsDir = path.join(__dirname, '..', 'jobs');
    if (!fs.existsSync(jobsDir)) return;

    const allFiles = fs.readdirSync(jobsDir);
    const tsFiles = allFiles.filter(f => f.endsWith('.ts'));
    const jsFiles = allFiles.filter(f => f.endsWith('.js'));
    const files = tsFiles.length > 0 ? tsFiles : jsFiles;

    for (const file of files) {
        const full = path.join(jobsDir, file);
        try {
            const mod = require(full);
            for (const key of Object.keys(mod)) {
                const exported = mod[key];
                if (typeof exported === 'function') {
                    const jobName = exported.name || key;
                    try {
                        if (!JobRegistry.has(jobName)) {
                            JobRegistry.register(jobName, exported, { className: exported.name });
                        }
                    } catch (err) {
                        console.error(`[CLI] erro ao registrar job ${jobName}:`, err);
                    }
                }
            }
        } catch (err) {
            console.error(`[CLI] falha ao carregar job ${file}:`, err);
        }
    }
}

function getOrCreateManager(): JobManager {
    // Ajuda e catálogo não precisam abrir/configurar o banco.
    const { JobManager } = require('../core/JobManager');
    database = require('../db/conection').db;
    try {
        return JobManager.getInstance();
    } catch (err) {
        return JobManager.getInstance({ maxConcurrentJobs: Number(process.env.MAX_CONCURRENT || '1') });
    }
}

main();
