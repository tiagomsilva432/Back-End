import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    closeReviewCycle,
    createReviewCycle,
    getReviewCycle,
    getReviewCycleResults,
    getUserReviewSummary,
    listReviewCycleRequests,
    listReviewCycles,
    listUserReviews,
} from "../controllers/review-cycle-controller.js";
import {
    createAdHocReviewRequest,
    declineReviewRequest,
    listMyReviewRequests,
    submitReview,
} from "../controllers/review-request-controller.js";
import {
    anonymousReviewListResponseSchema,
    createReviewCycleSchema,
    createReviewRequestSchema,
    createdReviewCycleResponseSchema,
    listMyReviewRequestsQuerySchema,
    listReviewCyclesQuerySchema,
    reviewCycleDetailResponseSchema,
    reviewCycleListResponseSchema,
    reviewCycleResponseSchema,
    reviewRequestListResponseSchema,
    reviewRequestResponseSchema,
    reviewResultsQuerySchema,
    reviewSummaryListResponseSchema,
    reviewSummaryResponseSchema,
    submitReviewSchema,
    submittedReviewResponseSchema,
} from "../dtos/review/review-dto.js";
import { errorResponses, jsonBody, jsonResponse } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { UserRole } from "../types/enums.js";

const router = Router();

const admins = requireRole(UserRole.SystemAdmin, UserRole.CompanyAdmin);

router.post(
    "/review-cycles",
    requireAuth,
    admins,
    validateBody(createReviewCycleSchema),
    createReviewCycle
);

router.get(
    "/review-cycles",
    requireAuth,
    admins,
    validateQuery(listReviewCyclesQuerySchema),
    listReviewCycles
);

router.get(
    "/review-cycles/:id",
    requireAuth,
    admins,
    getReviewCycle
);

router.get(
    "/review-cycles/:id/requests",
    requireAuth,
    admins,
    listReviewCycleRequests
);

router.post(
    "/review-cycles/:id/close",
    requireAuth,
    admins,
    closeReviewCycle
);

router.get(
    "/review-cycles/:id/results",
    requireAuth,
    admins,
    getReviewCycleResults
);

router.post(
    "/review-requests",
    requireAuth,
    admins,
    validateBody(createReviewRequestSchema),
    createAdHocReviewRequest
);

// No role listed: anyone can be a reviewer; the controller checks it is their request.
router.get(
    "/review-requests/mine",
    requireAuth,
    requireRole(),
    validateQuery(listMyReviewRequestsQuerySchema),
    listMyReviewRequests
);

router.post(
    "/review-requests/:id/review",
    requireAuth,
    requireRole(),
    validateBody(submitReviewSchema),
    submitReview
);

router.post(
    "/review-requests/:id/decline",
    requireAuth,
    requireRole(),
    declineReviewRequest
);

// Admins only, and the controller narrows it to the accounts they administer.
router.get(
    "/users/:id/review-summary",
    requireAuth,
    admins,
    validateQuery(reviewResultsQuerySchema),
    getUserReviewSummary
);

router.get(
    "/users/:id/reviews",
    requireAuth,
    admins,
    validateQuery(reviewResultsQuerySchema),
    listUserReviews
);

const idParam = (description: string) => ({
    name: "id",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const, format: "uuid" },
    description,
});

const tags = ["Avaliações"];
const security = [{ bearerAuth: [] }];
const unauthorized = { "401": jsonResponse(401, "Token em falta ou inválido") };
const adminsOnly = "Um `company_admin` na sua empresa; um `system_admin` em qualquer uma. ";
const resultsReaders =
    "Só quem administra a conta da pessoa: um `company_admin` sobre os seus `employee`, um " +
    "`system_admin` sobre qualquer uma. A própria pessoa nunca vê os seus resultados. ";

