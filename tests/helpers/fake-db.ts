import { jest } from "@jest/globals";

/**
 * O repositório falso — a nossa "base de dados".
 *
 * Um mock não é nada de mágico: é um objeto normal cujos métodos são
 * `jest.fn()`. Um `jest.fn()` faz duas coisas:
 *   1. GRAVA todas as chamadas que recebe (para depois fazermos asserções);
 *   2. devolve o que lhe mandarmos devolver (mockResolvedValue, mockRejectedValue...).
 *
 * As assinaturas são propositadamente vagas (`unknown`): o `mockResolvedValue()`
 * só aceita valores quando o tipo de retorno do mock é uma Promise, e o
 * `unknown` deixa-nos devolver qualquer forma de objeto em cada teste.
 */
export const fakeRepo = {
  findOneBy: jest.fn<(where: Record<string, unknown>) => Promise<unknown>>(),
  save: jest.fn<(entity: unknown) => Promise<unknown>>(),
  find: jest.fn<(options?: unknown) => Promise<unknown[]>>(),
  findOne: jest.fn<(options: unknown) => Promise<unknown>>(),
  update: jest.fn<(criteria: unknown, partial: unknown) => Promise<unknown>>(),
  delete: jest.fn<(criteria: unknown) => Promise<unknown>>(),
};

/**
 * Limpa o repositório falso entre testes.
 *
 * Usa mockReset() e não mockClear() de propósito. A diferença importa:
 *   - mockClear() -> esquece as CHAMADAS, mas mantém o valor de retorno configurado
 *   - mockReset() -> esquece as chamadas E o valor de retorno
 * Se usássemos mockClear, um `mockResolvedValue(utilizador)` de um teste
 * continuaria ativo no teste seguinte. Bugs desses são horríveis de encontrar.
 */
export function resetFakeRepo(): void {
  for (const fn of Object.values(fakeRepo)) fn.mockReset();
}
