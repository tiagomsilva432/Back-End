import { jest } from "@jest/globals";
import { mailer } from "../../src/services/mailer.js";

export const mailSpy = jest
    .spyOn(mailer, "sendActivationEmail")
    .mockImplementation(async () => {});
