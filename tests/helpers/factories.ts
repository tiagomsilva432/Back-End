import { hash } from "bcrypt";
import { AbsenceRequest } from "../../src/entities/AbsenceRequest.js";
import { Company } from "../../src/entities/Company.js";
import { CompanyHoliday } from "../../src/entities/CompanyHoliday.js";
import { Expense } from "../../src/entities/Expense.js";
import { Allocation } from "../../src/entities/Allocation.js";
import { Announcement } from "../../src/entities/Announcement.js";
import { Notification } from "../../src/entities/Notification.js";
import { EmployeeProfile } from "../../src/entities/EmployeeProfile.js";
import { EmployeeSkill } from "../../src/entities/EmployeeSkill.js";
import { Project } from "../../src/entities/Project.js";
import { ProjectMessage } from "../../src/entities/ProjectMessage.js";
import { ProjectResource } from "../../src/entities/ProjectResource.js";
import { Review } from "../../src/entities/Review.js";
import { ReviewCycle } from "../../src/entities/ReviewCycle.js";
import { ReviewRequest } from "../../src/entities/ReviewRequest.js";
import { Salary } from "../../src/entities/Salary.js";
import { Skill } from "../../src/entities/Skill.js";
import { User } from "../../src/entities/User.js";
import {
    AbsenceStatus,
    AbsenceType,
    AnnouncementScope,
    AnnouncementSeverity,
    ExpenseCategory,
    ProjectStatus,
    ReviewRequestStatus,
    SkillCategory,
    UserRole,
    UserStatus,
} from "../../src/types/enums.js";
import { saltRounds } from "../../src/env-vars.js";
import { manager } from "../setup/db.js";


let seq = 0;
const proximo = () => ++seq;

export async function criarEmpresa(nome?: string, email?: string | null): Promise<Company> {
    const repo = manager().getRepository(Company);
    const n = proximo();
    return repo.save(
        repo.create({
            name: nome ?? `Empresa ${n}`,
            email: email === undefined ? `geral${n}@empresa.pt` : email,
            country: "PT",
        }),
    );
}

interface OpcoesUtilizador {
    companyId?: string;
    email?: string;
    role?: UserRole;
    status?: UserStatus;
    password?: string;
    mustChangePassword?: boolean;
    signupToken?: string | null;
    signupTokenExpiresAt?: Date | null;
}

export async function criarUtilizador(opcoes: OpcoesUtilizador = {}): Promise<User> {
    const repo = manager().getRepository(User);
    const companyId = opcoes.companyId ?? (await criarEmpresa()).id;
    const temPassword = opcoes.password !== undefined;

    return repo.save(
        repo.create({
            companyId,
            email: opcoes.email ?? `utilizador${proximo()}@empresa.pt`,
            role: opcoes.role ?? UserRole.Employee,
            status: opcoes.status ?? (temPassword ? UserStatus.Active : UserStatus.Invited),
            passwordHash: temPassword ? await hash(opcoes.password!, saltRounds) : null,
            mustChangePassword: opcoes.mustChangePassword ?? !temPassword,
            signupToken: opcoes.signupToken ?? null,
            signupTokenExpiresAt: opcoes.signupTokenExpiresAt ?? null,
        }),
    );
}

interface OpcoesPerfil {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    address?: string | null;
    birthDate?: string | null;
    hireDate?: string;
    jobTitle?: string | null;
}

export async function criarPerfil(userId: string, opcoes: OpcoesPerfil = {}): Promise<EmployeeProfile> {
    const repo = manager().getRepository(EmployeeProfile);
    const n = proximo();

    return repo.save(
        repo.create({
            userId,
            firstName: opcoes.firstName ?? `Nome${n}`,
            lastName: opcoes.lastName ?? `Apelido${n}`,
            phone: opcoes.phone ?? null,
            address: opcoes.address ?? null,
            birthDate: opcoes.birthDate ?? null,
            hireDate: opcoes.hireDate ?? "2024-01-15",
            jobTitle: opcoes.jobTitle ?? null,
        }),
    );
}

export async function criarProjeto(
    companyId: string,
    nome?: string,
    opcoes: { managerId?: string | null; budget?: string | null; startDate?: string | null } = {},
): Promise<Project> {
    const repo = manager().getRepository(Project);
    const n = proximo();

    return repo.save(
        repo.create({
            companyId,
            name: nome ?? `Projeto ${n}`,
            status: ProjectStatus.Active,
            managerId: opcoes.managerId ?? null,
            budget: opcoes.budget ?? null,
            startDate: opcoes.startDate ?? null,
        }),
    );
}

