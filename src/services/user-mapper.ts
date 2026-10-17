import type { EmployeeProfileResponse } from "../dtos/user/employee-profile-dto.js";
import type { UserResponse } from "../dtos/user/user-dto.js";
import type { EmployeeProfile } from "../entities/EmployeeProfile.js";
import type { User } from "../entities/User.js";

/** Entidade -> DTO. Num serviço porque o auth e o user usam os dois. */
export const toProfileResponse = (profile: EmployeeProfile): EmployeeProfileResponse => ({
    userId: profile.userId,
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    address: profile.address,
    birthDate: profile.birthDate,
    hireDate: profile.hireDate,
    jobTitle: profile.jobTitle,
    avatarUrl: profile.avatarUrl,
});

/** Campo a campo: impede o passwordHash e o signupToken de sair. */
export const toUserResponse = (user: User): UserResponse => ({
    id: user.id,
    companyId: user.companyId,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    // undefined se a relação não foi carregada, null se não existe.
    profile: user.profile ? toProfileResponse(user.profile) : null,
});
