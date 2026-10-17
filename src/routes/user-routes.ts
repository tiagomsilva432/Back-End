import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    getUser,
    getUserProfile,
    listUsers,
    upsertUserProfile,
} from "../controllers/user-controller.js";
import {
    employeeProfileResponseSchema,
    upsertEmployeeProfileSchema,
} from "../dtos/user/employee-profile-dto.js";
import {
    listUsersQuerySchema,
    userListResponseSchema,
    userResponseSchema,
} from "../dtos/user/user-dto.js";
import { errorResponses, jsonBody, jsonResponse } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
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

const idParam = {
    name: "id",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const, format: "uuid" },
    description: "Id do utilizador",
};

//Documentação OpenAPI destas rotas
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
                "O PUT substitui: um campo opcional omitido fica a `null`. " +
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
};

export default router;
