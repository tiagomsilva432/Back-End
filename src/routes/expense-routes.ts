import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    createExpense,
    getExpense,
    listExpenses,
    patchExpense,
    removeExpense,
    removeReceipt,
    uploadReceipt,
} from "../controllers/expense-controller.js";
import {
    createExpenseSchema,
    expenseListResponseSchema,
    expenseResponseSchema,
    listExpensesQuerySchema,
    patchExpenseSchema,
} from "../dtos/expense/expense-dto.js";
import { fileResponseSchema } from "../dtos/file/file-dto.js";
import { errorResponses, fileBody, jsonBody, jsonResponse, pathId } from "../docs/response.js";
import { acceptFile } from "../middleware/acceptFile.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { FILE_KINDS } from "../services/files/file-kinds.js";
import { FileKind } from "../types/enums.js";

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

router.post(
    "/expenses/:id/receipts",
    requireAuth,
    requireRole(),
    acceptFile(FILE_KINDS[FileKind.ExpenseReceipt]),
    uploadReceipt
);

router.delete(
    "/expenses/:id/receipts/:fileId",
    requireAuth,
    requireRole(),
    removeReceipt
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
            description: `${managers}Serve para corrigir um erro de registo, e não avisa ninguém. Os recibos vão com ela.`,
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
    "/expenses/{id}/receipts": {
        post: {
            tags: ["Despesas"],
            summary: "Anexar um recibo",
            description:
                `${managers}JPEG, PNG, WebP ou PDF até 10 MB, em \`multipart/form-data\` no campo \`file\`; até 5 ` +
                "por despesa. O tipo vê-se pelos bytes, não pela extensão. Uma fotografia é endireitada, fica no " +
                "máximo com 2560 px e perde os metadados (o GPS sai); um PDF fica como veio. O mesmo ficheiro duas " +
                "vezes na mesma despesa é 409. Se já estiver noutra despesa da empresa é aceite, mas o " +
                "`duplicateOwnerIds` da resposta diz em quais: pode ser o mesmo recibo pago duas vezes.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestBody: fileBody("O recibo: JPEG, PNG, WebP ou PDF, até 10 MB"),
            responses: {
                "201": jsonResponse(201, "Recibo anexado", fileResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para gerir esta despesa"),
                "404": jsonResponse(404, "Despesa não encontrada"),
                "409": jsonResponse(409, "Já tem 5 recibos, ou este já está anexado"),
                "413": jsonResponse(413, "O ficheiro tem mais de 10 MB"),
                ...errorResponses(500),
            },
        },
    },
    "/expenses/{id}/receipts/{fileId}": {
        delete: {
            tags: ["Despesas"],
            summary: "Apagar um recibo",
            description: `${managers}O recibo de outra despesa é 404.`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, pathId("Id do recibo", "fileId")],
            responses: {
                "200": jsonResponse(200, "Recibo apagado"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para gerir esta despesa"),
                "404": jsonResponse(404, "Despesa ou recibo não encontrado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
