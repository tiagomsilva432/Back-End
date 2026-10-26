import { z } from "zod";
import { AbsenceStatus, AbsenceType } from "../../types/enums.js";
import { daysBetween, isoDate } from "../../utils/dates.js";
import { yearSchema } from "../common/fields-dto.js";

const idSchema = z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" });

/** Um pedido vai até um ano. Uma baixa mais longa pede-se em partes. */
export const MAX_ABSENCE_DAYS = 366;

const typeSchema = z.enum(AbsenceType).meta({
    example: AbsenceType.Vacation,
    description: "`vacation` (férias), `sick` (baixa) ou `leave` (outra ausência).",
});

const statusFilter = z.string().trim().toLowerCase().pipe(z.enum(AbsenceStatus)).optional()
    .meta({ example: AbsenceStatus.Pending, description: "Filtra por estado." });

const reasonSchema = z.string().trim().min(1).max(1000);

//Schema REQUEST createAbsence
export const createAbsenceSchema = z.object({
    type: typeSchema,
    startDate: z.iso.date().meta({ example: "2026-12-21" }),
    endDate: z.iso.date().meta({ example: "2026-12-31", description: "Inclusivo: um dia só tem startDate = endDate." }),
    note: reasonSchema.optional().meta({
        example: "Viagem em família",
        description: "Só a pessoa e os admins a veem.",
    }),
})
    // Validado contra hoje no pedido, e não na definição do schema: o dia muda.
    .superRefine((absence, ctx) => {
        if (absence.endDate < absence.startDate) {
            ctx.addIssue({ code: "custom", message: "O fim não pode ser antes do início", path: ["endDate"] });
        } else if (daysBetween(absence.startDate, absence.endDate) >= MAX_ABSENCE_DAYS) {
            ctx.addIssue({ code: "custom", message: `Um pedido vai até ${MAX_ABSENCE_DAYS} dias`, path: ["endDate"] });
        }

        // Uma baixa ou uma falta registam-se muitas vezes depois; as férias marcam-se antes.
        if (absence.type === AbsenceType.Vacation && absence.startDate < isoDate()) {
            ctx.addIssue({ code: "custom", message: "As férias não podem começar no passado", path: ["startDate"] });
        }
    })
    .meta({ id: "CreateAbsenceRequest", description: "Pedir uma ausência para si próprio" });

/** Só a documentação usa este: o corpo é opcional, e o validateBody recebe o de baixo. */
export const absenceDecisionBodySchema = z.object({
    reason: reasonSchema.optional().meta({
        example: "Já há duas pessoas da equipa fora nessa semana",
        description: "Fica em `decisionNote`, e vai na notificação.",
    }),
}).meta({ id: "AbsenceDecisionRequest", description: "Recusar ou cancelar, com um motivo opcional" });

export const absenceDecisionSchema = absenceDecisionBodySchema.optional();

//Schemas QUERY
export const listMyAbsencesQuerySchema = z.object({
    status: statusFilter,
}).meta({ id: "ListMyAbsencesQuery", description: "Filtros dos meus pedidos" });

export const listAbsencesQuerySchema = z.object({
    companyId: idSchema.optional().meta({ description: "Só para um system_admin. Sem ele, todas as empresas." }),
    userId: idSchema.optional().meta({ description: "Só os pedidos desta pessoa." }),
    status: statusFilter,
}).meta({ id: "ListAbsencesQuery", description: "Filtros dos pedidos para aprovar" });

export const absenceSummaryQuerySchema = z.object({
    year: yearSchema,
}).meta({ id: "AbsenceSummaryQuery", description: "O ano a contar" });

//Como um pedido é devolvido
export const absenceResponseSchema = z.object({
    id: idSchema,
    companyId: z.uuid(),
    userId: z.uuid(),
    type: typeSchema,
    status: z.enum(AbsenceStatus).meta({ example: AbsenceStatus.Pending }),
    startDate: z.iso.date().meta({ example: "2026-12-21" }),
    endDate: z.iso.date().meta({ example: "2026-12-31" }),
    workingDays: z.int().meta({
        example: 7,
        description: "Os dias de semana do intervalo que não são feriado (nacional ou da empresa).",
    }),
    note: z.string().nullable(),
    decidedBy: z.uuid().nullable().meta({
        description:
            "Quem o levou ao estado em que está: aprovou, recusou ou cancelou. Num `approved`, null quer dizer " +
            "que foi aprovado automaticamente (uma baixa).",
    }),
    decidedAt: z.iso.datetime().nullable(),
    decisionNote: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).meta({ id: "Absence", description: "Um pedido de ausência, com tudo: só a pessoa e os admins o veem assim" });

export const absenceListResponseSchema = z.array(absenceResponseSchema)
    .meta({ id: "AbsenceList", description: "Pedidos, do que começa mais tarde para o mais cedo" });

export const absenceSummaryResponseSchema = z.object({
    userId: z.uuid(),
    year: z.int().meta({ example: 2026 }),
    vacation: z.int().meta({ example: 12, description: "Dias úteis de férias aprovadas nesse ano." }),
    sick: z.int().meta({ example: 2 }),
    leave: z.int().meta({ example: 1 }),
}).meta({ id: "AbsenceSummary", description: "Dias úteis de ausências aprovadas, por tipo, num ano" });

export type CreateAbsenceRequest = z.infer<typeof createAbsenceSchema>;
export type AbsenceDecisionRequest = z.infer<typeof absenceDecisionSchema>;
export type ListMyAbsencesQuery = z.infer<typeof listMyAbsencesQuerySchema>;
export type ListAbsencesQuery = z.infer<typeof listAbsencesQuerySchema>;
export type AbsenceSummaryQuery = z.infer<typeof absenceSummaryQuerySchema>;
export type AbsenceResponse = z.infer<typeof absenceResponseSchema>;
export type AbsenceSummaryResponse = z.infer<typeof absenceSummaryResponseSchema>;
