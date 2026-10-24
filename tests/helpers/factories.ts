import { hash } from "bcrypt";
import { Company } from "../../src/entities/Company.js";
import { Allocation } from "../../src/entities/Allocation.js";
import { EmployeeProfile } from "../../src/entities/EmployeeProfile.js";
import { EmployeeSkill } from "../../src/entities/EmployeeSkill.js";
import { Project } from "../../src/entities/Project.js";
import { Review } from "../../src/entities/Review.js";
import { ReviewCycle } from "../../src/entities/ReviewCycle.js";
import { ReviewRequest } from "../../src/entities/ReviewRequest.js";
import { Salary } from "../../src/entities/Salary.js";
import { Skill } from "../../src/entities/Skill.js";
import { User } from "../../src/entities/User.js";
import {
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
    avatarUrl?: string | null;
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
            avatarUrl: opcoes.avatarUrl ?? null,
        }),
    );
}

export async function criarProjeto(companyId: string, nome?: string): Promise<Project> {
    const repo = manager().getRepository(Project);
    const n = proximo();

    return repo.save(
        repo.create({
            companyId,
            name: nome ?? `Projeto ${n}`,
            status: ProjectStatus.Active,
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
