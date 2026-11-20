<div align="center">
  <img src="assets/batcheman-logo.png" alt="Mascote do BatCheman" width="220" />
  <h1>BatCheman</h1>
  <p><strong>Grandes operações no PostgreSQL. Mais controle sobre a execução.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22+" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  </p>
</div>

## O projeto

O **BatCheman** é um framework experimental de linha de comando (CLI) para executar operações massivas de **UPDATE, INSERT e DELETE** no PostgreSQL. Ele permite comparar duas abordagens: uma única transação **monolítica** ou o processamento **em lotes**, com commits intermediários e checkpoints persistidos.

A proposta não é simplesmente executar mais rápido: é dar ao operador controle sobre o andamento da manutenção e sobre como ela convive com outras operações do banco.

## O que ele oferece?

- **Dois modos de execução:** monolítico e em lotes.
- **Checkpoint persistido:** progresso registrado a cada commit de lote.
- **Retomada controlada:** suporte a pausa, retomada e recuperação conforme o estado do job.
- **Parâmetros ajustáveis:** tamanho dos lotes e intervalo entre eles (*throttle*).
- **CLI para acompanhar:** cadastro, execução, status, logs e erros.

## Na prática

```bash
# Registrar uma operação SQL configurada no catálogo
bah register normalize-label --mode batch --batch-size 1000 --throttle 200

# Executar e acompanhar (substitua 1 pelo ID retornado)
bah run 1
bah status 1
```

> O exemplo pressupõe instalação, conexão e job configurados. O BatCheman é um protótipo acadêmico, não uma ferramenta certificada para uso em produção.

## Documentação

**[Acessar o guia completo →](docs/GUIA_DE_USO.md)** — instalação, configuração, contrato SQL, exemplos, comandos e limitações.

---

<sub>Projeto acadêmico desenvolvido para estudar o processamento em lotes em operações massivas no PostgreSQL.</sub>
