import { z } from "zod";
import { ExpenseCategory, ProjectStatus } from "../../types/enums.js";
import { isoDate } from "../../utils/dates.js";
import { csvList } from "../common/fields-dto.js";
import { expenseCategorySchema } from "../expense/expense-dto.js";

/** O painel cobre até dois anos: a resposta não cresce sem limite. */
export const MAX_OVERVIEW_MONTHS = 24;

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Mês inválido: usa AAAA-MM" });

const currentYear = () => isoDate().slice(0, 4);

const monthIndex = (month: string): number => {
    const [year, m] = month.split("-").map(Number) as [number, number];
    return year * 12 + m;
};

//Schema QUERY financeOverview
export const financeOverviewQuerySchema = z.object({
    from: monthSchema.default(() => `${currentYear()}-01`)
        .meta({ example: "2026-01", description: "Primeiro mês, inclusivo. Por omissão, janeiro deste ano." }),
    to: monthSchema.default(() => `${currentYear()}-12`)
        .meta({ example: "2026-12", description: "Último mês, inclusivo. Por omissão, dezembro deste ano." }),
    companyId: z.uuid().optional().meta({ description: "Só para um system_admin, e obrigatório para ele." }),
    projectIds: csvList(z.uuid()).meta({
        example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42,0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a43",
        description:
            "Separados por vírgulas. Só estes projetos, nas despesas de projeto e em `byProject`. " +
            "Os salários e as despesas da empresa não mudam.",
    }),
    categories: csvList(expenseCategorySchema).meta({
        example: "software,travel",
        description: "Separadas por vírgulas. Só estas categorias, nas despesas de projeto e da empresa.",
    }),
})
    .superRefine((query, ctx) => {
        if (query.to < query.from) {
            ctx.addIssue({ code: "custom", message: "O fim não pode ser antes do início", path: ["to"] });
        } else if (monthIndex(query.to) - monthIndex(query.from) >= MAX_OVERVIEW_MONTHS) {
            ctx.addIssue({ code: "custom", message: `O intervalo vai até ${MAX_OVERVIEW_MONTHS} meses`, path: ["to"] });
        }
    })
    .meta({ id: "FinanceOverviewQuery", description: "Os meses e os filtros do painel" });

const money = (example: string, description?: string) =>
    z.string().meta({ example, ...(description ? { description } : {}) });

const series = {
    salaries: money("43312.50", "O custo dos salários para a empresa (ver `salaryCostFactor`), até hoje."),
    projectExpenses: money("8200.00", "As despesas dos projetos."),
    overheadExpenses: money("3100.00", "As despesas da empresa, sem projeto."),
    total: money(
        "54612.50",
        "A soma das três. O custo em pessoas dos projetos já está nos salários, e não se soma outra vez.",
    ),
};

const categoryAmountSchema = z.object({
    category: z.enum(ExpenseCategory).meta({ example: ExpenseCategory.Software }),
    amount: money("1249.90"),
}).meta({ id: "CategoryAmount", description: "O total de uma categoria" });

export const financeOverviewResponseSchema = z.object({
    companyId: z.uuid(),
    from: z.string().meta({ example: "2026-01" }),
    to: z.string().meta({ example: "2026-12" }),
    salaryCostFactor: z.number().meta({
        example: 1.44375,
        description:
            "Por cada euro de salário bruto mensal, quanto custa à empresa. Em Portugal, 14 salários em 12 " +
            "meses mais a TSU (23,75%): 1,44375. Noutro país, 1.",
    }),
    totals: z.object(series).meta({ id: "FinanceTotals", description: "Os totais do intervalo" }),
    months: z.array(z.object({ month: z.string().meta({ example: "2026-03" }), ...series })
        .meta({ id: "FinanceMonth", description: "Um mês do intervalo" })),
    byCategory: z.array(categoryAmountSchema).meta({
        description: "As despesas (de projeto e da empresa) por categoria, pela mesma ordem sempre, com as que ficam a zero.",
    }),
    byProject: z.array(z.object({
        projectId: z.uuid(),
        projectName: z.string().meta({ example: "Portal do Cliente" }),
        status: z.enum(ProjectStatus),
        budget: z.string().nullable().meta({ example: "125000.00" }),
        expenses: money("8200.00", "As despesas do projeto no intervalo, com os filtros."),
        labourCost: money("32100.00", "O custo em pessoas do projeto no intervalo: parte dos salários."),
        spentToDate: money(
            "97500.00",
            "Desde o início do projeto até hoje: despesas e pessoas, sem filtros. É o que se compara com o orçamento.",
        ),
        budgetUsedPercent: z.number().nullable().meta({
            example: 78,
            description: "`spentToDate` em percentagem do orçamento. null sem orçamento.",
        }),
    }).meta({ id: "FinanceProject", description: "Um projeto no painel" })),
    unallocatedSalaries: money(
        "11212.50",
        "A parte dos salários do intervalo que não cabe a nenhum projeto: quem está sem alocação, ou alocado a menos de 100%.",
    ),
}).meta({ id: "FinanceOverview", description: "O painel de finanças de uma empresa" });

export const projectFinanceResponseSchema = z.object({
    projectId: z.uuid(),
    budget: z.string().nullable().meta({ example: "125000.00" }),
    includesLabour: z.boolean().meta({
        description:
            "true para os admins. Para o gestor de um projeto, false: não há `labourCost`, e `spent` são só as despesas.",
    }),
    expenses: money("8200.00", "Todas as despesas do projeto até hoje."),
    labourCost: money("89300.00", "O custo em pessoas até hoje. Só para os admins.").optional(),
    spent: money("97500.00", "As despesas, mais as pessoas quando `includesLabour`."),
    remaining: z.string().nullable().meta({
        example: "27500.00",
        description: "O orçamento menos `spent`. Negativo quando passou. null sem orçamento.",
    }),
    budgetUsedPercent: z.number().nullable().meta({ example: 78, description: "null sem orçamento." }),
    byCategory: z.array(categoryAmountSchema),
    months: z.array(z.object({
        month: z.string().meta({ example: "2026-03" }),
        expenses: money("1200.00"),
        labourCost: money("7215.00", "Só para os admins.").optional(),
    })).meta({ description: "Do primeiro mês com alguma coisa (início, alocação ou despesa) até este." }),
}).meta({ id: "ProjectFinance", description: "O orçamento de um projeto contra o que já se gastou" });

export type FinanceOverviewQuery = z.infer<typeof financeOverviewQuerySchema>;
export type FinanceOverviewResponse = z.infer<typeof financeOverviewResponseSchema>;
export type ProjectFinanceResponse = z.infer<typeof projectFinanceResponseSchema>;
