import { z } from "zod";
import { ReviewRequestStatus } from "../../types/enums.js";
import { isoDate, monthsAgo } from "../../utils/dates.js";

const companyIdSchema = z.uuid().meta({
    example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
    description:
        "Só o system_admin o indica. Um company_admin usa sempre a sua própria empresa; um valor diferente é recusado com 403.",
});

// Validado contra hoje no pedido, e não na definição do schema: o dia muda.
const notInThePast = (field: string) => (value: string | undefined, ctx: z.RefinementCtx) => {
    if (value && value < isoDate()) {
        ctx.addIssue({ code: "custom", message: "A data não pode ser no passado", path: [field] });
    }
};

//Schema REQUEST createReviewCycle
export const createReviewCycleSchema = z.object({
    companyId: companyIdSchema.optional(),
    name: z.string().trim().min(1).max(100).meta({ example: "Avaliação Q4 2026" }),
    deadline: z.iso.date().optional().meta({
        example: "2026-12-15",
        description: "Passa a ser o dueDate de cada pedido. Sem ele, os pedidos só expiram quando o ciclo fecha.",
    }),
    since: z.iso.date()
        .default(() => monthsAgo(6))
        .meta({
            example: "2026-05-01",
            description:
                "Início da janela de colegas: contam as pessoas que estiveram no mesmo projeto ao mesmo tempo " +
                "entre esta data e hoje. Por omissão, há 6 meses.",
        }),
})
    .superRefine((cycle, ctx) => {
        notInThePast("deadline")(cycle.deadline, ctx);
        if (cycle.since > isoDate()) {
            ctx.addIssue({ code: "custom", message: "A janela não pode começar no futuro", path: ["since"] });
        }
    })
    .meta({ id: "CreateReviewCycleRequest", description: "Abrir um ciclo de avaliação" });

//Schema QUERY listReviewCycles
export const listReviewCyclesQuerySchema = z.object({
    companyId: companyIdSchema.optional(),
    open: z.enum(["true", "false"]).optional().transform((v) => v === "true")
        .meta({ example: "true", description: "Só os ciclos ainda abertos." }),
}).meta({ id: "ListReviewCyclesQuery", description: "Filtros dos ciclos de avaliação" });

//Schema REQUEST createReviewRequest (ad-hoc)
export const createReviewRequestSchema = z.object({
    reviewerId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    revieweeId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a43" }),
    dueDate: z.iso.date().optional().meta({ example: "2026-11-30" }),
})
    .superRefine((request, ctx) => {
        if (request.reviewerId === request.revieweeId) {
            ctx.addIssue({ code: "custom", message: "Ninguém se avalia a si próprio", path: ["revieweeId"] });
        }
        notInThePast("dueDate")(request.dueDate, ctx);
    })
    .meta({ id: "CreateReviewRequestRequest", description: "Pedir uma avaliação fora de um ciclo" });

//Schema QUERY listMyReviewRequests
export const listMyReviewRequestsQuerySchema = z.object({
    status: z.string().trim().toLowerCase().pipe(z.enum(ReviewRequestStatus)).optional()
        .meta({ example: ReviewRequestStatus.Pending, description: "Filtra por estado." }),
}).meta({ id: "ListMyReviewRequestsQuery", description: "Filtros da caixa de pedidos" });

//Schema REQUEST submitReview
export const submitReviewSchema = z.object({
    recommendsRaise: z.boolean().meta({ example: true, description: "Merece um aumento, ou não." }),
    performanceScore: z.int().min(1).max(5).optional().meta({ example: 4, description: "De 1 a 5." }),
    comments: z.string().trim().min(1).max(5000).optional()
        .meta({ example: "Muito autónomo, puxa pela equipa nas revisões de código." }),
}).meta({ id: "SubmitReviewRequest", description: "Responder a um pedido de avaliação" });

//Schema QUERY dos resultados de uma pessoa
export const reviewResultsQuerySchema = z.object({
    cycleId: z.uuid().optional().meta({ description: "Só as avaliações deste ciclo." }),
}).meta({ id: "ReviewResultsQuery", description: "Filtros dos resultados de uma pessoa" });

//Como um ciclo é devolvido
export const reviewCycleResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    companyId: z.uuid(),
    name: z.string().meta({ example: "Avaliação Q4 2026" }),
    openedBy: z.uuid(),
    deadline: z.string().nullable().meta({ example: "2026-12-15" }),
    closedAt: z.iso.datetime().nullable().meta({ example: null, description: "null enquanto está aberto." }),
    createdAt: z.iso.datetime().meta({ example: "2026-10-23T10:30:00.000Z" }),
}).meta({ id: "ReviewCycle", description: "Um ciclo de avaliação" });

export const reviewCycleListResponseSchema = z.array(reviewCycleResponseSchema)
    .meta({ id: "ReviewCycleList", description: "Ciclos, do mais recente para o mais antigo" });

