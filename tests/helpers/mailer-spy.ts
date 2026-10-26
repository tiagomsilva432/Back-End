import { jest } from "@jest/globals";
import { mailer } from "../../src/services/mailer.js";

export const mailSpy = jest
    .spyOn(mailer, "sendActivationEmail")
    .mockImplementation(async () => {});

export const mailResetSpy = jest
    .spyOn(mailer, "sendPasswordResetEmail")
    .mockImplementation(async () => {});

/** Chamado no beforeEach: assim um spy novo não obriga a mexer no setup/db. */
export function resetMailSpies(): void {
    for (const spy of [mailSpy, mailResetSpy]) {
        spy.mockClear();
        spy.mockImplementation(async () => {});
    }
}
