> Documento histórico/de pesquisa; comandos do laboratório não são o fluxo público atual. [BatCheman: primeiro uso](../../README.md).

# Ambiente real — Fase A

## Escopo e instante da coleta

- Repositório: `M:/ProjetoTcc/Processamento_em_loteV5`.
- Coleta: **2026-09-30, 20:58:52–21:01:42, UTC−03:00**. São snapshots sucessivos, não uma medição atômica nem um benchmark.
- Windows: fuso `E. South America Standard Time`, deslocamento `-03:00` (Brasília). Relógio observado: `2026-09-30T20:58:54.3127118-03:00`.
- Container: `date -Iseconds` retornou `2026-10-01T00:01:19+00:00`. A mudança de data corresponde ao horário UTC; não foi consultado o timezone da sessão PostgreSQL nem validada sincronização NTP.
- Inspeção somente de metadados de sistema, runtime e dependências. Não houve SQL, leitura de dados de negócio, migrações, jobs, instalação, alteração de configuração ou início/parada de serviços. O único arquivo escrito por este inventário é este documento. `docker exec` executou apenas um shell de leitura de limites, `date` e `uname`.
- Não foram coletados `env`, senhas, linhas de comando de processos, logs completos ou `docker inspect` completo. Valores de uso livre, PIDs, estado dos containers e dependências podem mudar durante esta sessão.

## 1. Host Windows: CPU, memória e armazenamento

Evidências: CIM/PowerShell às 20:58:54; mapeamento dos discos às 21:00:26. GiB = bytes / 2³⁰; conversões calculadas por Python.

| Item | Observado |
|---|---|
| Sistema operacional | Microsoft Windows 10 Home Single Language, `10.0.19045`, build `19045`, 64 bits |
| Processador físico | 1 CPU Intel(R) Core(TM) i5-7300HQ CPU @ 2.50GHz, socket `U3E1` |
| Núcleos / processadores lógicos | **4 / 4**; `MaxClockSpeed=2501` MHz informado pelo CIM, não frequência medida sob carga |
| RAM instalada | 2 módulos de `8589934592` bytes: **16 GiB**; `Speed=2400`, `ConfiguredClockSpeed=2400` em ambos |
| RAM visível ao Windows | `17041690624` bytes = **15,871 GiB**; `TotalVisibleMemorySize=16642276` KiB |
| RAM livre naquele instante | `FreePhysicalMemory=3090452` KiB = **2,947 GiB**, não capacidade total ou limite Docker |
| Hypervisor | `HypervisorPresent=true` |
| Disco físico do repositório | Disco 0, `WD Green 2.5 1000GB`, SATA, GPT, `1000204886016` bytes = **931,513 GiB** |
| Volume do repositório | `M:`, NTFS, disco 0 / partição 4; volume `53686038528` bytes = **49,999 GiB**, livres `37546516480` bytes = **34,968 GiB** |
| Volume do perfil/Docker padrão | `C:`, NTFS, disco 0 / partição 3; volume `945826906112` bytes = **880,870 GiB**, livres `300761071616` bytes = **280,106 GiB** |

`C:` e `M:` pertencem ao **mesmo disco físico**; letras diferentes não comprovam isolamento de I/O. Não foram medidos desempenho, desgaste ou tipo de mídia além do modelo/barramento reportados.

Metadados de VHDX encontrados sob `C:/Users/nayan/AppData/Local/Docker/wsl/`:

| Arquivo | Comprimento lógico do arquivo |
|---|---:|
| `disk/docker_data.vhdx` | `46588231680` bytes = 43,389 GiB |
| `main/ext4.vhdx` | `385875968` bytes = 0,359 GiB |

Apenas caminho/tamanho/metadados foram enumerados: não houve montagem, leitura interna ou alteração dos VHDs. O vínculo exato desses arquivos com o daemon ativo não foi comprovado por configuração interna. Seus tamanhos **não** são limite do disco virtual, espaço efetivamente ocupado, tamanho do banco ou limite do container. O daemon informou `DockerRootDir=/var/lib/docker`, caminho do **Linux**, não do Windows.

## 2. Docker Desktop e ambiente Linux

