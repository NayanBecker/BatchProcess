import { JobConfig } from './BatchJob';

/**
 * Metadados de um job registrado
 */
export interface JobMetadata {
    className: string;
    config?: Partial<JobConfig>;
    description?: string;
    version?: string;
    author?: string;
}

/**
 * Registry central de jobs disponíveis
 *
 * Uso:
 *   JobRegistry.register('MyJob', MyJobClass, { description: '...' })
 *   const job = JobRegistry.create('MyJob', { batchSize: 2000 })
 */
export const JobRegistry: Map<string, { class: any; metadata: JobMetadata }> = new Map();

/**
 * Registra um novo job no sistema
 *
 * @param name - Nome único do job
 * @param jobClass - Classe que estende BatchJob
 * @param metadata - Metadados opcionais
 */
export function register(
    name: string,
    jobClass: any,
    metadata: JobMetadata = { className: jobClass.name }
): void {
    if (JobRegistry.has(name)) {
        console.warn(`[JobRegistry] Job "${name}" já registrado, sobrescrevendo...`);
    }
    JobRegistry.set(name, { class: jobClass, metadata });
}

/**
 * Cria uma instância de um job registrado
 *
 * @param name - Nome do job registrado
 * @param config - Configuração opcional para sobrescrever defaults
 * @returns Instância do job ou undefined se não encontrado
 */
export function create(name: string, config?: Partial<JobConfig>): any {
    const entry = JobRegistry.get(name);
    if (!entry) {
        return undefined;
    }
    return new entry.class(config);
}

/**
 * Busca metadados de um job registrado
 *
 * @param name - Nome do job
 * @returns Metadados ou undefined
 */
export function getMetadata(name: string): JobMetadata | undefined {
    const entry = JobRegistry.get(name);
    return entry?.metadata;
}

/**
 * Lista todos os jobs registrados
 *
 * @returns Array de { name, metadata }
 */
export function listRegistered(): Array<{ name: string; metadata: JobMetadata }> {
    return Array.from(JobRegistry.entries()).map(([name, entry]) => ({
        name,
        metadata: entry.metadata
    }));
}

/**
 * Verifica se um job está registrado
 */
export function has(name: string): boolean {
    return JobRegistry.has(name);
}

/**
 * Remove um job do registry (útil para testes)
 */
export function unregister(name: string): boolean {
    return JobRegistry.delete(name);
}

// Auto-registro: exportar função para facilitar
export const registry = {
    register,
    create,
    getMetadata,
    listRegistered,
    has,
    unregister
};
