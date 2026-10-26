import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    createHoliday,
    getCalendar,
    getProjectCalendar,
    listHolidays,
    removeHoliday,
} from "../controllers/calendar-controller.js";
import {
    calendarQuerySchema,
    calendarResponseSchema,
    companyHolidayResponseSchema,
    createHolidaySchema,
    holidayListResponseSchema,
    listHolidaysQuerySchema,
    projectCalendarQuerySchema,
    projectCalendarResponseSchema,
} from "../dtos/calendar/calendar-dto.js";
import { errorResponses, jsonBody, jsonResponse } from "../docs/response.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { UserRole } from "../types/enums.js";

const router = Router();

const admins = requireRole(UserRole.SystemAdmin, UserRole.CompanyAdmin);

// Ler é para qualquer conta ativa, na sua empresa. O que cada um vê de cada
// ausência decide-se no mapper.
router.get(
    "/calendar",
    requireAuth,
    requireRole(),
    validateQuery(calendarQuerySchema),
    getCalendar
);

router.get(
    "/projects/:id/calendar",
    requireAuth,
    requireRole(),
    validateQuery(projectCalendarQuerySchema),
    getProjectCalendar
);

router.get(
    "/holidays",
    requireAuth,
    requireRole(),
    validateQuery(listHolidaysQuerySchema),
    listHolidays
);

router.post(
    "/holidays",
    requireAuth,
    admins,
    validateBody(createHolidaySchema),
    createHoliday
);

router.delete(
    "/holidays/:id",
    requireAuth,
    admins,
    removeHoliday
);

const idParam = (description: string) => ({
    name: "id",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const, format: "uuid" },
    description,
});

const WHAT_SHOWS =
    "Os feriados (nacionais, calculados do país da empresa, e os que a empresa juntou) e as ausências que " +
    "tocam no intervalo. Toda a gente vê as aprovadas; os `pending` só os vê a própria pessoa e quem gere as " +
    "ausências da empresa. Para um colega, `vacation` aparece como `vacation`, e `sick` e `leave` como " +
    "`absent`. A nota nunca vem. Sem as contas terminadas. O intervalo vai até 366 dias.";

//Documentação OpenAPI destas rotas
export const calendarPaths: ZodOpenApiPathsObject = {
    "/calendar": {
        get: {
            tags: ["Calendário"],
            summary: "O calendário da empresa",
            description: `${WHAT_SHOWS} Um \`system_admin\` indica o \`companyId\`.`,
            security: [{ bearerAuth: [] }],
            requestParams: { query: calendarQuerySchema },
            responses: {
                "200": jsonResponse(200, "Calendário", calendarResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa, ou empresa alheia"),
                "404": jsonResponse(404, "Empresa não encontrada"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/calendar": {
        get: {
            tags: ["Calendário"],
            summary: "O calendário de um projeto",
            description:
                `O mesmo, só com as ausências de quem está alocado ao projeto em algum dia do intervalo, e do ` +
                `gestor. Qualquer conta ativa da empresa do projeto, como nas alocações. ${WHAT_SHOWS}`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id do projeto")],
            requestParams: { query: projectCalendarQuerySchema },
            responses: {
                "200": jsonResponse(200, "Calendário do projeto", projectCalendarResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa"),
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/holidays": {
        get: {
            tags: ["Calendário"],
            summary: "Os feriados de um ano",
            description:
                "Os nacionais e os da empresa, por data. Só Portugal (`PT`) tem feriados nacionais calculados: " +
                "uma empresa de outro país só vê os que juntou. Um `system_admin` indica o `companyId`.",
            security: [{ bearerAuth: [] }],
            requestParams: { query: listHolidaysQuerySchema },
            responses: {
                "200": jsonResponse(200, "Feriados", holidayListResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa, ou empresa alheia"),
                "404": jsonResponse(404, "Empresa não encontrada"),
                ...errorResponses(500),
            },
        },
        post: {
            tags: ["Calendário"],
            summary: "Juntar um feriado da empresa",
            description:
                "O municipal, o Carnaval, um dia de fecho. Um `system_admin` (que indica o `companyId`), ou um " +
                "`company_admin` na sua empresa. Um dia que já é feriado nacional, ou que a empresa já tem, é 409. " +
                "Conta logo nos dias úteis de todos os pedidos que o apanham.",
            security: [{ bearerAuth: [] }],
            requestBody: jsonBody(createHolidaySchema),
            responses: {
                "201": jsonResponse(201, "Feriado criado", companyHolidayResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões, ou empresa alheia"),
                "404": jsonResponse(404, "Empresa não encontrada"),
                "409": jsonResponse(409, "Esse dia já é feriado"),
                ...errorResponses(500),
            },
        },
    },
    "/holidays/{id}": {
        delete: {
            tags: ["Calendário"],
            summary: "Apagar um feriado da empresa",
            description: "Os mesmos do POST. Os nacionais não têm id: não se apagam.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam("Id do feriado")],
            responses: {
                "200": jsonResponse(200, "Feriado apagado"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Sem permissões"),
                "404": jsonResponse(404, "Feriado não encontrado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
