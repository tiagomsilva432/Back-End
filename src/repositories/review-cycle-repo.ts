import { IsNull } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { ReviewCycle } from "../entities/ReviewCycle.js";
import { ReviewRequest } from "../entities/ReviewRequest.js";
import { ReviewRequestStatus } from "../types/enums.js";

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

/**
 * O ciclo e os seus pedidos numa só transação: um ciclo sem os pedidos todos
 * ficava aberto com metade das pessoas de fora. Os pedidos precisam do id do
 * ciclo, por isso vêm de uma função chamada depois de o ciclo ser gravado.
 */
export async function createCycleWithRequests(
    cycle: ReviewCycle,
    buildRequests: (saved: ReviewCycle) => ReviewRequest[],
): Promise<{ cycle: ReviewCycle; requests: ReviewRequest[] }> {
    return await reviewCycleRepo.manager.transaction(async (manager) => {
        const saved = await manager.save(cycle);
        const requests = await manager.save(buildRequests(saved));
        return { cycle: saved, requests };
    });
}

/**
 * Fechar um ciclo expira o que ficou por responder, na mesma transação. Devolve
 * também quem tinha pedidos pendentes, para lhes dizer que expiraram.
 */
export async function closeCycle(
    cycle: ReviewCycle,
): Promise<{ cycle: ReviewCycle; expiredReviewerIds: string[] }> {
    return await reviewCycleRepo.manager.transaction(async (manager) => {
        const pending = await manager.find(ReviewRequest, {
            select: { reviewerId: true },
            where: { cycleId: cycle.id, status: ReviewRequestStatus.Pending },
        });

        cycle.closedAt = new Date();
        const saved = await manager.save(cycle);
        await manager.update(
            ReviewRequest,
            { cycleId: cycle.id, status: ReviewRequestStatus.Pending },
            { status: ReviewRequestStatus.Expired },
        );

        return { cycle: saved, expiredReviewerIds: [...new Set(pending.map((request) => request.reviewerId))] };
    });
}
