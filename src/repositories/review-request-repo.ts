import { AppDataSource } from "../data-source.js";
import { ReviewRequest } from "../entities/ReviewRequest.js";
import type { ReviewRequestStatus } from "../types/enums.js";

export const reviewRequestRepo = AppDataSource.getRepository(ReviewRequest);

export async function getReviewRequestById(id: string): Promise<ReviewRequest | null> {
    return await reviewRequestRepo.findOneBy({
        id
    });
}

export async function getReviewRequestByCyclePair(cycleId: string, reviewerId: string, revieweeId: string): Promise<ReviewRequest | null> {
    return await reviewRequestRepo.findOneBy({
        cycleId,
        reviewerId,
        revieweeId
    });
}

export async function getReviewRequestsByCycleId(cycleId: string): Promise<ReviewRequest[]> {
    return await reviewRequestRepo.find({
        where: { cycleId },
        order: { createdAt: "DESC" }
    });
}

export async function getReviewRequestsByReviewerId(reviewerId: string): Promise<ReviewRequest[]> {
    return await reviewRequestRepo.find({
        where: { reviewerId },
        order: { createdAt: "DESC" }
    });
}

export async function getReviewRequestsByReviewerIdAndStatus(reviewerId: string, status: ReviewRequestStatus): Promise<ReviewRequest[]> {
    return await reviewRequestRepo.find({
        where: { reviewerId, status },
        order: { dueDate: "ASC" }
    });
}

export async function getReviewRequestsByRevieweeId(revieweeId: string): Promise<ReviewRequest[]> {
    return await reviewRequestRepo.find({
        where: { revieweeId },
        order: { createdAt: "DESC" }
    });
}

export async function createReviewRequest(request: ReviewRequest) {
    return await reviewRequestRepo.save(request);
}

/** Cycle requests are generated in bulk, one per coworker pair. */
export async function createReviewRequests(requests: ReviewRequest[]) {
    return await reviewRequestRepo.save(requests);
}

export async function updateReviewRequest(request: ReviewRequest) {
    return await reviewRequestRepo.save(request);
}
