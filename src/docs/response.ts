import type { ZodOpenApiRequestBodyObject, ZodOpenApiResponseObject } from "zod-openapi";
import type { z } from "zod";
import { httpResponseSchema } from "../dtos/common/responses-dto.js";
import { getDefaults } from "../utils/httpStatusDefaults.js";

/**
 * Constrói uma Response Object do OpenAPI já embrulhada no envelope da API.
 * `data` é o schema Zod do payload (opcional).
 */
export const jsonResponse = (
    status: number,
    description?: string,
    data?: z.ZodType
): ZodOpenApiResponseObject => ({
    description: description ?? getDefaults(status).message,
    content: {
        "application/json": { schema: httpResponseSchema(status, data) },
    },
});

/** Corpo de pedido JSON obrigatório, a partir do schema Zod. */
export const jsonBody = (schema: z.ZodType): ZodOpenApiRequestBodyObject => ({
    required: true,
    content: { "application/json": { schema } },
});

/** Atalho para as respostas de erro mais comuns. */
export const errorResponses = (
    ...statuses: number[]
): Record<string, ZodOpenApiResponseObject> =>
    Object.fromEntries(statuses.map((s) => [String(s), jsonResponse(s)]));