Snapshot iniciado às **20:58:58**; `docker version`, `docker compose version` e campos filtrados de `docker info` retornaram:

| Componente | Observado |
|---|---|
| Docker client | `27.2.0`, API `1.47`, Windows/amd64; contexto `desktop-linux` |
| Docker server / Engine | `27.2.0`, API `1.47`, Linux/amd64 |
| Docker Desktop | `4.34.2 (167172)` |
| Docker Compose | `v2.29.2-desktop.2` |
| containerd / runc / docker-init | `1.7.20` / `1.1.13` / `0.19.0` |
| Kernel do Linux Docker | `5.15.153.1-microsoft-standard-WSL2`, x86_64 |
| CPU visível ao daemon | `NCPU=4` |
| RAM visível ao daemon | `MemTotal=8263696384` bytes = **7,696 GiB** |
| Armazenamento / cgroups | `overlay2`, `cgroupfs`, cgroup versão `1` |

**Não confundir camadas:** os 16 GiB instalados no Windows não são RAM disponível ao PostgreSQL. O Linux Docker expôs 7,696 GiB e 4 CPUs, compartilhados com outros processos/containers, não recursos reservados exclusivamente ao TCC. `/proc/meminfo` lido no container confirmou `MemTotal: 8070016 kB` e `SwapTotal: 2097152 kB` (**2 GiB de swap** do Linux visível; não memória física adicional nem reserva exclusiva). Não se inspecionaram configurações persistentes do WSL; estes são os recursos efetivamente visíveis durante a coleta.

## 3. Container `dbpostgres`: imagem, recursos e persistência

Snapshot iniciado às **21:01:16**. Evidências filtradas de `docker inspect`, `docker image inspect`, `docker stats --no-stream` e leitura dos arquivos cgroup:

```text
Name=/dbpostgres; Status=running; ImageReference=postgres
ImageId=sha256:f49abb9855df03f1829d6bd95bc8f5e9a24e1fd1bd11cab99bc2ef90f6960f6d
RepoTags=["postgres:17","postgres:latest"]
RepoDigests=["postgres@sha256:fe3f571d128e8efadcd8b2fde0e2b73ebab6dbec33f6bfe69d98c682c7d8f7bd"]
Os=linux; Architecture=amd64
Memory=0; MemoryReservation=0; MemorySwap=0; MemorySwappiness=null
NanoCpus=0; CpuQuota=0; CpuPeriod=0; CpuShares=0
CpusetCpus=""; CpusetMems=""; PidsLimit=null
ShmSize=67108864; Ulimits=[]
```

As tags são metadados locais; a versão binária/SQL do servidor PostgreSQL não foi consultada. Digest/ID identificam a imagem deste snapshot, mesmo que uma tag mude depois.

| Limite efetivo observado | Evidência e interpretação |
|---|---|
| Memória | `memory.limit_in_bytes=9223372036854771712`: sentinela de ausência de teto próprio no cgroup v1; **não** significa RAM fisicamente disponível nesse valor. `Memory=0` no Docker significa limite não configurado, não zero RAM. A capacidade visível é a do Linux Docker: 7,696 GiB, compartilhada. |
| Memória + swap | `memory.memsw.limit_in_bytes=9223372036854771712`; sem teto próprio nesse cgroup. `MemorySwap=0` é configuração não explícita, não evidência de swap desativado. |
| CPU | `cpu.cfs_quota_us=-1`, `cpu.cfs_period_us=100000`: sem quota CFS própria; `cpuset.cpus=0-3` e `cpuset.effective_cpus=0-3`: 4 CPUs elegíveis, sem exclusividade. |
| PIDs | `pids.max=max`: sem teto próprio de PIDs nesse cgroup. |
| Memória compartilhada | `ShmSize=67108864` bytes (64 MiB). |
| Uso instantâneo | `docker stats`: `CPU=0.00%`, `MemoryUsageAndLimit=34.89MiB / 7.696GiB`, `MemoryPercent=0.44%`, `PIDs=6`. Não representa pico, reserva ou benchmark. |

Não foi feito rastreamento de todos os cgroups ancestrais; os campos acima são os do container e a capacidade reportada pelo daemon/stats, não garantia de recursos livres sob concorrência.

