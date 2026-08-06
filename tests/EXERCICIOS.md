# Exercícios

Os 5 ficheiros `.test.ts` desta pasta são exemplos comentados. Estes exercícios
são para escreveres tu. Cria um ficheiro novo (por ex. `tests/exercicios.test.ts`)
ou acrescenta aos existentes.

Para correr só um ficheiro: `npm test -- tests/exercicios.test.ts`
Para correr só um teste pelo nome: `npm test -- -t "parte do nome"`
Para reexecutar sozinho a cada gravação: `npm run test:watch`

---

### 1. `role` omitido
POST sem o campo `role`. Assere 201 e inspeciona o que o `save` recebeu.
*Pista: o que é que `new User(company_id, email, undefined)` põe em `role` e em `signupToken`?*

### 2. `role: "ADMIN"` em maiúsculas
Assere a entidade entregue ao `save`.
*Pista: o Zod faz `.toLowerCase()` antes de validar o enum, e o construtor do User trata os admins de forma diferente dos employees.*

### 3. Campo extra desconhecido
`{ company_id: 1, email: "a@b.pt", hacker: true }` — dá 400 ou é ignorado em silêncio?
*Pista: o que faz um `z.object()` simples com chaves que não conhece?*

### 4. `GET /docs.json`
Assere 200, content-type JSON, a existência de `body.openapi`, e que `body.paths` contém `/health`.
*Pista: `expect(res.headers["content-type"]).toMatch(/json/)`.*

### 5. `GET /docs`
Assere 200 e content-type HTML, e que o corpo referencia o `/docs.json`.
*Pista: para HTML usa-se `res.text`, não `res.body`.*

### 6. `/health/db` a devolver 200
Faz a rota acreditar que a DataSource está ligada.
*Pista: `isInitialized` é uma propriedade normal e escrevível da instância `AppDataSource`. Repõe o valor original num `afterEach`, senão estragas o teste do ficheiro `health.test.ts`.*

### 7. `/health/db` a devolver 503 "Falha na ligação à base de dados"
O outro caminho de erro: a DataSource está inicializada mas a consulta rebenta.
*Pista: `mockRejectedValue`. Repara depois com atenção no que o `JSON.stringify` faz a um objeto `Error` passado como `details` — o resultado pode surpreender-te.*

### 8. Pedido sem corpo nenhum
`request(app).post("/auth/account/create")` sem `.send()`.
*Pista: o Express 5 deixa o `req.body` como `undefined`. Que valor de `field` resulta de um issue do Zod na raiz do objeto, depois do `path.join(".")`?*

### 9. JSON malformado
`.set("Content-Type", "application/json").send("{isto-nao-e-json")`.
Assere o que **realmente** acontece e escreve um comentário a explicar porquê.
*Pista: o `SyntaxError` que o `express.json()` atira não é um `HttpError`. Olha para o `errorHandler` e vê em que ramo cai. Não é 400.*

### 10. O `requestLogger`
Assere que um pedido ao `/health` produziu uma linha de log.
*Pista: `logSpy` + `expect.stringContaining("GET /health")`.*

### 11. Mesmo email, empresa diferente
Confirma que a procura é limitada pelo `companyId` e não só pelo email — ou seja, que duas empresas diferentes podem ter o mesmo email.
*Pista: não precisas de mudar o mock; basta olhar bem para os argumentos do `toHaveBeenCalledWith`.*
