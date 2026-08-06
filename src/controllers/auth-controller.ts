import { Response, Request } from "express";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import { HttpError } from "../dtos/common/errors-dto.js";
import { BASE_URL, PORT, jwtExpiresIn, jwtSecret, saltRounds } from "../env-vars.js";
import { createUser, getUserByEmail, getUserByEmailAndCompanyId, getUserBySignupToken, updateUser } from "../repositories/user-repo.js";
import { User } from "../entities/User.js";
import { compare, hash } from "bcrypt";
import jwt from "jsonwebtoken";
import { UserStatus } from "../types/enums.js";
import { JwtClaims } from "../dtos/auth/jwt-dto.js";
import { LoginResponse } from "../dtos/auth/login-dto.js";



export const createAccount = async (req: Request, res: Response) => {
    const { companyId, email, role } = req.body;
    const user: User | null = await getUserByEmailAndCompanyId(email, companyId);

    if(user){
        throw new HttpError(409, "Não foi possível criar a conta.");
    }

    const newUser = new User(companyId, email, role);

    const created: User = await createUser(newUser);

    const activationUrl: string = `${BASE_URL}:${PORT}/auth/account/activate?token=${created.signupToken}`

    console.log(`Conta Criada - URL Ativação: ${activationUrl}`);

    return new HttpResponse(201, "Conta criada", undefined, created).send(res);
}

export const activateUserWithToken = async (req: Request, res: Response) => {
    const { signupToken, password } = req.body;

    const user = await getUserBySignupToken(signupToken);

    if(!user || !user.signupTokenExpiresAt || user.signupTokenExpiresAt < new Date()){
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

    if(!user || !user.passwordHash){
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