/** O catálogo já vem semeado pela migração, por isso o nome por omissão nunca colide. */
export async function criarCompetencia(nome?: string, categoria = SkillCategory.Other): Promise<Skill> {
    const repo = manager().getRepository(Skill);

    return repo.save(repo.create({ name: nome ?? `Competência ${proximo()}`, category: categoria }));
}

export async function criarCompetenciaDePessoa(
    userId: string,
    skillId: string,
    opcoes: { proficiency?: number | null; yearsExperience?: string | null } = {},
): Promise<EmployeeSkill> {
    const repo = manager().getRepository(EmployeeSkill);

    return repo.save(
        repo.create({
            userId,
            skillId,
            proficiency: opcoes.proficiency ?? null,
            yearsExperience: opcoes.yearsExperience ?? null,
        }),
    );
}

interface OpcoesSalario {
    amount?: string;
    currency?: string;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    reason?: string | null;
}

export async function criarSalario(userId: string, createdBy: string, opcoes: OpcoesSalario = {}): Promise<Salary> {
    const repo = manager().getRepository(Salary);

    return repo.save(
        repo.create({
            userId,
            createdBy,
            amount: opcoes.amount ?? "1500.00",
            currency: opcoes.currency ?? "EUR",
            effectiveFrom: opcoes.effectiveFrom ?? "2025-01-01",
            effectiveTo: opcoes.effectiveTo ?? null,
            reason: opcoes.reason ?? null,
        }),
    );
}

interface OpcoesCiclo {
    name?: string;
    deadline?: string | null;
    closedAt?: Date | null;
}

export async function criarCiclo(companyId: string, openedBy: string, opcoes: OpcoesCiclo = {}): Promise<ReviewCycle> {
    const repo = manager().getRepository(ReviewCycle);

    return repo.save(
        repo.create({
            companyId,
            openedBy,
            name: opcoes.name ?? `Ciclo ${proximo()}`,
            deadline: opcoes.deadline ?? null,
            closedAt: opcoes.closedAt ?? null,
        }),
    );
}

interface OpcoesPedido {
    cycleId?: string | null;
    status?: ReviewRequestStatus;
    dueDate?: string | null;
}

export async function criarPedido(
    reviewer: Pick<User, "id" | "companyId">,
    revieweeId: string,
    requestedBy: string,
    opcoes: OpcoesPedido = {},
): Promise<ReviewRequest> {
    const repo = manager().getRepository(ReviewRequest);

    return repo.save(
        repo.create({
            companyId: reviewer.companyId,
            cycleId: opcoes.cycleId ?? null,
            requestedBy,
            reviewerId: reviewer.id,
            revieweeId,
            status: opcoes.status ?? ReviewRequestStatus.Pending,
            dueDate: opcoes.dueDate ?? null,
        }),
    );
}

interface OpcoesAvaliacao {
    recommendsRaise?: boolean;
    performanceScore?: number | null;
    comments?: string | null;
}

/** Grava a avaliação e marca o pedido como submetido, como faz o endpoint. */
export async function criarAvaliacao(request: ReviewRequest, opcoes: OpcoesAvaliacao = {}): Promise<Review> {
    await manager().getRepository(ReviewRequest).update(request.id, { status: ReviewRequestStatus.Submitted });
    const repo = manager().getRepository(Review);

    return repo.save(
        repo.create({
            requestId: request.id,
            recommendsRaise: opcoes.recommendsRaise ?? true,
            performanceScore: opcoes.performanceScore === undefined ? 4 : opcoes.performanceScore,
            comments: opcoes.comments ?? null,
        }),
    );
}

interface OpcoesAlocacao {
    allocationPercent?: number;
    roleOnProject?: string | null;
    startDate?: string;
    endDate?: string | null;
}

export async function criarAlocacao(
    userId: string,
    projectId: string,
    opcoes: OpcoesAlocacao = {},
): Promise<Allocation> {
    const repo = manager().getRepository(Allocation);

    return repo.save(
        repo.create({
            userId,
            projectId,
            allocationPercent: opcoes.allocationPercent ?? 50,
            roleOnProject: opcoes.roleOnProject ?? null,
            startDate: opcoes.startDate ?? "2026-01-01",
            endDate: opcoes.endDate ?? null,
        }),
    );
}

interface OpcoesAviso {
    scope?: AnnouncementScope;
    companyId?: string | null;
    projectId?: string | null;
    title?: string;
    severity?: AnnouncementSeverity;
    pinned?: boolean;
    startsAt?: Date;
    endsAt?: Date | null;
}

/**
 * Um aviso de sistema ativo por omissão. As datas são do relógio do JavaScript,
 * como as que a API grava: o now() da base de dados fica parado no início da
 * transação do teste.
 */
