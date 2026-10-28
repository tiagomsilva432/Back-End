import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    getUser,
    getUserProfile,
    listUsers,
    patchUserStatus,
    removeAvatar,
    uploadAvatar,
    upsertUserProfile,
} from "../controllers/user-controller.js";
import {
    employeeProfileResponseSchema,
    upsertEmployeeProfileSchema,
} from "../dtos/user/employee-profile-dto.js";
import {
    listUsersQuerySchema,
    patchUserStatusSchema,
    userListResponseSchema,
    userResponseSchema,
} from "../dtos/user/user-dto.js";
import { fileResponseSchema } from "../dtos/file/file-dto.js";
import { errorResponses, fileBody, jsonBody, jsonResponse, pathId } from "../docs/response.js";
import { acceptFile } from "../middleware/acceptFile.js";
import { FILE_KINDS } from "../services/files/file-kinds.js";
import { FileKind } from "../types/enums.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin, requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";

const router = Router();

// No role listed: reading is open to any active user, scoped to their company.
router.get(
    "/users",
    requireAuth,
    requireRole(),
    validateQuery(listUsersQuerySchema),
    listUsers
);

router.get(
    "/users/:id",
    requireAuth,
    requireRole(),
    getUser
);

router.get(
    "/users/:id/profile",
    requireAuth,
    requireRole(),
    getUserProfile
);

// Bare requireRole(): the write rule depends on the target, so the controller decides.
router.put(
    "/users/:id/profile",
    requireAuth,
    requireRole(),
    validateBody(upsertEmployeeProfileSchema),
    upsertUserProfile
);

// Bare requireRole(), como o PUT do perfil: o controller decide pelo alvo.
router.put(
    "/users/:id/avatar",
    requireAuth,
    requireRole(),
    acceptFile(FILE_KINDS[FileKind.Avatar]),
    uploadAvatar
);

router.delete(
    "/users/:id/avatar",
    requireAuth,
    requireRole(),
    removeAvatar
);

router.patch(
    "/users/:id/status",
    requireAuth,
    requireAdmin,
    validateBody(patchUserStatusSchema),
    patchUserStatus
);

const idParam = pathId("Id do utilizador");

export const userPaths: ZodOpenApiPathsObject = {
    "/users": {
        get: {
            tags: ["Utilizadores"],
            summary: "Listar utilizadores",
            description:
                "O diretório da empresa. Qualquer conta ativa lê os utilizadores da sua empresa; " +
                "um `system_admin` indica o `companyId` que quer ver. " +
                "Nunca devolve `passwordHash`, `signupToken` nem `signupTokenExpiresAt`.",
            security: [{ bearerAuth: [] }],
            requestParams: { query: listUsersQuerySchema },
            responses: {
                "200": jsonResponse(200, "Utilizadores", userListResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa, ou empresa fora do alcance"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}": {
        get: {
            tags: ["Utilizadores"],
            summary: "Ver um utilizador",
            description:
                "Qualquer conta ativa da empresa do utilizador. " +
                "Um utilizador de outra empresa devolve 404, não 403.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Utilizador", userResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/profile": {
        get: {
            tags: ["Utilizadores"],
            summary: "Ver o perfil de um utilizador",
            description:
                "Qualquer conta ativa da empresa do utilizador, como na listagem. " +
                "Um utilizador de outra empresa devolve 404; um utilizador ao alcance " +
                "mas que ainda não tem perfil devolve 404 com outra mensagem.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Perfil", employeeProfileResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Utilizador ou perfil não encontrado"),
                ...errorResponses(500),
            },
        },
        put: {
            tags: ["Utilizadores"],
            summary: "Criar ou atualizar o perfil de um utilizador",
            description:
                "Escrever é mais estreito do que ler: a própria pessoa, um `company_admin` sobre " +
                "a sua empresa, ou um `system_admin`. Um `employee` a editar um colega recebe 403. " +
                "O PUT substitui: um campo opcional omitido fica a `null`. O avatar não entra aqui: tem a sua " +
                "rota, `PUT /users/{id}/avatar`, e um PUT do perfil nunca lhe toca. " +
                "Responde 201 quando cria o perfil e 200 quando o atualiza.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestBody: jsonBody(upsertEmployeeProfileSchema),
            responses: {
                "200": jsonResponse(200, "Perfil atualizado", employeeProfileResponseSchema),
                "201": jsonResponse(201, "Perfil criado", employeeProfileResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para alterar este perfil"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/avatar": {
        put: {
            tags: ["Utilizadores"],
            summary: "Enviar o avatar de um utilizador",
            description:
                "Quem pode alterar o perfil: a própria pessoa, um `company_admin` sobre a sua empresa, ou um " +
                "`system_admin`. JPEG, PNG ou WebP até 5 MB, em `multipart/form-data` no campo `file`. Fica um " +
                "quadrado de 512 px em WebP, sem metadados (o GPS de uma fotografia sai). Substitui o anterior. " +
                "O `url` devolvido é o mesmo que passa a vir em `profile.avatarUrl`.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestBody: fileBody("A imagem: JPEG, PNG ou WebP, até 5 MB"),
            responses: {
                "201": jsonResponse(201, "Avatar atualizado", fileResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para alterar este perfil"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                "413": jsonResponse(413, "O ficheiro tem mais de 5 MB"),
                ...errorResponses(500),
            },
        },
        delete: {
            tags: ["Utilizadores"],
            summary: "Apagar o avatar de um utilizador",
            description: "As mesmas regras do envio. Sem avatar, é 404.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Avatar apagado"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para alterar este perfil"),
                "404": jsonResponse(404, "Utilizador não encontrado, ou sem avatar"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/status": {
        patch: {
            tags: ["Utilizadores"],
            summary: "Suspender, reativar ou terminar uma conta",
            description:
                "Quem altera tem de poder administrar a conta: um `company_admin` sobre os seus " +
                "`employee`, um `system_admin` sobre qualquer uma. Ninguém altera a sua própria conta. " +
                "Transições: `active` ↔ `suspended`, e qualquer uma → `terminated`, que é definitivo. " +
                "Uma conta `invited` só pode passar a `terminated`, o que revoga o convite. " +
                "Pedir o estado que a conta já tem responde 200 sem mudar nada. " +
                "Uma conta suspensa perde o acesso no pedido seguinte, sem esperar que o token expire.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestBody: jsonBody(patchUserStatusSchema),
            responses: {
                "200": jsonResponse(200, "Estado da conta atualizado", userResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para alterar o estado desta conta"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                "409": jsonResponse(409, "Transição de estado não permitida"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
