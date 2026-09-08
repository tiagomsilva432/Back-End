import type { ZodOpenApiResponseObject } from "zod-openapi";
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

/** Atalho para as respostas de erro mais comuns. */
export const errorResponses = (
    ...statuses: number[]
): Record<string, ZodOpenApiResponseObject> =>
    Object.fromEntries(statuses.map((s) => [String(s), jsonResponse(s)]));