export const createdReviewCycleResponseSchema = reviewCycleResponseSchema.extend({
    requestCount: z.int().meta({ example: 12, description: "Quantos pedidos se criaram. Pode ser 0." }),
}).meta({ id: "CreatedReviewCycle", description: "O ciclo aberto e quantos pedidos gerou" });

export const reviewCycleProgressSchema = z.object({
    [ReviewRequestStatus.Pending]: z.int().meta({ example: 3 }),
    [ReviewRequestStatus.Submitted]: z.int().meta({ example: 8 }),
    [ReviewRequestStatus.Declined]: z.int().meta({ example: 1 }),
    [ReviewRequestStatus.Expired]: z.int().meta({ example: 0 }),
}).meta({ id: "ReviewCycleProgress", description: "Quantos pedidos há em cada estado" });

export const reviewCycleDetailResponseSchema = reviewCycleResponseSchema.extend({
    progress: reviewCycleProgressSchema,
}).meta({ id: "ReviewCycleDetail", description: "Um ciclo e o seu progresso" });

//Como um pedido é devolvido
export const reviewRequestResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    cycleId: z.uuid().nullable().meta({ description: "null num pedido ad-hoc." }),
    reviewerId: z.uuid(),
    revieweeId: z.uuid(),
    status: z.enum(ReviewRequestStatus).meta({ example: ReviewRequestStatus.Pending }),
    dueDate: z.string().nullable().meta({ example: "2026-12-15" }),
}).meta({ id: "ReviewRequest", description: "Um pedido para uma pessoa avaliar outra" });

export const reviewRequestListResponseSchema = z.array(reviewRequestResponseSchema)
    .meta({ id: "ReviewRequestList", description: "Pedidos de avaliação" });

//A avaliação que o próprio reviewer acabou de submeter
export const submittedReviewResponseSchema = z.object({
    id: z.uuid(),
    requestId: z.uuid(),
    recommendsRaise: z.boolean().meta({ example: true }),
    performanceScore: z.int().nullable().meta({ example: 4 }),
    comments: z.string().nullable(),
    submittedAt: z.iso.datetime(),
}).meta({ id: "SubmittedReview", description: "A avaliação submetida, devolvida a quem a escreveu" });

//Os resultados, sem nunca dizer quem avaliou
export const reviewSummaryResponseSchema = z.object({
    revieweeId: z.uuid(),
    requestsReceived: z.int().meta({ example: 5, description: "Pedidos feitos sobre esta pessoa." }),
    reviewsReceived: z.int().meta({ example: 4, description: "Quantos desses foram respondidos." }),
    votesForRaise: z.int().meta({ example: 3 }),
    votesAgainst: z.int().meta({ example: 1 }),
    averageScore: z.number().nullable().meta({ example: 3.75, description: "null se ninguém deu nota." }),
}).meta({ id: "ReviewSummary", description: "Resumo das avaliações de uma pessoa" });

export const reviewSummaryListResponseSchema = z.array(reviewSummaryResponseSchema)
    .meta({ id: "ReviewSummaryList", description: "Resumo por pessoa avaliada" });

export const anonymousReviewResponseSchema = z.object({
    cycleId: z.uuid().nullable(),
    recommendsRaise: z.boolean().meta({ example: true }),
    performanceScore: z.int().nullable().meta({ example: 4 }),
    comments: z.string().nullable(),
    submittedOn: z.string().meta({ example: "2026-11-20", description: "Só o dia: a hora ajudava a adivinhar quem foi." }),
}).meta({ id: "AnonymousReview", description: "Uma avaliação, sem o reviewer nem o pedido" });

export const anonymousReviewListResponseSchema = z.array(anonymousReviewResponseSchema)
    .meta({ id: "AnonymousReviewList", description: "Avaliações recebidas, da melhor nota para a pior" });

export type CreateReviewCycleRequest = z.infer<typeof createReviewCycleSchema>;
export type ListReviewCyclesQuery = z.infer<typeof listReviewCyclesQuerySchema>;
export type CreateReviewRequestRequest = z.infer<typeof createReviewRequestSchema>;
export type ListMyReviewRequestsQuery = z.infer<typeof listMyReviewRequestsQuerySchema>;
export type SubmitReviewRequest = z.infer<typeof submitReviewSchema>;
export type ReviewResultsQuery = z.infer<typeof reviewResultsQuerySchema>;
export type ReviewCycleResponse = z.infer<typeof reviewCycleResponseSchema>;
export type ReviewRequestResponse = z.infer<typeof reviewRequestResponseSchema>;
export type SubmittedReviewResponse = z.infer<typeof submittedReviewResponseSchema>;
export type ReviewSummaryResponse = z.infer<typeof reviewSummaryResponseSchema>;
export type AnonymousReviewResponse = z.infer<typeof anonymousReviewResponseSchema>;
