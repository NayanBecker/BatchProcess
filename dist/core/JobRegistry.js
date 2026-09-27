"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registry = exports.JobRegistry = void 0;
exports.register = register;
exports.create = create;
exports.getMetadata = getMetadata;
exports.listRegistered = listRegistered;
exports.has = has;
exports.unregister = unregister;
/**
 * Registry central de jobs disponíveis
 *
 * Uso:
 *   JobRegistry.register('MyJob', MyJobClass, { description: '...' })
 *   const job = JobRegistry.create('MyJob', { batchSize: 2000 })
 */
exports.JobRegistry = new Map();
/**
 * Registra um novo job no sistema
 *
 * @param name - Nome único do job
 * @param jobClass - Classe que estende BatchJob
 * @param metadata - Metadados opcionais
 */
function register(name, jobClass, metadata = { className: jobClass.name }) {
    if (exports.JobRegistry.has(name)) {
        console.warn(`[JobRegistry] Job "${name}" já registrado, sobrescrevendo...`);
    }
    exports.JobRegistry.set(name, { class: jobClass, metadata });
}
/**
 * Cria uma instância de um job registrado
 *
 * @param name - Nome do job registrado
 * @param config - Configuração opcional para sobrescrever defaults
 * @returns Instância do job ou undefined se não encontrado
 */
function create(name, config) {
    const entry = exports.JobRegistry.get(name);
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
function getMetadata(name) {
    const entry = exports.JobRegistry.get(name);
    return entry?.metadata;
}
/**
 * Lista todos os jobs registrados
 *
 * @returns Array de { name, metadata }
 */
function listRegistered() {
    return Array.from(exports.JobRegistry.entries()).map(([name, entry]) => ({
        name,
        metadata: entry.metadata
    }));
}
/**
 * Verifica se um job está registrado
 */
function has(name) {
    return exports.JobRegistry.has(name);
}
/**
 * Remove um job do registry (útil para testes)
 */
function unregister(name) {
    return exports.JobRegistry.delete(name);
}
// Auto-registro: exportar função para facilitar
exports.registry = {
    register,
    create,
    getMetadata,
    listRegistered,
    has,
    unregister
};
