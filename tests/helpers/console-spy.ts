import { jest } from "@jest/globals";

/**
 * O requestLogger escreve uma linha por cada pedido, e o auth-controller
 * escreve o URL de ativação. Sem isto, o output dos testes fica ilegível.
 *
 * jest.spyOn(objeto, "metodo") embrulha um método que JÁ EXISTE, mantendo o
 * original acessível; o .mockImplementation(() => {}) troca-o por uma função
 * vazia. O resultado é duplamente útil: silencia o ruído E transforma o
 * console.log em algo sobre o qual podemos fazer asserções (ver o teste do 201).
 *
 * Para depurar um teste e voltar a ver os logs, comenta o .mockImplementation().
 */
export const logSpy = jest
  .spyOn(console, "log")
  .mockImplementation(() => {});
