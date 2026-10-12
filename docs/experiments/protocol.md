# Fase B — Protocolo das operações experimentais

**Versão 3 — Fase B concluída quanto ao desenho.** Nayan aprovou A/B, manteve Knex, restringiu o estudo a DML e delegou as decisões restantes ao assistente. As regras abaixo estão adotadas e podem ser revistas por nova versão. Isso não significa implementação, certificação do backup ou benchmarks concluídos.

## 1. Fonte de verdade e bancos

- Operações DML: EXP-01 a EXP-09. Dez arquivos originais permanecem arquivados em `experiments/operations/`; EXP-10 é somente referência histórica, fora dos benchmarks.
- Benchmark: banco **postgres**, schema **public**, somente tabelas `teste_*` autorizadas.
- Origem preservada: `public.receitafederal_quadrosocietario`, usada somente para leitura/preparação.
- Desenvolvimento, fixtures pequenas e testes internos: **tcc_framework_test**.
- Base de restauração adotada: **backup_testes**, preservada sem escritas dos runners ou da carga. Observado no container dbpostgres: tabela principal e seis auxiliares; conferida a estrutura de teste_socios/teste_migracao/teste_cnpj. Conteúdo integral e igualdade dos bancos não foram validados nesta decisão.
- Não mudar `.env` nem remover a proteção do runner da Fase A. O runner experimental confirmará banco/schema/tabelas. Adotar **benchmark_control em postgres** para estado experimental/checkpoints, a implementar e testar. DML e checkpoint usarão a mesma conexão/transação; não manter checkpoint em outro banco.
- A proposta de normalização de e-mails sintéticos foi substituída. O plano antigo em `.hermes/plans/2026-10-02_100058-fase-b-protocolo-proposto.md` é histórico, não instrução de execução.

## 2. Dataset e restauração

As seis tabelas auxiliares foram preparadas anteriormente com cópia integral da origem. O registro da preparação informa 17.447.222 registros por tabela e validação de contagens antes do commit; isso não é nova contagem nesta revisão. Evidências e limitações: `experiments/setup/README.md`.

Não há seed sintética: identificar a versão do snapshot da origem, contagens, min/max de IDs e fingerprint das colunas relevantes. Antes de cada execução, restaurar **schema e dados** iniciais da operação; não encadear as dez migrations sobre a mesma base alterada. EXP-02, 05, 06 e 08 compartilham teste_socios; EXP-04 e 07 compartilham teste_qualificacoes.

Corte adotado: persistir H=max(id) e quantidade elegível antes da carga, exigir IDs positivos/únicos/imutáveis e processar 0<id<=H. Dataset vazio usa H=0. Não recalcular H em retomadas. Proibir inserções/exclusões/alterações externas nas colunas de origem durante o ensaio principal. EXP-09 é a exceção de exclusão deliberada pela própria operação. Inserções concorrentes, em testes separados, devem ter id>H e ficar fora do alvo.

**Pendente:** automatizar e validar restauração reproduzível; registrar snapshot real e estado inicial por operação. A cópia atual, sozinha, não garante repetições equivalentes. Identificadores BIGINT não devem ser convertidos sem validação para number no JavaScript; usar representação sem perda no futuro runner.

**Procedimento de restauração decidido:** preservar backup_testes e gerar/identificar um artefato versionado de schema/dados/índices apenas das seis auxiliares, com checksum. Testar sua restauração em ambiente descartável antes de usá-lo em postgres. Antes de cada A/B, recriar/restaurar somente as auxiliares necessárias e seus objetos específicos de apoio, com allowlist explícita; nunca restaurar postgres inteiro ou sobrescrever a tabela principal. Não usar apenas UPDATE de reset. Aplicar a mesma preparação, ANALYZE e política de aquecimento; registrar autovacuum/checkpoints. Restauração lógica não garante caches ou disposição física idênticos.

