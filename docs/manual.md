# Manual de uso

## Funcionário (celular)

1. **Entrar:** usuário e senha recebidos do responsável. No primeiro acesso, crie sua senha (mínimo 8 caracteres, com letras e números).
2. **Semana atual:** aparece em destaque com o fechamento: crédito da semana anterior + recebido − gasto. O resultado mostra o crédito que fica com você ou quanto ainda falta receber da empresa. Na semana em aberto o valor é provisório; é confirmado no acerto.
3. **Adicionar despesa:** data, valor, categoria e descrição. Se tiver comprovante, marque "Sim" e, se quiser, anexe foto ou PDF (câmera, galeria ou arquivo). Detalhes como km, origem, destino e clientes são opcionais.
   - Cada gasto é um registro: dois gastos no mesmo dia ficam separados.
   - Um abastecimento conta só no dia em que foi pago.
   - Pode preencher a semana inteira de uma vez (ex.: na sexta ou no domingo).
4. **Adicionar recebimento:** registre só o que caiu de fato (transferência ou cartão benefício), uma vez. Se o valor se refere a outra semana, toque em "É de outra semana?".
5. **Adicionar percurso (opcional):** trechos do dia (ex.: São Paulo → Campinas e Campinas → Sorocaba).
6. **Corrigir:** use o lápis para editar ou a lixeira para excluir, enquanto a semana estiver em aberto.
7. **Semana encerrada:** fecha sozinha na quarta-feira seguinte se não houver valor a receber (a tela avisa a data). Depois fica só para consulta; para corrigir, fale com o responsável. Se faltar receber da empresa, a semana fecha sozinha assim que você lançar o recebimento.
8. Sem internet, o formulário não salva: os dados continuam na tela para tentar de novo.

## Administração (computador)

- **Funcionários:** cartões em ordem alfabética com selo da unidade (ex.: NRT, SUL) e busca por nome, usuário ou unidade. Gestor e Administrador podem incluir desativados.
- **Detalhe:** semanas da mais recente para a mais antiga, com crédito anterior, recebido, gasto e crédito/valor a acertar.
  - **Acerto automático:** não é preciso acertar semana por semana. Quando a semana termina sem valor a receber, ela fecha sozinha na quarta-feira (tolerância configurável). Se a empresa deve ao funcionário, o cartão dele mostra "A receber R$ ..."; quando ele lança o recebimento, a semana fecha sozinha.
  - **Acertar semana (opcional):** o botão continua disponível para fechar antes do prazo. Não registre recebimento na administração: o funcionário registra o complemento.
  - **Reabrir:** exige motivo; semanas posteriores acertadas também são reabertas (o sistema avisa antes).
- **Relatórios:** filtros por funcionário, mês ou intervalo, categoria e status; exportação em PDF e Excel com os mesmos filtros.
- **Administrador:** contas (criar, editar, definir a unidade, senha temporária, desativar/reativar), categorias, configurações, auditoria e "Acessar como funcionário" (faixa amarela com botão para sair; tudo fica registrado em nome do Administrador).

## Operação

- **Criar conta:** em Contas → Nova conta, escolha "Gerar senha temporária" (a pessoa cria a própria senha no primeiro acesso) ou "Definir a senha agora" (a pessoa já entra com a senha que você definiu).
- **Senha esquecida:** o Administrador abre a conta e usa "Definir senha temporária". A senha aparece uma única vez; entregue pessoalmente.
- **Desligamento:** desative a conta (bloqueio imediato, histórico preservado). Não exclua contas com dados financeiros.

## Demonstração

`npm run seed` cria, num Supabase local, uma equipe fictícia com seis semanas de uso simulado (senha de todos: `Demo12345`):

- **Funcionários:** `ana.souza`, `bruno.lima`, `carla.dias` e `diego.rocha`, em três unidades. Entre como qualquer um para ver a semana atual, as despesas por dia, os comprovantes, os percursos e as semanas anteriores encerradas.
- **Valor a receber:** `carla.dias` tem a última semana encerrada com **R$ 80,00 a receber da empresa**. O cartão dela no painel mostra o aviso; lançando um recebimento de R$ 80,00 como ela, a semana fecha sozinha na próxima rodada do acerto automático (ou pelo botão de acerto).
- **Administração:** `admin` (Administrador) e `gestor` (Gestor) veem o painel, os detalhes por semana, os relatórios com exportação em PDF/Excel e, no caso do Administrador, contas, categorias, configurações e auditoria.

Para recomeçar do zero: `npx supabase db reset` e `npm run seed`.
