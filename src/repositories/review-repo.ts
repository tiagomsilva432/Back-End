import { AppDataSource } from "../data-source.js";
import { Review } from "../entities/Review.js";

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

export async function createReview(review: Review) {
    return await reviewRepo.save(review);
}

export async function updateReview(review: Review) {
    return await reviewRepo.save(review);
}
