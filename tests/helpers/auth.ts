import jwt from "jsonwebtoken";
import type { User } from "../../src/entities/User.js";
import type { UserRole } from "../../src/types/enums.js";
import { UserStatus } from "../../src/types/enums.js";
import { criarUtilizador } from "./factories.js";

export const ACTOR_PASSWORD = "Password1!";

type Claims = Pick<User, "id" | "companyId" | "role">;

export function authorization(user: Claims): string {
    const token = jwt.sign(
        { sub: String(user.id), companyId: user.companyId, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: "1d" },
    );
    return `Bearer ${token}`;
}

interface Actor {
    user: User;
    header: string;
}

export async function createActor(role: UserRole, companyId?: string): Promise<Actor> {
    const user = await criarUtilizador({
        ...(companyId ? { companyId } : {}),
        role,
        password: ACTOR_PASSWORD,
        status: UserStatus.Active,
        mustChangePassword: false,
    });

    return { user, header: authorization(user) };
}