Persistência/porta observadas, sem leitura do conteúdo do volume:

```text
Type=volume; Driver=local; RW=true
Name=73b53fee9dc76c6694a0c6d4eb2fa4515584a291b9301a334461dcaa78dfbfa7
Source=/var/lib/docker/volumes/73b53fee9dc76c6694a0c6d4eb2fa4515584a291b9301a334461dcaa78dfbfa7/_data
Destination=/var/lib/postgresql/data
Porta: 0.0.0.0:5432 -> 5432/tcp
```

O bind informado abrange todas as interfaces IPv4 do host Docker; não foi testada acessibilidade externa nem inspecionado firewall. Ambos os rótulos Compose permitidos (`project.config_files` e `project.working_dir`) vieram vazios para `dbpostgres`; isso não comprova como o container foi originalmente criado.

## 4. Node/npm e dependências instaladas

**Snapshot das dependências: `2026-09-30T20:59:15.226276-03:00`.** São versões instaladas naquele momento, não intervalos declarados em `package.json` nem garantia do estado ao final da sessão. Comandos executados no repositório, com sucesso (`exit_code=0`):

```text
node --version: v22.22.2
npm --version: 10.9.7
npm ls --depth=0:
processamento-em-lote-monorepo@1.0.0 M:\ProjetoTcc\Processamento_em_loteV5
├── @types/node@25.2.3
├── knex@3.1.0
├── pg@8.18.0
├── ts-node@10.9.2
└── typescript@5.9.3
```

Não houve `npm install`, execução de testes/aplicação ou inventário de dependências transitivas. Se outro trabalho alterar dependências, repetir o snapshot antes do experimento.

## 5. Descoberta limitada de observabilidade externa

A descoberta ficou restrita ao `docker ps -a` do contexto `desktop-linux`, aos **dois rótulos Compose autorizados**, às portas Windows `3000/9090/9100/9187/8080` e a nomes/IDs de processos. Nenhum arquivo de configuração externo foi aberto e nenhum endpoint HTTP foi consultado.

O `docker ps -a` corrigido enumerou **5 containers**:

| Container | Imagem | Estado / status naquele instante | Publicação reportada |
|---|---|---|---|
| `dbpostgres` | `postgres` | running / Up 2 hours | `0.0.0.0:5432->5432/tcp` |
| `hotel-postgres` | `postgres:17` | exited / Exited (0) 9 days ago | vazia |
| `opencut-video-editor-api-1` | `opencut-video-editor-api` | exited / Exited (143) 2 days ago | vazia |
| `opencut-video-editor-web-1` | `opencut-video-editor-web` | exited / Exited (143) 2 days ago | vazia |
| `hermes-api` | `hermes-api-hermes-api` | running / Up 2 hours (unhealthy) | `0.0.0.0:8000->8000/tcp` |

Rótulos `com.docker.compose.project.config_files` / `com.docker.compose.project.working_dir`:

- `dbpostgres` e `hotel-postgres`: ambos vazios.
- Os dois containers `opencut-video-editor-*`: `M:\Hermes\OpenCut-video-editor\docker-compose.yml` / `M:\Hermes\OpenCut-video-editor`.
- `hermes-api`: `M:\Hermes\hermes-api\docker-compose.yml` / `M:\Hermes\hermes-api`.

Às **21:01:24**, a enumeração Windows sem supressão de erros retornou `EnumeratedTcpCount=272`, `EnumeratedUdpCount=53`; filtrando as cinco portas, `TCP=[]` e `UDP=[]`. Nenhum processo Windows correspondeu a `grafana|prometheus|exporter|cadvisor` (`ObservabilityProcessMatches=[]`).

O filtro ampliado às 21:00:20 encontrou, entre outros, `com.docker.backend` (11772, 13352), `vmmem` (8476), `Docker Desktop` (9424, 11732, 13488, 17004) e `wslservice` (4384); não retornou nomes correspondentes a `node` ou `postgres`. Apenas nomes/IDs foram extraídos: a ausência de `postgres` na lista Windows não contradiz sua execução no Linux Docker.

