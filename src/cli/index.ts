#!/usr/bin/env node
import { ConfigurationError } from '../core/runtimeConfig';
class UsageError extends Error { }
export const help = `
  Batcheman 

 --USO
    bah <comando> [argumentos] [opções]

 --Mas Bah Tchê segue os comandos!
 
    bah init [--config path]                                      Inicializa o schema de controle
    bah jobs list [--config path]                                Lista os jobs disponíveis
    bah register <name> [opções] [--config path]                 Cadastra uma nova execução
    bah run <id> [--config path]                                 Executa um job cadastrado
    bah status <id> [--config path]                              Mostra o estado da execução
    bah logs <id> [--config path]                                Exibe os logs mais recentes
    bah errors <id> [--config path]                              Exibe os erros mais recentes
    bah pause <id> [--config path]                                Solicita pausa cooperativa
    bah resume <id> [--config path]                               Reenfileira uma execução pausada
    bah cancel <id> [--config path]                               Solicita cancelamento
    bah recover <id> [--config path]                              Recupera uma execução após falha
`;
export async function main(args = process.argv.slice(2)) {
    if (!args.length || ['help', '--help'].includes(args[0])) { console.log(help); return; }
    const command = args.shift()!;
    if (!['init', 'jobs', 'register', 'run', 'status', 'logs', 'errors', 'pause', 'resume', 'cancel', 'recover'].includes(command)) throw new UsageError('Comando desconhecido');
    const subject = command === 'init' ? undefined : args.shift();
    if (command === 'jobs' && subject !== 'list') throw new UsageError('Use jobs list');
    if (command === 'register' && !/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(subject ?? '')) throw new UsageError('Nome inválido');
    if (!['init', 'jobs', 'register'].includes(command) && (!/^[1-9][0-9]*$/.test(subject ?? '') || !Number.isSafeInteger(Number(subject)))) throw new UsageError('ID inválido');
    const options: Record<string, string> = {};
    while (args.length) {
        const key = args.shift()!; const value = args.shift();
        const allowed = command === 'register' ? ['--config', '--mode', '--batch-size', '--throttle'] : ['--config'];
        if (!allowed.includes(key) || !value || options[key]) throw new UsageError('Opção inválida/duplicada');
        options[key] = value;
    }
    if (options['--mode'] && !['monolithic', 'batch'].includes(options['--mode'])) throw new UsageError('Modo inválido');
    for (const k of ['--batch-size', '--throttle']) if (options[k] && !/^(0|[1-9][0-9]*)$/.test(options[k])) throw new UsageError('Número inválido');
    const { publicCommand } = require('./public');
    console.log(JSON.stringify(await publicCommand(command, subject, options), null, 2));
}
export function formatCliError(error: unknown): string {
    if (error instanceof UsageError || error instanceof ConfigurationError) return error.message;
    const messages: Record<string, string> = {
        '28P01': 'Falha de autenticação PostgreSQL; confira usuário e a senha na variável indicada em passwordEnv.',
        '28000': 'Falha de autenticação PostgreSQL; confira usuário e regras de acesso do servidor.',
        ECONNREFUSED: 'Conexão recusada; confira host, port e se o PostgreSQL está ativo.',
        ENOTFOUND: 'Host não encontrado; confira connection.host.',
        ETIMEDOUT: 'Tempo limite de conexão; confira rede, host e port.',
        '3D000': 'O banco configurado não existe; crie-o externamente ou confira connection.database e target.database.',
        '42501': 'Permissão insuficiente; confira as permissões do usuário no banco e no schema de controle.',
    };
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(messages, code)) return `[${code}] ${messages[code]}`;
    return 'comando falhou; confira configuração/destino e status/errors. SQL e credenciais omitidos.';
}
if (require.main === module) void main().catch(e => { console.error('BatCheman: ' + formatCliError(e)); process.exitCode = 1; });