**Certificação antes do benchmark:** registrar versão/checksum do artefato, DDL, contagens, elegíveis, min/max de IDs, nulos e SHA-256 de exportação determinística ordenada por id, distinguindo NULL de string vazia. Validar também conjuntos e valores. A política está definida; geração/certificação do artefato e execução da restauração permanecem tarefas de implementação. Não copiar/restaurar backup_testes durante medições, pois compartilha recursos com postgres.

## 3. Catálogo e limites da medição

**Escopo adotado: somente DML.** DDL, restauração, colunas/tabelas de apoio, mapa de referências e marcação do EXP-09 são preparação fora da janela medida. Validação e DROP/RENAME também ficam fora; não executar finalização estrutural nos benchmarks DML. EXP-10 não exige estudo separado.

**Cronômetro:** iniciar imediatamente antes da transação A ou da primeira transação B, com cliente de trabalho já adquirido e H/estado administrativo preparados. Encerrar após confirmação do commit final, incluindo progresso/conclusão. Contar fronteiras, SQL, esperas, checkpoints, commits, controle entre lotes e throttle; não subtrair overhead. Agendamento/aquisição podem ser métricas separadas. Monitorar antes/durante/depois e observar recuperação. A janela comum da carga será fixada no piloto. Os arquivos originais não implementam essa separação automaticamente.

| ID | Operação medida proposta | Preparação / finalização fora da janela DML | Validação de resultado |
|---|---|---|---|
| 01 | UPDATE com LPAD do CNPJ | DROP/RENAME somente após validar; restaurar schema para próxima execução | Comparar com LPAD da origem numérica para todos os elegíveis; destino com 14 caracteres; preservar nulos não elegíveis |
| 02 | UPDATE com CASE do tipo de pessoa | Criar tipo_pessoa_descricao | Zero divergências em relação ao CASE; demais códigos e NULL resultam em Não identificado |
| 03 | UPDATE para JSONB | Criar dados_empresa | Igualdade JSONB com jsonb_build_object e COALESCE originais, inclusive nulos |
| 04 | UPDATE com JOIN | Criar/preencher referência e criar qualificacao_id | Todo par não nulo encontra exatamente a referência correta; pares com NULL continuam sem referência |
| 05 | UPDATE separando nome | Criar primeiro_nome/sobrenome NULL | Nome único sem sobrenome; vazios/nulos e espaços conforme seção 5; contagens e origem preservadas |
| 06 | UPDATE de nome_normalizado/processado | Nenhum DDL adicional | Elegíveis terminam TRUE e nome_normalizado igual a UPPER(TRIM(nome)), inclusive origem NULL |
| 07 | UPDATE de categoria | Nenhum DDL adicional | Conferir CASE na ordem Administrador, Diretor, Presidente, Outros; NULL vai para Outros |
| 08 | INSERT SELECT de sócios | Criar destino vazio | Igualdade de conjuntos por id/nome/documento, zero faltantes/extras; origem preservada |
| 09 | Somente DELETE | Restaurar migrado=FALSE; marcar SC antes da medição | Nenhum alvo sobrevivente, nenhum não alvo removido; conjunto remanescente igual ao esperado |
| 10 | Fora do benchmark DML | Arquivo histórico, não executar | Não exige implementação ou comparação neste estudo |

Não há FK criada no EXP-04 no SQL recebido: qualificacao_id é coluna de referência, sem constraint de integridade referencial. Não acrescentar FK/índices em um modo só. Preservar PKs e UNIQUE fornecidos e registrar o DDL efetivo de cada rodada. Para comparar execuções do EXP-04, reutilizar o mesmo mapa referência ou validar os pares codigo/descricao, não exigir que IDs gerados sem ordenação coincidam entre reconstruções.

## 4. Contrato A/B aprovado — implementação e validação pendentes

**Decisão de Nayan:** manter Knex e os contratos A/B abaixo. As regras específicas foram posteriormente delegadas ao assistente e estão definidas na seção 5. A definição não autoriza pular instrumentação ou testes antes dos benchmarks.

