#!/usr/bin/env node
"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const JobRegistry_1 = require("../core/JobRegistry");
const JobManager_1 = require("../core/JobManager");
const [, , command, arg] = process.argv;
// If API_URL is provided the CLI will act as API client; otherwise it runs locally
const API_URL = process.env.API_URL;
const useApi = !!API_URL;
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
    }
    catch (error) {
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
async function readBody(response) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    }
    catch (err) {
        throw new Error(`Resposta inválida do servidor (status ${response.status}). Corpo:\n${text}`);
    }
}
async function createJob(jobName) {
    if (useApi) {
        console.log(`🚀 Criando job "${jobName}" via API...`);
        const response = await fetch(`${API_URL}/api/batch/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_name: jobName })
        });
        const data = await readBody(response);
        if (!response.ok) {
            throw new Error(data.error || 'Falha ao criar job');
        }
        console.log(`✅ Job criado com sucesso!`);
        console.log(`   ID: ${data.data.id}`);
        console.log(`   Status: ${data.data.status}`);
        console.log(`   Dashboard: ${API_URL}/`);
        return;
    }
    // Local mode
    console.log(`🚀 Criando job "${jobName}" localmente...`);
    await loadJobs();
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
async function pauseJob(jobId) {
    if (useApi) {
        console.log(`⏸️  Pausando job ${jobId} via API...`);
        const response = await fetch(`${API_URL}/api/batch/jobs/${jobId}/pause`, {
            method: 'POST'
        });
        const data = await readBody(response);
        if (!response.ok) {
            throw new Error(data.error || 'Falha ao pausar job');
        }
        console.log(`✅ Job ${jobId} pausado com sucesso!`);
        return;
    }
    console.log(`⏸️  Pausando job ${jobId} localmente...`);
    const manager = getOrCreateManager();
    const dto = await manager.pauseJob(jobId);
    console.log(`✅ Job ${jobId} pausado (status=${dto.status})`);
}
async function resumeJob(jobId) {
    if (useApi) {
        console.log(`▶️  Retomando job ${jobId} via API...`);
        const response = await fetch(`${API_URL}/api/batch/jobs/${jobId}/resume`, {
            method: 'POST'
        });
        const data = await readBody(response);
        if (!response.ok) {
            throw new Error(data.error || 'Falha ao retomar job');
        }
        console.log(`✅ Job ${jobId} retomado com sucesso!`);
        return;
    }
    console.log(`▶️  Retomando job ${jobId} localmente...`);
    const manager = getOrCreateManager();
    const dto = await manager.resumeJob(jobId);
    console.log(`✅ Job ${jobId} retomado (status=${dto.status})`);
}
async function listJobs() {
    if (useApi) {
        console.log('📋 Listando jobs via API...\n');
        const response = await fetch(`${API_URL}/api/batch/jobs?limit=50`);
        const data = await readBody(response);
        if (!response.ok) {
            throw new Error(data.error || 'Falha ao listar jobs');
        }
        const jobs = data.data.jobs;
        if (jobs.length === 0) {
            console.log('Nenhum job encontrado.');
            return;
        }
        console.table(jobs.map((j) => ({
            ID: j.id,
            Nome: j.job_name,
            Status: j.status,
            Processados: j.metrics.itemsProcessed,
            Erros: j.error_count,
            Criado: new Date(j.created_at).toLocaleString()
        })));
        return;
    }
    console.log('📋 Listando jobs locais...\n');
    const manager = getOrCreateManager();
    const result = await manager.listJobs({ limit: 50 });
    const jobs = result.jobs;
    if (jobs.length === 0) {
        console.log('Nenhum job encontrado.');
        return;
    }
    console.table(jobs.map((j) => ({
        ID: j.id,
        Nome: j.job_name,
        Status: j.status,
        Processados: j.metrics.itemsProcessed,
        Erros: j.error_count,
        Criado: new Date(j.created_at).toLocaleString()
    })));
}
async function getStatus(jobId) {
    if (useApi) {
        console.log(`🔍 Status do job ${jobId} via API:\n`);
        const response = await fetch(`${API_URL}/api/batch/jobs/${jobId}`);
        const data = await readBody(response);
        if (!response.ok) {
            throw new Error(data.error || 'Falha ao obter status');
        }
        const job = data.data;
        console.log(JSON.stringify(job, null, 2));
        return;
    }
    console.log(`🔍 Status do job ${jobId} localmente:\n`);
    const manager = getOrCreateManager();
    const job = await manager.getJobStatus(jobId);
    if (!job) {
        console.log('Job não encontrado.');
        return;
    }
    console.log(JSON.stringify(job, null, 2));
}
async function getLogs(jobId) {
    if (useApi) {
        console.log(`📜 Logs do job ${jobId} via API:\n`);
        const response = await fetch(`${API_URL}/api/batch/jobs/${jobId}/logs?limit=50`);
        const data = await readBody(response);
        if (!response.ok) {
            throw new Error(data.error || 'Falha ao obter logs');
        }
        const logs = data.data;
        if (logs.length === 0) {
            console.log('Nenhum log encontrado.');
            return;
        }
        logs.forEach((log) => {
            const date = new Date(log.created_at).toLocaleString();
            console.log(`[${date}] [${log.level.toUpperCase()}] ${log.message}`);
        });
        return;
    }
    console.log(`📜 Logs do job ${jobId} localmente:\n`);
    const manager = getOrCreateManager();
    const logs = await manager.getJobLogs(jobId, { page: 1, limit: 50 });
    if (!logs || logs.length === 0) {
        console.log('Nenhum log encontrado.');
        return;
    }
    logs.forEach((log) => {
        const date = new Date(log.created_at).toLocaleString();
        console.log(`[${date}] [${log.level.toUpperCase()}] ${log.message}`);
    });
}
async function listAvailableJobs() {
    console.log('📦 Jobs disponíveis no registry:\n');
    if (useApi) {
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
        jobs.forEach((j) => {
            console.log(`  • ${j.name}${j.description ? ` - ${j.description}` : ''}`);
        });
        return;
    }
    // Local registry
    await loadJobs();
    const jobs = (0, JobRegistry_1.listRegistered)();
    if (jobs.length === 0) {
        console.log('Nenhum job registrado.');
        return;
    }
    jobs.forEach((j) => {
        console.log(`  • ${j.name}${j.metadata?.description ? ` - ${j.metadata.description}` : ''}`);
    });
}
/**
 * Carrega todos os arquivos em src/jobs e registra as classes exportadas
 */
function loadJobs() {
    const jobsDir = path_1.default.join(__dirname, '..', 'jobs');
    if (!fs_1.default.existsSync(jobsDir))
        return;
    const files = fs_1.default.readdirSync(jobsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
    for (const file of files) {
        const full = path_1.default.join(jobsDir, file);
        try {
            const mod = require(full);
            for (const key of Object.keys(mod)) {
                const exported = mod[key];
                if (typeof exported === 'function') {
                    const jobName = exported.name || key;
                    if (!(0, JobRegistry_1.has)(jobName)) {
                        (0, JobRegistry_1.register)(jobName, exported, { className: exported.name });
                        console.log(`[CLI] Registrado job ${jobName} (arquivo: ${file})`);
                    }
                }
            }
        }
        catch (err) {
            console.error(`[CLI] falha ao carregar job ${file}:`, err);
        }
    }
}
function getOrCreateManager() {
    try {
        return JobManager_1.JobManager.getInstance();
    }
    catch (err) {
        return JobManager_1.JobManager.getInstance({ maxConcurrentJobs: Number(process.env.MAX_CONCURRENT || '1') });
    }
}
main();
