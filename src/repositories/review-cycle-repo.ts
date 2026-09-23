import { IsNull } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { ReviewCycle } from "../entities/ReviewCycle.js";

export const reviewCycleRepo = AppDataSource.getRepository(ReviewCycle);

export async function getReviewCycleById(id: string): Promise<ReviewCycle | null> {
    return await reviewCycleRepo.findOneBy({
        id
    });
}

export async function getReviewCycleByCompanyIdAndName(companyId: string, name: string): Promise<ReviewCycle | null> {
    return await reviewCycleRepo.findOneBy({
        companyId,
        name
    });
}

export async function getReviewCyclesByCompanyId(companyId: string): Promise<ReviewCycle[]> {
    return await reviewCycleRepo.find({
        where: { companyId },
        order: { createdAt: "DESC" }
    });
}

export async function getOpenReviewCyclesByCompanyId(companyId: string): Promise<ReviewCycle[]> {
    return await reviewCycleRepo.find({
        where: { companyId, closedAt: IsNull() },
        order: { createdAt: "DESC" }
    });
}

export async function createReviewCycle(cycle: ReviewCycle) {
    return await reviewCycleRepo.save(cycle);
}

export async function updateReviewCycle(cycle: ReviewCycle) {
    return await reviewCycleRepo.save(cycle);
}
