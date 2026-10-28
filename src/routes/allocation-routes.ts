import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    createAllocation,
    getUserAllocationLoad,
    listProjectAllocations,
    listUserAllocations,
    patchAllocation,
    removeAllocation,
} from "../controllers/allocation-controller.js";
import {
    allocationListResponseSchema,
    allocationLoadResponseSchema,
    allocationResponseSchema,
    createAllocationSchema,
    listAllocationsQuerySchema,
    patchAllocationSchema,
} from "../dtos/allocation/allocation-dto.js";
import { errorResponses, jsonBody, jsonResponse, pathId } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin, requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";

const router = Router();

router.post(
    "/allocations",
    requireAuth,
    requireAdmin,
    validateBody(createAllocationSchema),
    createAllocation
);

router.patch(
    "/allocations/:id",
    requireAuth,
    requireAdmin,
    validateBody(patchAllocationSchema),
    patchAllocation
);

router.delete(
    "/allocations/:id",
    requireAuth,
    requireAdmin,
    removeAllocation
);

// No role listed: reading is open to any active user, scoped to their company.
router.get(
    "/projects/:id/allocations",
    requireAuth,
    requireRole(),
    validateQuery(listAllocationsQuerySchema),
    listProjectAllocations
);

router.get(
    "/users/:id/allocations",
    requireAuth,
    requireRole(),
    validateQuery(listAllocationsQuerySchema),
    listUserAllocations
);

router.get(
    "/users/:id/allocation-load",
    requireAuth,
    requireRole(),
    getUserAllocationLoad
);

export const allocationPaths: ZodOpenApiPathsObject = {
    "/allocations": {
        post: {
            tags: ["Alocações"],
            summary: "Alocar uma pessoa a um projeto",
            description:
                "Um `company_admin` aloca na sua própria empresa; um `system_admin` em qualquer uma. " +
                "O utilizador e o projeto têm de ser da mesma empresa - um utilizador de outra " +
                "empresa responde 404, igual a um que não existe. " +
                "Uma segunda alocação aberta do mesmo par responde 409; com `endDate` indicada é " +
                "aceite, porque registar uma alocação antiga é legítimo. " +
                "A soma passar os 100% é permitida: vê-se em `/users/{id}/allocation-load`.",
            security: [{ bearerAuth: [] }],
            requestBody: jsonBody(createAllocationSchema),
            responses: {
                "201": jsonResponse(201, "Alocação criada", allocationResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para alocar"),
                "404": jsonResponse(404, "Projeto ou utilizador não encontrado"),
                "409": jsonResponse(409, "Já existe uma alocação aberta deste par"),
                ...errorResponses(500),
            },
        },
    },
    "/allocations/{id}": {
        patch: {
            tags: ["Alocações"],
            summary: "Alterar ou fechar uma alocação",
            description:
                "Fechar uma alocação é indicar-lhe `endDate`. " +
                "Ao contrário do `PUT /users/{id}/profile`, um PATCH junta: um campo omitido fica " +
                "como está, e um `null` explícito limpa-o. " +
                "`endDate: null` reabre a alocação, e responde 409 se o par já tiver outra aberta. " +
                "O `startDate` não se altera: apaga-se e cria-se outra.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id da alocação")],
            requestBody: jsonBody(patchAllocationSchema),
            responses: {
                "200": jsonResponse(200, "Alocação atualizada", allocationResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para alterar alocações"),
                "404": jsonResponse(404, "Alocação não encontrada"),
                "409": jsonResponse(409, "Já existe uma alocação aberta deste par"),
                ...errorResponses(500),
            },
        },
        delete: {
            tags: ["Alocações"],
            summary: "Apagar uma alocação",
            description:
                "Serve para corrigir um erro de registo, como um `startDate` errado: apaga-se e " +
                "cria-se outra. Para terminar uma alocação, fecha-se com `PATCH` e `endDate`, " +
                "o que mantém o histórico. Um `company_admin` apaga na sua empresa; um " +
                "`system_admin` em qualquer uma.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id da alocação")],
            responses: {
                "200": jsonResponse(200, "Alocação apagada"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para apagar alocações"),
                "404": jsonResponse(404, "Alocação não encontrada"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/allocations": {
        get: {
            tags: ["Alocações"],
            summary: "Quem trabalha num projeto",
            description:
                "Qualquer conta ativa da empresa do projeto. `?open=true` deixa só as abertas. " +
                "Um projeto de outra empresa devolve 404, não 403.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id do projeto")],
            requestParams: { query: listAllocationsQuerySchema },
            responses: {
                "200": jsonResponse(200, "Alocações", allocationListResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/allocations": {
        get: {
            tags: ["Alocações"],
            summary: "Em que projetos uma pessoa trabalha",
            description:
                "Qualquer conta ativa da empresa da pessoa. `?open=true` deixa só as abertas.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id do utilizador")],
            requestParams: { query: listAllocationsQuerySchema },
            responses: {
                "200": jsonResponse(200, "Alocações", allocationListResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/users/{id}/allocation-load": {
        get: {
            tags: ["Alocações"],
            summary: "Carga de alocação de uma pessoa",
            description:
                "Soma as alocações ativas (abertas, ou que ainda não terminaram). " +
                "`overAllocated` fica a `true` acima de 100%, que é permitido e só se reporta.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id do utilizador")],
            responses: {
                "200": jsonResponse(200, "Carga de alocação", allocationLoadResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Utilizador não encontrado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
