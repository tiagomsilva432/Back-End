//Formato de Erro Standardizado

//Importar Mensagens Default
import { getDefaults } from "../../utils/httpStatusDefaults.js";

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

export interface FieldError {
  field: string;
  message: string;
}

/** O 400 de dados inválidos: um { field, message } por campo, que é o que um formulário lê. */
export const invalidData = (errors: FieldError[]): HttpError =>
  new HttpError(400, "Dados inválidos", "BAD_REQUEST", errors);

/** Os erros de um parse do Zod, campo a campo. */
export const fieldErrorsOf = (issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): FieldError[] =>
  issues.map((issue) => ({ field: issue.path.map(String).join("."), message: issue.message }));