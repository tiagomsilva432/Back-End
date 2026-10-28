import type { ZodOpenApiRequestBodyObject, ZodOpenApiResponseObject } from "zod-openapi";
import type { z } from "zod";
import { httpResponseSchema } from "../dtos/common/responses-dto.js";
import { getDefaults } from "../utils/httpStatusDefaults.js";

/** Uma Response Object do OpenAPI, já dentro do envelope da API. */
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

export const jsonBody = (schema: z.ZodType): ZodOpenApiRequestBodyObject => ({
    required: true,
    content: { "application/json": { schema } },
});

/**
 * Corpo multipart com um só ficheiro, no campo `file`: o que o acceptFile lê.
 * Escrito à mão porque o Zod não tem um tipo para bytes; o `format: binary`
 * é o que faz a página da documentação mostrar o seletor de ficheiros.
 */
export const fileBody = (description: string): ZodOpenApiRequestBodyObject => ({
    required: true,
    content: {
        "multipart/form-data": {
            schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary", description } },
            },
        },
    },
});

export const pathId = (description: string, name = "id") => ({
    name,
    in: "path" as const,
    required: true,
    schema: { type: "string" as const, format: "uuid" },
    description,
});

export const errorResponses = (
    ...statuses: number[]
): Record<string, ZodOpenApiResponseObject> =>
    Object.fromEntries(statuses.map((s) => [String(s), jsonResponse(s)]));
