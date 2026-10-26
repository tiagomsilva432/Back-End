import { jest } from "@jest/globals";
import { realtime } from "../../src/services/realtime.js";

// Ao contrário dos do mailer, estes não substituem nada: chamam o hub a sério,
// para o teste do stream continuar a ver os eventos chegar.
export const sendToUsersSpy = jest.spyOn(realtime, "sendToUsers");
export const sendToCompanySpy = jest.spyOn(realtime, "sendToCompany");
export const broadcastSpy = jest.spyOn(realtime, "broadcast");
export const disconnectUserSpy = jest.spyOn(realtime, "disconnectUser");

/** Chamado no beforeEach, como o resetMailSpies. */
export function resetRealtimeSpies(): void {
    sendToUsersSpy.mockClear();
    sendToCompanySpy.mockClear();
    broadcastSpy.mockClear();
    disconnectUserSpy.mockClear();
}

/** Os eventos de um tipo que o hub mandou, por esta ordem: [destinatários, dados]. */
export function eventsSentToUsers(event: string): Array<[string[], unknown]> {
    return sendToUsersSpy.mock.calls
        .filter(([, name]) => name === event)
        .map(([userIds, , data]) => [[...userIds].filter((id): id is string => Boolean(id)), data]);
}
