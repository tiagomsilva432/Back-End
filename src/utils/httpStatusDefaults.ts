export interface StatusDefaults {
    message: string;
    code: string;
}

export const HTTP_STATUS_DEFAULTS: Record<number, StatusDefaults> = {
    //100 - Informativas
    100: { message: "Continuar", code: "INFO_CONTINUE" },
    101: { message: "A mudar protocolos", code: "INFO_SWITCHING_PROTOCOLS" },
    102: { message: "A processar", code: "INFO_PROCESSING" },
    103: { message: "Indicações antecipadas", code: "INFO_EARLY_HINTS" },

    //200 - Sucesso
    200: { message: "OK", code: "SUCCESS_OK" },
    201: { message: "Criado com sucesso", code: "SUCCESS_CREATED" },
    202: { message: "Aceito", code: "SUCCESS_ACCEPTED" },
    203: { message: "Informação não autoritativa", code: "SUCCESS_NON_AUTHORITATIVE_INFO" },
    204: { message: "Sem conteúdo", code: "SUCCESS_NO_CONTENT" },
    205: { message: "Redefinir conteúdo", code: "SUCCESS_RESET_CONTENT" },
    206: { message: "Conteúdo parcial", code: "SUCCESS_PARTIAL_CONTENT" },
    207: { message: "Multi-status", code: "SUCCESS_MULTI_STATUS" },
    208: { message: "Já reportado", code: "SUCCESS_ALREADY_REPORTED" },
    226: { message: "Estou usado", code: "SUCCESS_IM_USED" },

    //300 - Redirecionamento
    300: { message: "Múltiplas escolhas", code: "REDIRECTION_MULTIPLE_CHOICES" },
    301: { message: "Movido permanentemente", code: "REDIRECTION_MOVED_PERMANENTLY" },
    302: { message: "Encontrado", code: "REDIRECTION_FOUND" },
    303: { message: "Veja outro", code: "REDIRECTION_SEE_OTHER" },
    304: { message: "Não modificado", code: "REDIRECTION_NOT_MODIFIED" },
    305: { message: "Use Proxy", code: "REDIRECTION_USE_PROXY" },
    307: { message: "Redirecionamento temporário", code: "REDIRECTION_TEMPORARY_REDIRECT" },
    308: { message: "Redirecionamento permanente", code: "REDIRECTION_PERMANENT_REDIRECT" },

    //400 - Erros Cliente
    400: { message: "Requisição inválida", code: "BAD_REQUEST" },
    401: { message: "Não autorizado", code: "UNAUTHORIZED" },
    402: { message: "Pagamento necessário", code: "PAYMENT_REQUIRED" },
    403: { message: "Acesso proibido", code: "FORBIDDEN" },
    404: { message: "Não encontrado", code: "NOT_FOUND" },
    405: { message: "Método não permitido", code: "METHOD_NOT_ALLOWED" },
    406: { message: "Não aceitável", code: "NOT_ACCEPTABLE" },
    407: { message: "Autenticação de proxy necessária", code: "PROXY_AUTHENTICATION_REQUIRED" },
    408: { message: "Tempo limite da requisição esgotado", code: "REQUEST_TIMEOUT" },
    409: { message: "Conflito de dados", code: "CONFLICT" },
    410: { message: "Perdido/Inexistente", code: "GONE" },
    411: { message: "Comprimento necessário", code: "LENGTH_REQUIRED" },
    412: { message: "Pré-condição falhou", code: "PRECONDITION_FAILED" },
    413: { message: "Entidade de requisição muito grande", code: "PAYLOAD_TOO_LARGE" },
    414: { message: "URI muito longa", code: "URI_TOO_LONG" },
    415: { message: "Tipo de mídia não suportado", code: "UNSUPPORTED_MEDIA_TYPE" },
    416: { message: "Intervalo solicitado não satisfatório", code: "RANGE_NOT_SATISFIABLE" },
    417: { message: "Expectativa falhou", code: "EXPECTATION_FAILED" },
    418: { message: "Eu sou um bule de chá", code: "IM_A_TEAPOT" }, // The classic RFC 2324 Easter Egg
    421: { message: "Requisição mal direcionada", code: "MISDIRECTED_REQUEST" },
    422: { message: "Entidade não processável", code: "UNPROCESSABLE_ENTITY" },
    423: { message: "Bloqueado", code: "LOCKED" },
    424: { message: "Falha de dependência", code: "FAILED_DEPENDENCY" },
    425: { message: "Muito cedo", code: "TOO_EARLY" },
    426: { message: "Atualização necessária", code: "UPGRADE_REQUIRED" },
    428: { message: "Pré-condição necessária", code: "PRECONDITION_REQUIRED" },
    429: { message: "Muitas requisições (Rate Limit)", code: "TOO_MANY_REQUESTS" },
    431: { message: "Campos de cabeçalho da requisição muito grandes", code: "REQUEST_HEADER_FIELDS_TOO_LARGE" },
    451: { message: "Indisponível por motivos legais", code: "UNAVAILABLE_FOR_LEGAL_REASONS" },

    //500 - Erros Servidor  
    500: { message: "Erro interno do servidor", code: "INTERNAL_SERVER_ERROR" },
    501: { message: "Não implementado", code: "NOT_IMPLEMENTED" },
    502: { message: "Bad Gateway / Gateway Inválido", code: "BAD_GATEWAY" },
    503: { message: "Serviço indisponível", code: "SERVICE_UNAVAILABLE" },
    504: { message: "Tempo limite do Gateway esgotado", code: "GATEWAY_TIMEOUT" },
    505: { message: "Versão HTTP não suportada", code: "HTTP_VERSION_NOT_SUPPORTED" },
    506: { message: "Variante também negocia", code: "VARIANT_ALSO_NEGOTIATES" },
    507: { message: "Armazenamento insuficiente", code: "INSUFFICIENT_STORAGE" },
    508: { message: "Loop detetado", code: "LOOP_DETECTED" },
    510: { message: "Não estendido", code: "NOT_EXTENDED" },
    511: { message: "Autenticação de rede necessária", code: "NETWORK_AUTHENTICATION_REQUIRED" }
};

export const getDefaults = (status: number): StatusDefaults => {
    if (HTTP_STATUS_DEFAULTS[status]) {
        return HTTP_STATUS_DEFAULTS[status];
    }
    if (status >= 500) return { message: "Erro crítico no servidor", code: "SERVER_ERROR" };
    if (status >= 400) return { message: "Erro na requisição", code: "CLIENT_ERROR" };
    if (status >= 300) return { message: "Redirecionamento", code: "REDIRECTION" };
    
    return { message: "Operação processada", code: "API_RESPONSE" };
};