# TCC II — Comece por aqui

## Já feito
- [x] **Fase A:** configuração, instalação/build, migrations internas e CLI básica validados; evidências em `docs/VALIDACAO-FASE-A.md`.
- [x] Seis tabelas auxiliares criadas/alimentadas em **postgres.public**, preservando a origem. Registro: `experiments/setup/README.md`.
- [x] Dez operações enviadas salvas em `experiments/operations/`, sem execução.
- [x] **Fase B concluída como desenho:** protocolo versão 3 em `docs/experiments/protocol.md`; decisões restantes delegadas por Nayan e registradas.

## Decidido
- **Knex mantido** para agilizar o desenvolvimento do protótipo.
- **Contratos A/B aprovados:** A com transação global; B com transação por lote e dados/checkpoint no mesmo commit. Implementação e validação ainda pendentes.
- **Benchmark:** postgres, tabelas `teste_*`; não modificar a tabela principal.
- **Desenvolvimento/testes internos:** tcc_framework_test. Conexão global não foi trocada.
- Cada operação é um experimento independente; restaurar antes de cada A/B.
- Métricas e visualização devem estar prontas antes dos benchmarks.
- Cenário antigo de e-mails sintéticos foi substituído.
- **Somente DML:** EXP-01 a EXP-09; EXP-10 arquivado fora do benchmark. DDL/preparação/validação/finalização fora da janela DML.
- **Base preservada:** backup_testes; existência e estrutura inspecionadas, conteúdo integral/restauração ainda a validar.

## Decisões finais da Fase B
- Cenário inicial: **EXP-06**, maiúsculas + TRIM, sem alterar espaços internos.
- EXP-05: nome único sem sobrenome; normalizar espaços ASCII; vazio/nulo sem nome/sobrenome.
- EXP-08: destino vazio, cópia sem apagar origem, retomada pelo checkpoint atômico; conflito aborta, não é ignorado.
- EXP-09: medir apenas **DELETE**, com marcação de SC preparada antes.
- Restaurar auxiliares a partir da mesma base antes de cada A/B; fixar teto de IDs; verificar conjuntos e divergências, não apenas completed.
- Controle experimental no futuro schema benchmark_control em postgres, para compartilhar transação com os dados.

## Próximas entregas — implementação e validação
1. Certificar backup/restauração e implementar/validar execução A/B, checkpoint e regras adotadas (incluindo correção do EXP-05).
2. Instrumentar métricas e dashboards; preparar carga concorrente.
3. Pilotar, repetir, coletar e analisar benchmarks.

**Não realizado:** execução das dez operações, runner A/B, validação de falhas desse contrato ou benchmark. SQL salvo não significa job implementado.

## Onde procurar
| Preciso de... | Arquivo/pasta |
|---|---|
| Resumo atual | **Este arquivo** |
| Contrato e pendências da Fase B | `docs/experiments/protocol.md` |
| SQL das dez operações | `experiments/operations/` |
| Preparação das seis tabelas | `experiments/setup/` |
| Instalação e banco de desenvolvimento | `docs/PREPARACAO-FASE-A.md` |
| Hardware e ambiente observado | `docs/AMBIENTE-FASE-A.md` |

Planos antigos são históricos; o protocolo acima orienta o cenário atual. Não há atualização automática do Notion nesta entrega.
