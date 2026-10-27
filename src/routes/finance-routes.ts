import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { getFinanceOverview, getProjectFinance } from "../controllers/finance-controller.js";
import {
    financeOverviewQuerySchema,
    financeOverviewResponseSchema,
    projectFinanceResponseSchema,
} from "../dtos/finance/finance-dto.js";
import { errorResponses, jsonResponse, pathId } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin, requireRole } from "../middleware/requireRole.js";
import { validateQuery } from "../middleware/validateQuery.js";

const router = Router();

router.get(
    "/finance/overview",
    requireAuth,
    requireAdmin,
    validateQuery(financeOverviewQuerySchema),
    getFinanceOverview
);

// Bare requireRole(): the project's manager may be an employee, so the controller decides.
router.get(
    "/projects/:id/finance",
    requireAuth,
    requireRole(),
    getProjectFinance
);

//Documentação OpenAPI destas rotas
export const financePaths: ZodOpenApiPathsObject = {
    "/finance/overview": {
        get: {
            tags: ["Finanças"],
            summary: "O painel de finanças da empresa",
            description:
                "Só para os admins: um `company_admin` vê a sua empresa, um `system_admin` indica o `companyId`. " +
                "Salários, despesas de projeto e despesas da empresa, mês a mês e em separado, para o cliente as " +
                "ligar e desligar sem voltar a pedir. Os salários contam o custo para a empresa (`salaryCostFactor`), " +
                "rateado pelos dias em que estiveram em vigor. Só conta o que já se gastou: os meses que ainda não " +
                "chegaram vêm a zero, e o mês corrente vai até hoje. O custo em pessoas de cada projeto é uma parte " +
                "dos salários, e não entra no `total` outra vez.",
            security: [{ bearerAuth: [] }],
            requestParams: { query: financeOverviewQuerySchema },
            responses: {
                "200": jsonResponse(200, "Finanças da empresa", financeOverviewResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões, ou empresa fora do alcance"),
                "404": jsonResponse(404, "Empresa não encontrada"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/finance": {
        get: {
            tags: ["Finanças"],
            summary: "O orçamento de um projeto contra o que já se gastou",
            description:
                "Os admins, ou o gestor do projeto. Os admins veem as despesas e o custo em pessoas (a parte do " +
                "salário de cada um pela percentagem da alocação). O gestor só vê as despesas: num projeto pequeno, " +
                "o custo em pessoas dava o salário de alguém. `includesLabour` diz qual das duas é.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id do projeto")],
            responses: {
                "200": jsonResponse(200, "Finanças do projeto", projectFinanceResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para ver as finanças deste projeto"),
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
