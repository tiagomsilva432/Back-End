import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    createUserSalary,
    getUserCurrentSalary,
    listUserSalaries,
    removeUserSalary,
} from "../controllers/salary-controller.js";
import {
    createSalarySchema,
    salaryListResponseSchema,
    salaryResponseSchema,
} from "../dtos/salary/salary-dto.js";
import { errorResponses, jsonBody, jsonResponse, pathId } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin, requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";

const router = Router();

// Bare requireRole(): the person themselves may read, so the controller decides.
router.get(
    "/users/:id/salaries",
    requireAuth,
    requireRole(),
    listUserSalaries
);

router.get(
    "/users/:id/salaries/current",
    requireAuth,
    requireRole(),
    getUserCurrentSalary
);

router.post(
    "/users/:id/salaries",
    requireAuth,
    requireAdmin,
    validateBody(createSalarySchema),
    createUserSalary
);

router.delete(
    "/users/:id/salaries/:salaryId",
    requireAuth,
    requireAdmin,
    removeUserSalary
);

const idParam = pathId("Id do utilizador");

const readers =
    "Só a própria pessoa, ou quem administra a conta dela: um `company_admin` sobre os seus " +
    "`employee`, um `system_admin` sobre qualquer uma. Um colega recebe 403. ";

//Documentação OpenAPI destas rotas
export const salaryPaths: ZodOpenApiPathsObject = {
    "/users/{id}/salaries": {
        get: {
            tags: ["Salários"],
            summary: "Histórico de salários de uma pessoa",
            description: `${readers}Do mais recente para o mais antigo, incluindo aumentos agendados.`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Salários", salaryListResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para ver o salário desta pessoa"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                ...errorResponses(500),
            },
        },
        post: {
            tags: ["Salários"],
            summary: "Definir o salário seguinte",
            description:
                "Quem administra a conta, e nunca sobre si próprio. O salário aberto fecha-se no dia " +
                "em que o novo começa, na mesma transação. O histórico não se reescreve: o " +
                "`effectiveFrom` tem de ser posterior ao do salário mais recente, ou responde 409. " +
                "Uma data futura agenda um aumento; até lá, `/current` continua a mostrar o anterior.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestBody: jsonBody(createSalarySchema),
            responses: {
                "201": jsonResponse(201, "Salário definido", salaryResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para alterar o salário desta pessoa"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                "409": jsonResponse(409, "O novo salário começa antes do mais recente"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/salaries/current": {
        get: {
            tags: ["Salários"],
            summary: "Salário em vigor hoje",
            description:
                `${readers}É o que se paga hoje, e não o mais recente: um aumento agendado só ` +
                "aparece aqui no dia em que começa.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Salário em vigor", salaryResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para ver o salário desta pessoa"),
                "404": jsonResponse(404, "Utilizador não encontrado, ou sem salário em vigor"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/salaries/{salaryId}": {
        delete: {
            tags: ["Salários"],
            summary: "Apagar o salário mais recente",
            description:
                "Serve para corrigir um erro de registo. Só o mais recente se apaga - a meio do " +
                "histórico ficava um buraco - e o anterior volta a ficar aberto. " +
                "As mesmas permissões do POST.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam, pathId("Id do salário", "salaryId")],
            responses: {
                "200": jsonResponse(200, "Salário apagado"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para alterar o salário desta pessoa"),
                "404": jsonResponse(404, "Utilizador ou salário não encontrado"),
                "409": jsonResponse(409, "Só o salário mais recente pode ser apagado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
