import { IsNull } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { ReviewRequest } from "../entities/ReviewRequest.js";
import { ReviewRequestStatus } from "../types/enums.js";

export const reviewRequestRepo = AppDataSource.getRepository(ReviewRequest);

export async function getReviewRequestById(id: string): Promise<ReviewRequest | null> {
    return await reviewRequestRepo.findOneBy({
        id
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

/** Um pedido ad-hoc deste par ainda por responder: o segundo seria um duplicado. */
export async function getPendingAdHocRequest(reviewerId: string, revieweeId: string): Promise<ReviewRequest | null> {
    return await reviewRequestRepo.findOneBy({
        reviewerId,
        revieweeId,
        cycleId: IsNull(),
        status: ReviewRequestStatus.Pending
    });
}

/** Quantos pedidos do ciclo há em cada estado, com zero nos que não aparecem. */
export async function countRequestsByStatus(cycleId: string): Promise<Record<ReviewRequestStatus, number>> {
    const rows = await reviewRequestRepo
        .createQueryBuilder("r")
        .select("r.status", "status")
        .addSelect("COUNT(*)::int", "count")
        .where("r.cycleId = :cycleId", { cycleId })
        .groupBy("r.status")
        .getRawMany<{ status: ReviewRequestStatus; count: number }>();

    const counts = Object.fromEntries(
        Object.values(ReviewRequestStatus).map((status) => [status, 0]),
    ) as Record<ReviewRequestStatus, number>;

    for (const row of rows) {
        counts[row.status] = row.count;
    }

    return counts;
}

export async function createReviewRequest(request: ReviewRequest) {
    return await reviewRequestRepo.save(request);
}

export async function updateReviewRequest(request: ReviewRequest) {
    return await reviewRequestRepo.save(request);
}
