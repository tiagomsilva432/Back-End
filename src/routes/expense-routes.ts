import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    createExpense,
    getExpense,
    listExpenses,
    patchExpense,
    removeExpense,
} from "../controllers/expense-controller.js";
import {
    createExpenseSchema,
    expenseListResponseSchema,
    expenseResponseSchema,
    listExpensesQuerySchema,
    patchExpenseSchema,
} from "../dtos/expense/expense-dto.js";
import { errorResponses, jsonBody, jsonResponse, pathId } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";

const router = Router();

// Bare requireRole() everywhere: a project's manager may be an employee, so the
// controller decides from the project's managerId.
router.post(
    "/expenses",
    requireAuth,
    requireRole(),
    validateBody(createExpenseSchema),
    createExpense
);

router.get(
    "/expenses",
    requireAuth,
    requireRole(),
    validateQuery(listExpensesQuerySchema),
    listExpenses
);

router.get(
    "/expenses/:id",
    requireAuth,
    requireRole(),
    getExpense
);

router.patch(
    "/expenses/:id",
    requireAuth,
    requireRole(),
    validateBody(patchExpenseSchema),
    patchExpense
);

router.delete(
    "/expenses/:id",
    requireAuth,
    requireRole(),
    removeExpense
);

const idParam = pathId("Id da despesa");

const managers =
    "Uma despesa de projeto: um `system_admin`, um `company_admin` da empresa, ou o gestor do projeto " +
    "(`managerId`). Uma despesa da empresa, sem projeto: só os dois admins. Os outros da empresa recebem 403. ";

//Documentação OpenAPI destas rotas
export const expensePaths: ZodOpenApiPathsObject = {
    "/expenses": {
        post: {
            tags: ["Despesas"],
            summary: "Registar uma despesa",
            description:
                `${managers}Com \`projectId\` é do projeto; sem ele, é da empresa, e um \`system_admin\` indica o ` +
                "`companyId`. Se a despesa fizer o projeto passar os 80% ou os 100% do orçamento, os admins e o " +
                "gestor são avisados (`project.budget_threshold`).",
            security: [{ bearerAuth: [] }],
            requestBody: jsonBody(createExpenseSchema),
            responses: {
                "201": jsonResponse(201, "Despesa registada", expenseResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para registar esta despesa"),
                "404": jsonResponse(404, "Projeto ou empresa não encontrado"),
                ...errorResponses(500),
            },
        },
        get: {
            tags: ["Despesas"],
            summary: "Listar despesas",
            description:
                "Os admins veem as da empresa (um `system_admin` indica o `companyId`), e filtram por projeto, " +
                "categoria, datas ou só as da empresa (`overhead=true`). O gestor de um projeto que não é admin " +
                "tem de indicar o `projectId` de um projeto que gere. Da mais recente para a mais antiga.",
            security: [{ bearerAuth: [] }],
            requestParams: { query: listExpensesQuerySchema },
            responses: {
                "200": jsonResponse(200, "Despesas", expenseListResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para ver estas despesas"),
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/expenses/{id}": {
        get: {
            tags: ["Despesas"],
            summary: "Ver uma despesa",
            description: `${managers}Uma de outra empresa devolve 404, não 403.`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Despesa", expenseResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para gerir esta despesa"),
                "404": jsonResponse(404, "Despesa não encontrada"),
                ...errorResponses(500),
            },
        },
        patch: {
            tags: ["Despesas"],
            summary: "Alterar uma despesa",
            description:
                `${managers}Um PATCH junta: um campo omitido fica como está, e um \`null\` explícito limpa a ` +
                "descrição. O projeto de uma despesa não muda. Subir o montante pode avisar do orçamento, como no POST.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestBody: jsonBody(patchExpenseSchema),
            responses: {
                "200": jsonResponse(200, "Despesa atualizada", expenseResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para gerir esta despesa"),
                "404": jsonResponse(404, "Despesa não encontrada"),
                ...errorResponses(500),
            },
        },
        delete: {
            tags: ["Despesas"],
            summary: "Apagar uma despesa",
            description: `${managers}Serve para corrigir um erro de registo, e não avisa ninguém.`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Despesa apagada"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para gerir esta despesa"),
                "404": jsonResponse(404, "Despesa não encontrada"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
