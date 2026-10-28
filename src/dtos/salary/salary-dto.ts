import { z } from "zod";
import { isoDate } from "../../utils/dates.js";
import { decimalString } from "../common/fields-dto.js";

// NUMERIC(12,2): 10 dígitos inteiros.
const amountSchema = decimalString(10, 2, "Montante inválido: usa no máximo 10 dígitos e 2 casas decimais");

export const createSalarySchema = z.object({
    amount: amountSchema.meta({ example: "2150.00", description: "Bruto mensal. Não pode ser negativo." }),
    currency: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{3}$/, {
        message: "Moeda inválida: use o código de 3 letras (por exemplo, EUR)",
    })).default("EUR").meta({ example: "EUR" }),
    effectiveFrom: z.iso.date()
        .default(() => isoDate())
        .meta({
            example: "2026-11-01",
            description: "Por omissão, a data de hoje. Pode ser futura: um aumento agendado.",
        }),
    reason: z.string().trim().min(1).max(255).optional().meta({ example: "Aumento anual" }),
}).meta({ id: "CreateSalaryRequest", description: "Definir o salário seguinte de uma pessoa" });

export const salaryResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    userId: z.uuid(),
    amount: z.string().meta({ example: "2150.00" }),
    currency: z.string().meta({ example: "EUR" }),
    effectiveFrom: z.string().meta({ example: "2026-11-01" }),
    effectiveTo: z.string().nullable().meta({
        example: null,
        description: "Exclusivo: é o dia em que o salário seguinte começa. null no mais recente.",
    }),
    reason: z.string().nullable().meta({ example: "Aumento anual" }),
    createdBy: z.uuid().meta({ description: "Quem o definiu." }),
    createdAt: z.iso.datetime().meta({ example: "2026-10-21T10:30:00.000Z" }),
}).meta({ id: "Salary", description: "Um salário de uma pessoa" });

export const salaryListResponseSchema = z.array(salaryResponseSchema)
    .meta({ id: "SalaryList", description: "Histórico de salários, do mais recente para o mais antigo" });

export type CreateSalaryRequest = z.infer<typeof createSalarySchema>;
export type SalaryResponse = z.infer<typeof salaryResponseSchema>;
