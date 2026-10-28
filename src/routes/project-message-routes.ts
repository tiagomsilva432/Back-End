import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    createProjectMessage,
    getMyUnreadProjectMessages,
    listProjectMessages,
    patchProjectMessage,
    readProjectMessages,
    removeProjectMessage,
} from "../controllers/project-message-controller.js";
import {
    createProjectMessageSchema,
    listProjectMessagesQuerySchema,
    patchProjectMessageSchema,
    projectMessagePageResponseSchema,
    projectMessageResponseSchema,
    readProjectMessagesResponseSchema,
    unreadProjectMessagesResponseSchema,
} from "../dtos/project/project-message-dto.js";
import { errorResponses, jsonBody, jsonResponse, pathId } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";

const router = Router();

// Three segments, so it never meets /projects/:id. A /projects/:id/unread
// would, if one is ever added.
router.get(
    "/projects/messages/unread",
    requireAuth,
    requireRole(),
    getMyUnreadProjectMessages
);

// Bare requireRole() everywhere: who is on the project comes from its
// allocations and managerId, so the controller decides.
router.get(
    "/projects/:id/messages",
    requireAuth,
    requireRole(),
    validateQuery(listProjectMessagesQuerySchema),
    listProjectMessages
);

router.post(
    "/projects/:id/messages",
    requireAuth,
    requireRole(),
    validateBody(createProjectMessageSchema),
    createProjectMessage
);

// Before /:messageId, so "read" is never taken for an id.
router.post(
    "/projects/:id/messages/read",
    requireAuth,
    requireRole(),
    readProjectMessages
);

router.patch(
    "/projects/:id/messages/:messageId",
    requireAuth,
    requireRole(),
    validateBody(patchProjectMessageSchema),
    patchProjectMessage
);

router.delete(
    "/projects/:id/messages/:messageId",
    requireAuth,
    requireRole(),
    removeProjectMessage
);

const idParam = pathId("Id do projeto");
const messageIdParam = pathId("Id da mensagem", "messageId");

const members =
    "Quem está no projeto: quem lá tem uma alocação que ainda não terminou, o gestor (`managerId`), " +
    "um `company_admin` da empresa ou um `system_admin`. Os outros da empresa recebem 403. ";

export const projectMessagePaths: ZodOpenApiPathsObject = {
    "/projects/messages/unread": {
        get: {
            tags: ["Chat"],
            summary: "Mensagens por ler, por projeto",
            description:
                "Nos projetos em que a pessoa está ou que gere: as mensagens de outros depois da sua marca de " +
                "leitura (todas, se nunca leu). Só vêm os projetos com alguma. Um admin que não está num " +
                "projeto lê o chat dele, mas esse projeto não conta aqui.",
            security: [{ bearerAuth: [] }],
            responses: {
                "200": jsonResponse(200, "Mensagens por ler", unreadProjectMessagesResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/messages": {
        get: {
            tags: ["Chat"],
            summary: "Ler o chat de um projeto",
            description:
                `${members}Da mais recente para a mais antiga, às páginas: para a seguinte, passa-se o ` +
                "`nextBefore` como `before`. O `lastReadMessageId` diz até onde a pessoa já tinha lido. " +
                "Ler não marca como lido: isso é `POST /projects/{id}/messages/read`.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestParams: { query: listProjectMessagesQuerySchema },
            responses: {
                "200": jsonResponse(200, "Mensagens", projectMessagePageResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa, ou não está no projeto"),
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
        post: {
            tags: ["Chat"],
            summary: "Escrever no chat",
            description:
                `${members}Vai em direto pelo stream das notificações, como \`event: project_message\`, para ` +
                "quem está no projeto, o gestor e os `company_admin` da empresa. Quem escreve fica com o chat " +
                "lido até aqui.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestBody: jsonBody(createProjectMessageSchema),
            responses: {
                "201": jsonResponse(201, "Mensagem enviada", projectMessageResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa, ou não está no projeto"),
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/messages/read": {
        post: {
            tags: ["Chat"],
            summary: "Marcar o chat como lido",
            description: `${members}Marca até à mensagem mais recente. Repetir não muda nada.`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Mensagens lidas", readProjectMessagesResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa, ou não está no projeto"),
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/messages/{messageId}": {
        patch: {
            tags: ["Chat"],
            summary: "Corrigir uma mensagem",
            description:
                `${members}Só quem a escreveu, nem um admin. Fica com o \`editedAt\`, e vai em direto ` +
                "como `updated`.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam, messageIdParam],
            requestBody: jsonBody(patchProjectMessageSchema),
            responses: {
                "200": jsonResponse(200, "Mensagem atualizada", projectMessageResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Não está no projeto, ou a mensagem não é sua"),
                "404": jsonResponse(404, "Projeto ou mensagem não encontrado"),
                ...errorResponses(500),
            },
        },
        delete: {
            tags: ["Chat"],
            summary: "Apagar uma mensagem",
            description:
                `${members}Quem a escreveu, o gestor do projeto ou um admin. Apaga de vez, e vai em direto ` +
                "como `deleted`.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam, messageIdParam],
            responses: {
                "200": jsonResponse(200, "Mensagem apagada"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Não está no projeto, ou sem permissões para a apagar"),
                "404": jsonResponse(404, "Projeto ou mensagem não encontrado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
