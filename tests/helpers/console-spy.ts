import { jest } from "@jest/globals";

export const logSpy = jest
    .spyOn(console, "log")
    .mockImplementation(() => {});

export const errorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => {});
