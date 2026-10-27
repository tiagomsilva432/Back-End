import { z } from "zod";
import { ExpenseCategory } from "../../types/enums.js";
import { isoDate } from "../../utils/dates.js";
import { companyIdSchema, decimalString, flag } from "../common/fields-dto.js";
import { fileListResponseSchema } from "../file/file-dto.js";

const idSchema = z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" });

// NUMERIC(12,2): 10 dígitos inteiros. O CHECK pede mais do que zero.
const amountSchema = decimalString(10, 2, "Montante inválido: usa no máximo 10 dígitos e 2 casas decimais")
    .refine((amount) => amount !== "0.00", { message: "O montante tem de ser maior que zero" });

export const expenseCategorySchema = z.string().trim().toLowerCase().pipe(z.enum(ExpenseCategory)).meta({
    example: ExpenseCategory.Software,
    description: "`software`, `hardware`, `travel`, `services`, `office` ou `other`.",
});

// Validado contra hoje no pedido, e não na definição do schema: o dia muda.
const incurredOnSchema = z.iso.date()
    .refine((date) => date <= isoDate(), { message: "Uma despesa não pode ter data futura" });

const titleSchema = z.string().trim().min(1).max(150).meta({ example: "Licenças JetBrains" });

const descriptionSchema = z.string().trim().min(1).max(2000)
    .meta({ example: "Renovação anual, 5 lugares" });

//Schema REQUEST createExpense
export const createExpenseSchema = z.object({
    projectId: idSchema.optional().meta({
        description:
            "O projeto da despesa. Sem ele, é uma despesa da empresa (renda, licenças, equipamento), " +
            "que só os admins registam.",
    }),
    companyId: companyIdSchema.optional().meta({
        description:
            "Só numa despesa da empresa, e só para um system_admin. Numa despesa de projeto, a empresa é a do projeto.",
    }),
    title: titleSchema,
    description: descriptionSchema.optional(),
    amount: amountSchema.meta({ example: "1249.90", description: "Maior do que zero." }),
    category: expenseCategorySchema,
    incurredOn: incurredOnSchema.default(() => isoDate()).meta({
        example: "2026-10-20",
        description: "O dia em que se gastou: é o que os gráficos usam. Por omissão, hoje. Nunca no futuro.",
    }),
})
    .refine((expense) => !(expense.projectId && expense.companyId), {
        message: "Numa despesa de projeto, a empresa é a do projeto",
        path: ["companyId"],
    })
    .meta({ id: "CreateExpenseRequest", description: "Registar uma despesa" });

/**
 * Corpo do PATCH. Junta em vez de substituir: o que for omitido fica como está,
 * e um null explícito limpa a descrição. O projeto de uma despesa não muda.
 */
export const patchExpenseSchema = z.object({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    amount: amountSchema.optional().meta({ example: "1249.90" }),
    category: expenseCategorySchema.optional(),
    incurredOn: incurredOnSchema.optional().meta({ example: "2026-10-20" }),
})
    .refine((patch) => Object.keys(patch).length > 0, { message: "Nada para alterar" })
    .meta({ id: "PatchExpenseRequest", description: "Alterar uma despesa" });

//Schema QUERY listExpenses
export const listExpensesQuerySchema = z.object({
    companyId: idSchema.optional().meta({ description: "Só para um system_admin, e obrigatório sem `projectId`." }),
    projectId: idSchema.optional().meta({
        description: "Só as deste projeto. Para o gestor de um projeto, que não é admin, é obrigatório.",
    }),
    overhead: flag("Só as despesas da empresa, sem projeto."),
    category: z.string().trim().toLowerCase().pipe(z.enum(ExpenseCategory)).optional()
        .meta({ example: ExpenseCategory.Travel, description: "Filtra por categoria." }),
    from: z.iso.date().optional().meta({ example: "2026-01-01", description: "Desde este dia, inclusivo." }),
    to: z.iso.date().optional().meta({ example: "2026-12-31", description: "Até este dia, inclusivo." }),
})
    .superRefine((query, ctx) => {
        if (query.projectId && query.overhead) {
            ctx.addIssue({ code: "custom", message: "Uma despesa da empresa não tem projeto", path: ["overhead"] });
        }
        if (query.from && query.to && query.to < query.from) {
            ctx.addIssue({ code: "custom", message: "O fim não pode ser antes do início", path: ["to"] });
        }
    })
    .meta({ id: "ListExpensesQuery", description: "Filtros da listagem de despesas" });

//Como uma despesa é devolvida
export const expenseResponseSchema = z.object({
    id: idSchema,
    companyId: z.uuid(),
    projectId: z.uuid().nullable().meta({ description: "null numa despesa da empresa." }),
    title: z.string().meta({ example: "Licenças JetBrains" }),
    description: z.string().nullable().meta({ example: "Renovação anual, 5 lugares" }),
    amount: z.string().meta({ example: "1249.90" }),
    category: z.enum(ExpenseCategory).meta({ example: ExpenseCategory.Software }),
    incurredOn: z.iso.date().meta({ example: "2026-10-20" }),
    createdBy: z.uuid().meta({ description: "Quem a registou." }),
    receipts: fileListResponseSchema.meta({
        description:
            "Os recibos, do mais antigo para o mais recente, até 5. Um recibo que também está noutra despesa da " +
            "empresa traz o id dela em `duplicateOwnerIds`.",
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).meta({ id: "Expense", description: "Uma despesa" });

export const expenseListResponseSchema = z.array(expenseResponseSchema)
    .meta({ id: "ExpenseList", description: "Despesas, da mais recente para a mais antiga" });

export type CreateExpenseRequest = z.infer<typeof createExpenseSchema>;
export type PatchExpenseRequest = z.infer<typeof patchExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type ExpenseResponse = z.infer<typeof expenseResponseSchema>;
