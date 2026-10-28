import type { Response } from "express";
import { z } from "zod";
import { getDefaults } from "../../utils/httpStatusDefaults.js";

/**
 * O envelope do HttpResponse em Zod, só para o OpenAPI. O errorHandler também
 * responde por HttpResponse, por isso serve para sucessos e erros.
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

    this.message = message ?? DEFAULT.message;
    this.code = code ?? DEFAULT.code;
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
