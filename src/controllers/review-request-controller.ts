import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type {
    CreateReviewRequestRequest,
    ListMyReviewRequestsQuery,
    SubmitReviewRequest,
} from "../dtos/review/review-dto.js";
import type { ReviewRequest } from "../entities/ReviewRequest.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { reviewRepo, submitReview as saveReview } from "../repositories/review-repo.js";
import {
    createReviewRequest as saveReviewRequest,
    getPendingAdHocRequest,
    getReviewRequestById,
    getReviewRequestsByReviewerId,
    getReviewRequestsByReviewerIdAndStatus,
    reviewRequestRepo,
    updateReviewRequest,
} from "../repositories/review-request-repo.js";
import { getUserById } from "../repositories/user-repo.js";
import { notifier } from "../services/notifier.js";
import { toReviewRequestResponse, toSubmittedReviewResponse } from "../services/review-mapper.js";
import { requireUserInReach } from "../services/user-scope.js";
import { ReviewRequestStatus, UserStatus } from "../types/enums.js";
import { isoDate } from "../utils/dates.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Pedido não encontrado";
const USER_NOT_FOUND = "Utilizador não encontrado";

/**
 * O pedido tem de ser de quem responde: o de outra pessoa dá o mesmo 404 de um
 * que não existe. Um pedido fora de prazo expira aqui, à primeira tentativa.
 */
const requireOwnPendingRequest = async (actor: User, id: string): Promise<ReviewRequest> => {
    const request = await getReviewRequestById(id);

    if (!request || request.reviewerId !== actor.id) {
        throw new HttpError(404, NOT_FOUND);
    }

    if (request.status !== ReviewRequestStatus.Pending) {
        throw new HttpError(409, "Este pedido já não está pendente");
    }

    if (request.dueDate && request.dueDate < isoDate()) {
        request.status = ReviewRequestStatus.Expired;
        await updateReviewRequest(request);
        throw new HttpError(409, "O prazo deste pedido terminou");
    }

    return request;
};

export const createAdHocReviewRequest = async (req: Request, res: Response) => {
    const body = req.body as CreateReviewRequestRequest;
    const actor: User = getCurrentActor(req);

    const reviewer = requireUserInReach(actor, await getUserById(body.reviewerId), USER_NOT_FOUND);
    const reviewee = requireUserInReach(actor, await getUserById(body.revieweeId), USER_NOT_FOUND);

    // Mesma resposta de um utilizador desconhecido: um system_admin alcança as
    // duas empresas, mas um par entre empresas não existe.
    if (reviewer.companyId !== reviewee.companyId) {
        throw new HttpError(404, USER_NOT_FOUND);
    }

    if (reviewer.status !== UserStatus.Active || reviewee.status !== UserStatus.Active) {
        throw new HttpError(409, "Só contas ativas podem avaliar ou ser avaliadas");
    }

    if (await getPendingAdHocRequest(reviewer.id, reviewee.id)) {
        throw new HttpError(409, "Já existe um pedido por responder entre estas duas pessoas");
    }

    const created = await saveReviewRequest(
        reviewRequestRepo.create({
            companyId: reviewee.companyId,
            cycleId: null,
            requestedBy: actor.id,
            reviewerId: reviewer.id,
            revieweeId: reviewee.id,
            dueDate: body.dueDate ?? null,
        }),
    );

    await notifier.notify("review_request.created", {
        companyId: created.companyId,
        recipientIds: [created.reviewerId],
        exclude: [actor.id],
        data: { requestId: created.id, revieweeId: created.revieweeId, dueDate: created.dueDate },
    });

    return new HttpResponse(201, "Pedido criado", undefined, toReviewRequestResponse(created)).send(res);
}

export const listMyReviewRequests = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListMyReviewRequestsQuery;

    const requests = query.status
        ? await getReviewRequestsByReviewerIdAndStatus(actor.id, query.status)
        : await getReviewRequestsByReviewerId(actor.id);

    return new HttpResponse(200, "Pedidos", undefined, requests.map(toReviewRequestResponse)).send(res);
}

export const submitReview = async (req: Request, res: Response) => {
    const body = req.body as SubmitReviewRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const request = await requireOwnPendingRequest(actor, id);

    const saved = await saveReview(
        request,
        reviewRepo.create({
            requestId: request.id,
            recommendsRaise: body.recommendsRaise,
            performanceScore: body.performanceScore ?? null,
            comments: body.comments ?? null,
        }),
    );

    // Só nos ad-hoc: num ciclo, quem o abriu recebia uma por cada avaliação, e o
    // progresso já se vê no ciclo. Nunca para o avaliado, que o pode ter pedido
    // sobre si próprio. O que a notificação leva está no catálogo.
    if (request.cycleId === null) {
        await notifier.notify("review.submitted", {
            companyId: request.companyId,
            recipientIds: [request.requestedBy],
            exclude: [actor.id, request.revieweeId],
            data: { revieweeId: request.revieweeId },
        });
    }

    return new HttpResponse(201, "Avaliação submetida", undefined, toSubmittedReviewResponse(saved)).send(res);
}

export const declineReviewRequest = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const request = await requireOwnPendingRequest(actor, id);

    request.status = ReviewRequestStatus.Declined;
    const saved = await updateReviewRequest(request);

    // Como no submit: só os ad-hoc, e nunca para o avaliado.
    if (saved.cycleId === null) {
        await notifier.notify("review_request.declined", {
            companyId: saved.companyId,
            recipientIds: [saved.requestedBy],
            exclude: [actor.id, saved.revieweeId],
            data: { requestId: saved.id, reviewerId: saved.reviewerId, revieweeId: saved.revieweeId },
        });
    }

    return new HttpResponse(200, "Pedido recusado", undefined, toReviewRequestResponse(saved)).send(res);
}
