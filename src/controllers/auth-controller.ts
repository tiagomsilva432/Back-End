import type { Response, Request } from "express";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import { HttpError } from "../dtos/common/errors-dto.js";
import { jwtExpiresIn, jwtSecret, saltRounds } from "../env-vars.js";
import { createUser, getUserByEmail, getUserByEmailAndCompanyId, getUserById, getUserBySignupToken, updateUser } from "../repositories/user-repo.js";
import { User } from "../entities/User.js";
import { compare, hash } from "bcrypt";
import jwt from "jsonwebtoken";
import { UserStatus } from "../types/enums.js";
import type { JwtClaims } from "../dtos/auth/jwt-dto.js";
import type { LoginResponse } from "../dtos/auth/login-dto.js";
import type { MeResponse } from "../dtos/auth/me-dto.js";
import { getAuth } from "../middleware/requireAuth.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { resolveAccountTarget } from "../services/account-policy.js";
import type { CreateAccountRequest, CreateAccountResponse } from "../dtos/auth/account-dto.js";
import { getCompanyById } from "../repositories/company-repo.js";
import { mailer } from "../services/mailer.js";



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

    const activationUrl: string = `${process.env.FE_URL}/auth/account/activate?token=${created.signupToken}`

    console.log(`Conta Criada - URL Ativação: ${activationUrl}`);

    // A conta fica criada mesmo que o email falhe; o token continua válido
    // e pode ser reenviado.
    try {
        await mailer.sendActivationEmail(company, created.email, activationUrl);
    } catch (error) {
        console.error(`Falha ao enviar o email de ativação para ${created.email}`, error);
    }

    const data: CreateAccountResponse = {
        id: created.id,
        companyId: created.companyId,
        email: created.email,
        role: created.role,
        status: created.status,
    };

    return new HttpResponse(201, "Conta criada", undefined, data).send(res);
}

export const activateUserWithToken = async (req: Request, res: Response) => {
    const { signupToken, password } = req.body;

    const user = await getUserBySignupToken(signupToken);

    if(!user?.signupTokenExpiresAt || user.signupTokenExpiresAt < new Date()){
        throw new HttpError(401, "Token Inválido");
    }

    user.passwordHash = await hash(password, saltRounds);
    user.status = UserStatus.Active;
    user.mustChangePassword = false;
    user.signupToken = null;
    user.signupTokenExpiresAt = null;

    await updateUser(user);

    return new HttpResponse(200, "Conta ativada com sucesso").send(res);
}

export const loginWithEmailAndPassword = async (req: Request, res: Response) => {
    const { email, password } = req.body;
    
    const user: User | null = await getUserByEmail(email);

    if(!user?.passwordHash){
        throw new HttpError(401, "Credenciais Inválidas");
    }

    const validPassword: boolean = await compare(password, user.passwordHash);

    if(!validPassword){
        throw new HttpError(401, "Credenciais Inválidas")
    }

    if(user.status !== UserStatus.Active || user.mustChangePassword){
        throw new HttpError(403, "Conta não está ativa")
    }

    const claims: JwtClaims = {
        sub: String(user.id),
        companyId: user.companyId,
        role: user.role,
    };

    const token: string = jwt.sign(claims, jwtSecret(), { expiresIn: jwtExpiresIn() });

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
        throw new HttpError(401, "Token inválido");
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