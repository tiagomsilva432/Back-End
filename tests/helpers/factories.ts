import { hash } from "bcrypt";
import { Company } from "../../src/entities/Company.js";
import { Allocation } from "../../src/entities/Allocation.js";
import { EmployeeProfile } from "../../src/entities/EmployeeProfile.js";
import { Project } from "../../src/entities/Project.js";
import { User } from "../../src/entities/User.js";
import { ProjectStatus, UserRole, UserStatus } from "../../src/types/enums.js";
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
