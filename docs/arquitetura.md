# Arquitetura

## Modelo de dados

| Tabela | Conteúdo |
| --- | --- |
| `profiles` | Identidade (nome, usuário, CPF e unidade opcionais), papel, ativo, avatar/foto, troca de senha obrigatória. Sem senha. |
| `categories` | Nome, grupo (percurso/outras), ativa, ordem. |
| `employee_weeks` | Uma por funcionário e segunda-feira; status `aberta`/`acertada`; `version`. |
| `expenses` | Semana, data, valor (centavos), categoria, grupo, descrição, km/origem/destino/clientes opcionais, comprovante sim/não. Exclusão lógica. |
| `receipts` | Valores recebidos da empresa: semana de referência, data, valor, descrição opcional. |
| `routes` | Percursos opcionais e independentes. |
| `attachments` | Caminho privado no Storage, tipo, tamanho. |
| `settlements` | Instantâneo do acerto e validade (invalidado na reabertura). |
| `audit_events` | Ator real, funcionário afetado, sessão de suporte, entidade, ação, motivo, antes/depois. |
| `support_sessions` | Administrador, funcionário, início, expiração, fim. |
| `login_attempts` | Limite de tentativas (5 falhas/15 min por usuário; 30 por IP). |
| `app_settings` | Início da operação, limites de anexo, duração do suporte, validade da senha temporária. |

Valores em `bigint` (centavos). Datas de ocorrência em `date` (calendário de São Paulo); horários em `timestamptz`. Chaves UUID.

## Cálculo

Para cada funcionário e semana: `C` = crédito do último acerto válido anterior; `R` = recebido; `D` = gasto; `S = C + R − D`.
`S ≥ 0` é crédito; `S < 0` é valor a acertar (`−S`) e impede o acerto. **Acerto automático:** `app.auto_settle_employee` (agendada com pg_cron a cada 15 minutos via `run_auto_settlement`) acerta em ordem as semanas terminadas há mais que a tolerância, sem alteração nos últimos 30 minutos e com `S ≥ 0`; para na primeira com `S < 0`. A administração e o próprio funcionário veem esses valores (função `week_balances`; o funcionário só os próprios). Para o funcionário, `S < 0` aparece como "A receber da empresa".

## Permissões

| | Funcionário | Visualizador | Gestor | Administrador |
| --- | --- | --- | --- | --- |
| Ver próprios lançamentos | ✔ | | | |
| Ver funcionários ativos | | ✔ | ✔ | ✔ |
| Ver desativados | | | ✔ | ✔ |
| Criar/editar lançamentos | próprios, semana aberta | | | qualquer, semana aberta (auditado) |
| Saldos e crédito (ver) | próprios | ✔ | ✔ | ✔ |
| Acertar / reabrir | | | ✔ | ✔ |
| Exportar | | ✔ | ✔ | ✔ |
| Contas, categorias, configurações, auditoria, suporte | | | | ✔ |

Aplicação em três camadas: RLS (leitura), funções RPC (escrita) e verificação no servidor Next (rotas e ações).

## Fluxos

- **Login:** usuário + senha → limite de tentativas → Supabase Auth → conferência de conta ativa e validade da senha temporária → troca obrigatória se for o caso.
- **Lançamento:** formulário (validação Zod) → server action → RPC → gatilho de semana aberta → auditoria. Em falha, o formulário mantém os dados.
- **Anexo:** despesa salva → `/api/anexos/upload-url` (autoriza) → envio direto ao Storage privado → `register_attachment` (confere objeto, tipo, tamanho, limite).
- **Acerto:** Gestor/Administrador → `settle_week` (trava, confere sequência, versão e saldo, grava instantâneo, encerra).
- **Reabertura:** motivo obrigatório → invalida acertos da semana e das posteriores → todas voltam a "em aberto".
