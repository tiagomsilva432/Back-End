import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    approveAbsence,
    cancelAbsence,
    createAbsence,
    getAbsence,
    getAbsenceSummary,
    listAbsences,
    listMyAbsences,
    rejectAbsence,
} from "../controllers/absence-controller.js";
import {
    absenceDecisionBodySchema,
    absenceDecisionSchema,
    absenceListResponseSchema,
    absenceResponseSchema,
    absenceSummaryQuerySchema,
    absenceSummaryResponseSchema,
    createAbsenceSchema,
    listAbsencesQuerySchema,
    listMyAbsencesQuerySchema,
} from "../dtos/absence/absence-dto.js";
import { errorResponses, jsonBody, jsonResponse, pathId } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin, requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";

const router = Router();

// Sem roles na rota: toda a gente pede para si. Quem decide vê-se no controller,
// pela empresa do pedido e por não ser o próprio.
router.post(
    "/absences",
    requireAuth,
    requireRole(),
    validateBody(createAbsenceSchema),
    createAbsence
);

router.get(
    "/absences",
    requireAuth,
    requireAdmin,
    validateQuery(listAbsencesQuerySchema),
    listAbsences
);

// Antes do /:id, senão o "mine" era lido como um id.
router.get(
    "/absences/mine",
    requireAuth,
    requireRole(),
    validateQuery(listMyAbsencesQuerySchema),
    listMyAbsences
);

router.get(
    "/absences/:id",
    requireAuth,
    requireRole(),
    getAbsence
);

router.post(
    "/absences/:id/approve",
    requireAuth,
    requireRole(),
    approveAbsence
);

router.post(
    "/absences/:id/reject",
    requireAuth,
    requireRole(),
    validateBody(absenceDecisionSchema),
    rejectAbsence
);

router.post(
    "/absences/:id/cancel",
    requireAuth,
    requireRole(),
    validateBody(absenceDecisionSchema),
    cancelAbsence
);

router.get(
    "/users/:id/absence-summary",
    requireAuth,
    requireRole(),
    validateQuery(absenceSummaryQuerySchema),
    getAbsenceSummary
);

/** O motivo é opcional, e o corpo também. */
const optionalDecisionBody = {
    required: false,
    content: { "application/json": { schema: absenceDecisionBodySchema } },
};

const WHO_DECIDES =
    "Decide um `system_admin`, ou um `company_admin` da empresa do pedido. Nunca o próprio: " +
    "o pedido de um `company_admin` decide-o outro `company_admin`, ou um `system_admin`.";

const WHO_SEES =
    "Só a pessoa e quem gere as ausências da empresa veem o pedido. Para os outros é 404, como um que não existe.";

