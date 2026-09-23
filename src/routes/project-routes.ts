import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { createProject, getProject, listProjects } from "../controllers/project-controller.js";
import {
    createProjectSchema,
    listProjectsQuerySchema,
    projectListResponseSchema,
    projectResponseSchema,
} from "../dtos/project/project-dto.js";
import { jsonBody, jsonResponse, errorResponses } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { UserRole } from "../types/enums.js";

const router = Router();

router.post(
    "/projects",
    requireAuth,
    requireRole(UserRole.SystemAdmin, UserRole.CompanyAdmin),
    validateBody(createProjectSchema),
    createProject
);

// No role listed: reading is open to any active user, scoped to their company.
router.get(
    "/projects",
    requireAuth,
    requireRole(),
    validateQuery(listProjectsQuerySchema),
    listProjects
);

router.get(
    "/projects/:id",
    requireAuth,
    requireRole(),
    getProject
);

const idParam = {
    name: "id",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const, format: "uuid" },
    description: "Id do projeto",
};

//Documentação OpenAPI destas rotas
export const projectPaths: ZodOpenApiPathsObject = {
    "/projects": {
        post: {
            tags: ["Projetos"],
            summary: "Criar um projeto",
            description:
                "Um `company_admin` cria na sua própria empresa; um `system_admin` indica o `companyId`. " +
                "Um `employee` não cria projetos. O gestor, se indicado, tem de ser da mesma empresa.",
            security: [{ bearerAuth: [] }],
            requestBody: jsonBody(createProjectSchema),
            responses: {
                "201": jsonResponse(201, "Projeto criado", projectResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para criar este projeto"),
                "404": jsonResponse(404, "Empresa ou gestor não encontrado"),
                "409": jsonResponse(409, "Já existe um projeto com este nome nesta empresa"),
                ...errorResponses(500),
            },
        },
        get: {
            tags: ["Projetos"],
            summary: "Listar projetos",
            description:
                "Qualquer conta ativa lê os projetos da sua empresa. " +
                "Um `system_admin` indica o `companyId` que quer ver.",
            security: [{ bearerAuth: [] }],
            requestParams: { query: listProjectsQuerySchema },
            responses: {
                "200": jsonResponse(200, "Projetos", projectListResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa, ou empresa fora do alcance"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}": {
        get: {
            tags: ["Projetos"],
            summary: "Ver um projeto",
            description:
                "Qualquer conta ativa da empresa do projeto. " +
                "Um projeto de outra empresa devolve 404, não 403.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Projeto", projectResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
