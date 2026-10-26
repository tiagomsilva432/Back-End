import "reflect-metadata";
import "dotenv/config";
import { parseArgs } from "node:util";
import { hash } from "bcrypt";
import { z } from "zod";
import { AppDataSource } from "../data-source.js";
import { passwordSchema } from "../dtos/auth/account-dto.js";
import type { Company } from "../entities/Company.js";
import { User } from "../entities/User.js";
import { saltRounds } from "../env-vars.js";
import { getCompanies, getCompanyById } from "../repositories/company-repo.js";
import { createUser, getUserByEmailAndCompanyId } from "../repositories/user-repo.js";
import { UserRole, UserStatus } from "../types/enums.js";

const { values } = parseArgs({
    options: {
        email: { type: "string" },
        password: { type: "string" },
        "company-id": { type: "string" },
        "company-name": { type: "string" },
    },
    strict: true,
});

async function resolveCompany(): Promise<Company> {
    const id = values["company-id"];

    if (id) {
        const company = await getCompanyById(id);
        if (!company) {
            throw new Error(`Não existe nenhuma empresa com o id ${id}`);
        }
        return company;
    }

    const wanted = values["company-name"]?.trim().toLowerCase();
    const companies = await getCompanies();
    const candidates = wanted
        ? companies.filter((company) => company.name.trim().toLowerCase() === wanted)
        : companies;

    if (candidates.length === 1) {
        return candidates[0]!;
    }
    if (candidates.length === 0) {
        throw new Error("Nenhuma empresa encontrada. Corre `npm run db:migrate` ou indica --company-id.");
    }
    throw new Error(
        `Há várias empresas. Escolhe uma com --company-id:\n${candidates
            .map((company) => `  ${company.id}  ${company.name}`)
            .join("\n")}`,
    );
}

await AppDataSource.initialize();

try {
    const email = z.string().trim().toLowerCase().pipe(z.email()).parse(values.email);
    const password = passwordSchema.parse(values.password ?? process.env.ADMIN_PASSWORD);

    const company = await resolveCompany();

    if (await getUserByEmailAndCompanyId(email, company.id)) {
        throw new Error(`Já existe uma conta com o email ${email} na empresa ${company.name}`);
    }

    const admin = new User(company.id, email, UserRole.SystemAdmin);
    admin.passwordHash = await hash(password, saltRounds);
    admin.status = UserStatus.Active;
    admin.mustChangePassword = false;
    admin.signupToken = null;
    admin.signupTokenExpiresAt = null;

    const created = await createUser(admin);

    console.log(`system_admin criado: ${created.email} (empresa: ${company.name})`);
} catch (error) {
    const detail = error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join("; ")
        : error instanceof Error ? error.message : String(error);
    console.error(detail);
    process.exitCode = 1;
} finally {
    await AppDataSource.destroy();
}
