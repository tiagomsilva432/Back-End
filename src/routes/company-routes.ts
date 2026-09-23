import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { createCompany, getCompany, listCompanies } from "../controllers/company-controller.js";
import {
    companyListResponseSchema,
    companyResponseSchema,
    createCompanySchema,
} from "../dtos/company/company-dto.js";
import { jsonBody, jsonResponse, errorResponses } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { UserRole } from "../types/enums.js";

const router = Router();

router.post(
    "/companies",
    requireAuth,
    requireRole(UserRole.SystemAdmin),
    validateBody(createCompanySchema),
    createCompany
);

router.get(
    "/companies",
    requireAuth,
    requireRole(UserRole.SystemAdmin),
    listCompanies
);

// No role listed: any active user, scoped to their own company by the controller.
router.get(
    "/companies/:id",
    requireAuth,
    requireRole(),
    getCompany
);

const idParam = {
    name: "id",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const, format: "uuid" },
    description: "Id da empresa",
};

//Documentação OpenAPI destas rotas
export const companyPaths: ZodOpenApiPathsObject = {
    "/companies": {
        post: {
            tags: ["Empresas"],
            summary: "Criar uma empresa",
            description: "Exclusivo do `system_admin`. O passo seguinte é criar o `company_admin` da empresa.",
            security: [{ bearerAuth: [] }],
            requestBody: jsonBody(createCompanySchema),
            responses: {
                "201": jsonResponse(201, "Empresa criada", companyResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Exclusivo do system_admin"),
                "409": jsonResponse(409, "Já existe uma empresa com este NIF"),
                ...errorResponses(500),
            },
        },
        get: {
            tags: ["Empresas"],
            summary: "Listar as empresas",
            description: "Exclusivo do `system_admin`: é o directório de todas as empresas.",
            security: [{ bearerAuth: [] }],
            responses: {
                "200": jsonResponse(200, "Empresas", companyListResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Exclusivo do system_admin"),
                ...errorResponses(500),
            },
        },
    },
    "/companies/{id}": {
        get: {
            tags: ["Empresas"],
            summary: "Ver uma empresa",
            description:
                "O `system_admin` vê qualquer uma; os restantes só a sua. " +
                "Uma empresa fora do alcance de quem pergunta devolve 404, não 403.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Empresa", companyResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Empresa não encontrada"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
