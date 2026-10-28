import type { EmployeeProfileResponse } from "../dtos/user/employee-profile-dto.js";
import type { UserResponse } from "../dtos/user/user-dto.js";
import type { EmployeeProfile } from "../entities/EmployeeProfile.js";
import type { User } from "../entities/User.js";
import { FileKind } from "../types/enums.js";
import { filesFor } from "./files/files.js";

/**
 * O link do avatar de cada pessoa, numa query, para os mappers abaixo. Quem
 * não tem avatar não aparece: o get() dá undefined, e o mapper põe null.
 */
export async function avatarUrlsOf(userIds: string[]): Promise<Map<string, string>> {
    const files = await filesFor(FileKind.Avatar, userIds);
    const urls = new Map<string, string>();

    for (const [userId, [avatar]] of files) {
        if (avatar) {
            urls.set(userId, avatar.url);
        }
    }

    return urls;
}

export const toProfileResponse = (profile: EmployeeProfile, avatarUrl: string | null): EmployeeProfileResponse => ({
    userId: profile.userId,
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    address: profile.address,
    birthDate: profile.birthDate,
    hireDate: profile.hireDate,
    jobTitle: profile.jobTitle,
    avatarUrl,
});

/** Campo a campo: impede o passwordHash e o signupToken de sair. */
export const toUserResponse = (user: User, avatars: Map<string, string>): UserResponse => ({
    id: user.id,
    companyId: user.companyId,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    // undefined se a relação não foi carregada, null se não existe.
    profile: user.profile ? toProfileResponse(user.profile, avatars.get(user.id) ?? null) : null,
});
