import { getUsersByCompanyId, getUsersByRole } from "../repositories/user-repo.js";
import { UserRole, UserStatus } from "../types/enums.js";

/**
 * A quem se diz o que acontece numa empresa: os seus company_admins ativos,
 * menos a pessoa em causa. Sem nenhum (é ela o único, ou a empresa ficou sem),
 * os system_admins ativos, que são quem lá pode agir.
 */
export async function companyAdminIdsOrSystemAdmins(companyId: string, exceptUserId: string): Promise<string[]> {
    const companyAdmins = (await getUsersByCompanyId(companyId, {
        role: UserRole.CompanyAdmin,
        status: UserStatus.Active,
    }))
        .map((admin) => admin.id)
        .filter((id) => id !== exceptUserId);

    if (companyAdmins.length > 0) {
        return companyAdmins;
    }

    return (await getUsersByRole(UserRole.SystemAdmin, { status: UserStatus.Active })).map((admin) => admin.id);
}