**Conclusão delimitada:** não apareceu evidência identificável de Grafana, Prometheus, node_exporter, postgres_exporter ou cAdvisor **nesses containers, nomes de processos Windows e portas locais inspecionados**. Isso não prova ausência universal: outros contextos Docker, máquinas, namespaces, nomes/portas diferentes e serviços remotos não foram investigados. `hermes-api` concorre pelos recursos Docker e apareceu `unhealthy`; o motivo não foi diagnosticado, nem foram lidos seus logs.

## 6. Comandos de repetição (somente leitura)

Executar os comandos de Git Bash com diretório de trabalho `M:/ProjetoTcc/Processamento_em_loteV5`. Os blocos PowerShell podem ser executados no PowerShell ou passados a `powershell.exe -NoProfile -NonInteractive -Command '…'` no Git Bash. Não publicar saídas de inspeção completa, variáveis de ambiente ou command lines.

### Host/discos — PowerShell

```powershell
Get-Date -Format o
Get-TimeZone | Select-Object Id,DisplayName,BaseUtcOffset
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture,TotalVisibleMemorySize,FreePhysicalMemory
Get-CimInstance Win32_Processor | Select-Object Name,SocketDesignation,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed
Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory,NumberOfProcessors,NumberOfLogicalProcessors,HypervisorPresent
Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity,Speed,ConfiguredClockSpeed
Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DeviceID -in @("C:","M:") } | Select-Object DeviceID,DriveType,FileSystem,Size,FreeSpace
$p = @(Get-Partition | Where-Object { $_.DriveLetter -in @("C","M") })
$p | Select-Object DiskNumber,PartitionNumber,DriveLetter,Size,Type
$p.DiskNumber | Sort-Object -Unique | ForEach-Object { Get-Disk -Number $_ } | Select-Object Number,FriendlyName,BusType,PartitionStyle,Size
Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\Docker\wsl" -Filter *.vhdx -Recurse -File | Select-Object FullName,Length,LastWriteTime
```

### Runtime, recursos e imagem — Git Bash

```bash
python -c 'import datetime; print(datetime.datetime.now().astimezone().isoformat())'
node --version
npm --version
npm ls --depth=0
docker version --format '{{json .}}'
docker compose version
docker info --format 'OS={{.OSType}} OperatingSystem={{.OperatingSystem}} Arch={{.Architecture}} Kernel={{.KernelVersion}} CPUs={{.NCPU}} MemoryBytes={{.MemTotal}} Root={{.DockerRootDir}} Storage={{.Driver}} CgroupDriver={{.CgroupDriver}} CgroupVersion={{.CgroupVersion}}'
docker inspect --type container --format 'Name={{.Name}} ImageId={{.Image}} ImageReference={{.Config.Image}} Status={{.State.Status}} Memory={{.HostConfig.Memory}} MemoryReservation={{.HostConfig.MemoryReservation}} MemorySwap={{.HostConfig.MemorySwap}} MemorySwappiness={{json .HostConfig.MemorySwappiness}} NanoCpus={{.HostConfig.NanoCpus}} CpuQuota={{.HostConfig.CpuQuota}} CpuPeriod={{.HostConfig.CpuPeriod}} CpuShares={{.HostConfig.CpuShares}} CpusetCpus={{json .HostConfig.CpusetCpus}} CpusetMems={{json .HostConfig.CpusetMems}} PidsLimit={{json .HostConfig.PidsLimit}} ShmSize={{.HostConfig.ShmSize}} Ulimits={{json .HostConfig.Ulimits}} Mounts={{json .Mounts}} Ports={{json .NetworkSettings.Ports}}' dbpostgres
image_id=$(docker inspect --type container --format '{{.Image}}' dbpostgres) && docker image inspect --format 'Id={{.Id}} RepoTags={{json .RepoTags}} RepoDigests={{json .RepoDigests}} Os={{.Os}} Architecture={{.Architecture}}' "$image_id"
docker stats dbpostgres --no-stream --format 'Name={{.Name}} CPU={{.CPUPerc}} MemoryUsageAndLimit={{.MemUsage}} MemoryPercent={{.MemPerc}} PIDs={{.PIDs}}'
docker exec dbpostgres sh -c 'date -Iseconds; uname -srm; for f in /sys/fs/cgroup/memory/memory.limit_in_bytes /sys/fs/cgroup/memory/memory.memsw.limit_in_bytes /sys/fs/cgroup/cpu/cpu.cfs_quota_us /sys/fs/cgroup/cpu/cpu.cfs_period_us /sys/fs/cgroup/cpuset/cpuset.cpus /sys/fs/cgroup/cpuset/cpuset.effective_cpus /sys/fs/cgroup/pids/pids.max; do if [ -r "$f" ]; then printf "%s=" "$f"; while IFS= read -r line; do printf "%s\n" "$line"; done < "$f"; else printf "%s=unavailable\n" "$f"; fi; done; while read -r key value unit; do case "$key" in MemTotal:|SwapTotal:) printf "%s %s %s\n" "$key" "$value" "$unit";; esac; done < /proc/meminfo'
```

