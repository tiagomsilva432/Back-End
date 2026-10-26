import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    createAnnouncement,
    getAnnouncement,
    listAnnouncements,
    listMyAnnouncements,
    listProjectAnnouncements,
    patchAnnouncement,
    readAnnouncement,
    removeAnnouncement,
} from "../controllers/announcement-controller.js";
import {
    announcementFeedItemSchema,
    announcementFeedResponseSchema,
    announcementListResponseSchema,
    announcementResponseSchema,
    createAnnouncementSchema,
    listAnnouncementsQuerySchema,
    listMyAnnouncementsQuerySchema,
    listProjectAnnouncementsQuerySchema,
    patchAnnouncementSchema,
} from "../dtos/announcement/announcement-dto.js";
import { errorResponses, jsonBody, jsonResponse } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";

const router = Router();

// Sem roles na rota: quem pode publicar depende do scope e, num projeto, do
// managerId. Decide-se no controller.
router.post(
    "/announcements",
    requireAuth,
    requireRole(),
    validateBody(createAnnouncementSchema),
    createAnnouncement
);

router.get(
    "/announcements",
    requireAuth,
    requireRole(),
    validateQuery(listAnnouncementsQuerySchema),
    listAnnouncements
);

// Antes do /:id, senão o "mine" era lido como um id.
router.get(
    "/announcements/mine",
    requireAuth,
    requireRole(),
    validateQuery(listMyAnnouncementsQuerySchema),
    listMyAnnouncements
);

router.get(
    "/announcements/:id",
    requireAuth,
    requireRole(),
    getAnnouncement
);

router.patch(
    "/announcements/:id",
    requireAuth,
    requireRole(),
    validateBody(patchAnnouncementSchema),
    patchAnnouncement
);

router.delete(
    "/announcements/:id",
    requireAuth,
    requireRole(),
    removeAnnouncement
);

router.post(
    "/announcements/:id/read",
    requireAuth,
    requireRole(),
    readAnnouncement
);

router.get(
    "/projects/:id/announcements",
    requireAuth,
    requireRole(),
    validateQuery(listProjectAnnouncementsQuerySchema),
    listProjectAnnouncements
);

const idParam = (description: string) => ({
    name: "id",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const, format: "uuid" },
    description,
});

const WHO_MANAGES =
    "Sistema: só um `system_admin`. Empresa: um `system_admin`, ou um `company_admin` dessa empresa. " +
    "Projeto: esses dois, ou o gestor do projeto (`managerId`).";

//Documentação OpenAPI destas rotas
export const announcementPaths: ZodOpenApiPathsObject = {
    "/announcements": {
        post: {
            tags: ["Avisos"],
            summary: "Publicar um aviso",
            description:
                `O \`scope\` decide quem o vê: \`system\` toda a gente, \`company\` uma empresa, \`project\` ` +
                `quem está no projeto. ${WHO_MANAGES} ` +
                "Um aviso que já está ativo vai logo pelo stream (`event: announcement`). Um agendado " +
                "(`startsAt` no futuro) aparece no feed quando começar, mas não é empurrado nessa altura.",
            security: [{ bearerAuth: [] }],
            requestBody: jsonBody(createAnnouncementSchema),
            responses: {
                "201": jsonResponse(201, "Aviso publicado", announcementResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para publicar neste scope"),
                "404": jsonResponse(404, "Empresa ou projeto não encontrado"),
                ...errorResponses(500),
            },
        },
        get: {
            tags: ["Avisos"],
            summary: "Os avisos que posso gerir",
            description:
                `Para a gestão, não para ler: devolve o que quem pergunta pode alterar. ${WHO_MANAGES} ` +
                "Por omissão só os ativos; `?includeInactive=true` junta os agendados e os que já acabaram.",
            security: [{ bearerAuth: [] }],
            requestParams: { query: listAnnouncementsQuerySchema },
            responses: {
                "200": jsonResponse(200, "Avisos", announcementListResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa, ou empresa alheia"),
                ...errorResponses(500),
            },
        },
    },
    "/announcements/mine": {
        get: {
            tags: ["Avisos"],
            summary: "Os meus avisos",
            description:
                "Os ativos que esta pessoa vê: os de sistema, os da sua empresa, e os dos projetos em que " +
                "está alocada ou que gere. Cada um traz `read`. Fixados primeiro, depois do mais recente.",
            security: [{ bearerAuth: [] }],
            requestParams: { query: listMyAnnouncementsQuerySchema },
            responses: {
                "200": jsonResponse(200, "Avisos", announcementFeedResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                ...errorResponses(500),
            },
        },
    },
    "/announcements/{id}": {
        get: {
            tags: ["Avisos"],
            summary: "Ver um aviso",
            description:
                "Um aviso de outra empresa, ou um agendado ou acabado para quem não o gere, responde 404.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id do aviso")],
            responses: {
                "200": jsonResponse(200, "Aviso", announcementFeedItemSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Aviso não encontrado"),
                ...errorResponses(500),
            },
        },
        patch: {
            tags: ["Avisos"],
            summary: "Alterar um aviso",
            description:
                `${WHO_MANAGES} Um PATCH junta: o omitido fica como está, e \`endsAt: null\` tira o fim. ` +
                "O scope, a empresa e o projeto não mudam. Quem o vê recebe `action: \"updated\"`, também " +
                "quando deixa de estar ativo.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id do aviso")],
            requestBody: jsonBody(patchAnnouncementSchema),
            responses: {
                "200": jsonResponse(200, "Aviso atualizado", announcementResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para gerir este aviso"),
                "404": jsonResponse(404, "Aviso não encontrado"),
                ...errorResponses(500),
            },
        },
        delete: {
            tags: ["Avisos"],
            summary: "Apagar um aviso",
            description: `${WHO_MANAGES} As leituras vão com ele.`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id do aviso")],
            responses: {
                "200": jsonResponse(200, "Aviso apagado"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões para gerir este aviso"),
                "404": jsonResponse(404, "Aviso não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/announcements/{id}/read": {
        post: {
            tags: ["Avisos"],
            summary: "Marcar um aviso como lido",
            description: "Também serve para dispensar um banner. Repetir não muda nada.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id do aviso")],
            responses: {
                "200": jsonResponse(200, "Aviso lido", announcementFeedItemSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Aviso não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/announcements": {
        get: {
            tags: ["Avisos"],
            summary: "Os avisos de um projeto",
            description:
                "Para a página do projeto. Qualquer conta ativa da empresa do projeto, como nas alocações. " +
                "`?includeInactive=true` só conta para quem gere o projeto.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id do projeto")],
            requestParams: { query: listProjectAnnouncementsQuerySchema },
            responses: {
                "200": jsonResponse(200, "Avisos do projeto", announcementFeedResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
