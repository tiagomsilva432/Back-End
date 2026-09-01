import { Router } from "express";
import { validateBody } from "../middleware/validateBody.js";
import { activateAccountSchema, createAccountSchema } from "../dtos/auth/account-dto.js";
import { activateUserWithToken, createAccount, loginWithEmailAndPassword } from "../controllers/auth-controller.js";
import { loginSchema } from "../dtos/auth/login-dto.js";

const router = Router();

router.post(
    "/auth/account/create",
    validateBody(createAccountSchema),
    createAccount
);

router.post(
    "/auth/account/activate",
    validateBody(activateAccountSchema),
    activateUserWithToken
);

router.post(
    "/auth/login",
    validateBody(loginSchema),
    loginWithEmailAndPassword
);

export default router;