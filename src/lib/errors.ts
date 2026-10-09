// Tradução dos códigos de erro do banco (P0001) para mensagens simples.

const MESSAGES: Record<string, string> = {
  NAO_AUTENTICADO: "Sua sessão não está mais ativa. Entre novamente.",
  SEM_PERMISSAO: "Você não tem permissão para esta ação.",
  FUNCIONARIO_INVALIDO: "Funcionário não encontrado ou inativo.",
  SUPORTE_EXPIRADO: "O modo de suporte expirou. Inicie novamente.",
  DATA_OBRIGATORIA: "Informe a data.",
  DATA_ANTES_INICIO: "A data é anterior ao início da operação.",
  DATA_FUTURA: "A data não pode passar do domingo da semana atual.",
  ID_OBRIGATORIO: "Não foi possível identificar o registro. Recarregue a página.",
  CATEGORIA_INVALIDA: "Escolha uma categoria válida.",
  CATEGORIA_INATIVA: "Esta categoria foi desativada. Escolha outra.",
  CATEGORIA_DUPLICADA: "Já existe uma categoria com esse nome.",
  REGISTRO_INVALIDO: "Registro não encontrado.",
  SEMANA_ACERTADA: "Esta semana já foi encerrada e não pode ser alterada.",
  SEMANA_INVALIDA: "Semana inválida.",
  SEMANA_JA_ACERTADA: "Esta semana já está encerrada.",
  SEMANA_NAO_ACERTADA: "Esta semana não está encerrada.",
  SEMANA_ANTERIOR_PENDENTE: "Há semana anterior com lançamentos ainda aberta. Acerte as semanas em ordem.",
  SEMANA_POSTERIOR_ACERTADA: "Há semana posterior já acertada. Reabra-a antes de acertar esta.",
  SALDO_NEGATIVO: "Ainda falta dinheiro para acertar esta semana. Aguarde o recebimento ser registrado.",
  VERSAO_DESATUALIZADA: "Houve lançamentos novos nesta semana. Confira os valores atualizados e tente de novo.",
  MOTIVO_OBRIGATORIO: "Informe o motivo (mínimo de 5 caracteres).",
  ARQUIVO_INVALIDO: "Arquivo inválido.",
  ARQUIVO_NAO_ENCONTRADO: "O envio do arquivo não foi concluído. Tente anexar de novo.",
  TIPO_ARQUIVO_INVALIDO: "Formato não aceito. Use foto (JPEG, PNG, WebP) ou PDF.",
  ARQUIVO_GRANDE: "Arquivo acima de 10 MB.",
  LIMITE_ANEXOS: "Limite de anexos por despesa atingido.",
  CPF_DUPLICADO: "Já existe uma conta com este CPF.",
  CPF_INVALIDO: "CPF inválido.",
  USUARIO_DUPLICADO: "Este usuário de acesso já está em uso.",
  NAO_REMOVER_PROPRIO_ADMIN: "Você não pode remover seu próprio papel de Administrador.",
  NAO_DESATIVAR_PROPRIA_CONTA: "Você não pode desativar a própria conta.",
  PAPEL_COM_HISTORICO: "Funcionário com lançamentos não pode mudar de papel.",
  VALOR_INVALIDO: "Valor inválido.",
  ADMIN_JA_EXISTE: "O primeiro Administrador já foi criado.",
};

export const GENERIC_ERROR = "Não foi possível concluir. Verifique sua internet e tente de novo.";

export function codeFromError(err: unknown): string | null {
  const msg =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err ?? "");
  const match = msg.match(/\b([A-Z][A-Z_]{3,})\b/);
  return match && MESSAGES[match[1]] ? match[1] : null;
}

export function friendlyError(err: unknown): string {
  const code = codeFromError(err);
  return code ? MESSAGES[code] : GENERIC_ERROR;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fail(error: string, fieldErrors?: Record<string, string>): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return { ok: false, error, fieldErrors };
}
