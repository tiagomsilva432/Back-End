import { Router } from "express";
import { validateBody } from "../middleware/validateBody.js";
import { createAccountSchema } from "../dtos/auth/account-dto.js";
import { createAccount } from "../controllers/auth-controller.js";

const router = Router();

router.post(
    "/auth/account/create",
    validateBody(createAccountSchema),
    createAccount
);

export default router;