import { z } from "zod";
import { HolidayKind } from "../../services/holidays.js";
import { ABSENT } from "../../services/absence-policy.js";
import { AbsenceStatus, AbsenceType } from "../../types/enums.js";
import { daysBetween } from "../../utils/dates.js";
import { yearSchema } from "../common/fields-dto.js";

const idSchema = z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" });

/** Um calendário cobre até um ano: a resposta não cresce sem limite. */
export const MAX_CALENDAR_DAYS = 366;

const companyIdFilter = idSchema.optional().meta({
    description: "Só para um system_admin. Os outros veem sempre a sua empresa.",
});

const range = {
    from: z.iso.date().meta({ example: "2026-12-01", description: "Primeiro dia, inclusivo." }),
    to: z.iso.date().meta({ example: "2026-12-31", description: "Último dia, inclusivo." }),
};

const validRange = (query: { from: string; to: string }, ctx: z.RefinementCtx) => {
    if (query.to < query.from) {
        ctx.addIssue({ code: "custom", message: "O fim não pode ser antes do início", path: ["to"] });
    } else if (daysBetween(query.from, query.to) >= MAX_CALENDAR_DAYS) {
        ctx.addIssue({ code: "custom", message: `O intervalo vai até ${MAX_CALENDAR_DAYS} dias`, path: ["to"] });
    }
};

//Schemas QUERY
export const calendarQuerySchema = z.object({ ...range, companyId: companyIdFilter })
    .superRefine(validRange)
    .meta({ id: "CalendarQuery", description: "O intervalo do calendário" });

export const projectCalendarQuerySchema = z.object(range)
    .superRefine(validRange)
    .meta({ id: "ProjectCalendarQuery", description: "O intervalo do calendário do projeto" });

export const listHolidaysQuerySchema = z.object({
    year: yearSchema,
    companyId: companyIdFilter,
}).meta({ id: "ListHolidaysQuery", description: "O ano dos feriados" });

//Schema REQUEST createHoliday
export const createHolidaySchema = z.object({
    companyId: idSchema.optional().meta({
        description: "Obrigatório para um system_admin. Um company_admin junta sempre à sua.",
    }),
    date: z.iso.date().meta({ example: "2026-06-13" }),
    name: z.string().trim().min(1).max(150).meta({ example: "Santo António" }),
}).meta({ id: "CreateHolidayRequest", description: "Juntar um feriado da empresa" });

//Como um feriado é devolvido
export const holidaySchema = z.object({
    id: z.uuid().nullable().meta({ description: "Só nos da empresa: é com ele que se apaga. null nos nacionais." }),
    date: z.iso.date().meta({ example: "2026-12-25" }),
    name: z.string().meta({ example: "Natal" }),
    kind: z.enum(HolidayKind).meta({
        example: HolidayKind.National,
        description: "`national` (calculado do país da empresa) ou `company` (juntado pela empresa).",
    }),
}).meta({ id: "Holiday", description: "Um feriado" });

export const holidayListResponseSchema = z.array(holidaySchema)
    .meta({ id: "HolidayList", description: "Feriados, por data" });

export const companyHolidayResponseSchema = z.object({
    id: idSchema,
    companyId: z.uuid(),
    date: z.iso.date().meta({ example: "2026-06-13" }),
    name: z.string().meta({ example: "Santo António" }),
    createdBy: z.uuid(),
    createdAt: z.iso.datetime(),
}).meta({ id: "CompanyHoliday", description: "Um feriado da empresa" });

//Como uma ausência aparece no calendário
export const calendarAbsenceSchema = z.object({
    id: idSchema,
    userId: z.uuid(),
    type: z.enum([...Object.values(AbsenceType), ABSENT]).meta({
        example: AbsenceType.Vacation,
        description:
            "O tipo verdadeiro para a pessoa e para os admins. Para os colegas, `vacation` continua `vacation`, " +
            "e `sick`, `leave` e `unjustified` aparecem como `absent`.",
    }),
    status: z.enum([AbsenceStatus.Pending, AbsenceStatus.Approved]).meta({
        example: AbsenceStatus.Approved,
        description: "Os `pending` só aparecem à própria pessoa e aos admins.",
    }),
    startDate: z.iso.date().meta({ example: "2026-12-21" }),
    endDate: z.iso.date().meta({ example: "2026-12-31" }),
}).meta({ id: "CalendarAbsence", description: "Alguém fora, como o calendário o mostra: sem a nota" });

export const calendarResponseSchema = z.object({
    companyId: z.uuid(),
    from: z.iso.date().meta({ example: "2026-12-01" }),
    to: z.iso.date().meta({ example: "2026-12-31" }),
    holidays: z.array(holidaySchema),
    absences: z.array(calendarAbsenceSchema),
}).meta({ id: "Calendar", description: "Os feriados e as ausências de um intervalo" });

export const projectCalendarResponseSchema = calendarResponseSchema.extend({
    projectId: z.uuid(),
}).meta({
    id: "ProjectCalendar",
    description: "O mesmo, só com as ausências de quem está alocado ao projeto no intervalo, e do gestor",
});

export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export type ProjectCalendarQuery = z.infer<typeof projectCalendarQuerySchema>;
export type ListHolidaysQuery = z.infer<typeof listHolidaysQuerySchema>;
export type CreateHolidayRequest = z.infer<typeof createHolidaySchema>;
export type CompanyHolidayResponse = z.infer<typeof companyHolidayResponseSchema>;
export type CalendarAbsence = z.infer<typeof calendarAbsenceSchema>;
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;
