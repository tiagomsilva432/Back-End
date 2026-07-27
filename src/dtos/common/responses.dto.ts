//Formato de Resposta Standardizado
import { Response } from "express";
//Importar Mensagens Default
import { getDefaults } from "../../utils/httpStatusDefaults.js";

export interface ApiResponse {
  status: number;
  message: string;
  code: string;
  data?: unknown;
}

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
