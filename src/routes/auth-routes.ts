import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { validateBody } from "../middleware/validateBody.js";
import { activateAccountSchema, createAccountResponseSchema, createAccountSchema } from "../dtos/auth/account-dto.js";
import { jsonBody, jsonResponse, errorResponses, pathId } from "../docs/response.js";
import { meResponseSchema } from "../dtos/auth/me-dto.js";
import { loginConflictResponseSchema, loginResponseSchema } from "../dtos/auth/login-dto.js";
import { activateUserWithToken, changePassword, confirmPasswordReset, createAccount, getCurrentUser, loginWithEmailAndPassword, requestPasswordReset, resendActivation } from "../controllers/auth-controller.js";
import { loginSchema } from "../dtos/auth/login-dto.js";
import {
    changePasswordSchema,
    confirmPasswordResetSchema,
    requestPasswordResetSchema,
} from "../dtos/auth/password-dto.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireRole.js";

const router = Router();


router.post(
    "/auth/account/create",
    requireAuth,
    requireAdmin,
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

router.post(
    "/auth/account/:id/resend-activation",
    requireAuth,
    requireAdmin,
    resendActivation
);

// Sem requireRole: ele recusa mustChangePassword com 403, e é essa conta que
// precisa deste endpoint. O status é verificado dentro do controller.
router.post(
    "/auth/password/change",
    requireAuth,
    validateBody(changePasswordSchema),
    changePassword
);

router.post(
    "/auth/password/reset",
    validateBody(requestPasswordResetSchema),
    requestPasswordReset
);

router.post(
    "/auth/password/reset/confirm",
    validateBody(confirmPasswordResetSchema),
    confirmPasswordReset
);

//Documentação OpenAPI destas rotas
export const authPaths: ZodOpenApiPathsObject = {
    "/auth/account/create": {
        post: {
            tags: ["Auth"],
            summary: "Criar uma conta",
            description:
                "Cria a conta no estado `invited` e envia o email de ativação. A ativação é o passo 2. " +
                "Hierarquia: um `system_admin` cria `company_admin` (indicando o `companyId`); " +
                "um `company_admin` cria `employee` na sua própria empresa; um `employee` não cria ninguém.",
            security: [{ bearerAuth: [] }],
            requestBody: jsonBody(createAccountSchema),
            responses: {
                "201": jsonResponse(201, "Conta criada", createAccountResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para criar esta conta"),
                "404": jsonResponse(404, "Empresa não encontrada"),
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
            description:
                "O email só é único dentro da empresa, por isso o login escolhe a conta que a " +
                "password abre. Se a mesma password abrir contas em mais do que uma empresa, " +
                "responde 409 com a lista delas e o pedido repete-se com o `companyId` escolhido.",
            requestBody: jsonBody(loginSchema),
            responses: {
                "200": jsonResponse(200, "Login bem sucedido", loginResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Credenciais inválidas"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "409": jsonResponse(
                    409,
                    "O email existe em mais do que uma empresa: escolhe uma",
                    loginConflictResponseSchema,
                ),
                ...errorResponses(500),
            },
        },
    },
    "/auth/account/{id}/resend-activation": {
        post: {
            tags: ["Auth"],
            summary: "Reenviar o email de ativação",
            description:
                "Cunha um token novo e reenvia o link. É o caminho de recuperação de um convite " +
                "cujo token expirou: sem isto a conta ficava presa, a ocupar o email, sem password. " +
                "Só funciona numa conta `invited` - numa conta já ativa responde 409, porque " +
                "recunhar o token reabria um link que define uma password nova sem saber a antiga. " +
                "Quem reenvia tem de poder administrar a conta: um `company_admin` sobre os seus " +
                "`employee`, um `system_admin` sobre qualquer uma.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id da conta a reconvidar")],
            responses: {
                "200": jsonResponse(200, "Ativação reenviada"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para reenviar a ativação desta conta"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                "409": jsonResponse(409, "A conta não está convidada"),
                ...errorResponses(500),
            },
        },
    },
    "/auth/password/change": {
        post: {
            tags: ["Auth"],
            summary: "Trocar a própria password",
            description:
                "Pede a password atual e a nova. Funciona com uma conta marcada com " +
                "`mustChangePassword`, que é o ponto: essa conta é recusada em todo o resto da API " +
                "até trocar a password. Uma password nova invalida qualquer link de recuperação " +
                "pendente. O token de acesso não é rodado, por isso o mesmo continua a servir.",
            security: [{ bearerAuth: [] }],
            requestBody: jsonBody(changePasswordSchema),
            responses: {
                "200": jsonResponse(200, "Password alterada com sucesso"),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token inválido ou password atual errada"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
    "/auth/password/reset": {
        post: {
            tags: ["Auth"],
            summary: "Pedir a redefinição da password",
            description:
                "Não precisa de autenticação, e responde sempre 200 com o mesmo corpo: a resposta " +
                "nunca diz se o email existe. O mesmo email pode ter conta em várias empresas, e " +
                "nesse caso cada uma recebe o seu próprio link, com o nome da empresa no assunto. " +
                "Uma conta ainda `invited` não tem password para redefinir e é ignorada - " +
                "essa recupera-se por `resend-activation`.",
            requestBody: jsonBody(requestPasswordResetSchema),
            responses: {
                "200": jsonResponse(200, "Pedido registado"),
                ...errorResponses(400),
                ...errorResponses(500),
            },
        },
    },
    "/auth/password/reset/confirm": {
        post: {
            tags: ["Auth"],
            summary: "Definir a password nova com o token do email",
            description:
                "Só mexe na password: nunca no estado da conta. Uma conta suspensa que redefina a " +
                "password continua suspensa e continua a não conseguir entrar - a redefinição não " +
                "dá privilégio nenhum. O token é de uso único e vale uma hora.",
            requestBody: jsonBody(confirmPasswordResetSchema),
            responses: {
                "200": jsonResponse(200, "Password redefinida com sucesso"),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token inválido, já usado ou expirado"),
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