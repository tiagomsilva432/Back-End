import { createDocument } from "zod-openapi";
import { createAccountSchema } from "../dtos/auth/account-dto.js";
import { loginSchema } from "../dtos/auth/login-dto.js";
import { healthPaths } from "../routes/health-routes.js";

export const openApiDocument: ReturnType<typeof createDocument> = createDocument({
    openapi: "3.1.0",
    info: {
        title: "API - Projeto Final",
        version: "1.0.0",
        description: "Documentação gerada a partir dos schemas Zod (DTOs).",
    },
    servers: [
        {
            url: `${process.env.BASE_URL ?? "http://localhost"}:${process.env.PORT ?? 3000}`,
            description: "Servidor local",
        },
    ],
    tags: [
        { name: "Sistema", description: "Estado e diagnóstico da API" },
        { name: "Auth", description: "Autenticação e gestão de contas" },
    ],
    paths: {
        ...healthPaths,
    },
    components: {
        schemas: {
            LoginRequest: loginSchema,
            CreateAccountRequest: createAccountSchema,
        },
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
            },
        },
    },
});
