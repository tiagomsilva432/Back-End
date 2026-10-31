# Back-End

[English](README.md) · Português

> Este é um de dois repositórios: esta API e a aplicação web do
> [Front-End](https://github.com/tiagomsilva432/Front-End) foram feitas para
> trabalhar juntas. Clona os dois lado a lado.

A API de um ERP para uma empresa de software: pessoas, projetos e alocações,
salários e avaliações entre colegas, ausências e feriados, despesas e um painel
de finanças, um quadro de tarefas, chat e ficheiros por projeto, avisos e
notificações em direto.

Express 5 · TypeORM · PostgreSQL 18 · TypeScript (ESM) · Zod.

A referência completa da API é gerada a partir do código e está em
**`/docs`**. Este README explica como pôr tudo a correr e como o sistema se
organiza; não lista todos os endpoints.

**Índice**

1. [Arranque rápido (Docker)](#arranque-rápido-docker)
2. [Correr a API fora do Docker](#correr-a-api-fora-do-docker)
3. [Configuração](#configuração)
4. [Como funciona](#como-funciona)
5. [Estruturas de dados importantes](#estruturas-de-dados-importantes)
6. [Endpoints principais](#endpoints-principais)
7. [Atualizações em direto e ficheiros](#atualizações-em-direto-e-ficheiros)
8. [Scripts](#scripts)
9. [Testes](#testes)
10. [Produção](#produção)

---

## Arranque rápido (Docker)

A forma recomendada em qualquer sistema: Windows, macOS (Intel ou Apple
Silicon) e Linux correm exatamente a mesma stack. Todas as imagens são
multi-arquitetura.

**Precisas de:** Git e Docker Desktop (ou Docker Engine com o Compose v2). Mais
nada instalado na máquina.

### 1. Clonar

Clona os dois repositórios lado a lado, com estes nomes de pasta. A API não
precisa do frontend, mas a stack de produção conta com ele ali.

```bash
git clone https://github.com/tiagomsilva432/Back-End.git
git clone https://github.com/tiagomsilva432/Front-End.git
cd Back-End
```

### 2. Criar o `.env` (opcional)

O Compose tem um valor por omissão para cada variável, por isso a stack arranca
sem `.env`. Cria um para mudar portas, enviar emails a sério, etc. (o `cp`
também funciona no PowerShell, onde é um alias do `Copy-Item`):

```bash
cp .env.example .env
```

O utilizador e a palavra-passe da base de dados ficam fixos quando o volume é
criado pela primeira vez. Se mudares `DB_USER`, `DB_PASSWORD` ou `DB_NAME`
depois (o ficheiro de exemplo usa `root`, o valor por omissão é `postgres`),
recria o volume com `docker compose down -v`.

### 3. Arrancar

```bash
docker compose up --build
```

Arrancam dois contentores:

| Contentor | Porta na máquina | O que é |
| --- | --- | --- |
| `db` | `5433` | PostgreSQL 18, com os dados no volume `db_data` |
| `api` | `3000` | a API em modo watch; corre as migrações primeiro |

O primeiro build demora uns minutos. Quando o log mostrar
`Server a correr em: http://localhost:3000`, abre:

- http://localhost:3000/health → `200`
- http://localhost:3000/docs → a referência da API (precisa de internet: a
  página carrega o visualizador de um CDN; o `/docs.json` funciona offline)

Se a porta 3000 ou a 5433 estiverem ocupadas, define `API_EXPOSED_PORT` ou
`DB_EXPOSED_PORT` no `.env`. Se mudares a da API, define também
`API_PUBLIC_URL=http://localhost:<porta>` (para os pedidos "Try it" do `/docs`
irem ao sítio certo) e o `VITE_API_URL` do frontend.

As migrações também criam uma primeira empresa, a **My Software Company**, e o
catálogo de competências partilhado. Não criam utilizadores.

### 4. Criar o primeiro administrador, ou carregar os dados de demonstração

Escolhe um dos dois.

**A. Só o administrador.** O primeiro `system_admin` não pode vir da API, por
isso cria-se pela linha de comandos. O mesmo comando serve no zsh e no
PowerShell:

```bash
docker compose exec api npm run admin:create -- --email=admin@example.com --password='Admin@2026'
```

A palavra-passe precisa de 8 ou mais caracteres, com uma maiúscula, uma
minúscula, um número e um de `@$!%*?&#`. Mantém as aspas simples: o `!` e o `$`
querem dizer outra coisa no zsh e no PowerShell. O administrador fica na única
empresa que existe; se houver várias, junta `--company-id=<uuid>`.

**B. Os dados de demonstração.** Um seed enche a base de dados com duas
empresas, um administrador para cada, colaboradores, projetos, tarefas,
salários, ausências, despesas, anúncios e avaliações, tudo com datas à volta
de hoje:

```bash
docker compose exec api npm run db:seed
```

| Login | Palavra-passe | Papel | Empresa |
| --- | --- | --- | --- |
| `admin@erp.test` | `Demo@2026` | `system_admin` | Nexo Software |
| `marta.sousa@nexo.test` | `Demo@2026` | `company_admin` | Nexo Software |
| `rui.almeida@nexo.test` | `Demo@2026` | colaborador, gere o Portal do Cliente e o Website Institucional | Nexo Software |
| `ana.ferreira@nexo.test` | `Demo@2026` | colaboradora, gere a Plataforma de Formação | Nexo Software |
| `joao.costa@nexo.test` | `Demo@2026` | colaborador, gere a App Mobile Entregas | Nexo Software |
| `ines.martins@nexo.test` | `Demo@2026` | colaboradora | Nexo Software |
| `pedro.santos@nexo.test` | `Demo@2026` | colaborador, gere a Migração para a Cloud | Nexo Software |
| `beatriz.lopes@nexo.test` | `Demo@2026` | colaboradora | Nexo Software |
| `carla.mendes@atlantico.test` | `Demo@2026` | `company_admin` | Atlântico Digital |
| `nuno.pereira@atlantico.test` | `Demo@2026` | colaborador, gere a Loja Online Onda Azul | Atlântico Digital |
| `sofia.rodrigues@atlantico.test` | `Demo@2026` | colaboradora | Atlântico Digital |

Só corre em desenvolvimento, numa base de dados sem utilizadores, e muda o nome
da My Software Company para Nexo Software. Para recomeçar,
`docker compose down -v`.

### 5. Entrar

No `/docs`, abre **Auth → POST /auth/login**, envia o email e a palavra-passe e
usa o `token` que vem na resposta como Bearer token nos outros pedidos.

### 6. Convidar pessoas

`POST /auth/account/create` cria uma conta em `invited` e envia por email um
link de ativação. Sem SMTP configurado, os emails são **escritos no log da API**
em vez de enviados:

```bash
docker compose logs -f api
```

O link aponta para o frontend (`FE_URL/auth/account/activate?token=…`). Sem o
frontend, tira o token do link e chama `POST /auth/account/activate` com
`{ "signupToken": "<token>", "password": "<palavra-passe>" }`.

### No dia a dia

| | |
| --- | --- |
| Alterações ao código | apanhadas sozinhas (o contentor vigia o `src/` por polling, que funciona nos bind mounts do Windows e do macOS) |
| Migrações novas | `docker compose restart api` |
| O `package.json` mudou | `docker compose up -d --build -V api` (o `-V` substitui o volume antigo do `node_modules`) |
| Parar, sem perder dados | `docker compose down` |
| Parar e apagar a base de dados | `docker compose down -v` |
| Abrir o `psql` | `docker compose exec db psql -U postgres -d erp_ossilvas_dev` |

### Com o frontend

O frontend corre na máquina, com o Node.js 24. Na pasta `Front-End`:

```bash
cp .env.example .env
npm install
npm run dev
```

Abre http://localhost:5173. O `.env` dele aponta para `http://localhost:3000`,
e a API aceita essa origem pelo `CORS_ORIGINS` (sem `.env`, a API aceita
qualquer origem em desenvolvimento).

---

## Correr a API fora do Docker

Para usar um debugger ou ter um ciclo mais rápido. **Precisas do Node.js 24** (a
versão do Dockerfile e do CI) e de uma base de dados PostgreSQL 18.

```bash
npm install
```

Cria o `.env` como no passo 2 e aponta-o para a base de dados:

- **A base de dados do Compose** (`docker compose up -d db`): define
  `DB_HOST=localhost` e `DB_PORT=5433`. O utilizador e a palavra-passe são os
  com que o volume foi criado.
- **Um PostgreSQL 18 local:** `DB_PORT=5432`, as tuas credenciais, e cria a base
  de dados primeiro (`createdb -U postgres erp_ossilvas_dev`). Tem de ser a
  versão 18: as chaves primárias usam o `uuidv7()` por omissão.

Depois:

```bash
npm run db:migrate
npm run admin:create -- --email=admin@example.com --password='Admin@2026'
npm run dev
```

Para os dados de demonstração em vez de um administrador sozinho, corre
`npm run db:seed` no lugar do `admin:create` (ver o passo 4).

---

## Configuração

Tudo vem das variáveis de ambiente (do `.env`, localmente). O `.env.example`
tem todas, comentadas.

| Variável | Por omissão | |
| --- | --- | --- |
| `PORT` | `3000` | |
| `NODE_ENV` | — | `production` esconde os detalhes dos 5xx e fecha o CORS à lista |
| `FE_URL` | `http://localhost:5173` | a base dos links nos emails |
| `CORS_ORIGINS` | — | separadas por vírgulas; vazio = qualquer origem em dev, nenhuma em produção |
| `API_PUBLIC_URL` | `BASE_URL:PORT` | para onde o `/docs` manda os pedidos "Try it" |
| `DB_HOST` · `DB_PORT` | `localhost` · `5432` | o Compose define `db` · `5432` dentro da rede |
| `DB_USER` · `DB_PASSWORD` · `DB_NAME` | `postgres` · `postgres` · `erp` | no Compose, o nome por omissão é `erp_ossilvas_dev` |
| `JWT_SECRET` | — | **obrigatória** |
| `JWT_EXPIRES_IN` | `1d` | com unidade (`12h`, `1d`); um número sozinho são milissegundos |
| `BCRYPT_ROUNDS` | `12` | |
| `SIGNUP_TOKEN_EXPIRATION_DAYS` | `7` | links de ativação |
| `PASSWORD_RESET_EXPIRATION_HOURS` | `1` | links de redefinição |
| `UPLOADS_DIR` | `uploads` | relativa a onde a API corre |
| `FILE_URL_TTL_MINUTES` | `60` | um link de um ficheiro vale entre isto e o dobro |
| `SMTP_HOST` | — | **vazio = os emails vão para o log** |
| `SMTP_PORT` · `SMTP_USER` · `SMTP_PASSWORD` | `587` · — · — | `465` usa TLS implícito |
| `MAIL_FROM` | `nao-responder@localhost` | tem de ser um endereço que o fornecedor aceite |
| `MAIL_ALLOW_COMPANY_FROM` | `false` | `true` envia do email de cada empresa; só se estiverem todos verificados |
| `DB_EXPOSED_PORT` · `API_EXPOSED_PORT` | `5433` · `3000` | só no Compose: as portas na máquina |

**Email.** Quem envia de facto é a conta de SMTP, por isso, por omissão, a
empresa aparece no nome do remetente e no `Reply-To`, e o endereço é o
`MAIL_FROM`. Duas configurações que funcionam sem domínio próprio: Gmail com uma
App Password (`smtp.gmail.com:587`) ou o plano gratuito da Brevo com um
remetente verificado (`smtp-relay.brevo.com:587`).

---

## Como funciona

### Estrutura

```
src/
  routes/        routers do Express, com a descrição OpenAPI dos seus caminhos
  controllers/   recebem o pedido e dão a resposta; verificam o acesso
  services/      regras de negócio: políticas, finanças, feriados, ficheiros, tempo real, email
  repositories/  as queries do TypeORM
  entities/      o esquema, como entidades do TypeORM
  dtos/          schemas Zod: validam os pedidos e geram o /docs
  middleware/    autenticação, roles, validação, uploads, erros, CORS, log dos pedidos
  migrations/    a única forma de o esquema mudar (o synchronize está desligado)
  scripts/       admin:create, db:seed, files:sweep, check-sharp
tests/           Jest + supertest contra um PostgreSQL a sério
deploy/          Caddy, a imagem web de produção, scripts up/update/backup
```

### Um pedido

```
cors → express.json → log do pedido
  → requireAuth     verifica o JWT
  → requireRole     volta a ler o utilizador: inativo ou com mustChangePassword → 403
  → validateBody / validateQuery   Zod; um campo inválido → 400 com os erros por campo
  → controller      verificações de alcance e de permissões, depois o trabalho
  → { status, message, code, data }      (os erros usam o mesmo envelope)
```

O `requireRole` lê a conta da base de dados em cada pedido, por isso uma
suspensão vale logo no pedido seguinte, e não só quando o token expira.

### Empresas e roles

Cada conta pertence a uma empresa, e o token leva esse `companyId`. O mesmo
email pode existir em várias empresas; é a palavra-passe que escolhe a conta
(ver o login, mais abaixo).

| Role | Cria | Vê |
| --- | --- | --- |
| `system_admin` | `company_admin`s, em qualquer empresa | todas as empresas (indica `?companyId=`) |
| `company_admin` | `employee`s, na sua empresa | a sua empresa |
| `employee` | — | a sua empresa; só altera o que é seu |

Um id fora do alcance de quem pede responde **404, e não 403**, para a API nunca
confirmar que algo existe noutra empresa.

Algumas regras que mexem com a interface:

- Os salários, os resultados das avaliações e os detalhes das ausências (uma
  baixa aparece como `absent`) só os vê a própria pessoa e quem a administra.
- O chat, os recursos e o quadro de um projeto são dos seus membros: quem está
  alocado, o gestor e os admins da empresa.
- No quadro, o título e a descrição de uma tarefa altera-os quem a criou, o
  gestor ou um admin; o prazo, a prioridade, as etiquetas e os ficheiros também
  o responsável; os outros membros podem pegar numa tarefa sem responsável e
  comentar. Só o gestor ou um admin aprovam uma tarefa para `done`. As regras
  estão em `src/services/task-workflow.ts`.
- Terminar uma conta fecha o salário e as alocações nesse dia.

### Convenções

- **Os ids** são uuidv7, por isso ordenam-se pela data de criação; as listas
  paginadas usam o último id como cursor (`?before=`).
- **As datas** são `YYYY-MM-DD`, e "hoje" é sempre a data em Lisboa, seja qual
  for o fuso do servidor. Os timestamps são ISO 8601 em UTC.
- **O dinheiro** viaja como texto com duas casas decimais (`"1249.90"`).
- **`PATCH`** junta: um campo que não vem fica como está, e um `null` limpa-o.
  **`PUT`** substitui.

---

## Estruturas de dados importantes

Todas as respostas, de sucesso ou de erro:

```json
{ "status": 200, "message": "Login bem sucedido", "code": "SUCCESS_OK", "data": { } }
```

Um `400` lista os campos a assinalar num formulário (também em produção):

```json
{ "status": 400, "message": "Dados inválidos", "code": "BAD_REQUEST",
  "data": [{ "field": "email", "message": "E-mail inválido" }] }
```

**Login.** `POST /auth/login` com `{ email, password }` devolve
`{ token, user: { id, email, role } }`. As claims do token são
`{ sub, companyId, role }`. Se a palavra-passe abrir contas em duas empresas,
responde `409` com a escolha, e o cliente repete o login com o `companyId`:

```json
{ "status": 409, "code": "CONFLICT", "message": "…",
  "data": [{ "companyId": "0193…", "companyName": "ACME Software" }] }
```

**Os ficheiros** (avatares, recibos, documentos de ausências, recursos de
projeto, anexos de tarefas) vêm dentro do recurso a que pertencem, assim:

```json
{ "id": "0193…", "kind": "expense_receipt", "name": "fatura.pdf",
  "mimeType": "application/pdf", "size": 48213,
  "url": "http://localhost:3000/files/0193…?exp=1793664000&sig=…",
  "uploadedBy": "0193…", "createdAt": "2026-10-24T09:30:00.000Z", "duplicateOwnerIds": [] }
```

**As notificações:**

```json
{ "id": "0193…", "type": "allocation.created",
  "message": "Tem uma nova alocação no projeto Website (50%)",
  "data": { "projectId": "0193…", "projectName": "Website" },
  "readAt": null, "createdAt": "2026-10-24T09:30:00.000Z" }
```

---

## Endpoints principais

O resto, com os corpos, as respostas e as regras de permissões, está no `/docs`.

| Endpoint | |
| --- | --- |
| `GET /docs` · `GET /docs.json` | a referência da API · o mesmo em OpenAPI 3.1 |
| `GET /health` · `GET /health/db` | o servidor está de pé · chega à base de dados |
| `POST /auth/login` · `GET /auth/me` | entrar · de quem é o token |
| `POST /auth/account/create` · `POST /auth/account/activate` | convidar alguém · definir a palavra-passe com o link do email |
| `POST /auth/password/reset` · `POST /auth/password/reset/confirm` | pedir e confirmar a redefinição da palavra-passe |
| `GET /users` | o diretório da empresa, cada pessoa com o seu perfil |
| `GET /projects` · `GET /projects/{id}` | os projetos da empresa |
| `GET /projects/{id}/tasks` | o quadro: quatro colunas de tarefas |
| `POST /projects/{id}/tasks/{taskId}/move` | arrastar uma tarefa: `{ status, position }` |
| `GET /calendar?from=&to=` | feriados e ausências num intervalo |
| `GET /finance/overview` | o painel de finanças (admins) |
| `GET /notifications/mine` | a caixa de notificações, das mais recentes para as mais antigas |
| `POST /notifications/stream-ticket` · `GET /notifications/stream` | o stream em direto (ver abaixo) |

**Uma empresa nova** entra em três passos: o `system_admin` cria-a
(`POST /companies`), convida o seu `company_admin` (`POST /auth/account/create`
com esse `companyId`), e esse admin ativa a conta e convida os colaboradores.

---

## Atualizações em direto e ficheiros

**Server-Sent Events.** O `EventSource` do browser não consegue enviar o header
`Authorization`, por isso o cliente troca primeiro o token por um bilhete de uso
único (`POST /notifications/stream-ticket`, válido 30 s) e abre
`GET /notifications/stream?ticket=…`. Eventos: `ready`, `notification`,
`announcement`, `project_message`, `project_task`, `project_task_comment`, e
`close` com o motivo. Um bilhete só serve uma vez, por isso o cliente volta a
ligar-se sozinho com um novo. Os streams abertos vivem em memória: isto funciona
com **um** processo da API.

**Os uploads** vão em `multipart/form-data`, com o ficheiro num campo chamado
`file`, para o recurso a que pertencem (por exemplo,
`POST /expenses/{id}/receipts`). O tipo vê-se pelos bytes, as imagens são
regravadas sem metadados, e cada ficheiro volta com um `url` assinado que não
precisa de token e expira ao fim de uma ou duas horas. Lê-o do recurso de cada
vez em vez de o guardar. Os ficheiros ficam em `UPLOADS_DIR`.

---

## Scripts

| Script | |
| --- | --- |
| `npm run dev` | modo watch, sem build |
| `npm run build` · `npm start` | compila para `dist/` · compila e corre |
| `npm test` · `npm run test:watch` | os testes (precisam do Docker) |
| `npm run test:types` | verifica os tipos de `src/` e de `tests/` |
| `npm run lint` · `npm run lint:fix` | Biome |
| `npm run db:migrate` · `npm run db:revert` | aplica as migrações pendentes · desfaz a última |
| `npm run db:generate -- src/migrations/Nome` | escreve uma migração a partir das alterações às entidades (lê-a antes de a correr) |
| `npm run db:check` | falha se as entidades e as migrações não baterem certo |
| `npm run admin:create -- --email=… --password='…'` | cria um `system_admin` |
| `npm run db:seed` | enche uma base de dados vazia com dados de demonstração (só em desenvolvimento) |
| `npm run files:sweep` | apaga os ficheiros cujo dono já não existe |

Na stack do Docker, põe-lhes `docker compose exec api` à frente.

---

## Testes

```bash
npm install
npm test
```

O Docker tem de estar a correr; não há mais nada a preparar. Os testes arrancam
o seu próprio `postgres:18-alpine` numa porta aleatória (Testcontainers), correm
as migrações e apagam-no no fim. A primeira vez descarrega a imagem. O Docker
Desktop funciona logo no Windows e no macOS; com o Colima ou parecidos, aponta o
`DOCKER_HOST` para o socket deles.

Cada teste corre dentro de uma transação que é desfeita no fim, por isso os
testes nunca veem os dados uns dos outros. Ao escrever um:

- usa o `repo(Entity)` ou o `manager()` do `tests/setup/db.ts`, ou os
  repositórios de `src/`; nunca o `AppDataSource.query()`, que foge à transação
  do teste;
- não acrescentes `resetMocks` nem `restoreMocks` ao `jest.config.mjs`;
- o email e o hub de tempo real têm espiões em `tests/helpers/`;
- os uploads vão para uma pasta temporária que se esvazia depois de cada teste.

O CI (`.github/workflows/ci.yml`) corre o lint, os tipos, o build, a
verificação das migrações, os testes, as duas imagens Docker e um arranque do
build compilado.

---

## Produção

Um servidor, quatro contentores: `db`, `migrate` (corre as migrações e sai),
`api`, e `web` (Caddy: HTTPS, o frontend compilado, e o `/api` encaminhado para
a API). Os uploads vivem no volume `uploads`.

Num servidor Ubuntu novo, com as portas 22, 80 e 443 abertas:

```bash
curl -fsSL https://get.docker.com | sh
mkdir -p /srv/erp && cd /srv/erp
git clone https://github.com/tiagomsilva432/Back-End.git
git clone https://github.com/tiagomsilva432/Front-End.git
cd Back-End && cp deploy/env.prod.example .env.prod
```

Preenche o `.env.prod`. O `PUBLIC_URL` é o endereço público com o protocolo;
sem domínio, usa o IP do servidor pelo sslip.io
(`https://203-0-113-10.sslip.io`). Depois:

```bash
sh deploy/up.sh
docker compose --env-file .env.prod -f compose.prod.yaml exec api npm run admin:create:prod -- --email=<email> --password='<palavra-passe>'
docker compose --env-file .env.prod -f compose.prod.yaml exec api node dist/scripts/check-sharp.js
```

O último comando confirma que o processamento de imagens funciona nessa
máquina; deve escrever `… linux-x64: OK`.

| | |
| --- | --- |
| Atualizar | `sh deploy/update.sh` (faz pull dos dois repositórios e volta a fazer o deploy) |
| Logs | `docker compose --env-file .env.prod -f compose.prod.yaml logs -f api` |
| Backup diário | `0 3 * * * /bin/sh /srv/erp/Back-End/deploy/backup.sh` no `crontab -e` |

O backup escreve `backups/erp-<data>.dump` e `backups/uploads-<data>.tar.gz` e
guarda 7 dias. Repõe os dois juntos: uma base de dados sem os uploads tem
recibos que dão 404.

### A stack de produção na tua máquina

```bash
cp deploy/env.prod.example .env.prod
```

No `.env.prod`, define `PUBLIC_URL=http://localhost`, `HTTP_PORT=8080` e
`HTTPS_PORT=8443` (para não precisar das portas 80 e 443), e quaisquer valores
para `DB_PASSWORD` e `JWT_SECRET`. Depois arranca-a. É o único comando que
muda, porque o PowerShell não tem `sh`:

macOS (zsh):

```bash
sh deploy/up.sh
```

Windows (PowerShell):

```powershell
docker compose --env-file .env.prod -f compose.prod.yaml up -d --build
```

Abre http://localhost:8080.
