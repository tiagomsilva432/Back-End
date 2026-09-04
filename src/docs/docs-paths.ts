import { ZodOpenApiPathsObject } from "zod-openapi";
import { errorResponses } from "./response.js";

export const docsPaths: ZodOpenApiPathsObject = {
    "/docs.json": {
        get: {
            tags: ["Sistema"],
            summary: "Obter a especificação OpenAPI",
            description: "Devolve o documento OpenAPI 3.1 desta API, em JSON e sem o envelope habitual.",
            responses: {
                "200": {
                    description: "Especificação OpenAPI desta API",
                    content: {
                        "application/json": {
                            schema: { type: "object", additionalProperties: true },
                        },
                    },
                },
                ...errorResponses(500),
            },
        },
    },
    "/docs": {
        get: {
            tags: ["Sistema"],
            summary: "Abrir a documentação interativa",
            description: "Página HTML (Scalar) que lê a especificação em `/docs.json`.",
            responses: {
                "200": {
                    description: "Página HTML da documentação",
                    content: {
                        "text/html": { schema: { type: "string" } },
                    },
                },
                ...errorResponses(500),
            },
        },
    },
};
