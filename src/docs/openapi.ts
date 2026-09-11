import { createDocument } from "zod-openapi";
import { createAccountSchema } from "../dtos/auth/account-dto.js";
import { loginResponseSchema, loginSchema } from "../dtos/auth/login-dto.js";
import { meResponseSchema } from "../dtos/auth/me-dto.js";
import { healthPaths } from "../routes/health-routes.js";
import { authPaths } from "../routes/auth-routes.js";
import { docsPaths } from "./docs-paths.js";

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
        ...docsPaths,
        ...authPaths,
    },
    components: {
        schemas: {
            LoginRequest: loginSchema,
            LoginResponse: loginResponseSchema,
            CreateAccountRequest: createAccountSchema,
            MeResponse: meResponseSchema,
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
