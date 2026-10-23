import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type {
    CreateSkillRequest,
    EmployeeSkillResponse,
    ListSkillUsersQuery,
    ListSkillsQuery,
    PatchSkillRequest,
    SkillHolderResponse,
    SkillResponse,
    UpsertEmployeeSkillRequest,
} from "../dtos/skill/skill-dto.js";
import type { EmployeeSkill } from "../entities/EmployeeSkill.js";
import type { Skill } from "../entities/Skill.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import {
    deleteEmployeeSkill,
    employeeSkillRepo,
    getEmployeeSkill,
    getEmployeeSkillsBySkillIdAndCompanyId,
    getEmployeeSkillsByUserId,
    updateEmployeeSkill,
} from "../repositories/employee-skill-repo.js";
import {
    createSkill as saveSkill,
    getSkillById,
    getSkillByNameIgnoringCase,
    getSkills,
    getSkillsByCategory,
    skillRepo,
    updateSkill,
} from "../repositories/skill-repo.js";
import { getUserById } from "../repositories/user-repo.js";
import { canAdministerAccount } from "../services/account-policy.js";
import { resolveCompanyScope } from "../services/company-scope.js";
import { requireUserInReach } from "../services/user-scope.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Competência não encontrada";
const USER_NOT_FOUND = "Utilizador não encontrado";
const DUPLICATE_NAME = "Já existe uma competência com este nome";

const toSkillResponse = (skill: Skill): SkillResponse => ({
    id: skill.id,
    name: skill.name,
    category: skill.category,
});

const toEmployeeSkillResponse = (employeeSkill: EmployeeSkill, skill: Skill): EmployeeSkillResponse => ({
    userId: employeeSkill.userId,
    skillId: employeeSkill.skillId,
    name: skill.name,
    category: skill.category,
    proficiency: employeeSkill.proficiency,
    yearsExperience: employeeSkill.yearsExperience,
});

const toHolderResponse = (employeeSkill: EmployeeSkill): SkillHolderResponse => ({
    userId: employeeSkill.userId,
    proficiency: employeeSkill.proficiency,
    yearsExperience: employeeSkill.yearsExperience,
});

const requireSkill = async (id: string): Promise<Skill> => {
    const skill = await getSkillById(id);

    if (!skill) {
        throw new HttpError(404, NOT_FOUND);
    }

    return skill;
};

/**
 * Quem escreve as competências de uma pessoa: quem administra a conta dela, e
 * nunca ela própria. As competências decidem alocações, por isso não se declaram.
 */
const requireSkillManager = async (actor: User, userId: string): Promise<User> => {
    const target = requireUserInReach(actor, await getUserById(userId), USER_NOT_FOUND);

    if (target.id === actor.id || !canAdministerAccount(actor.role, target.role)) {
        throw new HttpError(403, "Sem permissões para alterar as competências desta pessoa");
    }

    return target;
};

export const listSkills = async (req: Request, res: Response) => {
    const query = req.validQuery as ListSkillsQuery;

    const skills = query.category
        ? await getSkillsByCategory(query.category)
        : await getSkills();

    return new HttpResponse(200, "Competências", undefined, skills.map(toSkillResponse)).send(res);
}

export const createSkill = async (req: Request, res: Response) => {
    const { name, category } = req.body as CreateSkillRequest;

    if (await getSkillByNameIgnoringCase(name)) {
        throw new HttpError(409, DUPLICATE_NAME);
    }

    const created = await saveSkill(skillRepo.create({ name, category }));

    return new HttpResponse(201, "Competência criada", undefined, toSkillResponse(created)).send(res);
}

export const patchSkill = async (req: Request, res: Response) => {
    const body = req.body as PatchSkillRequest;
    const id = uuidParam(req.params.id, NOT_FOUND);

    const skill = await requireSkill(id);

    if (body.name !== undefined) {
        const sameName = await getSkillByNameIgnoringCase(body.name);

        // Mudar só as maiúsculas do próprio nome é legítimo.
        if (sameName && sameName.id !== skill.id) {
            throw new HttpError(409, DUPLICATE_NAME);
        }

        skill.name = body.name;
    }

    if (body.category !== undefined) {
        skill.category = body.category;
    }

    const saved = await updateSkill(skill);

    return new HttpResponse(200, "Competência atualizada", undefined, toSkillResponse(saved)).send(res);
}

export const listSkillUsers = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);
    const query = req.validQuery as ListSkillUsersQuery;

    const companyId = resolveCompanyScope(actor, query.companyId, "Só pode ver a sua empresa");

    await requireSkill(id);

    const holders = await getEmployeeSkillsBySkillIdAndCompanyId(id, companyId);

    return new HttpResponse(200, "Pessoas com esta competência", undefined, holders.map(toHolderResponse)).send(res);
}

export const listUserSkills = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, USER_NOT_FOUND);

    // Ler é mais largo do que escrever: qualquer conta ativa da empresa.
    requireUserInReach(actor, await getUserById(id), USER_NOT_FOUND);

    const employeeSkills = await getEmployeeSkillsByUserId(id);

    return new HttpResponse(
        200,
        "Competências",
        undefined,
        employeeSkills.map((employeeSkill) => toEmployeeSkillResponse(employeeSkill, employeeSkill.skill)),
    ).send(res);
}

export const upsertUserSkill = async (req: Request, res: Response) => {
    const body = req.body as UpsertEmployeeSkillRequest;
    const actor: User = getCurrentActor(req);
    const userId = uuidParam(req.params.id, USER_NOT_FOUND);
    const skillId = uuidParam(req.params.skillId, NOT_FOUND);

    await requireSkillManager(actor, userId);
    const skill = await requireSkill(skillId);

    const existing = await getEmployeeSkill(userId, skillId);

    // A chave primária é o par, logo o save() já é um upsert.
    const saved = await updateEmployeeSkill(
        employeeSkillRepo.create({
            userId,
            skillId,
            proficiency: body.proficiency ?? null,
            yearsExperience: body.yearsExperience ?? null,
        }),
    );

    return new HttpResponse(
        existing ? 200 : 201,
        existing ? "Competência atualizada" : "Competência atribuída",
        undefined,
        toEmployeeSkillResponse(saved, skill),
    ).send(res);
}

export const removeUserSkill = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const userId = uuidParam(req.params.id, USER_NOT_FOUND);
    const skillId = uuidParam(req.params.skillId, NOT_FOUND);

    await requireSkillManager(actor, userId);

    const result = await deleteEmployeeSkill(userId, skillId);

    if (!result.affected) {
        throw new HttpError(404, "Esta pessoa não tem esta competência");
    }

    return new HttpResponse(200, "Competência removida").send(res);
}
