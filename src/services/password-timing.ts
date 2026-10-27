import { randomUUID } from "node:crypto";
import { compare, hash } from "bcrypt";
import { saltRounds } from "../env-vars.js";

let dummyHash: Promise<string> | null = null;

/** Gasta o tempo de um bcrypt quando não houve password nenhuma para comparar. */
async function burnCompare(password: string): Promise<void> {
    dummyHash ??= hash(randomUUID(), saltRounds);
    await compare(password, await dummyHash);
}

export const passwordTiming = { burnCompare };
