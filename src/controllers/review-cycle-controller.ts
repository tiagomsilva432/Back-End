import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type {
    CreateReviewCycleRequest,
    ListReviewCyclesQuery,
    ReviewResultsQuery,
} from "../dtos/review/review-dto.js";
import type { ReviewCycle } from "../entities/ReviewCycle.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { getCoworkerPairsByCompanyId } from "../repositories/allocation-repo.js";
import { getCompanyById } from "../repositories/company-repo.js";
import {
    closeCycle,
    createCycleWithRequests,
    getOpenReviewCyclesByCompanyId,
    getReviewCycleByCompanyIdAndName,
    getReviewCycleById,
    getReviewCyclesByCompanyId,
    reviewCycleRepo,
} from "../repositories/review-cycle-repo.js";
import { getAnonymousReviews, getReviewSummaries } from "../repositories/review-repo.js";
import {
    countRequestsByStatus,
    getReviewRequestsByCycleId,
    reviewRequestRepo,
} from "../repositories/review-request-repo.js";
import { getUserById, getUsersByIds } from "../repositories/user-repo.js";
import { canAdministerAccount } from "../services/account-policy.js";
import { requireInReach, resolveCompanyScope } from "../services/company-scope.js";
import {
    toAnonymousReviewResponse,
    toReviewCycleResponse,
    toReviewRequestResponse,
    toReviewSummaryResponse,
} from "../services/review-mapper.js";
import { requireUserInReach } from "../services/user-scope.js";
import { isoDate } from "../utils/dates.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Ciclo não encontrado";
const USER_NOT_FOUND = "Utilizador não encontrado";

const requireCycle = async (actor: User, id: string): Promise<ReviewCycle> =>
    requireInReach(actor, await getReviewCycleById(id), NOT_FOUND);

/**
 * Quem lê os resultados de uma pessoa: quem administra a conta dela, e nunca a
 * própria. Um company_admin que entrou num ciclo também não vê os seus.
 */
const canReadResults = (actor: User, target: Pick<User, "id" | "role">): boolean =>
    target.id !== actor.id && canAdministerAccount(actor.role, target.role);

const requireResultsReader = async (actor: User, userId: string): Promise<User> => {
    const target = requireUserInReach(actor, await getUserById(userId), USER_NOT_FOUND);

    if (!canReadResults(actor, target)) {
        throw new HttpError(403, "Sem permissões para ver as avaliações desta pessoa");
    }

    return target;
};

/** Um cycleId no filtro tem de estar ao alcance, como qualquer outro id. */
const requireCycleFilter = async (actor: User, cycleId: string | undefined): Promise<void> => {
    if (cycleId) {
        await requireCycle(actor, cycleId);
    }
};

export const createReviewCycle = async (req: Request, res: Response) => {
    const body = req.body as CreateReviewCycleRequest;
    const actor: User = getCurrentActor(req);

    const companyId = resolveCompanyScope(actor, body.companyId, "Só pode abrir ciclos na sua empresa");

    if (!(await getCompanyById(companyId))) {
        throw new HttpError(404, "Empresa não encontrada");
    }

    if (await getReviewCycleByCompanyIdAndName(companyId, body.name)) {
        throw new HttpError(409, "Já existe um ciclo com este nome nesta empresa");
    }

    const pairs = await getCoworkerPairsByCompanyId(companyId, body.since, isoDate());

    const { cycle, requests } = await createCycleWithRequests(
        reviewCycleRepo.create({
            companyId,
            name: body.name,
            openedBy: actor.id,
            deadline: body.deadline ?? null,
            closedAt: null,
        }),
        (saved) => pairs.map((pair) => reviewRequestRepo.create({
            companyId,
            cycleId: saved.id,
            requestedBy: actor.id,
            reviewerId: pair.reviewerId,
            revieweeId: pair.revieweeId,
            dueDate: saved.deadline,
        })),
    );

    return new HttpResponse(201, "Ciclo aberto", undefined, {
        ...toReviewCycleResponse(cycle),
        requestCount: requests.length,
    }).send(res);
}

export const listReviewCycles = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListReviewCyclesQuery;

    const companyId = resolveCompanyScope(actor, query.companyId, "Só pode ver a sua empresa");

    const cycles = query.open
        ? await getOpenReviewCyclesByCompanyId(companyId)
        : await getReviewCyclesByCompanyId(companyId);

    return new HttpResponse(200, "Ciclos", undefined, cycles.map(toReviewCycleResponse)).send(res);
}

export const getReviewCycle = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const cycle = await requireCycle(actor, id);
    const progress = await countRequestsByStatus(id);

    return new HttpResponse(200, "Ciclo", undefined, { ...toReviewCycleResponse(cycle), progress }).send(res);
}

/** Quem avalia quem, e em que estado está. O conteúdo das avaliações nunca sai daqui. */
export const listReviewCycleRequests = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    await requireCycle(actor, id);

    const requests = await getReviewRequestsByCycleId(id);

    return new HttpResponse(200, "Pedidos do ciclo", undefined, requests.map(toReviewRequestResponse)).send(res);
}

export const closeReviewCycle = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const cycle = await requireCycle(actor, id);

    if (cycle.closedAt) {
        throw new HttpError(409, "Este ciclo já está fechado");
    }

    const closed = await closeCycle(cycle);

    return new HttpResponse(200, "Ciclo fechado", undefined, toReviewCycleResponse(closed)).send(res);
}

export const getReviewCycleResults = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    await requireCycle(actor, id);

    const rows = await getReviewSummaries({ cycleId: id });
    const reviewees = new Map(
        (await getUsersByIds(rows.map((row) => row.revieweeId))).map((user) => [user.id, user]),
    );

    // As mesmas regras do resumo de uma pessoa: um company_admin não vê as suas
    // nem as de outro company_admin, mesmo dentro de um ciclo da sua empresa.
    const visible = rows.filter((row) => {
        const reviewee = reviewees.get(row.revieweeId);
        return reviewee !== undefined && canReadResults(actor, reviewee);
    });

    return new HttpResponse(
        200,
        "Resultados do ciclo",
        undefined,
        visible.map((row) => toReviewSummaryResponse(row.revieweeId, row)),
    ).send(res);
}

export const getUserReviewSummary = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, USER_NOT_FOUND);
    const query = req.validQuery as ReviewResultsQuery;

    await requireResultsReader(actor, id);
    await requireCycleFilter(actor, query.cycleId);

    const [row] = await getReviewSummaries({
        revieweeId: id,
        ...(query.cycleId ? { cycleId: query.cycleId } : {}),
    });

    return new HttpResponse(200, "Resumo das avaliações", undefined, toReviewSummaryResponse(id, row)).send(res);
}

export const listUserReviews = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, USER_NOT_FOUND);
    const query = req.validQuery as ReviewResultsQuery;

    await requireResultsReader(actor, id);
    await requireCycleFilter(actor, query.cycleId);

    const reviews = await getAnonymousReviews(id, query.cycleId);

    return new HttpResponse(200, "Avaliações", undefined, reviews.map(toAnonymousReviewResponse)).send(res);
}