//Documentação OpenAPI destas rotas
export const absencePaths: ZodOpenApiPathsObject = {
    "/absences": {
        post: {
            tags: ["Ausências"],
            summary: "Pedir uma ausência",
            description:
                "Para quem pede, sempre: férias (`vacation`), baixa (`sick`) ou outra ausência (`leave`), em dias " +
                "inteiros e com o `endDate` incluído. As férias não podem começar no passado; uma baixa ou uma falta " +
                "podem, porque se registam muitas vezes depois. Um intervalo só de fins de semana e feriados é 400, " +
                "e um que toque noutro pedido pendente ou aprovado da mesma pessoa é 409. Fica `pending`, e quem " +
                "decide recebe `absence.requested`. Uma baixa não passa por aprovação: fica logo `approved`, sem " +
                "`decidedBy`; quem decide recebe `absence.auto_approved`, e os gestores dos projetos da pessoa " +
                "nesses dias `absence.teammate_away`. Quem decide são os outros `company_admin`s ativos da " +
                "empresa; sem nenhum, os `system_admin`s.",
            security: [{ bearerAuth: [] }],
            requestBody: jsonBody(createAbsenceSchema),
            responses: {
                "201": jsonResponse(201, "Pedido criado", absenceResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "409": jsonResponse(409, "Já há um pedido pendente ou aprovado nesses dias"),
                ...errorResponses(500),
            },
        },
        get: {
            tags: ["Ausências"],
            summary: "Os pedidos para decidir",
            description:
                "Para quem aprova: `system_admin` e `company_admin`. Um `company_admin` vê a sua empresa; um " +
                "`system_admin` vê todas, ou a do `?companyId=`. Com o tipo verdadeiro e a nota.",
            security: [{ bearerAuth: [] }],
            requestParams: { query: listAbsencesQuerySchema },
            responses: {
                "200": jsonResponse(200, "Pedidos", absenceListResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões, ou empresa alheia"),
                ...errorResponses(500),
            },
        },
    },
    "/absences/mine": {
        get: {
            tags: ["Ausências"],
            summary: "Os meus pedidos",
            description: "Todos, em qualquer estado, do que começa mais tarde para o mais cedo.",
            security: [{ bearerAuth: [] }],
            requestParams: { query: listMyAbsencesQuerySchema },
            responses: {
                "200": jsonResponse(200, "Pedidos", absenceListResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
    "/absences/{id}": {
        get: {
            tags: ["Ausências"],
            summary: "Ver um pedido",
            description: WHO_SEES,
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id do pedido")],
            responses: {
                "200": jsonResponse(200, "Pedido", absenceResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Pedido não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/absences/{id}/approve": {
        post: {
            tags: ["Ausências"],
            summary: "Aprovar um pedido",
            description:
                `${WHO_DECIDES} Só um \`pending\`: outro estado é 409. A pessoa recebe \`absence.approved\`, e os ` +
                "gestores dos projetos onde ela está alocada nesses dias recebem `absence.teammate_away`, com o " +
                "tipo tapado como no calendário.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id do pedido")],
            responses: {
                "200": jsonResponse(200, "Pedido aprovado", absenceResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "O pedido é seu, ou conta não está ativa"),
                "404": jsonResponse(404, "Pedido não encontrado"),
                "409": jsonResponse(409, "O pedido já não está pendente"),
                ...errorResponses(500),
            },
        },
    },
    "/absences/{id}/reject": {
        post: {
            tags: ["Ausências"],
            summary: "Recusar um pedido",
            description:
                `${WHO_DECIDES} Só um \`pending\`. O \`reason\`, opcional, fica em \`decisionNote\` e vai na ` +
                "notificação `absence.rejected` para a pessoa.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id do pedido")],
            requestBody: optionalDecisionBody,
            responses: {
                "200": jsonResponse(200, "Pedido recusado", absenceResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "O pedido é seu, ou conta não está ativa"),
                "404": jsonResponse(404, "Pedido não encontrado"),
                "409": jsonResponse(409, "O pedido já não está pendente"),
                ...errorResponses(500),
            },
        },
    },
    "/absences/{id}/cancel": {
        post: {
            tags: ["Ausências"],
            summary: "Cancelar um pedido",
            description:
                "A pessoa cancela o seu se estiver pendente, ou aprovado e ainda por começar. Quem decide cancela " +
                "um pendente ou aprovado a qualquer altura. A notificação `absence.cancelled` vai para o outro " +
                "lado: a pessoa, se foi um admin; quem decide, se foi a pessoa.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id do pedido")],
            requestBody: optionalDecisionBody,
            responses: {
                "200": jsonResponse(200, "Pedido cancelado", absenceResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Pedido não encontrado"),
                "409": jsonResponse(409, "Já não está ativo, ou já começou"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/absence-summary": {
        get: {
            tags: ["Ausências"],
            summary: "Os dias de ausência de uma pessoa num ano",
            description:
                "Os dias úteis de ausências aprovadas, por tipo. Um pedido que passa a passagem de ano conta só os " +
                "dias desse ano. A pessoa e quem gere as ausências da empresa; um colega recebe 403.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id do utilizador")],
            requestParams: { query: absenceSummaryQuerySchema },
            responses: {
                "200": jsonResponse(200, "Resumo das ausências", absenceSummaryResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para ver as ausências desta pessoa"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
