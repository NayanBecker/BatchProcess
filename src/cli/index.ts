#!/usr/bin/env node

/**
 * CLI do Batch Framework
 *
 * Agora a CLI atua como cliente da API REST.
 * Todas as operações são delegadas para a API.
 *
 * Uso:
 *   npm run dev start <job_name>   -> POST /api/batch/jobs
 *   npm run dev pause <job_id>     -> POST /api/batch/jobs/:id/pause
 *   npm run dev resume <job_id>    -> POST /api/batch/jobs/:id/resume
 *   npm run dev list               -> GET /api/batch/jobs
 *   npm run dev logs <job_id>      -> GET /api/batch/jobs/:id/logs
 *   npm run dev status <job_id>    -> GET /api/batch/jobs/:id
 */

import { spawn } from 'child_process';

const [, , command, arg] = process.argv;

const API_URL = process.env.API_URL || 'http://localhost:3000';

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
                await pauseJob(parseInt(arg));
                break;

            case 'resume':
                if (!arg) {
                    console.error('❌ Uso: npm run dev resume <job_id>');
                    process.exit(1);
                }
                await resumeJob(parseInt(arg));
                break;

            case 'list':
                await listJobs();
                break;

            case 'logs':
                if (!arg) {
                    console.error('❌ Uso: npm run dev logs <job_id>');
                    process.exit(1);
                }
                await getLogs(parseInt(arg));
                break;

            case 'status':
                if (!arg) {
                    console.error('❌ Uso: npm run dev status <job_id>');
                    process.exit(1);
                }
                await getStatus(parseInt(arg));
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
  npm run dev start NormalizeUserEmailsJob
  npm run dev pause 1
  npm run dev resume 1
  npm run dev list
                `);
        }
    } catch (error: any) {
        console.error(`❌ Erro: ${error.message}`);
        if (error.response) {
            console.error(`   Detalhes: ${JSON.stringify(error.response.data)}`);
        }
        process.exit(1);
    }
}

// =====================
// FUNÇÕES DA CLI
// =====================

async function createJob(jobName: string): Promise<void> {
    console.log(`🚀 Criando job "${jobName}"...`);

    const response = await fetch(`${API_URL}/api/batch/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_name: jobName })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Falha ao criar job');
    }

    console.log(`✅ Job criado com sucesso!`);
    console.log(`   ID: ${data.data.id}`);
    console.log(`   Status: ${data.data.status}`);
    console.log(`   Dashboard: http://localhost:3000/`);
}

async function pauseJob(jobId: number): Promise<void> {
    console.log(`⏸️  Pausando job ${jobId}...`);

    const response = await fetch(`${API_URL}/api/batch/jobs/${jobId}/pause`, {
        method: 'POST'
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Falha ao pausar job');
    }

    console.log(`✅ Job ${jobId} pausado com sucesso!`);
}

async function resumeJob(jobId: number): Promise<void> {
    console.log(`▶️  Retomando job ${jobId}...`);

    const response = await fetch(`${API_URL}/api/batch/jobs/${jobId}/resume`, {
        method: 'POST'
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Falha ao retomar job');
    }

    console.log(`✅ Job ${jobId} retomado com sucesso!`);
}

async function listJobs(): Promise<void> {
    console.log('📋 Listando jobs...\n');

    const response = await fetch(`${API_URL}/api/batch/jobs?limit=50`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Falha ao listar jobs');
    }

    const jobs = data.data.jobs;

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
    console.log(`🔍 Status do job ${jobId}:\n`);

    const response = await fetch(`${API_URL}/api/batch/jobs/${jobId}`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Falha ao obter status');
    }

    const job = data.data;
    console.log(JSON.stringify(job, null, 2));
}

async function getLogs(jobId: number): Promise<void> {
    console.log(`📜 Logs do job ${jobId}:\n`);

    const response = await fetch(`${API_URL}/api/batch/jobs/${jobId}/logs?limit=50`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Falha ao obter logs');
    }

    const logs = data.data;

    if (logs.length === 0) {
        console.log('Nenhum log encontrado.');
        return;
    }

    logs.forEach((log: any) => {
        const date = new Date(log.created_at).toLocaleString();
        console.log(`[${date}] [${log.level.toUpperCase()}] ${log.message}`);
    });
}

async function listAvailableJobs(): Promise<void> {
    console.log('📦 Jobs disponíveis no registry:\n');

    const response = await fetch(`${API_URL}/api/batch/jobs/available/list`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Falha ao listar jobs disponíveis');
    }

    const jobs = data.data;

    if (jobs.length === 0) {
        console.log('Nenhum job registrado.');
        return;
    }

    jobs.forEach((j: any) => {
        console.log(`  • ${j.name}${j.description ? ` - ${j.description}` : ''}`);
    });
}

// Executar
main();
