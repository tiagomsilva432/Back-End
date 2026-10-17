import type { AllocationResponse } from "../dtos/allocation/allocation-dto.js";
import type { Allocation } from "../entities/Allocation.js";

/** Entidade -> DTO. Não devolve o createdAt, como nos projetos. */
export const toAllocationResponse = (allocation: Allocation): AllocationResponse => ({
    id: allocation.id,
    userId: allocation.userId,
    projectId: allocation.projectId,
    allocationPercent: allocation.allocationPercent,
    roleOnProject: allocation.roleOnProject,
    startDate: allocation.startDate,
    endDate: allocation.endDate,
});