export async function criarAviso(createdBy: string, opcoes: OpcoesAviso = {}): Promise<Announcement> {
    const repo = manager().getRepository(Announcement);
    const n = proximo();

    return repo.save(
        repo.create({
            scope: opcoes.scope ?? AnnouncementScope.System,
            companyId: opcoes.companyId ?? null,
            projectId: opcoes.projectId ?? null,
            createdBy,
            title: opcoes.title ?? `Aviso ${n}`,
            body: `Texto do aviso ${n}`,
            severity: opcoes.severity ?? AnnouncementSeverity.Info,
            pinned: opcoes.pinned ?? false,
            startsAt: opcoes.startsAt ?? new Date(Date.now() - 60_000),
            endsAt: opcoes.endsAt ?? null,
        }),
    );
}

interface OpcoesNotificacao {
    type?: string;
    data?: Record<string, unknown>;
    readAt?: Date | null;
}

export async function criarNotificacao(
    recipient: Pick<User, "id" | "companyId">,
    opcoes: OpcoesNotificacao = {},
): Promise<Notification> {
    const repo = manager().getRepository(Notification);

    return repo.save(
        repo.create({
            recipientId: recipient.id,
            companyId: recipient.companyId,
            type: opcoes.type ?? "project.manager_assigned",
            data: opcoes.data ?? { projectId: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42", projectName: `Projeto ${proximo()}` },
            readAt: opcoes.readAt ?? null,
        }),
    );
}

interface OpcoesAusencia {
    type?: AbsenceType;
    status?: AbsenceStatus;
    startDate?: string;
    endDate?: string;
    note?: string | null;
    decidedBy?: string | null;
}

/** Férias pendentes por omissão, numa semana de dezembro sem feriados. */
export async function criarAusencia(
    user: Pick<User, "id" | "companyId">,
    opcoes: OpcoesAusencia = {},
): Promise<AbsenceRequest> {
    const repo = manager().getRepository(AbsenceRequest);
    const decidedBy = opcoes.decidedBy ?? null;

    return repo.save(
        repo.create({
            companyId: user.companyId,
            userId: user.id,
            type: opcoes.type ?? AbsenceType.Vacation,
            status: opcoes.status ?? AbsenceStatus.Pending,
            startDate: opcoes.startDate ?? "2026-12-14",
            endDate: opcoes.endDate ?? "2026-12-18",
            note: opcoes.note ?? null,
            decidedBy,
            decidedAt: decidedBy ? new Date() : null,
            decisionNote: null,
        }),
    );
}

export async function criarFeriado(
    companyId: string,
    createdBy: string,
    opcoes: { date?: string; name?: string } = {},
): Promise<CompanyHoliday> {
    const repo = manager().getRepository(CompanyHoliday);

    return repo.save(
        repo.create({
            companyId,
            createdBy,
            date: opcoes.date ?? "2026-06-13",
            name: opcoes.name ?? `Feriado ${proximo()}`,
        }),
    );
}

interface OpcoesDespesa {
    projectId?: string | null;
    title?: string;
    description?: string | null;
    amount?: string;
    category?: ExpenseCategory;
    incurredOn?: string;
}

/** Uma despesa da empresa por omissão: software, num dia de 2025. */
export async function criarDespesa(
    companyId: string,
    createdBy: string,
    opcoes: OpcoesDespesa = {},
): Promise<Expense> {
    const repo = manager().getRepository(Expense);

    return repo.save(
        repo.create({
            companyId,
            projectId: opcoes.projectId ?? null,
            title: opcoes.title ?? `Despesa ${proximo()}`,
            description: opcoes.description ?? null,
            amount: opcoes.amount ?? "100.00",
            category: opcoes.category ?? ExpenseCategory.Software,
            incurredOn: opcoes.incurredOn ?? "2025-06-15",
            createdBy,
        }),
    );
}

interface OpcoesRecurso {
    title?: string;
    url?: string | null;
    note?: string | null;
}

/** Um link para o repositório por omissão. */
export async function criarRecurso(
    projectId: string,
    createdBy: string,
    opcoes: OpcoesRecurso = {},
): Promise<ProjectResource> {
    const repo = manager().getRepository(ProjectResource);

    return repo.save(
        repo.create({
            projectId,
            createdBy,
            title: opcoes.title ?? `Recurso ${proximo()}`,
            url: opcoes.url === undefined ? "https://github.com/empresa/projeto" : opcoes.url,
            note: opcoes.note ?? null,
        }),
    );
}

/** Uma mensagem no chat de um projeto. O id é uuidv7: cada uma é mais recente do que a anterior. */
export async function criarMensagem(projectId: string, authorId: string, body?: string): Promise<ProjectMessage> {
    const repo = manager().getRepository(ProjectMessage);

    return repo.save(
        repo.create({
            projectId,
            authorId,
            body: body ?? `Mensagem ${proximo()}`,
        }),
    );
}
