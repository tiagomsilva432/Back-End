import { Brackets, In, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { AbsenceRequest } from "../entities/AbsenceRequest.js";
import { User } from "../entities/User.js";
import { AbsenceStatus, type AbsenceType, UserStatus } from "../types/enums.js";

export const absenceRepo = AppDataSource.getRepository(AbsenceRequest);

/** Os que ocupam dias: um recusado ou cancelado já não conta. */
const ACTIVE_STATUSES = [AbsenceStatus.Pending, AbsenceStatus.Approved];

export async function getAbsenceById(id: string): Promise<AbsenceRequest | null> {
    return await absenceRepo.findOneBy({
        id
    });
}

export interface AbsenceFilter {
    companyId?: string;
    userId?: string;
    status?: AbsenceStatus;
    type?: AbsenceType;
}

/** Do que começa mais tarde para o mais cedo. O id desempata os que começam no mesmo dia. */
export async function getAbsences(filter: AbsenceFilter): Promise<AbsenceRequest[]> {
    return await absenceRepo.find({
        where: {
            ...(filter.companyId ? { companyId: filter.companyId } : {}),
            ...(filter.userId ? { userId: filter.userId } : {}),
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.type ? { type: filter.type } : {})
        },
        order: { startDate: "DESC", id: "DESC" }
    });
}

/** As aprovadas de uma pessoa que tocam em [from, to]. Os dias de fora contam-se no controller. */
export async function getApprovedAbsencesBetween(
    userId: string,
    from: string,
    to: string,
): Promise<AbsenceRequest[]> {
    return await absenceRepo.find({
        where: {
            userId,
            status: AbsenceStatus.Approved,
            startDate: LessThanOrEqual(to),
            endDate: MoreThanOrEqual(from)
        },
        order: { startDate: "ASC", id: "ASC" }
    });
}

export interface CalendarAbsenceOptions {
    companyId: string;
    from: string;
    to: string;
    /** Só estas pessoas: o calendário de um projeto. Uma lista vazia dá []. */
    userIds?: string[];
    /** Quem pergunta vê sempre os seus pendentes. */
    viewerId: string;
    /** Um admin vê os pendentes de toda a gente. */
    allPending: boolean;
}

/**
 * O que o calendário mostra num intervalo: as aprovadas, e as pendentes que
 * quem pergunta pode ver. Sem as das contas terminadas.
 */
export async function getCalendarAbsences(options: CalendarAbsenceOptions): Promise<AbsenceRequest[]> {
    if (options.userIds?.length === 0) {
        return [];
    }

    const query = absenceRepo
        .createQueryBuilder("a")
        .innerJoin("a.user", "u")
        .where("a.companyId = :companyId", { companyId: options.companyId })
        .andWhere("a.startDate <= :to AND a.endDate >= :from", { from: options.from, to: options.to })
        .andWhere("u.status <> :terminated", { terminated: UserStatus.Terminated })
        .andWhere(new Brackets((status) => {
            status.where("a.status = :approved", { approved: AbsenceStatus.Approved });

            if (options.allPending) {
                status.orWhere("a.status = :pending", { pending: AbsenceStatus.Pending });
            } else {
                status.orWhere("(a.status = :pending AND a.userId = :viewerId)", {
                    pending: AbsenceStatus.Pending,
                    viewerId: options.viewerId,
                });
            }
        }));

    if (options.userIds) {
        query.andWhere("a.userId IN (:...userIds)", { userIds: options.userIds });
    }

    return await query
        .orderBy("a.startDate", "ASC")
        .addOrderBy("a.id", "ASC")
        .getMany();
}

/**
 * Grava a ausência se não tocar noutra pendente ou aprovada da mesma pessoa, ou
 * devolve null. A linha da pessoa fica trancada até ao fim: dois pedidos ao mesmo
 * tempo (um duplo clique) passavam os dois pela verificação.
 */
export async function createAbsenceIfFree(absence: AbsenceRequest): Promise<AbsenceRequest | null> {
    return await absenceRepo.manager.transaction(async (manager) => {
        await manager.getRepository(User)
            .createQueryBuilder("u")
            .setLock("pessimistic_write")
            .where("u.id = :userId", { userId: absence.userId })
            .getOne();

        const repo = manager.getRepository(AbsenceRequest);
        const overlapping = await repo.findOneBy({
            userId: absence.userId,
            status: In(ACTIVE_STATUSES),
            startDate: LessThanOrEqual(absence.endDate),
            endDate: MoreThanOrEqual(absence.startDate)
        });

        return overlapping ? null : await repo.save(absence);
    });
}

export async function updateAbsence(absence: AbsenceRequest) {
    return await absenceRepo.save(absence);
}
