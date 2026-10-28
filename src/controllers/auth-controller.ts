import type { Response, Request } from "express";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import { HttpError } from "../dtos/common/errors-dto.js";
import { feUrl, jwtExpiresIn, jwtSecret, passwordResetExpDate, saltRounds, signupTokenExpDate } from "../env-vars.js";
import { createUser, getUserByEmailAndCompanyId, getUserById, getUserByPasswordResetToken, getUserBySignupToken, getUsersByEmail, updateUser } from "../repositories/user-repo.js";
import { User } from "../entities/User.js";
import { compare, hash } from "bcrypt";
import jwt from "jsonwebtoken";
import { UserStatus } from "../types/enums.js";
import { randomUUID } from "node:crypto";
import { requireUserInReach } from "../services/user-scope.js";
import { isoDate } from "../utils/dates.js";
import { uuidParam } from "../utils/params.js";
import type {
    ChangePasswordRequest,
    ConfirmPasswordResetRequest,
    RequestPasswordResetRequest,
} from "../dtos/auth/password-dto.js";
import type { JwtClaims } from "../dtos/auth/jwt-dto.js";
import type { LoginCompanyChoice, LoginRequest, LoginResponse } from "../dtos/auth/login-dto.js";
import type { MeResponse } from "../dtos/auth/me-dto.js";
import { getAuth } from "../middleware/requireAuth.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { canAdministerAccount, resolveAccountTarget } from "../services/account-policy.js";
import { companyAdminIdsOrSystemAdmins } from "../services/admin-recipients.js";
import type { ActivateAccountRequest, CreateAccountRequest, CreateAccountResponse } from "../dtos/auth/account-dto.js";
import { getCompanyById } from "../repositories/company-repo.js";
import { mailer } from "../services/mailer.js";
import { notifier } from "../services/notifier.js";
import { passwordTiming } from "../services/password-timing.js";
import { createEmployeeProfile, employeeProfileRepo } from "../repositories/employee-profile-repo.js";
import { toProfileResponse } from "../services/user-mapper.js";

export const createAccount = async (req: Request, res: Response) => {
    const body = req.body as CreateAccountRequest;
    const actor: User = getCurrentActor(req);

    const { companyId, role } = resolveAccountTarget(actor, body);

    const company = await getCompanyById(companyId);

    if (!company) {
        throw new HttpError(404, "Empresa não encontrada");
    }

    const user: User | null = await getUserByEmailAndCompanyId(body.email, companyId);

    if(user){
        throw new HttpError(409, "Não foi possível criar a conta.");
    }

    const created: User = await createUser(new User(companyId, body.email, role));

    const activationUrl: string = `${feUrl()}/auth/account/activate?token=${created.signupToken}`;

    // A conta fica criada mesmo que o email falhe; o token continua válido
    // e pode ser reenviado.
    try {
        await mailer.sendActivationEmail(company, created.email, activationUrl);
    } catch (error) {
        console.error(`Falha ao enviar o email de ativação para ${created.email}`, error);
    }

    // Sem transação: uma transação aqui fugia ao QueryRunner dos testes.
    const profile = body.profile
        ? await createEmployeeProfile(
            employeeProfileRepo.create({
                userId: created.id,
                firstName: body.profile.firstName,
                lastName: body.profile.lastName,
                hireDate: body.profile.hireDate ?? isoDate(),
                jobTitle: body.profile.jobTitle ?? null,
                phone: null,
                address: null,
                birthDate: null,
            }),
        )
        : null;

    const data: CreateAccountResponse = {
        id: created.id,
        companyId: created.companyId,
        email: created.email,
        role: created.role,
        status: created.status,
        ...(profile ? { profile: toProfileResponse(profile, null) } : {}),
    };

    return new HttpResponse(201, "Conta criada", undefined, data).send(res);
}

