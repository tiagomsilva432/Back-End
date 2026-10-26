import type {
    AnonymousReviewResponse,
    ReviewCycleResponse,
    ReviewRequestResponse,
    ReviewSummaryResponse,
    SubmittedReviewResponse,
} from "../dtos/review/review-dto.js";
import type { Review } from "../entities/Review.js";
import type { ReviewCycle } from "../entities/ReviewCycle.js";
import type { ReviewRequest } from "../entities/ReviewRequest.js";
import type { ReviewSummaryRow } from "../repositories/review-repo.js";
import { isoDate } from "../utils/dates.js";

export const toReviewCycleResponse = (cycle: ReviewCycle): ReviewCycleResponse => ({
    id: cycle.id,
    companyId: cycle.companyId,
    name: cycle.name,
    openedBy: cycle.openedBy,
    deadline: cycle.deadline,
    closedAt: cycle.closedAt ? cycle.closedAt.toISOString() : null,
    createdAt: cycle.createdAt.toISOString(),
});

export const toReviewRequestResponse = (request: ReviewRequest): ReviewRequestResponse => ({
    id: request.id,
    cycleId: request.cycleId,
    reviewerId: request.reviewerId,
    revieweeId: request.revieweeId,
    status: request.status,
    dueDate: request.dueDate,
});

export const toSubmittedReviewResponse = (review: Review): SubmittedReviewResponse => ({
    id: review.id,
    requestId: review.requestId,
    recommendsRaise: review.recommendsRaise,
    performanceScore: review.performanceScore,
    comments: review.comments,
    submittedAt: review.submittedAt.toISOString(),
});

/** Campo a campo de propósito: o reviewerId e o requestId nunca entram aqui. */
export const toAnonymousReviewResponse = (review: Review): AnonymousReviewResponse => ({
    cycleId: review.request.cycleId,
    recommendsRaise: review.recommendsRaise,
    performanceScore: review.performanceScore,
    comments: review.comments,
    submittedOn: isoDate(review.submittedAt),
});

/** Quem nunca foi pedido não tem linha: aparece com zeros. */
export const toReviewSummaryResponse = (
    revieweeId: string,
    row: ReviewSummaryRow | undefined,
): ReviewSummaryResponse => ({
    revieweeId,
    requestsReceived: row?.requestsReceived ?? 0,
    reviewsReceived: row?.reviewsReceived ?? 0,
    votesForRaise: row?.votesForRaise ?? 0,
    votesAgainst: row?.votesAgainst ?? 0,
    averageScore: row?.averageScore ?? null,
});
