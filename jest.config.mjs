/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",

  // Pelo .ts o Jest não sabe se é ESM: o "type": "module" do package.json não chega.
  extensionsToTreatAsEsm: [".ts"],

  testMatch: ["<rootDir>/tests/**/*.test.ts"],

  // .ts antes de .js, para nunca apanhar um build antigo.
  moduleFileExtensions: ["ts", "js", "mjs", "cjs", "json", "node"],

  // Uma segunda cópia da aplicação dava erros de "duplicate manual mock".
  modulePathIgnorePatterns: ["<rootDir>/dist/"],

  // Os imports relativos levam .js (ESM), mas o ficheiro no disco é .ts.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  transform: {
    // O SWC só tira os tipos: um erro de tipos não falha o `npm test`. Para isso há o `npm run test:types`.
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
          // Iguais ao experimentalDecorators e ao emitDecoratorMetadata do tsconfig.json.
          transform: {
            legacyDecorator: true,
            decoratorMetadata: false,
          },
          target: "es2022",
          keepClassNames: true,
        },
        // Em CommonJS não há import.meta.dirname, que o src/data-source.ts usa.
        module: { type: "es6" },
        sourceMaps: "inline",
      },
    ],
  },

  // Correm no processo principal, antes dos workers: a morada da base de dados chega aos testes pelo process.env.
  globalSetup: "<rootDir>/tests/setup/global-db.mjs",
  globalTeardown: "<rootDir>/tests/setup/global-db-teardown.mjs",
  // Em cada ficheiro de teste: o primeiro antes de existir o framework (só env), o segundo já com o beforeEach.
  setupFiles: ["<rootDir>/tests/setup/env.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup/db.ts"],

  // Com mais workers, cada um abria a sua pool contra a mesma base de dados e o isolamento por transação deixava de valer.
  maxWorkers: 1,

  testTimeout: 30_000,

  coverageProvider: "v8",

  // Nunca resetMocks nem restoreMocks: destruíam o spy do getRepository de tests/setup/db.ts
  // e os testes seguintes gravavam na pool em vez da transação.

  verbose: true,
};