export const activateUserWithToken = async (req: Request, res: Response) => {
    const { signupToken, password } = req.body as ActivateAccountRequest;

    const user = await getUserBySignupToken(signupToken);

    if(!user?.signupTokenExpiresAt || user.signupTokenExpiresAt < new Date()){
        throw new HttpError(401, "Token Inválido");
    }

    user.passwordHash = await hash(password, saltRounds);
    user.status = UserStatus.Active;
    user.mustChangePassword = false;
    user.signupToken = null;
    user.signupTokenExpiresAt = null;
    // O token chegou por email: quem o usa tem acesso à caixa.
    user.emailVerifiedAt = new Date();

    await updateUser(user);

    // Os admins da empresa sabem que o convite foi aceite. O primeiro
    // company_admin não tem nenhum: vai para os system_admins.
    await notifier.notify("user.activated", {
        companyId: user.companyId,
        recipientIds: await companyAdminIdsOrSystemAdmins(user.companyId, user.id),
        exclude: [user.id],
        data: { userId: user.id, email: user.email },
    });

    return new HttpResponse(200, "Conta ativada com sucesso").send(res);
}

export const loginWithEmailAndPassword = async (req: Request, res: Response) => {
    const { email, password, companyId } = req.body as LoginRequest;

    // O email repete-se entre empresas: escolhe-se a conta que a password abre.
    const candidates: User[] = companyId
        ? [await getUserByEmailAndCompanyId(email, companyId)].filter(
            (candidate): candidate is User => candidate !== null,
        )
        : await getUsersByEmail(email);

    const matches: User[] = [];
    let compared = false;

    // Sequencial para um pedido não multiplicar o trabalho de bcrypt.
    for (const candidate of candidates) {
        if (!candidate.passwordHash) {
            continue;
        }

        compared = true;

        if (await compare(password, candidate.passwordHash)) {
            matches.push(candidate);
        }
    }

    if (!compared) {
        await passwordTiming.burnCompare(password);
    }

    // Password antes do estado: mantém o 401 uniforme.
    if (matches.length === 0) {
        throw new HttpError(401, "Credenciais Inválidas");
    }

    if (matches.length > 1) {
        const choices: LoginCompanyChoice[] = [];

        for (const match of matches) {
            const company = await getCompanyById(match.companyId);
            choices.push({
                companyId: match.companyId,
                companyName: company?.name ?? "",
            });
        }

        choices.sort((a, b) => a.companyName.localeCompare(b.companyName));

        return new HttpResponse(
            409,
            "Este email existe em mais do que uma empresa: repete o login com o companyId",
            undefined,
            choices,
        ).send(res);
    }

    const [user] = matches as [User];

    if(user.status !== UserStatus.Active || user.mustChangePassword){
        throw new HttpError(403, "Conta não está ativa")
    }

    const claims: JwtClaims = {
        sub: String(user.id),
        companyId: user.companyId,
        role: user.role,
    };

    const token: string = jwt.sign(claims, jwtSecret(), { expiresIn: jwtExpiresIn() });

    user.lastLoginAt = new Date();
    await updateUser(user);

    const data: LoginResponse = {
        token,
        user: {
            id: user.id,
            email: user.email,
            role: user.role,
        },
    };

    return new HttpResponse(200, "Login bem sucedido", undefined, data).send(res);
}

export const getCurrentUser = async (req: Request, res: Response) => {
    const claims = getAuth(req);

    const user: User | null = await getUserById(claims.sub);

    if(!user){
        throw new HttpError(401, "Sessão inválida. Inicie sessão novamente");
    }

    if(user.status !== UserStatus.Active || user.mustChangePassword){
        throw new HttpError(403, "Conta não está ativa");
    }

    const data: MeResponse = {
        id: user.id,
        companyId: user.companyId,
        email: user.email,
        role: user.role,
    };

    return new HttpResponse(200, "Utilizador autenticado", undefined, data).send(res);
}
/**
 * Só uma conta `invited` se reenvia. Recunhar um token numa conta ativa seria um
 * caminho de tomada de conta: o link de ativação define uma password nova.
 */
