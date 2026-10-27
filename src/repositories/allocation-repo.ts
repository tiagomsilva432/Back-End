import { IsNull, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Allocation } from "../entities/Allocation.js";
import { UserStatus } from "../types/enums.js";
import { isoDate } from "../utils/dates.js";

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

export interface CoworkerPair {
    reviewerId: string;
    revieweeId: string;
}

/**
 * Pares de colegas de uma empresa: duas pessoas ativas no mesmo projeto com
 * alocações que se sobrepõem, e cuja sobreposição cai entre `since` e `today`.
 * O join é simétrico, por isso cada par sai nos dois sentidos.
 */
export async function getCoworkerPairsByCompanyId(
    companyId: string,
    since: string,
    today: string,
): Promise<CoworkerPair[]> {
    return await allocationRepo
        .createQueryBuilder("a1")
        .innerJoin(Allocation, "a2", "a2.projectId = a1.projectId AND a2.userId <> a1.userId")
        .innerJoin("a1.project", "p")
        .innerJoin("a1.user", "u1")
        .innerJoin("a2.user", "u2")
        .select("a1.userId", "reviewerId")
        .addSelect("a2.userId", "revieweeId")
        .distinct(true)
        .where("p.companyId = :companyId", { companyId })
        .andWhere("u1.status = :active AND u2.status = :active", { active: UserStatus.Active })
        // O troço em comum: do início mais tardio ao fim mais cedo. Tem de existir,
        // e de tocar na janela [since, today].
        .andWhere(
            "GREATEST(a1.startDate, a2.startDate) <= LEAST(COALESCE(a1.endDate, 'infinity'::date), COALESCE(a2.endDate, 'infinity'::date))",
        )
        .andWhere("GREATEST(a1.startDate, a2.startDate) <= :today", { today })
        .andWhere(
            "LEAST(COALESCE(a1.endDate, 'infinity'::date), COALESCE(a2.endDate, 'infinity'::date)) >= :since",
            { since },
        )
        .getRawMany<CoworkerPair>();
}

/** Alocações que contam para a carga: já começaram e ainda não terminaram. */
export async function getActiveAllocationsByUserId(userId: string): Promise<Allocation[]> {
    const hoje = isoDate();

    return await allocationRepo.find({
        where: [
            { userId, startDate: LessThanOrEqual(hoje), endDate: IsNull() },
            { userId, startDate: LessThanOrEqual(hoje), endDate: MoreThanOrEqual(hoje) }
        ],
        order: { startDate: "DESC" }
    });
}

/**
 * Quem está envolvido num projeto: alocações que ainda não terminaram, mesmo as
 * que só começam depois. Não é o mesmo que as abertas (endDate null): uma
 * alocação que fecha no fim do mês ainda conta até lá.
 */
export async function getInvolvedUserIdsByProjectId(projectId: string): Promise<string[]> {
    const hoje = isoDate();

    const allocations = await allocationRepo.find({
        select: { userId: true },
        where: [
            { projectId, endDate: IsNull() },
            { projectId, endDate: MoreThanOrEqual(hoje) }
        ]
    });

    return [...new Set(allocations.map((a) => a.userId))];
}

/** O mesmo do outro lado: os projetos em que uma pessoa está envolvida. */
export async function getInvolvedProjectIdsByUserId(userId: string): Promise<string[]> {
    const hoje = isoDate();

    const allocations = await allocationRepo.find({
        select: { projectId: true },
        where: [
            { userId, endDate: IsNull() },
            { userId, endDate: MoreThanOrEqual(hoje) }
        ]
    });

    return [...new Set(allocations.map((a) => a.projectId))];
}

/**
 * Quem esteve alocado a um projeto em algum dia de [from, to]: o calendário do
 * projeto. Não é o mesmo que os envolvidos, que olham só para hoje.
 */
export async function getUserIdsAllocatedBetween(projectId: string, from: string, to: string): Promise<string[]> {
    const allocations = await allocationRepo.find({
        select: { userId: true },
        where: [
            { projectId, startDate: LessThanOrEqual(to), endDate: IsNull() },
            { projectId, startDate: LessThanOrEqual(to), endDate: MoreThanOrEqual(from) }
        ]
    });

    return [...new Set(allocations.map((a) => a.userId))];
}

/** Os gestores dos projetos em que uma pessoa está alocada em algum dia de [from, to]. */
export async function getManagerIdsOfProjectsAllocatedBetween(
    userId: string,
    from: string,
    to: string,
): Promise<string[]> {
    const rows = await allocationRepo
        .createQueryBuilder("a")
        .innerJoin("a.project", "p")
        .select("p.managerId", "managerId")
        .distinct(true)
        .where("a.userId = :userId", { userId })
        .andWhere("p.managerId IS NOT NULL")
        .andWhere("a.startDate <= :to", { to })
        .andWhere("COALESCE(a.endDate, 'infinity'::date) >= :from", { from })
        .getRawMany<{ managerId: string }>();

    return rows.map((row) => row.managerId);
}

/** As alocações de todos os projetos de uma empresa, de sempre: o custo em pessoas de cada um. */
export async function getAllocationsByCompanyId(companyId: string): Promise<Allocation[]> {
    return await allocationRepo
        .createQueryBuilder("a")
        .innerJoin("a.project", "p")
        .where("p.companyId = :companyId", { companyId })
        .getMany();
}

export async function createAllocation(allocation: Allocation) {
    return await allocationRepo.save(allocation);
}

export async function updateAllocation(allocation: Allocation) {
    return await allocationRepo.save(allocation);
}

export async function deleteAllocation(id: string) {
    return await allocationRepo.delete({
        id
    });
}