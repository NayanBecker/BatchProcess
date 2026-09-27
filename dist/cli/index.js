#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const JobRegistry = __importStar(require("../core/JobRegistry.js"));
const JobManager_js_1 = require("../core/JobManager.js");
const [, , command, arg] = process.argv;
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
        process.exit(1);
    }
}
// =====================
// FUNÇÕES DA CLI
// =====================
async function createJob(jobName) {
    console.log(`🚀 Criando job "${jobName}" localmente...`);
    await registerJobsFromDisk();
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
    console.log(`⏸️  Pausando job ${jobId} localmente...`);
    const manager = getOrCreateManager();
    const dto = await manager.pauseJob(jobId);
    console.log(`✅ Job ${jobId} pausado (status=${dto.status})`);
}
async function resumeJob(jobId) {
    console.log(`▶️  Retomando job ${jobId} localmente...`);
    const manager = getOrCreateManager();
    const dto = await manager.resumeJob(jobId);
    console.log(`✅ Job ${jobId} retomado (status=${dto.status})`);
}
async function listJobs() {
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
function loadJobs() {
    const jobsDir = path_1.default.join(__dirname, '..', 'jobs');
    if (!fs_1.default.existsSync(jobsDir))
        return [];
    const allFiles = fs_1.default.readdirSync(jobsDir);
    const tsFiles = allFiles.filter(f => f.endsWith('.ts'));
    const jsFiles = allFiles.filter(f => f.endsWith('.js'));
    const files = tsFiles.length > 0 ? tsFiles : jsFiles;
    return files.map((file, index) => ({
        id: index + 1,
        job: path_1.default.parse(file).name
    }));
}
/**
 * Carrega os jobs do diretório e registra as classes exportadas no registry local
 */
async function registerJobsFromDisk() {
    const jobsDir = path_1.default.join(__dirname, '..', 'jobs');
    if (!fs_1.default.existsSync(jobsDir))
        return;
    const allFiles = fs_1.default.readdirSync(jobsDir);
    const tsFiles = allFiles.filter(f => f.endsWith('.ts'));
    const jsFiles = allFiles.filter(f => f.endsWith('.js'));
    const files = tsFiles.length > 0 ? tsFiles : jsFiles;
    for (const file of files) {
        const full = path_1.default.join(jobsDir, file);
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
                    }
                    catch (err) {
                        console.error(`[CLI] erro ao registrar job ${jobName}:`, err);
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
        return JobManager_js_1.JobManager.getInstance();
    }
    catch (err) {
        return JobManager_js_1.JobManager.getInstance({ maxConcurrentJobs: Number(process.env.MAX_CONCURRENT || '1') });
    }
}
main();
