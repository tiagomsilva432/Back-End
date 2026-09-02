import { hash } from "bcrypt";
import { Company } from "../../src/entities/Company.js";
import { User } from "../../src/entities/User.js";
import { UserRole, UserStatus } from "../../src/types/enums.js";
import { saltRounds } from "../../src/env-vars.js";
import { manager } from "../setup/db.js";


let seq = 0;
const proximo = () => ++seq;

export async function criarEmpresa(nome?: string): Promise<Company> {
    const repo = manager().getRepository(Company);
    return repo.save(
        repo.create({
            name: nome ?? `Empresa ${proximo()}`,
            country: "PT",
        }),
    );
}

interface OpcoesUtilizador {
    companyId?: number;
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

    return repo.save(
        repo.create({
            companyId,
            email: opcoes.email ?? `utilizador${proximo()}@empresa.pt`,
            role: opcoes.role ?? UserRole.Employee,
            status: opcoes.status ?? UserStatus.Invited,
            passwordHash: opcoes.password ? await hash(opcoes.password, saltRounds) : null,
            mustChangePassword: opcoes.mustChangePassword ?? true,
            signupToken: opcoes.signupToken ?? null,
            signupTokenExpiresAt: opcoes.signupTokenExpiresAt ?? null,
        }),
    );
}

export async function criarUtilizadorAtivo(
    password: string,
    opcoes: OpcoesUtilizador = {},
): Promise<User> {
    return criarUtilizador({
        status: UserStatus.Active,
        mustChangePassword: false,
        ...opcoes,
        password,
    });
}