**A, DML monolítico:** mesma expressão SQL set-based sobre o conjunto completo limitado a H, em uma transação READ COMMITTED, com progresso/conclusão no mesmo commit. EXP-09 mede apenas DELETE; a marcação é preparação comum anterior.

**B, DML batch:** mesma expressão/predicado, acrescentando intervalo de IDs. Selecionar próximos até B IDs existentes, limitados a H; executar DML e checkpoint por meio da mesma instância Knex.Transaction; commit por lote. Tamanho de lote significa registros percorridos, não id+batch_size. Throttle entre commits, fora da transação; inicialmente zero para separar seus efeitos do tamanho de lote.

Job, executor, iterator e persistência precisam receber a conexão transacional. Uma transação no executor com job ainda usando conexão global não atende ao contrato. Os arquivos SQL salvos não implementam isso.

Persistir cursor, H e contadores na mesma transação do DML. Distinguir linhas visitadas, alteradas, inseridas e excluídas. Lote sem alterações ainda pode avançar. EXP-09 deve guardar a fronteira do lote antes de excluir; não calcular cursor consultando linhas já removidas.

Falha antes do commit aborta o lote inteiro, inclusive checkpoint; manter último cursor comprometido. Sem retry oculto na comparação principal. Retomada explícita; depois de resposta de commit perdida, reler estado durável antes de repetir. Não admitir dois workers sobre a mesma execução.

**Atomicidade:** A confirma toda a transformação de uma vez; B deixa prefixos comprometidos visíveis entre lotes. Igualdade final não equivale a atomicidade global. Não prometer exactly-once nem rollback global do batch.

## 5. Decisões específicas adotadas por delegação de Nayan

1. **EXP-01:** LPAD padroniza para 14 posições; não prova recuperação do formato textual original se a fonte aceitava comprimentos diferentes. Comparar também com o formato esperado da origem. Validar números não negativos e até 14 dígitos. DROP/RENAME é finalização destrutiva, não executar sem validação e autorização da rodada.
2. **EXP-02:** manter o CASE original: 1 Jurídica, 2 Física, 3 Estrangeiro, demais/NULL Não identificado. É regra explícita do experimento, não afirmação de validação cadastral externa.
3. **EXP-05:** remover espaços ASCII U+0020 nas extremidades e reduzir sequências internas a um espaço. Primeiro token = primeiro_nome; restante = sobrenome; nome único tem sobrenome NULL; vazio/só espaços produz ambos NULL; origem NULL permanece NULL. Tabs/quebras/outros caracteres não serão normalizados como espaço. Não interpretar sobrenomes compostos ou razão social semanticamente. Corrigir isso na futura implementação compartilhada A/B; o SQL original arquivado continua preservado. Predicado inicial nome IS NOT NULL AND primeiro_nome IS NULL. Repetir sobre vazio pode reescrever NULL sem alterar o estado lógico: não confundir idempotência lógica com ausência de escritas.
4. **EXP-06:** manter UPPER(TRIM(nome)) original, sem remoção de espaços internos. Preparação exige nome_normalizado NULL e processado FALSE. Nome NULL termina normalizado NULL e processado TRUE. processado NULL não é elegível; detectá-lo como estado inicial inválido, não mudar predicado silenciosamente.
5. **EXP-08:** **cópia**, sem apagar origem. Destino vazio por nova execução; INSERT SELECT e checkpoint no mesmo commit; retomada explícita pelo último cursor durável, sem repetir intervalos confirmados. Não usar ON CONFLICT DO NOTHING. Conflito inesperado de PK aborta lote e exige investigação. O INSERT não se torna idempotente por si; segurança depende do checkpoint atômico/exclusividade. Não limpar destino para retomar a mesma execução.
6. **EXP-09:** medir **apenas DELETE WHERE migrado=TRUE**, limitado a H. Restaurar estado FALSE em todas as linhas e marcar uf='SC' antes de iniciar a carga/cronômetro. Registrar conjunto de IDs esperado. Em B, selecionar até B IDs elegíveis ainda existentes, guardar fronteira e depois excluir/gravar checkpoint no mesmo commit; não usar OFFSET sobre conjunto em exclusão. Validar ausência de alvos e preservação exata dos demais.
7. **EXP-10:** fora do escopo DML. Preservar arquivo como referência; não implementar alternativa incremental nem exigir estudo DDL para concluir o TCC.
8. **EXP-04:** criar/preencher referência antes da janela, congelar o mesmo mapa de IDs para A/B; manter UNIQUE/PK originais sem nova FK. Validar pares lógicos e ausência de referências órfãs. A alimentação de referência é preparação, não INSERT medido adicional.

