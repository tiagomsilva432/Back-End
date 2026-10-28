import { z } from "zod";
import { AbsenceStatus, AbsenceType } from "../../types/enums.js";
import { daysBetween, isoDate } from "../../utils/dates.js";
import { yearSchema } from "../common/fields-dto.js";
import { fileListResponseSchema } from "../file/file-dto.js";

const idSchema = z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" });

/** Um pedido vai até um ano. Uma baixa mais longa pede-se em partes. */
export const MAX_ABSENCE_DAYS = 366;

const typeSchema = z.enum(AbsenceType).meta({
    example: AbsenceType.Vacation,
    description:
        "`vacation` (férias), `sick` (baixa), `leave` (outra ausência) ou `unjustified` (falta injustificada, " +
        "que só um admin marca).",
});

/** O que cada um pede para si: uma falta injustificada só a marca um admin. */
const ownTypeSchema = z.enum([AbsenceType.Vacation, AbsenceType.Sick, AbsenceType.Leave]).meta({
    example: AbsenceType.Vacation,
    description: "`vacation` (férias), `sick` (baixa) ou `leave` (outra ausência).",
});

const statusFilter = z.string().trim().toLowerCase().pipe(z.enum(AbsenceStatus)).optional()
    .meta({ example: AbsenceStatus.Pending, description: "Filtra por estado." });

const typeFilter = z.string().trim().toLowerCase().pipe(z.enum(AbsenceType)).optional()
    .meta({ example: AbsenceType.Unjustified, description: "Filtra por tipo." });

const reasonSchema = z.string().trim().min(1).max(1000);

const range = {
    startDate: z.iso.date().meta({ example: "2026-12-21" }),
    endDate: z.iso.date().meta({ example: "2026-12-31", description: "Inclusivo: um dia só tem startDate = endDate." }),
};

const validRange = (absence: { startDate: string; endDate: string }, ctx: z.RefinementCtx) => {
    if (absence.endDate < absence.startDate) {
        ctx.addIssue({ code: "custom", message: "O fim não pode ser antes do início", path: ["endDate"] });
    } else if (daysBetween(absence.startDate, absence.endDate) >= MAX_ABSENCE_DAYS) {
        ctx.addIssue({ code: "custom", message: `Um pedido vai até ${MAX_ABSENCE_DAYS} dias`, path: ["endDate"] });
    }
};

export const createAbsenceSchema = z.object({
    type: ownTypeSchema,
    ...range,
    note: reasonSchema.optional().meta({
        example: "Viagem em família",
        description: "Só a pessoa e os admins a veem.",
    }),
})
    // Validado contra hoje no pedido, e não na definição do schema: o dia muda.
    .superRefine((absence, ctx) => {
        validRange(absence, ctx);

        // Uma baixa ou outra ausência registam-se muitas vezes depois; as férias marcam-se antes.
        if (absence.type === AbsenceType.Vacation && absence.startDate < isoDate()) {
            ctx.addIssue({ code: "custom", message: "As férias não podem começar no passado", path: ["startDate"] });
        }
    })
    .meta({ id: "CreateAbsenceRequest", description: "Pedir uma ausência para si próprio" });

export const registerAbsenceSchema = z.object({
    type: typeSchema,
    ...range,
    note: reasonSchema.optional().meta({
        example: "Não apareceu nem avisou",
        description: "Só a pessoa e os admins a veem.",
    }),
})
    .superRefine((absence, ctx) => {
        validRange(absence, ctx);

        // Uma falta marca-se depois de acontecer, nunca antes.
        if (absence.type === AbsenceType.Unjustified && absence.endDate > isoDate()) {
            ctx.addIssue({ code: "custom", message: "Uma falta não pode ser marcada em dias futuros", path: ["endDate"] });
        }
    })
    .meta({ id: "RegisterAbsenceRequest", description: "Registar uma ausência de outra pessoa, já aprovada" });

/** Só a documentação usa este: o corpo é opcional, e o validateBody recebe o de baixo. */
export const absenceDecisionBodySchema = z.object({
    reason: reasonSchema.optional().meta({
        example: "Já há duas pessoas da equipa fora nessa semana",
        description: "Fica em `decisionNote`, e vai na notificação.",
    }),
}).meta({ id: "AbsenceDecisionRequest", description: "Recusar ou cancelar, com um motivo opcional" });

export const absenceDecisionSchema = absenceDecisionBodySchema.optional();

export const listMyAbsencesQuerySchema = z.object({
    status: statusFilter,
    type: typeFilter,
}).meta({ id: "ListMyAbsencesQuery", description: "Filtros dos meus pedidos" });

export const listAbsencesQuerySchema = z.object({
    companyId: idSchema.optional().meta({ description: "Só para um system_admin. Sem ele, todas as empresas." }),
    userId: idSchema.optional().meta({ description: "Só os pedidos desta pessoa." }),
    status: statusFilter,
    type: typeFilter,
}).meta({ id: "ListAbsencesQuery", description: "Filtros dos pedidos para aprovar" });

export const absenceSummaryQuerySchema = z.object({
    year: yearSchema,
}).meta({ id: "AbsenceSummaryQuery", description: "O ano a contar" });

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
            "Quem o levou ao estado em que está: aprovou, registou, recusou ou cancelou. Num `approved`, null quer " +
            "dizer que foi aprovado automaticamente (uma baixa).",
    }),
    decidedAt: z.iso.datetime().nullable(),
    decisionNote: z.string().nullable(),
    documents: fileListResponseSchema.meta({
        description:
            "As justificações (um atestado, uma declaração), do mais antigo para o mais recente, até 5. Como a " +
            "nota, só a pessoa e os admins as veem: o calendário nunca as mostra.",
    }),
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
    unjustified: z.int().meta({ example: 0, description: "Dias úteis de faltas injustificadas." }),
}).meta({ id: "AbsenceSummary", description: "Dias úteis de ausências aprovadas, por tipo, num ano" });

export type CreateAbsenceRequest = z.infer<typeof createAbsenceSchema>;
export type RegisterAbsenceRequest = z.infer<typeof registerAbsenceSchema>;
export type AbsenceDecisionRequest = z.infer<typeof absenceDecisionSchema>;
export type ListMyAbsencesQuery = z.infer<typeof listMyAbsencesQuerySchema>;
export type ListAbsencesQuery = z.infer<typeof listAbsencesQuerySchema>;
export type AbsenceSummaryQuery = z.infer<typeof absenceSummaryQuerySchema>;
export type AbsenceResponse = z.infer<typeof absenceResponseSchema>;
export type AbsenceSummaryResponse = z.infer<typeof absenceSummaryResponseSchema>;
