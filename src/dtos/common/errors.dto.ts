//Formato de Erro Standardizado

//Importar Mensagens Default
import { getDefaults } from "../../utils/httpStatusDefaults.js";

export interface ApiError {
  status: number;
  message: string;
  code: string;
  details?: unknown;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    const DEFAULT = getDefaults(status);
    const finalMessage = message ?? DEFAULT.message;
    super(finalMessage);
    this.name = "HttpError";
    this.code = code ?? DEFAULT.code;
    this.details = details;
  }
}