/**
 * Configuração do Jest.
 *
 * O ficheiro é .mjs (e não .ts) por duas razões: fica inequivocamente em ESM,
 * e o `tsc` nunca lhe toca.
 *
 * Quase tudo o que está aqui existe por causa de UMA característica do projeto:
 * isto é ESM puro ("type": "module" no package.json) escrito em TypeScript.
 * O suporte a ESM no Jest ainda é experimental, daí a flag
 * --experimental-vm-modules no script "test" do package.json.
 *
 * @type {import('jest').Config}
 */
export default {
  // Isto é uma API HTTP, não há browser nem DOM.
  testEnvironment: "node",

  // OBRIGATÓRIO. O Jest não consegue adivinhar, só pela extensão .ts, se o
  // ficheiro é ESM ou CommonJS. O package.json diz "type": "module" -> ESM.
  extensionsToTreatAsEsm: [".ts"],

  // Só ficheiros dentro de tests/ e terminados em .test.ts são testes.
  testMatch: ["<rootDir>/tests/**/*.test.ts"],

  // Resolver .ts antes de .js, para nunca apanhar por acidente um build antigo.
  moduleFileExtensions: ["ts", "js", "mjs", "cjs", "json", "node"],

  // A pasta dist/ é o build compilado. Se o Jest a lesse, veria uma segunda
  // cópia de toda a aplicação (e daria erros de "duplicate manual mock").
  modulePathIgnorePatterns: ["<rootDir>/dist/"],

  // O código-fonte escreve `import { app } from "./app.js"` (assim manda o ESM),
  // mas o ficheiro em disco chama-se `app.ts`. Esta regra tira o ".js" dos
  // caminhos RELATIVOS para o Jest encontrar o TypeScript.
  // Imports de pacotes ("express", "typeorm") não são afetados.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  transform: {
    // O @swc/jest transpila TypeScript -> JavaScript. É rápido, e é da mesma
    // família do esbuild/tsx que já usas em `npm run dev`.
    //
    // ATENÇÃO: o SWC apenas REMOVE os tipos, não os verifica. Um erro de tipos
    // NÃO faz falhar o `npm test`. Para verificar tipos: `npm run test:types`.
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
          transform: {
            // Estes dois espelham EXATAMENTE o tsconfig.json:
            legacyDecorator: true, // "experimentalDecorators": true
            decoratorMetadata: false, // "emitDecoratorMetadata": false
            // (o comentário no tsconfig.json explica porque tem de ficar off:
            //  ligá-lo parte o output ESM por causa de imports circulares
            //  entre entidades)
          },
          target: "es2022",
          keepClassNames: true, // nomes de entidades legíveis nos erros
        },
        // Manter ESM como ESM. Converter para CommonJS não é sequer possível
        // aqui: src/data-source.ts usa `import.meta.dirname`, que não existe
        // em CommonJS.
        module: { type: "es6" },
        sourceMaps: "inline",
      },
    ],
  },

  // A ORDEM destes dois é o coração de toda a montagem.
  //
  // setupFiles corre ANTES de o framework de testes existir: aqui ainda não há
  // describe, it, expect nem beforeEach. É o gancho mais cedo possível, ideal
  // para escrever variáveis de ambiente.
  setupFiles: ["<rootDir>/tests/setup/env.ts"],
  // setupFilesAfterEnv corre DEPOIS, já com o framework montado -- por isso
  // pode registar um beforeEach global. É aqui que se instala o mock da BD.
  setupFilesAfterEnv: ["<rootDir>/tests/setup/mocks.ts"],
  //
  // Ambos correm até ao fim antes de o ficheiro de teste ser importado. É essa
  // garantia que permite aos testes fazerem `import { app } from "../src/app.js"`
  // normalmente, com a certeza de que o mock já está no sítio.

  // O @swc/jest não instrumenta o código para o provider de cobertura do Babel.
  coverageProvider: "v8",

  // NÃO acrescentar `resetMocks` nem `restoreMocks` aqui!
  // Ambos destruiriam os spies criados em tests/setup/mocks.ts logo a seguir ao
  // primeiro teste, e os testes seguintes iriam bater na base de dados real.
  // O isolamento é feito pelo beforeEach explícito nesse ficheiro.

  verbose: true,
};
