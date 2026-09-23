import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { createCompany } from "../controllers/company-controller.js";
import { createCompanyResponseSchema, createCompanySchema } from "../dtos/company/company-dto.js";
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
                "201": jsonResponse(201, "Empresa criada", createCompanyResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Exclusivo do system_admin"),
                "409": jsonResponse(409, "Já existe uma empresa com este NIF"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
