import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    createSkill,
    listSkillUsers,
    listSkills,
    listUserSkills,
    patchSkill,
    removeUserSkill,
    upsertUserSkill,
} from "../controllers/skill-controller.js";
import {
    createSkillSchema,
    employeeSkillListResponseSchema,
    employeeSkillResponseSchema,
    listSkillUsersQuerySchema,
    listSkillsQuerySchema,
    patchSkillSchema,
    skillHolderListResponseSchema,
    skillListResponseSchema,
    skillResponseSchema,
    upsertEmployeeSkillSchema,
} from "../dtos/skill/skill-dto.js";
import { errorResponses, jsonBody, jsonResponse } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { UserRole } from "../types/enums.js";

const router = Router();

// No role listed: the catalog is shared, any active user reads it.
router.get(
    "/skills",
    requireAuth,
    requireRole(),
    validateQuery(listSkillsQuerySchema),
    listSkills
);

// The catalog is shared by every company, so only the system_admin changes it.
router.post(
    "/skills",
    requireAuth,
    requireRole(UserRole.SystemAdmin),
    validateBody(createSkillSchema),
    createSkill
);

router.patch(
    "/skills/:id",
    requireAuth,
    requireRole(UserRole.SystemAdmin),
    validateBody(patchSkillSchema),
    patchSkill
);

router.get(
    "/skills/:id/users",
    requireAuth,
    requireRole(),
    validateQuery(listSkillUsersQuerySchema),
    listSkillUsers
);

router.get(
    "/users/:id/skills",
    requireAuth,
    requireRole(),
    listUserSkills
);

router.put(
    "/users/:id/skills/:skillId",
    requireAuth,
    requireRole(UserRole.SystemAdmin, UserRole.CompanyAdmin),
    validateBody(upsertEmployeeSkillSchema),
    upsertUserSkill
);

router.delete(
    "/users/:id/skills/:skillId",
    requireAuth,
    requireRole(UserRole.SystemAdmin, UserRole.CompanyAdmin),
    removeUserSkill
);

const idParam = (description: string) => ({
    name: "id",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const, format: "uuid" },
    description,
});

const skillIdParam = {
    name: "skillId",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const, format: "uuid" },
    description: "Id da competência",
};

//Documentação OpenAPI destas rotas
export const skillPaths: ZodOpenApiPathsObject = {
    "/skills": {
        get: {
            tags: ["Competências"],
            summary: "Listar o catálogo de competências",
            description: "O catálogo é partilhado por todas as empresas. Qualquer conta ativa o lê.",
            security: [{ bearerAuth: [] }],
            requestParams: { query: listSkillsQuerySchema },
            responses: {
                "200": jsonResponse(200, "Competências", skillListResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
        post: {
            tags: ["Competências"],
            summary: "Acrescentar uma competência ao catálogo",
            description:
                "Exclusivo do `system_admin`, porque o catálogo é de todas as empresas. " +
                "O nome é único sem distinguir maiúsculas: `react` e `React` são a mesma competência.",
            security: [{ bearerAuth: [] }],
            requestBody: jsonBody(createSkillSchema),
            responses: {
                "201": jsonResponse(201, "Competência criada", skillResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Exclusivo do system_admin"),
                "409": jsonResponse(409, "Já existe uma competência com este nome"),
                ...errorResponses(500),
            },
        },
    },
    "/skills/{id}": {
        patch: {
            tags: ["Competências"],
            summary: "Alterar uma competência do catálogo",
            description:
                "Exclusivo do `system_admin`. Um PATCH junta: um campo omitido fica como está. " +
                "A alteração vê-se em todas as pessoas que têm a competência.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id da competência")],
            requestBody: jsonBody(patchSkillSchema),
            responses: {
                "200": jsonResponse(200, "Competência atualizada", skillResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Exclusivo do system_admin"),
                "404": jsonResponse(404, "Competência não encontrada"),
                "409": jsonResponse(409, "Já existe uma competência com este nome"),
                ...errorResponses(500),
            },
        },
    },
    "/skills/{id}/users": {
        get: {
            tags: ["Competências"],
            summary: "Quem tem uma competência",
            description:
                "Só as pessoas da empresa de quem pergunta; um `system_admin` indica o `companyId`. " +
                "Ordenado da maior proficiência para a menor.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id da competência")],
            requestParams: { query: listSkillUsersQuerySchema },
            responses: {
                "200": jsonResponse(200, "Pessoas com esta competência", skillHolderListResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa, ou empresa fora do alcance"),
                "404": jsonResponse(404, "Competência não encontrada"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/skills": {
        get: {
            tags: ["Competências"],
            summary: "Competências de uma pessoa",
            description:
                "Qualquer conta ativa da empresa da pessoa. " +
                "Um utilizador de outra empresa devolve 404, não 403.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id do utilizador")],
            responses: {
                "200": jsonResponse(200, "Competências", employeeSkillListResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/skills/{skillId}": {
        put: {
            tags: ["Competências"],
            summary: "Atribuir ou alterar uma competência de uma pessoa",
            description:
                "Quem escreve tem de poder administrar a conta: um `company_admin` sobre os seus " +
                "`employee`, um `system_admin` sobre qualquer uma. Ninguém altera as suas próprias " +
                "competências: elas decidem alocações, por isso não se autodeclaram. " +
                "O PUT substitui: um campo omitido fica a `null`, e o corpo pode ser `{}`. " +
                "Responde 201 quando atribui e 200 quando altera.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id do utilizador"), skillIdParam],
            requestBody: jsonBody(upsertEmployeeSkillSchema),
            responses: {
                "200": jsonResponse(200, "Competência atualizada", employeeSkillResponseSchema),
                "201": jsonResponse(201, "Competência atribuída", employeeSkillResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para alterar as competências desta pessoa"),
                "404": jsonResponse(404, "Utilizador ou competência não encontrado"),
                ...errorResponses(500),
            },
        },
        delete: {
            tags: ["Competências"],
            summary: "Tirar uma competência a uma pessoa",
            description: "As mesmas permissões do PUT. A competência continua no catálogo.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id do utilizador"), skillIdParam],
            responses: {
                "200": jsonResponse(200, "Competência removida"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para alterar as competências desta pessoa"),
                "404": jsonResponse(404, "Utilizador não encontrado, ou a pessoa não tem esta competência"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