**Cenário inicial adotado: EXP-06**, para desenvolver e validar o contrato antes de ampliar às outras operações DML. EXP-01 a EXP-09 formam o catálogo principal; EXP-10 permanece somente arquivado.

## 6. Integridade e controles comuns

- Validar contagem e divergências com IS DISTINCT FROM para nulos, fora da janela cronometrada. Para inserção/exclusão, validar conjuntos e ausência de linhas extras, não só contadores do job.
- Comparar com o estado esperado calculado a partir de snapshot imutável, não somente entre A e B (ambos podem estar errados).
- Manter hardware, PostgreSQL, índices, pool, configuração de durabilidade, cache, carga e timeouts equivalentes; registrar autovacuum/checkpoints e interferência externa.
- Carga de leitura e carga com escritas conflitantes são perfis separados. As escritas concorrentes não podem modificar predicados ou colunas de origem sem novo contrato específico. Carga com exclusão requer política explícita para leituras que deixam de encontrar registros.
- Perfil inicial: leituras por PK/faixas nas auxiliares, com controle sem operação massiva. Em EXP-09, zero linhas para registro já excluído é resposta esperada, contabilizada separadamente de erros/timeouts. Perfil adicional de escrita, quando implementado, usará coluna auxiliar não envolvida na transformação, preparada igualmente em A/B. Detalhes operacionais e capacidade serão fixados na fase de carga/piloto.
- Controle sem operação massiva, múltiplas repetições, ordem balanceada/aleatorizada e carga oferecida registrada. Seeds pertencem ao gerador de carga/ordem, não à origem real já copiada.
- Medir duração, throughput, latência concorrente, erros/timeouts, CPU/memória/I/O/locks, sem declarar sucesso apenas por tempo total.
- Batch sizes, throttle, taxa de carga, duração e repetições finais serão definidos no piloto, não inventados a partir dos scripts.
- Conforme pedido: **métricas e visualização prontas antes dos benchmarks**. Não há métricas coletadas nesta atualização.

## 7. Encerramento da Fase B e entregas seguintes

Definidos: catálogo DML EXP-01 a EXP-09, postgres.public, backup_testes preservado, desenvolvimento isolado, escopo de medição, Knex, contratos A/B, cenário inicial EXP-06, regras específicas, restauração e aceites por operação.

**Fase B concluída como definição metodológica**, com decisões delegadas por Nayan. Revisões futuras devem versionar o protocolo e preservar a comparabilidade das execuções. Nenhum benchmark foi realizado para encerrar esta fase.

**Ainda não implementado/validado:** certificação do backup e artefato, restauração automatizada, schema benchmark_control, runners/jobs A/B, SQL executável corrigido EXP-05, consultas automatizadas de integridade, testes de falha, instrumentação e benchmarks. Validar backup/restauração e fixtures, testar contrato, instrumentar métricas/visualização e pilotar antes da campanha. Nenhum dado ou SQL experimental foi alterado/executado nesta decisão.

Referências técnicas consultadas: documentação oficial PostgreSQL 17, seções 9.4 (String Functions and Operators), 13.3 (Explicit Locking) e comando ALTER TABLE. Arquivos SQL foram arquivados e comparados ao anexo; não executados nesta tarefa.
