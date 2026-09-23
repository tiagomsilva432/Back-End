//Formato de Resposta Standardizado
import type { Response } from "express";
import { z } from "zod";
//Importar Mensagens Default
import { getDefaults } from "../../utils/httpStatusDefaults.js";

export interface ApiResponse {
  status: number;
  message: string;
  code: string;
  data?: unknown;
}

/**
 * Versão Zod do envelope acima — usada só para gerar o OpenAPI.
 * Fica ao lado do `ApiResponse` para as duas formas não divergirem.
 * Como o errorHandler também responde via HttpResponse, este mesmo
 * envelope serve para sucessos e erros.
 */
export const httpResponseSchema = (
  status: number,
  data?: z.ZodType
): z.ZodObject => {
  const DEFAULT = getDefaults(status);

  return z.object({
    status: z.literal(status),
    message: z.string().meta({ example: DEFAULT.message }),
    code: z.string().meta({ example: DEFAULT.code }),
    ...(data ? { data } : {}),
  });
};

export class HttpResponse {
  constructor(
    public readonly status: number,
    public readonly message?: string,
    public readonly code?: string,
    public readonly data?: unknown
  ) {
    const DEFAULT = getDefaults(status);

    this.status = status;
    this.message = message ?? DEFAULT.message;
    this.code = code ?? DEFAULT.code;
    this.data = data;
  }

  send(res: Response) {
    return res.status(this.status).json({
      status: this.status,
      message: this.message,
      code: this.code,
      data: this.data,
    });
  }
}