export const resendActivation = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, "Utilizador não encontrado");

    const target = requireUserInReach(actor, await getUserById(id), "Utilizador não encontrado");

    if (!canAdministerAccount(actor.role, target.role)) {
        throw new HttpError(403, "Sem permissões para reenviar a ativação desta conta");
    }

    if (target.status !== UserStatus.Invited) {
        throw new HttpError(409, "Só é possível reenviar a ativação de uma conta convidada");
    }

    const company = await getCompanyById(target.companyId);

    if (!company) {
        throw new HttpError(404, "Empresa não encontrada");
    }

    target.signupToken = randomUUID();
    target.signupTokenExpiresAt = new Date(Date.now() + signupTokenExpDate());

    const saved = await updateUser(target);

    const activationUrl: string = `${feUrl()}/auth/account/activate?token=${saved.signupToken}`;

    // O token fica válido mesmo que o email falhe.
    try {
        await mailer.sendActivationEmail(company, saved.email, activationUrl);
    } catch (error) {
        console.error(`Falha ao reenviar o email de ativação para ${saved.email}`, error);
    }

    return new HttpResponse(200, "Ativação reenviada").send(res);
}

/**
 * Sem requireRole de propósito: ele recusa mustChangePassword com 403, e é
 * exatamente essa conta que precisa deste endpoint. O status continua a contar.
 */
export const changePassword = async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body as ChangePasswordRequest;
    const claims = getAuth(req);

    const user: User | null = await getUserById(claims.sub);

    if (!user) {
        throw new HttpError(401, "Sessão inválida. Inicie sessão novamente");
    }

    if (user.status !== UserStatus.Active) {
        throw new HttpError(403, "Conta não está ativa");
    }

    if (!user.passwordHash || !(await compare(currentPassword, user.passwordHash))) {
        throw new HttpError(401, "Credenciais Inválidas");
    }

    user.passwordHash = await hash(newPassword, saltRounds);
    user.mustChangePassword = false;
    // Uma password nova invalida qualquer recuperação pendente.
    user.signupToken = null;
    user.signupTokenExpiresAt = null;
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;

    await updateUser(user);

    return new HttpResponse(200, "Password alterada com sucesso").send(res);
}

const RESET_REQUESTED = "Se existir uma conta com este email, enviámos as instruções para a redefinir";

/** Responde sempre o mesmo: a resposta não pode dizer se o email existe. */
export const requestPasswordReset = async (req: Request, res: Response) => {
    const { email, companyId } = req.body as RequestPasswordResetRequest;

    const candidates: User[] = companyId
        ? [await getUserByEmailAndCompanyId(email, companyId)].filter(
            (candidate): candidate is User => candidate !== null,
        )
        : await getUsersByEmail(email);

    for (const candidate of candidates) {
        // Sem passwordHash não há password para redefinir: essa conta ativa-se.
        // Uma conta terminada é definitiva: terminar já lhe apagou o token.
        if (!candidate.passwordHash || candidate.status === UserStatus.Terminated) {
            continue;
        }

        // Um erro numa conta não pode mudar a resposta: um 500 aqui era um oráculo.
        try {
            candidate.passwordResetToken = randomUUID();
            candidate.passwordResetExpiresAt = new Date(Date.now() + passwordResetExpDate());

            const saved = await updateUser(candidate);
            const company = await getCompanyById(saved.companyId);

            if (company) {
                const resetUrl = `${feUrl()}/auth/password/reset?token=${saved.passwordResetToken}`;
                // Sem await: o envio só acontece para contas que existem, e esperar por ele denunciava-as.
                void mailer.sendPasswordResetEmail(company, saved.email, resetUrl).catch((error: unknown) => {
                    console.error(`Falha ao enviar a recuperação de ${saved.id}`, error);
                });
            }
        } catch (error) {
            console.error(`Falha ao preparar a recuperação de ${candidate.id}`, error);
        }
    }

    return new HttpResponse(200, RESET_REQUESTED).send(res);
}

/** Só mexe na password: nunca no status nem nas colunas do convite. */
export const confirmPasswordReset = async (req: Request, res: Response) => {
    const { token, password } = req.body as ConfirmPasswordResetRequest;

    const user = await getUserByPasswordResetToken(token);

    if (!user?.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
        throw new HttpError(401, "Token Inválido");
    }

    user.passwordHash = await hash(password, saltRounds);
    user.mustChangePassword = false;
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    // O link também chegou por email.
    user.emailVerifiedAt ??= new Date();

    await updateUser(user);

    return new HttpResponse(200, "Password redefinida com sucesso").send(res);
}
