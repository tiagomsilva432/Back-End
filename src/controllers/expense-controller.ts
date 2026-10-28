import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type {
    CreateExpenseRequest,
    ExpenseResponse,
    ListExpensesQuery,
    PatchExpenseRequest,
} from "../dtos/expense/expense-dto.js";
import type { FileResponse } from "../dtos/file/file-dto.js";
import type { Expense } from "../entities/Expense.js";
import type { Project } from "../entities/Project.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import {
    createExpense as saveExpense,
    deleteExpense,
    expenseRepo,
    getExpenseById,
    getExpenses,
    updateExpense,
} from "../repositories/expense-repo.js";
import { getProjectById } from "../repositories/project-repo.js";
import { notifyBudgetCrossings } from "../services/budget-alerts.js";
import { requireCompany } from "../services/company-calendar.js";
import { requireInReach, resolveCompanyScope } from "../services/company-scope.js";
import { canManageProjectExpenses, requireManageableExpense } from "../services/expense-policy.js";
import { fileHandlers } from "../services/files/file-handlers.js";
import { FILE_KINDS } from "../services/files/file-kinds.js";
import { filesFor, removeFilesOf } from "../services/files/files.js";
import { FileKind, UserRole } from "../types/enums.js";
import { toCents } from "../utils/money.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Despesa não encontrada";
const PROJECT_NOT_FOUND = "Projeto não encontrado";

const toResponse = (expense: Expense, receipts: FileResponse[]): ExpenseResponse => ({
    id: expense.id,
    companyId: expense.companyId,
    projectId: expense.projectId,
    title: expense.title,
    description: expense.description,
    amount: expense.amount,
    category: expense.category,
    incurredOn: expense.incurredOn,
    createdBy: expense.createdBy,
    receipts,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
});

const receiptsOf = async (expense: Expense): Promise<FileResponse[]> =>
    (await filesFor(FileKind.ExpenseReceipt, [expense.id])).get(expense.id) ?? [];

/** O projeto de uma despesa de projeto: é o managerId dele que decide se um employee a gere. */
const projectOf = async (expense: Expense): Promise<Project | null> =>
    expense.projectId ? await getProjectById(expense.projectId) : null;

/** 404 para a de outra empresa, como para uma que não existe; 403 para a da empresa que não é sua. */
async function requireExpense(actor: User, id: string): Promise<{ expense: Expense; project: Project | null }> {
    const expense = requireInReach(actor, await getExpenseById(id), NOT_FOUND);
    const project = await projectOf(expense);

    requireManageableExpense(actor, expense, project);

    return { expense, project };
}

export const createExpense = async (req: Request, res: Response) => {
    const body = req.body as CreateExpenseRequest;
    const actor: User = getCurrentActor(req);

    let companyId: string;
    let project: Project | null = null;

    if (body.projectId) {
        project = requireInReach(actor, await getProjectById(body.projectId), PROJECT_NOT_FOUND);

        if (!canManageProjectExpenses(actor, project)) {
            throw new HttpError(403, "Só o gestor do projeto ou um administrador regista despesas neste projeto");
        }

        companyId = project.companyId;
    } else {
        if (actor.role === UserRole.Employee) {
            throw new HttpError(403, "Só um administrador regista despesas da empresa");
        }

        companyId = resolveCompanyScope(actor, body.companyId, "Só pode registar despesas na sua empresa");
        await requireCompany(companyId);
    }

    const created = await saveExpense(
        expenseRepo.create({
            companyId,
            projectId: project ? project.id : null,
            title: body.title,
            description: body.description ?? null,
            amount: body.amount,
            category: body.category,
            incurredOn: body.incurredOn,
            createdBy: actor.id,
        }),
    );

    if (project) {
        await notifyBudgetCrossings(actor, project, { expensesDelta: toCents(created.amount) });
    }

    return new HttpResponse(201, "Despesa registada", undefined, toResponse(created, [])).send(res);
}

/**
 * Os admins veem as da empresa, e filtram por projeto se quiserem. O gestor de
 * um projeto, que não é admin, só vê as dos projetos que gere, um de cada vez.
 */
export const listExpenses = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListExpensesQuery;
    const filters = {
        ...(query.category ? { category: query.category } : {}),
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
    };

    let expenses: Expense[];

    if (query.projectId) {
        const project = requireInReach(actor, await getProjectById(query.projectId), PROJECT_NOT_FOUND);

        if (!canManageProjectExpenses(actor, project)) {
            throw new HttpError(403, "Sem permissões para ver as despesas deste projeto");
        }

        expenses = await getExpenses({ ...filters, projectId: project.id });
    } else {
        if (actor.role === UserRole.Employee) {
            throw new HttpError(403, "Indique um projeto de que seja gestor");
        }

        const companyId = resolveCompanyScope(actor, query.companyId, "Só pode ver a sua empresa");

        expenses = await getExpenses({ ...filters, companyId, overhead: query.overhead });
    }

    const receipts = await filesFor(FileKind.ExpenseReceipt, expenses.map((expense) => expense.id));

    return new HttpResponse(
        200,
        "Despesas",
        undefined,
        expenses.map((expense) => toResponse(expense, receipts.get(expense.id) ?? [])),
    ).send(res);
}

export const getExpense = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const { expense } = await requireExpense(actor, id);

    return new HttpResponse(200, "Despesa", undefined, toResponse(expense, await receiptsOf(expense))).send(res);
}

export const patchExpense = async (req: Request, res: Response) => {
    const body = req.body as PatchExpenseRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const { expense, project } = await requireExpense(actor, id);
    const previousAmount = expense.amount;

    if (body.title !== undefined) {
        expense.title = body.title;
    }

    if (body.description !== undefined) {
        expense.description = body.description;
    }

    if (body.amount !== undefined) {
        expense.amount = body.amount;
    }

    if (body.category !== undefined) {
        expense.category = body.category;
    }

    if (body.incurredOn !== undefined) {
        expense.incurredOn = body.incurredOn;
    }

    const saved = await updateExpense(expense);
    const delta = toCents(saved.amount) - toCents(previousAmount);

    if (project && delta > 0) {
        await notifyBudgetCrossings(actor, project, { expensesDelta: delta });
    }

    return new HttpResponse(200, "Despesa atualizada", undefined, toResponse(saved, await receiptsOf(saved))).send(res);
}

/** Para corrigir um erro de registo. Não avisa ninguém: o gasto só desce. */
export const removeExpense = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const { expense } = await requireExpense(actor, id);

    await deleteExpense(expense.id);
    // Depois da despesa: um recibo que fique para trás apanha-o o files:sweep.
    await removeFilesOf(FileKind.ExpenseReceipt, expense.id);

    return new HttpResponse(200, "Despesa apagada").send(res);
}

/** Quem gere a despesa gere os recibos dela: as mesmas regras, os mesmos 404 e 403. */
const receipts = fileHandlers(FILE_KINDS[FileKind.ExpenseReceipt], {
    requireOwner: async (actor, req) => {
        const { expense } = await requireExpense(actor, uuidParam(req.params.id, NOT_FOUND));

        return { companyId: expense.companyId, ownerId: expense.id, owner: expense };
    },
    messages: { uploaded: "Recibo anexado", removed: "Recibo apagado", notFound: "Recibo não encontrado" },
});

export const uploadReceipt = receipts.upload;
export const removeReceipt = receipts.remove;
