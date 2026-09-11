import { In, IsNull, Not } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Allocation } from "../entities/Allocation.js";

export const allocationRepo = AppDataSource.getRepository(Allocation);

export async function getAllocationById(id: string): Promise<Allocation | null> {
    return await allocationRepo.findOneBy({
        id
    });
}

export async function getAllocationsByUserId(userId: string): Promise<Allocation[]> {
    return await allocationRepo.find({
        where: { userId },
        order: { startDate: "DESC" }
    });
}

export async function getAllocationsByProjectId(projectId: string): Promise<Allocation[]> {
    return await allocationRepo.find({
        where: { projectId },
        order: { startDate: "DESC" }
    });
}

export async function getOpenAllocationsByUserId(userId: string): Promise<Allocation[]> {
    return await allocationRepo.find({
        where: { userId, endDate: IsNull() },
        order: { startDate: "DESC" }
    });
}

export async function getOpenAllocationsByProjectId(projectId: string): Promise<Allocation[]> {
    return await allocationRepo.find({
        where: { projectId, endDate: IsNull() },
        order: { startDate: "DESC" }
    });
}

export async function getOpenAllocation(userId: string, projectId: string): Promise<Allocation | null> {
    return await allocationRepo.findOneBy({
        userId,
        projectId,
        endDate: IsNull()
    });
}

export async function getCoworkerIdsByUserId(userId: string): Promise<string[]> {
    const myAllocations = await getOpenAllocationsByUserId(userId);

    if (myAllocations.length === 0) {
        return [];
    }

    const shared = await allocationRepo.find({
        where: {
            projectId: In(myAllocations.map((allocation) => allocation.projectId)),
            userId: Not(userId),
            endDate: IsNull()
        }
    });

    return [...new Set(shared.map((allocation) => allocation.userId))];
}

export async function createAllocation(allocation: Allocation) {
    return await allocationRepo.save(allocation);
}

export async function updateAllocation(allocation: Allocation) {
    return await allocationRepo.save(allocation);
}