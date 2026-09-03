import { jest } from "@jest/globals";

export const logSpy = jest
    .spyOn(console, "log")
    .mockImplementation(() => {});
