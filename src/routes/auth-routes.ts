import { Router } from "express";
import { ZodOpenApiPathsObject, ZodOpenApiRequestBodyObject } from "zod-openapi";
import { z } from "zod";
import { validateBody } from "../middleware/validateBody.js";
import { activateAccountSchema, createAccountResponseSchema, createAccountSchema } from "../dtos/auth/account-dto.js";
import { jsonResponse, errorResponses } from "../docs/response.js";
import { meResponseSchema } from "../dtos/auth/me-dto.js";
import { loginResponseSchema } from "../dtos/auth/login-dto.js";
import { activateUserWithToken, createAccount, getCurrentUser, loginWithEmailAndPassword } from "../controllers/auth-controller.js";
import { loginSchema } from "../dtos/auth/login-dto.js";
import { requireAuth } from "../middleware/requireAuth.js";

const jsonBody = (schema: z.ZodType): ZodOpenApiRequestBodyObject => ({
    required: true,
    content: { "application/json": { schema } },
});

const router = Router();

router.post(
    "/auth/account/create",
    validateBody(createAccountSchema),
    createAccount
);

router.post(
    "/auth/account/activate",
    validateBody(activateAccountSchema),
    activateUserWithToken
);

router.post(
    "/auth/login",
    validateBody(loginSchema),
    loginWithEmailAndPassword
);

router.get(
    "/auth/me",
    requireAuth,
    getCurrentUser
);

//Documentação OpenAPI destas rotas
export const authPaths: ZodOpenApiPathsObject = {
    "/auth/account/create": {
        post: {
            tags: ["Auth"],
            summary: "Criar uma conta",
            description: "Cria a conta no estado `invited`. A ativação é o passo 2.",
            requestBody: jsonBody(createAccountSchema),
            responses: {
                "201": jsonResponse(201, "Conta criada", createAccountResponseSchema),
                ...errorResponses(400),
                "409": jsonResponse(409, "Já existe uma conta com este email nesta empresa"),
                ...errorResponses(500),
            },
        },
    },
    "/auth/account/activate": {
        post: {
            tags: ["Auth"],
            summary: "Ativar uma conta e definir a password",
            description: "Consome o signupToken do link de ativação. Só pode ser usado uma vez.",
            requestBody: jsonBody(activateAccountSchema),
            responses: {
                "200": jsonResponse(200, "Conta ativada com sucesso"),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token inexistente, já usado ou expirado"),
                ...errorResponses(500),
            },
        },
    },
    "/auth/login": {
        post: {
            tags: ["Auth"],
            summary: "Autenticar e obter um token de acesso",
            requestBody: jsonBody(loginSchema),
            responses: {
                "200": jsonResponse(200, "Login bem sucedido", loginResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Credenciais inválidas"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
    "/auth/me": {
        get: {
            tags: ["Auth"],
            summary: "Dados do utilizador autenticado",
            description: "As regras do login são reavaliadas: a conta pode ter sido suspensa depois de o token ser emitido.",
            security: [{ bearerAuth: [] }],
            responses: {
                "200": jsonResponse(200, "Utilizador autenticado", meResponseSchema),
                "401": jsonResponse(401, "Token em falta, inválido ou de uma conta que já não existe"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;