A leitura cgroup acima corresponde à versão **1**, efetivamente encontrada. Se o ambiente mudar para cgroup v2, ausência desses arquivos exige nova investigação, não a conclusão de ausência de limites. `docker exec` pressupõe container já em execução; não iniciá-lo para repetir este inventário.

### Descoberta autorizada — Git Bash e PowerShell

```bash
docker ps -a --no-trunc --format '{{json .ID}} {{json .Names}} {{json .Image}} {{json .State}} {{json .Status}} {{json .Ports}} {{json (.Label "com.docker.compose.project.config_files")}} {{json (.Label "com.docker.compose.project.working_dir")}}'
```

```powershell
$ErrorActionPreference = "Stop"
Get-Date -Format o
$ports = @(3000,9090,9100,9187,8080)
$tcp = @(Get-NetTCPConnection -ErrorAction Stop)
$udp = @(Get-NetUDPEndpoint -ErrorAction Stop)
[ordered]@{ EnumeratedTcpCount=$tcp.Count; EnumeratedUdpCount=$udp.Count }
$tcp | Where-Object { $_.LocalPort -in $ports } | Select-Object LocalAddress,LocalPort,State,OwningProcess
$udp | Where-Object { $_.LocalPort -in $ports } | Select-Object LocalAddress,LocalPort,OwningProcess
Get-Process | Where-Object { $_.ProcessName -match "grafana|prometheus|exporter|cadvisor|node|postgres|docker|vmmem|wsl" } | Select-Object Id,ProcessName
```

## 7. Limitações e preservação

- Uma primeira tentativa de formatação do `docker ps` falhou (`wrong number of args for json`); foi corrigida usando parênteses em `json (.Label "…")` e a enumeração completa retornou com sucesso. Não houve instalação ou alteração de serviço para contornar o erro.
- A primeira enumeração de portas usou supressão de erros; foi repetida com `-ErrorAction Stop`, contagens de endpoints e resultado vazio confirmado para as portas alvo. A conclusão de ausência local usa esta segunda leitura.
- O repositório já estava modificado antes deste trabalho: exclusão de `src/Jobs_Dones/NormalizeUserEmailsJob.ts`; alterações em `src/db/conection.ts` e `src/db/knexfile.ts`; arquivos não rastreados `2026-09-27_172403-retomada-conclusao-tcc2.md`, `src/db/config.ts` e `tests/`. Antes da escrita deste documento, também apareceram `.gitignore` modificado e `.env.example` não rastreado. Essas mudanças concorrentes/pré-existentes não foram feitas nem revertidas por este inventário.
- Verificação final do Git às `2026-09-30T21:05:04.858083-03:00`: este documento apareceu como não rastreado. Também apareceram novas mudanças concorrentes em `src/cli/index.ts`, duas migrações, exclusões staged de `dist/` e `src/.env`. Este inventário não editou esses arquivos nem executou comandos de stage/remoção; não há alegação de árvore limpa. A ferramenta de escrita confirmou exclusivamente `research/docs/AMBIENTE-FASE-A.md`.
- As saídas pertinentes estão transcritas/seletivamente estruturadas acima. Não se pretende certificar reprodutibilidade experimental, disponibilidade futura, ausência global de observabilidade ou limites persistentes após reinício. Repetir a coleta no início de cada rodada da Fase A.
