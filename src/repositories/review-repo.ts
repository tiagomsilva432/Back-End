import { AppDataSource } from "../data-source.js";
import { Review } from "../entities/Review.js";
import type { ReviewRequest } from "../entities/ReviewRequest.js";
import { ReviewRequestStatus } from "../types/enums.js";
import { reviewRequestRepo } from "./review-request-repo.js";

export const reviewRepo = AppDataSource.getRepository(Review);

export async function getReviewById(id: string): Promise<Review | null> {
    return await reviewRepo.findOneBy({
        id
    });
}

export async function getReviewByRequestId(requestId: string): Promise<Review | null> {
    return await reviewRepo.findOneBy({
        requestId
    });
}

export async function getReviewsByRevieweeId(revieweeId: string): Promise<Review[]> {
    return await reviewRepo.find({
        where: { request: { revieweeId } },
        relations: { request: true },
        order: { submittedAt: "DESC" }
    });
}

export async function getReviewsByCycleId(cycleId: string): Promise<Review[]> {
    return await reviewRepo.find({
        where: { request: { cycleId } },
        relations: { request: true },
        order: { submittedAt: "DESC" }
    });
}

/**
 * Para o admin, sem rasto de quem escreveu: nem o reviewerId nem o requestId
 * saem daqui. Ordena-se pelo conteúdo, nunca pelo tempo, que denunciaria a ordem
 * em que cada colega respondeu.
 */
export async function getAnonymousReviews(revieweeId: string, cycleId?: string): Promise<Review[]> {
    return await reviewRepo.find({
        where: { request: { revieweeId, ...(cycleId ? { cycleId } : {}) } },
        relations: { request: true },
        order: {
            performanceScore: { direction: "DESC", nulls: "LAST" },
            recommendsRaise: "DESC",
            comments: { direction: "ASC", nulls: "LAST" }
        }
    });
}

export interface ReviewSummaryRow {
    revieweeId: string;
    requestsReceived: number;
    reviewsReceived: number;
    votesForRaise: number;
    votesAgainst: number;
    averageScore: number | null;
}

/**
 * O mesmo que a vista v_raise_review_summary, mas a partir dos pedidos: quem foi
 * pedido e ainda não recebeu nada aparece com zeros em vez de desaparecer.
 */
export async function getReviewSummaries(filters: { revieweeId?: string; cycleId?: string }): Promise<ReviewSummaryRow[]> {
    const query = reviewRequestRepo
        .createQueryBuilder("rr")
        .leftJoin("rr.review", "rv")
        .select("rr.revieweeId", "revieweeId")
        .addSelect("COUNT(*)::int", "requestsReceived")
        .addSelect("COUNT(rv.id)::int", "reviewsReceived")
        .addSelect("(COUNT(rv.id) FILTER (WHERE rv.recommendsRaise))::int", "votesForRaise")
        .addSelect("(COUNT(rv.id) FILTER (WHERE NOT rv.recommendsRaise))::int", "votesAgainst")
        .addSelect("ROUND(AVG(rv.performanceScore), 2)::float8", "averageScore")
        .groupBy("rr.revieweeId")
        .orderBy("rr.revieweeId");

    if (filters.revieweeId) {
        query.andWhere("rr.revieweeId = :revieweeId", { revieweeId: filters.revieweeId });
    }

    if (filters.cycleId) {
        query.andWhere("rr.cycleId = :cycleId", { cycleId: filters.cycleId });
    }

    return await query.getRawMany<ReviewSummaryRow>();
}

/** A resposta e o estado do pedido mudam juntos, ou nenhum muda. */
export async function submitReview(request: ReviewRequest, review: Review): Promise<Review> {
    return await reviewRepo.manager.transaction(async (manager) => {
        const saved = await manager.save(review);
        request.status = ReviewRequestStatus.Submitted;
        await manager.save(request);
        return saved;
    });
}

export async function createReview(review: Review) {
    return await reviewRepo.save(review);
}

export async function updateReview(review: Review) {
    return await reviewRepo.save(review);
}
