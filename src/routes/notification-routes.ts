import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    createStreamTicket,
    getMyUnreadCount,
    listMyNotifications,
    openNotificationStream,
    readAllMyNotifications,
    readNotification,
} from "../controllers/notification-controller.js";
import {
    listMyNotificationsQuerySchema,
    notificationPageResponseSchema,
    notificationResponseSchema,
    notificationStreamQuerySchema,
    readAllNotificationsResponseSchema,
    streamTicketResponseSchema,
    unreadCountResponseSchema,
} from "../dtos/notification/notification-dto.js";
import { errorResponses, jsonResponse, pathId } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireStreamAuth } from "../middleware/requireStreamAuth.js";
import { validateQuery } from "../middleware/validateQuery.js";

const router = Router();

// As rotas /mine antes das /:id, senão o "mine" era lido como um id.
router.get(
    "/notifications/mine",
    requireAuth,
    requireRole(),
    validateQuery(listMyNotificationsQuerySchema),
    listMyNotifications
);

router.get(
    "/notifications/mine/unread-count",
    requireAuth,
    requireRole(),
    getMyUnreadCount
);

router.post(
    "/notifications/mine/read-all",
    requireAuth,
    requireRole(),
    readAllMyNotifications
);

router.post(
    "/notifications/stream-ticket",
    requireAuth,
    requireRole(),
    createStreamTicket
);

// requireStreamAuth em vez de requireAuth: o EventSource não manda headers.
router.get(
    "/notifications/stream",
    requireStreamAuth,
    requireRole(),
    openNotificationStream
);

router.post(
    "/notifications/:id/read",
    requireAuth,
    requireRole(),
    readNotification
);

//Documentação OpenAPI destas rotas
export const notificationPaths: ZodOpenApiPathsObject = {
    "/notifications/mine": {
        get: {
            tags: ["Notificações"],
            summary: "As minhas notificações",
            description:
                "Da mais recente para a mais antiga, às páginas. Para a página seguinte, passa-se " +
                "o `nextBefore` como `before`. Ficam gravadas mesmo com a pessoa offline: é aqui que " +
                "se leem ao voltar, e depois de cada `ready` do stream.",
            security: [{ bearerAuth: [] }],
            requestParams: { query: listMyNotificationsQuerySchema },
            responses: {
                "200": jsonResponse(200, "Notificações", notificationPageResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
    "/notifications/mine/unread-count": {
        get: {
            tags: ["Notificações"],
            summary: "Quantas notificações estão por ler",
            security: [{ bearerAuth: [] }],
            responses: {
                "200": jsonResponse(200, "Notificações por ler", unreadCountResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
    "/notifications/mine/read-all": {
        post: {
            tags: ["Notificações"],
            summary: "Marcar todas como lidas",
            security: [{ bearerAuth: [] }],
            responses: {
                "200": jsonResponse(200, "Notificações lidas", readAllNotificationsResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
    "/notifications/{id}/read": {
        post: {
            tags: ["Notificações"],
            summary: "Marcar uma notificação como lida",
            description:
                "Só a própria pessoa: a notificação de outra responde 404, igual a uma que não existe. " +
                "Marcar outra vez não muda a hora da primeira leitura.",
            security: [{ bearerAuth: [] }],
            parameters: [pathId("Id da notificação")],
            responses: {
                "200": jsonResponse(200, "Notificação lida", notificationResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Notificação não encontrada"),
                ...errorResponses(500),
            },
        },
    },
    "/notifications/stream-ticket": {
        post: {
            tags: ["Notificações"],
            summary: "Pedir um bilhete para o stream",
            description:
                "O `EventSource` do browser não manda o header `Authorization`. Este bilhete vai no URL " +
                "do stream em vez do JWT: serve uma vez e dura 30 segundos.",
            security: [{ bearerAuth: [] }],
            responses: {
                "201": jsonResponse(201, "Bilhete criado", streamTicketResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
    "/notifications/stream": {
        get: {
            tags: ["Notificações"],
            summary: "Receber notificações e avisos em direto",
            description:
                "Server-Sent Events, e a única rota fora do envelope JSON. Autentica com `?ticket=` " +
                "(ou com o Bearer, para clientes com fetch). Eventos:\n\n" +
                "- `ready` `{ unread }`: ligado. O cliente lê `GET /notifications/mine` para acertar o que perdeu.\n" +
                "- `notification`: uma notificação nova, com a forma de `Notification`.\n" +
                "- `announcement`: `{ action: \"created\" | \"updated\", announcement }` ou `{ action: \"deleted\", id }`.\n" +
                "- `project_message`: o chat de um projeto, `{ action: \"created\" | \"updated\", message }` ou " +
                "`{ action: \"deleted\", projectId, id }`.\n" +
                "- `project_task`: o quadro de um projeto, `{ action: \"created\" | \"updated\", task }`, " +
                "`{ action: \"moved\", task, order }` ou `{ action: \"deleted\", projectId, id }`.\n" +
                "- `project_task_comment`: `{ action: \"created\" | \"updated\", projectId, comment }` ou " +
                "`{ action: \"deleted\", projectId, taskId, id }`.\n" +
                "- `close` `{ reason }`: logo antes de fechar. `token_expired` (volta a fazer login), " +
                "`account_inactive` (a conta deixou de estar ativa), `server_shutdown` (volta a ligar daqui a pouco) " +
                "ou `too_many_connections` (mais de 5 abertas: esta era a mais antiga, não volta a ligar).\n\n" +
                "O bilhete só serve uma vez, por isso o reconnect automático do browser falha: ao cair, " +
                "pede-se outro bilhete e abre-se outro stream.",
            security: [{ bearerAuth: [] }, {}],
            requestParams: { query: notificationStreamQuerySchema },
            responses: {
                "200": {
                    description: "Stream de eventos, aberto até fechar",
                    content: {
                        "text/event-stream": { schema: { type: "string" } },
                    },
                },
                "401": jsonResponse(401, "Bilhete ou token em falta, inválido ou expirado"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