//Documentação OpenAPI destas rotas
export const reviewPaths: ZodOpenApiPathsObject = {
    "/review-cycles": {
        post: {
            tags,
            summary: "Abrir um ciclo de avaliação",
            description:
                adminsOnly +
                "Gera, na mesma transação, um pedido por cada par de colegas: duas pessoas ativas no " +
                "mesmo projeto, com alocações que se sobrepõem entre `since` e hoje. Cada par gera " +
                "dois pedidos, um em cada sentido. Entram employees e company_admins. " +
                "Um ciclo sem pares é aceite, com `requestCount` a 0.",
            security,
            requestBody: jsonBody(createReviewCycleSchema),
            responses: {
                "201": jsonResponse(201, "Ciclo aberto", createdReviewCycleResponseSchema),
                ...errorResponses(400),
                ...unauthorized,
                "403": jsonResponse(403, "Sem permissões, ou empresa fora do alcance"),
                "404": jsonResponse(404, "Empresa não encontrada"),
                "409": jsonResponse(409, "Já existe um ciclo com este nome nesta empresa"),
                ...errorResponses(500),
            },
        },
        get: {
            tags,
            summary: "Listar os ciclos",
            description: `${adminsOnly}Um \`system_admin\` indica o \`companyId\`. \`?open=true\` deixa só os abertos.`,
            security,
            requestParams: { query: listReviewCyclesQuerySchema },
            responses: {
                "200": jsonResponse(200, "Ciclos", reviewCycleListResponseSchema),
                ...errorResponses(400),
                ...unauthorized,
                "403": jsonResponse(403, "Sem permissões, ou empresa fora do alcance"),
                ...errorResponses(500),
            },
        },
    },
    "/review-cycles/{id}": {
        get: {
            tags,
            summary: "Ver um ciclo e o seu progresso",
            description: `${adminsOnly}Quantos pedidos há em cada estado.`,
            security,
            parameters: [idParam("Id do ciclo")],
            responses: {
                "200": jsonResponse(200, "Ciclo", reviewCycleDetailResponseSchema),
                ...unauthorized,
                "403": jsonResponse(403, "Sem permissões"),
                "404": jsonResponse(404, "Ciclo não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/review-cycles/{id}/requests": {
        get: {
            tags,
            summary: "Quem avalia quem num ciclo",
            description:
                `${adminsOnly}Mostra o estado de cada pedido - quem já respondeu - mas nunca o ` +
                "conteúdo: as avaliações são anónimas.",
            security,
            parameters: [idParam("Id do ciclo")],
            responses: {
                "200": jsonResponse(200, "Pedidos do ciclo", reviewRequestListResponseSchema),
                ...unauthorized,
                "403": jsonResponse(403, "Sem permissões"),
                "404": jsonResponse(404, "Ciclo não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/review-cycles/{id}/close": {
        post: {
            tags,
            summary: "Fechar um ciclo",
            description: `${adminsOnly}Na mesma transação, os pedidos por responder passam a \`expired\`.`,
            security,
            parameters: [idParam("Id do ciclo")],
            responses: {
                "200": jsonResponse(200, "Ciclo fechado", reviewCycleResponseSchema),
                ...unauthorized,
                "403": jsonResponse(403, "Sem permissões"),
                "404": jsonResponse(404, "Ciclo não encontrado"),
                "409": jsonResponse(409, "Este ciclo já está fechado"),
                ...errorResponses(500),
            },
        },
    },
    "/review-cycles/{id}/results": {
        get: {
            tags,
            summary: "Resultados de um ciclo, por pessoa",
            description:
                resultsReaders +
                "Só aparecem as pessoas cujos resultados quem pergunta pode ler: um `company_admin` " +
                "que entrou no ciclo não vê a sua linha, nem a de outro `company_admin`.",
            security,
            parameters: [idParam("Id do ciclo")],
            responses: {
                "200": jsonResponse(200, "Resultados do ciclo", reviewSummaryListResponseSchema),
                ...unauthorized,
                "403": jsonResponse(403, "Sem permissões"),
                "404": jsonResponse(404, "Ciclo não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/review-requests": {
        post: {
            tags,
            summary: "Pedir uma avaliação fora de um ciclo",
            description:
                adminsOnly +
                "As duas pessoas têm de ser da mesma empresa e estar ativas. Um segundo pedido por " +
                "responder para o mesmo par responde 409.",
            security,
            requestBody: jsonBody(createReviewRequestSchema),
            responses: {
                "201": jsonResponse(201, "Pedido criado", reviewRequestResponseSchema),
                ...errorResponses(400),
                ...unauthorized,
                "403": jsonResponse(403, "Sem permissões"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                "409": jsonResponse(409, "Conta não ativa, ou já há um pedido por responder"),
                ...errorResponses(500),
            },
        },
    },
    "/review-requests/mine": {
        get: {
            tags,
            summary: "Os meus pedidos de avaliação",
            description: "Os pedidos em que quem pergunta é o reviewer. Qualquer conta ativa.",
            security,
            requestParams: { query: listMyReviewRequestsQuerySchema },
            responses: {
                "200": jsonResponse(200, "Pedidos", reviewRequestListResponseSchema),
                ...errorResponses(400),
                ...unauthorized,
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
    "/review-requests/{id}/review": {
        post: {
            tags,
            summary: "Responder a um pedido",
            description:
                "Só o reviewer do pedido; o de outra pessoa responde 404. O pedido tem de estar " +
                "`pending`. Fora de prazo passa a `expired` e responde 409. A avaliação e o novo " +
                "estado gravam-se na mesma transação, e não se alteram depois.",
            security,
            parameters: [idParam("Id do pedido")],
            requestBody: jsonBody(submitReviewSchema),
            responses: {
                "201": jsonResponse(201, "Avaliação submetida", submittedReviewResponseSchema),
                ...errorResponses(400),
                ...unauthorized,
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Pedido não encontrado"),
                "409": jsonResponse(409, "O pedido já não está pendente, ou o prazo terminou"),
                ...errorResponses(500),
            },
        },
    },
    "/review-requests/{id}/decline": {
        post: {
            tags,
            summary: "Recusar um pedido",
            description: "As mesmas regras de responder: só o reviewer, e só um pedido `pending` dentro do prazo.",
            security,
            parameters: [idParam("Id do pedido")],
            responses: {
                "200": jsonResponse(200, "Pedido recusado", reviewRequestResponseSchema),
                ...unauthorized,
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Pedido não encontrado"),
                "409": jsonResponse(409, "O pedido já não está pendente, ou o prazo terminou"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/review-summary": {
        get: {
            tags,
            summary: "Resumo das avaliações de uma pessoa",
            description: `${resultsReaders}Todas as avaliações, ou as de um ciclo com \`?cycleId=\`.`,
            security,
            parameters: [idParam("Id do utilizador")],
            requestParams: { query: reviewResultsQuerySchema },
            responses: {
                "200": jsonResponse(200, "Resumo das avaliações", reviewSummaryResponseSchema),
                ...errorResponses(400),
                ...unauthorized,
                "403": jsonResponse(403, "Sem permissões para ver as avaliações desta pessoa"),
                "404": jsonResponse(404, "Utilizador ou ciclo não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/reviews": {
        get: {
            tags,
            summary: "Avaliações recebidas por uma pessoa, anónimas",
            description:
                resultsReaders +
                "Sem o reviewer nem o id do pedido - qualquer um dos dois levava a quem escreveu - e " +
                "com o dia mas sem a hora. Ordenadas pela nota, nunca pelo tempo.",
            security,
            parameters: [idParam("Id do utilizador")],
            requestParams: { query: reviewResultsQuerySchema },
            responses: {
                "200": jsonResponse(200, "Avaliações", anonymousReviewListResponseSchema),
                ...errorResponses(400),
                ...unauthorized,
                "403": jsonResponse(403, "Sem permissões para ver as avaliações desta pessoa"),
                "404": jsonResponse(404, "Utilizador ou ciclo não encontrado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
