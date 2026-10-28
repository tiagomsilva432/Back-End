import { z } from "zod";
import { isoDate } from "../../utils/dates.js";
import { flag } from "../common/fields-dto.js";

const percentSchema = z.int().min(1).max(100).meta({
    example: 60,
    description: "Entre 1 e 100. A soma pode passar os 100: isso reporta-se, não se recusa.",
});

const roleOnProjectSchema = z.string().trim().min(1).max(100).meta({ example: "Backend Developer" });

// O default vive aqui e não na coluna: sem ele o refine das datas não tinha
// startDate para comparar, e um CHECK da base de dados sairia como 500.
const startDateSchema = z.iso.date()
    .default(() => isoDate())
    .meta({ example: "2026-02-01", description: "Por omissão, a data de hoje." });

export const createAllocationSchema = z.object({
    userId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    projectId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    allocationPercent: percentSchema,
    roleOnProject: roleOnProjectSchema.optional(),
    startDate: startDateSchema,
    endDate: z.iso.date().optional().meta({ example: "2026-06-30" }),
})
    .refine((a) => !a.endDate || a.endDate >= a.startDate, {
        message: "A data de fim não pode ser anterior à data de início",
        path: ["endDate"],
    })
    .meta({ id: "CreateAllocationRequest", description: "Alocar uma pessoa a um projeto" });

/**
 * Corpo do PATCH. Junta em vez de substituir: o que for omitido fica como está,
 * e um null explícito limpa o campo. É o contrário do PUT do perfil.
 */
export const patchAllocationSchema = z.object({
    allocationPercent: percentSchema.optional(),
    roleOnProject: roleOnProjectSchema.nullable().optional(),
    endDate: z.iso.date().nullable().optional()
        .meta({ example: "2026-06-30", description: "null reabre a alocação." }),
})
    .refine((patch) => Object.keys(patch).length > 0, { message: "Nada para alterar" })
    .meta({ id: "PatchAllocationRequest", description: "Alterar ou fechar uma alocação" });

export const listAllocationsQuerySchema = z.object({
    open: flag("Só as alocações abertas."),
}).meta({ id: "ListAllocationsQuery", description: "Filtros das alocações" });

export const allocationResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    userId: z.uuid(),
    projectId: z.uuid(),
    allocationPercent: z.int().meta({ example: 60 }),
    roleOnProject: z.string().nullable().meta({ example: "Backend Developer" }),
    startDate: z.string().meta({ example: "2026-02-01" }),
    endDate: z.string().nullable().meta({ example: "2026-06-30" }),
}).meta({ id: "Allocation", description: "Uma alocação de uma pessoa a um projeto" });

export const allocationListResponseSchema = z.array(allocationResponseSchema)
    .meta({ id: "AllocationList", description: "Alocações, da mais recente para a mais antiga" });

export const allocationLoadResponseSchema = z.object({
    userId: z.uuid(),
    totalPercent: z.int().meta({ example: 120 }),
    overAllocated: z.boolean().meta({ example: true, description: "true acima de 100%." }),
}).meta({ id: "AllocationLoad", description: "Carga de alocação de uma pessoa" });

export type CreateAllocationRequest = z.infer<typeof createAllocationSchema>;
export type PatchAllocationRequest = z.infer<typeof patchAllocationSchema>;
export type ListAllocationsQuery = z.infer<typeof listAllocationsQuerySchema>;
export type AllocationResponse = z.infer<typeof allocationResponseSchema>;
export type AllocationLoadResponse = z.infer<typeof allocationLoadResponseSchema>;
