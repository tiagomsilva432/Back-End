import { hash } from "bcrypt";
import { Company } from "../../src/entities/Company.js";
import { User } from "../../src/entities/User.js";
import { UserRole, UserStatus } from "../../src/types/enums.js";
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
