import "reflect-metadata";
import "dotenv/config";
import { hash } from "bcrypt";
import type { EntityManager } from "typeorm";
import { AppDataSource } from "../data-source.js";
import {
    AbsenceRequest,
    Allocation,
    Announcement,
    Company,
    EmployeeProfile,
    EmployeeSkill,
    Expense,
    Project,
    ProjectTask,
    ProjectTaskComment,
    Review,
    ReviewCycle,
    ReviewRequest,
    Salary,
    Skill,
    User,
} from "../entities/index.js";
import { envIsDev, saltRounds } from "../env-vars.js";
import {
    AbsenceStatus,
    AbsenceType,
    AnnouncementScope,
    AnnouncementSeverity,
    ExpenseCategory,
    ProjectStatus,
    ReviewRequestStatus,
    TaskPriority,
    TaskStatus,
    UserRole,
    UserStatus,
} from "../types/enums.js";
import { addDays, isoDate, monthsAgo } from "../utils/dates.js";

const PASSWORD = "Demo@2026";
const DAY_MS = 24 * 60 * 60 * 1000;

const today = isoDate();
const inDays = (days: number): string => addDays(today, days);
const ago = (months: number): string => monthsAgo(months, today);
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);
const noon = (date: string): Date => new Date(`${date}T12:00:00Z`);

// O monthsAgo passa um 31 que não existe para o dia 1 seguinte: aqui quer-se mesmo o dia 1 desse mês.
const firstOfMonth = (months: number): string => {
    const [year, month] = today.split("-").map(Number) as [number, number];
    return new Date(Date.UTC(year, month - 1 - months, 1)).toISOString().slice(0, 10);
};

type CompanyKey = "nexo" | "atlantico";

interface PersonSeed {
    company: CompanyKey;
    email: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    jobTitle: string;
    hiredMonthsAgo: number;
    phone: string;
    address: string;
}

const PEOPLE = {
    admin: { company: "nexo", email: "admin@erp.test", role: UserRole.SystemAdmin, firstName: "Administrador", lastName: "Sistema", jobTitle: "Administrador de sistema", hiredMonthsAgo: 48, phone: "+351 910 000 001", address: "Avenida da Liberdade 110, Lisboa" },
    marta: { company: "nexo", email: "marta.sousa@nexo.test", role: UserRole.CompanyAdmin, firstName: "Marta", lastName: "Sousa", jobTitle: "Diretora de Operações", hiredMonthsAgo: 40, phone: "+351 912 345 601", address: "Rua Augusta 45, Lisboa" },
    rui: { company: "nexo", email: "rui.almeida@nexo.test", role: UserRole.Employee, firstName: "Rui", lastName: "Almeida", jobTitle: "Tech Lead", hiredMonthsAgo: 48, phone: "+351 912 345 602", address: "Rua de Santa Catarina 210, Porto" },
    ana: { company: "nexo", email: "ana.ferreira@nexo.test", role: UserRole.Employee, firstName: "Ana", lastName: "Ferreira", jobTitle: "Frontend Developer", hiredMonthsAgo: 24, phone: "+351 912 345 603", address: "Avenida de Roma 12, Lisboa" },
    joao: { company: "nexo", email: "joao.costa@nexo.test", role: UserRole.Employee, firstName: "João", lastName: "Costa", jobTitle: "Backend Developer", hiredMonthsAgo: 36, phone: "+351 912 345 604", address: "Rua do Ouro 88, Lisboa" },
    ines: { company: "nexo", email: "ines.martins@nexo.test", role: UserRole.Employee, firstName: "Inês", lastName: "Martins", jobTitle: "UX/UI Designer", hiredMonthsAgo: 18, phone: "+351 912 345 605", address: "Rua Garrett 30, Lisboa" },
    pedro: { company: "nexo", email: "pedro.santos@nexo.test", role: UserRole.Employee, firstName: "Pedro", lastName: "Santos", jobTitle: "DevOps Engineer", hiredMonthsAgo: 24, phone: "+351 912 345 606", address: "Avenida da Boavista 1500, Porto" },
    beatriz: { company: "nexo", email: "beatriz.lopes@nexo.test", role: UserRole.Employee, firstName: "Beatriz", lastName: "Lopes", jobTitle: "QA Engineer", hiredMonthsAgo: 12, phone: "+351 912 345 607", address: "Rua de Cedofeita 75, Porto" },
    carla: { company: "atlantico", email: "carla.mendes@atlantico.test", role: UserRole.CompanyAdmin, firstName: "Carla", lastName: "Mendes", jobTitle: "CEO", hiredMonthsAgo: 30, phone: "+351 913 456 701", address: "Rua Direita 20, Peniche" },
    nuno: { company: "atlantico", email: "nuno.pereira@atlantico.test", role: UserRole.Employee, firstName: "Nuno", lastName: "Pereira", jobTitle: "Full-stack Developer", hiredMonthsAgo: 20, phone: "+351 913 456 702", address: "Avenida do Mar 5, Ericeira" },
    sofia: { company: "atlantico", email: "sofia.rodrigues@atlantico.test", role: UserRole.Employee, firstName: "Sofia", lastName: "Rodrigues", jobTitle: "Product Designer", hiredMonthsAgo: 14, phone: "+351 913 456 703", address: "Rua da Praia 9, Peniche" },
} satisfies Record<string, PersonSeed>;

type PersonKey = keyof typeof PEOPLE;

// O primeiro vale desde a contratação; os seguintes, desde há n meses.
const SALARIES: Partial<Record<PersonKey, Array<[amount: number, fromMonthsAgo: number | null, reason: string | null]>>> = {
    marta: [[3800, null, null]],
    rui: [[2900, null, null], [3200, 6, "Promoção a Tech Lead"]],
    ana: [[1900, null, null], [2100, 2, "Revisão anual"]],
    joao: [[2300, null, null]],
    ines: [[1950, null, null]],
    pedro: [[2500, null, null]],
    beatriz: [[1800, null, null]],
    carla: [[3500, null, null]],
    nuno: [[2400, null, null]],
    sofia: [[2200, null, null]],
};

const SKILLS: Partial<Record<PersonKey, Array<[name: string, proficiency: number, years: number]>>> = {
    rui: [["Node.js", 5, 8], ["TypeScript", 5, 6], ["Backend", 4, 9]],
    ana: [["React", 5, 4], ["JavaScript", 5, 5], ["TypeScript", 4, 3], ["Frontend", 5, 5]],
    joao: [["Node.js", 4, 5], ["SQL", 4, 6], ["Backend", 5, 6]],
    ines: [["Frontend", 3, 2], ["React", 3, 1]],
    pedro: [["Docker", 5, 6], ["DevOps", 5, 6], ["Git", 4, 7]],
    beatriz: [["QA", 5, 4], ["JavaScript", 3, 2]],
    nuno: [["Fullstack", 4, 5], ["React", 4, 4], ["Node.js", 3, 3]],
    sofia: [["Frontend", 3, 2]],
};

interface ProjectSeed {
    company: CompanyKey;
    name: string;
    clientName: string | null;
    status: ProjectStatus;
    manager: PersonKey;
    startDate: string;
    endDate: string | null;
    budget: number;
}

const PROJECTS = {
    portal: { company: "nexo", name: "Portal do Cliente", clientName: "Banco Horizonte", status: ProjectStatus.Active, manager: "rui", startDate: ago(5), endDate: inDays(75), budget: 90000 },
    app: { company: "nexo", name: "App Mobile Entregas", clientName: "Rápido Express", status: ProjectStatus.Active, manager: "joao", startDate: ago(3), endDate: inDays(45), budget: 21000 },
    migracao: { company: "nexo", name: "Migração para a Cloud", clientName: null, status: ProjectStatus.OnHold, manager: "pedro", startDate: ago(2), endDate: null, budget: 15000 },
    website: { company: "nexo", name: "Website Institucional", clientName: "Quinta do Vale", status: ProjectStatus.Completed, manager: "rui", startDate: ago(8), endDate: ago(4), budget: 20000 },
    formacao: { company: "nexo", name: "Plataforma de Formação", clientName: "Escola Digital", status: ProjectStatus.Planned, manager: "ana", startDate: inDays(30), endDate: null, budget: 45000 },
    loja: { company: "atlantico", name: "Loja Online Onda Azul", clientName: "Onda Azul Surf", status: ProjectStatus.Active, manager: "nuno", startDate: ago(4), endDate: inDays(30), budget: 40000 },
} satisfies Record<string, ProjectSeed>;

type ProjectKey = keyof typeof PROJECTS;

const ALLOCATIONS: Array<[who: PersonKey, project: ProjectKey, percent: number, role: string, endDate: string | null]> = [
    ["rui", "portal", 60, "Tech Lead", null],
    ["rui", "website", 50, "Tech Lead", ago(4)],
    ["ana", "portal", 80, "Frontend", null],
    ["ana", "website", 100, "Frontend", ago(4)],
    ["joao", "app", 80, "Backend", null],
    ["joao", "portal", 40, "Backend", null],
    ["ines", "portal", 30, "UX/UI", null],
    ["ines", "app", 40, "UX/UI", null],
    ["pedro", "migracao", 50, "DevOps", null],
    ["pedro", "portal", 20, "DevOps", null],
    ["beatriz", "portal", 50, "QA", null],
    ["beatriz", "app", 50, "QA", null],
    ["nuno", "loja", 100, "Full-stack", null],
    ["sofia", "loja", 60, "Design", null],
];

interface TaskSeed {
    title: string;
    status: TaskStatus;
    assignee: PersonKey | null;
    priority?: TaskPriority;
    dueInDays?: number;
    labels?: string[];
    createdBy: PersonKey;
    createdDaysAgo: number;
    completedDaysAgo?: number;
    comments?: Array<[author: PersonKey, body: string, daysAgo: number]>;
}

const TASKS: Record<ProjectKey, TaskSeed[]> = {
    portal: [
        { title: "Página de recuperação de palavra-passe", status: TaskStatus.Todo, assignee: "ana", priority: TaskPriority.High, dueInDays: 7, labels: ["frontend"], createdBy: "rui", createdDaysAgo: 6 },
        { title: "Exportar extratos em PDF", status: TaskStatus.Todo, assignee: "joao", dueInDays: 14, labels: ["backend"], createdBy: "rui", createdDaysAgo: 5 },
        { title: "Rever acessibilidade (WCAG AA)", status: TaskStatus.Todo, assignee: null, priority: TaskPriority.Low, labels: ["frontend", "acessibilidade"], createdBy: "ines", createdDaysAgo: 3 },
        {
            title: "Autenticação com dois fatores", status: TaskStatus.InProgress, assignee: "joao", priority: TaskPriority.Critical, dueInDays: 3, labels: ["backend", "segurança"], createdBy: "rui", createdDaysAgo: 12,
            comments: [
                ["rui", "Vamos usar TOTP (app autenticadora); o SMS fica para depois.", 4],
                ["joao", "Combinado. O QR code já está a ser gerado, falta a recuperação por códigos.", 3],
            ],
        },
        { title: "Dashboard de movimentos", status: TaskStatus.InProgress, assignee: "ana", priority: TaskPriority.High, dueInDays: 5, labels: ["frontend"], createdBy: "rui", createdDaysAgo: 10 },
        { title: "Pipeline de deploy para staging", status: TaskStatus.InProgress, assignee: "pedro", dueInDays: -2, labels: ["devops"], createdBy: "pedro", createdDaysAgo: 15 },
        { title: "Ecrãs de onboarding", status: TaskStatus.Review, assignee: "ines", dueInDays: 1, labels: ["design"], createdBy: "rui", createdDaysAgo: 14 },
        {
            title: "Testes E2E do login", status: TaskStatus.Review, assignee: "beatriz", priority: TaskPriority.High, labels: ["qa"], createdBy: "beatriz", createdDaysAgo: 9,
            comments: [["beatriz", "Passam todos menos o bloqueio após 5 tentativas falhadas.", 1]],
        },
        { title: "Configurar repositório e CI", status: TaskStatus.Done, assignee: "pedro", labels: ["devops"], createdBy: "rui", createdDaysAgo: 140, completedDaysAgo: 120 },
        { title: "Modelo de dados das contas", status: TaskStatus.Done, assignee: "joao", labels: ["backend"], createdBy: "rui", createdDaysAgo: 110, completedDaysAgo: 90 },
        { title: "Protótipo navegável", status: TaskStatus.Done, assignee: "ines", labels: ["design"], createdBy: "rui", createdDaysAgo: 80, completedDaysAgo: 60 },
    ],
    app: [
        { title: "Notificações push de entrega", status: TaskStatus.Todo, assignee: "joao", labels: ["backend"], createdBy: "joao", createdDaysAgo: 8 },
        { title: "Modo offline", status: TaskStatus.Todo, assignee: null, priority: TaskPriority.Low, createdBy: "joao", createdDaysAgo: 8 },
        { title: "Design do ecrã de tracking", status: TaskStatus.InProgress, assignee: "ines", priority: TaskPriority.High, dueInDays: 4, labels: ["design"], createdBy: "joao", createdDaysAgo: 11 },
        { title: "Login com número de telemóvel", status: TaskStatus.Review, assignee: "joao", priority: TaskPriority.High, labels: ["backend"], createdBy: "joao", createdDaysAgo: 20 },
    ],
    migracao: [
        { title: "Inventário dos serviços atuais", status: TaskStatus.Todo, assignee: "pedro", createdBy: "pedro", createdDaysAgo: 50 },
        { title: "Terraform da rede", status: TaskStatus.InProgress, assignee: "pedro", labels: ["devops"], createdBy: "pedro", createdDaysAgo: 45 },
    ],
    website: [
        { title: "Design da homepage", status: TaskStatus.Done, assignee: "ana", createdBy: "rui", createdDaysAgo: 230, completedDaysAgo: 200 },
        { title: "Integração com a loja de vinhos", status: TaskStatus.Done, assignee: "ana", createdBy: "rui", createdDaysAgo: 200, completedDaysAgo: 160 },
        { title: "SEO e analytics", status: TaskStatus.Done, assignee: "rui", createdBy: "rui", createdDaysAgo: 160, completedDaysAgo: 130 },
    ],
    formacao: [],
    loja: [
        { title: "Checkout com MB WAY", status: TaskStatus.InProgress, assignee: "nuno", priority: TaskPriority.High, dueInDays: 6, createdBy: "nuno", createdDaysAgo: 10 },
        { title: "Fotos de produto na galeria", status: TaskStatus.Todo, assignee: "sofia", createdBy: "nuno", createdDaysAgo: 4 },
        { title: "Catálogo de pranchas", status: TaskStatus.Done, assignee: "nuno", createdBy: "nuno", createdDaysAgo: 90, completedDaysAgo: 60 },
    ],
};

const ABSENCES: Array<{ who: PersonKey; type: AbsenceType; status: AbsenceStatus; startDate: string; endDate: string; note: string | null; decidedDaysAgo?: number }> = [
    { who: "ana", type: AbsenceType.Vacation, status: AbsenceStatus.Approved, startDate: inDays(10), endDate: inDays(14), note: null, decidedDaysAgo: 5 },
    { who: "joao", type: AbsenceType.Vacation, status: AbsenceStatus.Pending, startDate: inDays(21), endDate: inDays(25), note: "Viagem de família" },
    { who: "beatriz", type: AbsenceType.Leave, status: AbsenceStatus.Pending, startDate: inDays(5), endDate: inDays(5), note: "Mudança de casa" },
    { who: "ines", type: AbsenceType.Sick, status: AbsenceStatus.Approved, startDate: inDays(-8), endDate: inDays(-6), note: null, decidedDaysAgo: 8 },
    { who: "rui", type: AbsenceType.Vacation, status: AbsenceStatus.Approved, startDate: inDays(-60), endDate: inDays(-56), note: null, decidedDaysAgo: 75 },
    { who: "sofia", type: AbsenceType.Vacation, status: AbsenceStatus.Pending, startDate: inDays(12), endDate: inDays(16), note: null },
];

const monthly = (months: number): string[] => Array.from({ length: months }, (_, i) => firstOfMonth(i));

const EXPENSES: Array<{ company: CompanyKey; project: ProjectKey | null; title: string; amount: number; category: ExpenseCategory; dates: string[]; by: PersonKey }> = [
    { company: "nexo", project: null, title: "Renda do escritório", amount: 1800, category: ExpenseCategory.Office, dates: monthly(6), by: "marta" },
    { company: "nexo", project: null, title: "Licenças de software", amount: 410, category: ExpenseCategory.Software, dates: monthly(6), by: "marta" },
    { company: "nexo", project: null, title: "Portáteis para a equipa", amount: 2900, category: ExpenseCategory.Hardware, dates: [ago(4)], by: "marta" },
    { company: "nexo", project: null, title: "Formação AWS", amount: 650, category: ExpenseCategory.Services, dates: [ago(2)], by: "marta" },
    { company: "nexo", project: null, title: "Jantar de equipa", amount: 380, category: ExpenseCategory.Other, dates: [ago(1)], by: "marta" },
    { company: "nexo", project: "portal", title: "Licenças Figma", amount: 540, category: ExpenseCategory.Software, dates: [ago(4)], by: "rui" },
    { company: "nexo", project: "portal", title: "Servidor de staging", amount: 190, category: ExpenseCategory.Services, dates: monthly(5), by: "rui" },
    { company: "nexo", project: "portal", title: "Viagem ao cliente (Porto)", amount: 285, category: ExpenseCategory.Travel, dates: [ago(3)], by: "rui" },
    { company: "nexo", project: "portal", title: "Testes de penetração", amount: 2400, category: ExpenseCategory.Services, dates: [ago(1)], by: "rui" },
    { company: "nexo", project: "app", title: "Conta Apple Developer", amount: 99, category: ExpenseCategory.Software, dates: [ago(3)], by: "joao" },
    { company: "nexo", project: "app", title: "Dispositivos de teste", amount: 1650, category: ExpenseCategory.Hardware, dates: [ago(2)], by: "joao" },
    { company: "nexo", project: "app", title: "API de mapas", amount: 420, category: ExpenseCategory.Services, dates: [ago(1)], by: "joao" },
    { company: "nexo", project: "migracao", title: "Créditos AWS", amount: 1200, category: ExpenseCategory.Services, dates: monthly(2), by: "pedro" },
    { company: "nexo", project: "website", title: "Tema e plugins", amount: 320, category: ExpenseCategory.Software, dates: [ago(7)], by: "rui" },
    { company: "nexo", project: "website", title: "Sessão fotográfica", amount: 900, category: ExpenseCategory.Services, dates: [ago(6)], by: "rui" },
    { company: "atlantico", project: null, title: "Renda do cowork", amount: 600, category: ExpenseCategory.Office, dates: monthly(4), by: "carla" },
    { company: "atlantico", project: "loja", title: "Shopify", amount: 300, category: ExpenseCategory.Software, dates: [ago(3)], by: "nuno" },
];

const CLOSED_REVIEWS: Array<[reviewer: PersonKey, reviewee: PersonKey, score: number, raise: boolean, comments: string]> = [
    ["rui", "ana", 5, true, "Muito autónoma e cuidadosa com a qualidade do código."],
    ["joao", "ana", 4, true, "Comunica bem com o backend e antecipa problemas."],
    ["rui", "joao", 4, true, "Sólido tecnicamente; podia documentar mais as decisões."],
    ["ana", "joao", 5, true, "Está sempre disponível para ajudar a equipa."],
    ["ana", "ines", 4, true, "Protótipos claros que poupam muitas dúvidas."],
    ["rui", "ines", 4, false, "Bom trabalho; falta envolver mais cedo quem desenvolve."],
];

const OPEN_REQUESTS: Array<[reviewer: PersonKey, reviewee: PersonKey]> = [
    ["ana", "beatriz"],
    ["joao", "ines"],
    ["beatriz", "ana"],
    ["ines", "rui"],
];

async function seed(manager: EntityManager, passwordHash: string): Promise<Array<{ user: User; company: Company }>> {
    const companyRepo = manager.getRepository(Company);

    // A migração cria a primeira empresa: passa a ser a Nexo.
    const [existing] = await companyRepo.find({ order: { createdAt: "ASC" }, take: 1 });
    const nexo = existing ?? new Company("");
    nexo.name = "Nexo Software, Lda.";
    nexo.taxId = "514238761";
    nexo.email = "geral@nexo.test";

    const companies: Record<CompanyKey, Company> = {
        nexo: await companyRepo.save(nexo),
        atlantico: await companyRepo.save(new Company("Atlântico Digital", "509876543", "ola@atlantico.test")),
    };

    const users = {} as Record<PersonKey, User>;

    for (const [key, person] of Object.entries(PEOPLE) as Array<[PersonKey, PersonSeed]>) {
        const user = new User(companies[person.company].id, person.email, person.role);
        user.passwordHash = passwordHash;
        user.status = UserStatus.Active;
        user.mustChangePassword = false;
        user.signupToken = null;
        user.signupTokenExpiresAt = null;
        user.emailVerifiedAt = new Date();
        users[key] = await manager.getRepository(User).save(user);

        await manager.getRepository(EmployeeProfile).save(manager.getRepository(EmployeeProfile).create({
            userId: users[key].id,
            firstName: person.firstName,
            lastName: person.lastName,
            jobTitle: person.jobTitle,
            hireDate: ago(person.hiredMonthsAgo),
            phone: person.phone,
            address: person.address,
            birthDate: null,
        }));
    }

    const adminOf = (key: PersonKey): User => (PEOPLE[key].role === UserRole.Employee
        ? users[PEOPLE[key].company === "nexo" ? "marta" : "carla"]
        : users.admin);

    const salaryRepo = manager.getRepository(Salary);
    for (const [key, history] of Object.entries(SALARIES) as Array<[PersonKey, Array<[number, number | null, string | null]>]>) {
        const starts = history.map(([, from]) => (from === null ? ago(PEOPLE[key].hiredMonthsAgo) : ago(from)));

        await salaryRepo.save(history.map(([amount, , reason], i) => salaryRepo.create({
            userId: users[key].id,
            amount: amount.toFixed(2),
            currency: "EUR",
            effectiveFrom: starts[i]!,
            // O effectiveTo é exclusivo: é o dia em que o seguinte começa.
            effectiveTo: starts[i + 1] ?? null,
            reason,
            createdBy: adminOf(key).id,
        })));
    }

    const skillIds = new Map((await manager.getRepository(Skill).find()).map((skill) => [skill.name, skill.id]));
    const employeeSkillRepo = manager.getRepository(EmployeeSkill);
    for (const [key, skills] of Object.entries(SKILLS) as Array<[PersonKey, Array<[string, number, number]>]>) {
        await employeeSkillRepo.save(skills.map(([name, proficiency, years]) => {
            const skillId = skillIds.get(name);
            if (!skillId) {
                throw new Error(`A competência ${name} não está no catálogo`);
            }
            return employeeSkillRepo.create({ userId: users[key].id, skillId, proficiency, yearsExperience: years.toFixed(1) });
        }));
    }

    const projectRepo = manager.getRepository(Project);
    const projects = {} as Record<ProjectKey, Project>;
    for (const [key, project] of Object.entries(PROJECTS) as Array<[ProjectKey, ProjectSeed]>) {
        projects[key] = await projectRepo.save(projectRepo.create({
            companyId: companies[project.company].id,
            managerId: users[project.manager].id,
            name: project.name,
            clientName: project.clientName,
            status: project.status,
            startDate: project.startDate,
            endDate: project.endDate,
            budget: project.budget.toFixed(2),
        }));
    }

    const allocationRepo = manager.getRepository(Allocation);
    await allocationRepo.save(ALLOCATIONS.map(([who, project, percent, role, endDate]) => allocationRepo.create({
        userId: users[who].id,
        projectId: projects[project].id,
        allocationPercent: percent,
        roleOnProject: role,
        startDate: PROJECTS[project].startDate,
        endDate,
    })));

    const taskRepo = manager.getRepository(ProjectTask);
    const commentRepo = manager.getRepository(ProjectTaskComment);
    for (const [key, tasks] of Object.entries(TASKS) as Array<[ProjectKey, TaskSeed[]]>) {
        const positions = new Map<TaskStatus, number>();

        for (const task of tasks) {
            const position = positions.get(task.status) ?? 0;
            positions.set(task.status, position + 1);

            const saved = await taskRepo.save(taskRepo.create({
                projectId: projects[key].id,
                title: task.title,
                description: null,
                status: task.status,
                position,
                assigneeId: task.assignee ? users[task.assignee].id : null,
                dueDate: task.dueInDays === undefined ? null : inDays(task.dueInDays),
                priority: task.priority ?? TaskPriority.Medium,
                labels: task.labels ?? [],
                createdBy: users[task.createdBy].id,
                createdAt: daysAgo(task.createdDaysAgo),
                completedAt: task.completedDaysAgo === undefined ? null : daysAgo(task.completedDaysAgo),
            }));

            for (const [author, body, days] of task.comments ?? []) {
                await commentRepo.save(commentRepo.create({
                    taskId: saved.id,
                    authorId: users[author].id,
                    body,
                    createdAt: daysAgo(days),
                    editedAt: null,
                }));
            }
        }
    }

    const absenceRepo = manager.getRepository(AbsenceRequest);
    await absenceRepo.save(ABSENCES.map((absence) => absenceRepo.create({
        companyId: users[absence.who].companyId,
        userId: users[absence.who].id,
        type: absence.type,
        status: absence.status,
        startDate: absence.startDate,
        endDate: absence.endDate,
        note: absence.note,
        decidedBy: absence.decidedDaysAgo === undefined ? null : adminOf(absence.who).id,
        decidedAt: absence.decidedDaysAgo === undefined ? null : daysAgo(absence.decidedDaysAgo),
        decisionNote: null,
    })));

    const expenseRepo = manager.getRepository(Expense);
    await expenseRepo.save(EXPENSES.flatMap((expense) => expense.dates.map((incurredOn) => expenseRepo.create({
        companyId: companies[expense.company].id,
        projectId: expense.project ? projects[expense.project].id : null,
        title: expense.title,
        description: null,
        amount: expense.amount.toFixed(2),
        category: expense.category,
        incurredOn,
        createdBy: users[expense.by].id,
    }))));

    const announcementRepo = manager.getRepository(Announcement);
    await announcementRepo.save([
        announcementRepo.create({
            scope: AnnouncementScope.System,
            companyId: null,
            projectId: null,
            createdBy: users.admin.id,
            title: "Manutenção programada no sábado",
            body: "A plataforma vai estar indisponível no sábado entre as 08:00 e as 10:00 para atualizações.",
            severity: AnnouncementSeverity.Warning,
            pinned: false,
            endsAt: new Date(Date.now() + 7 * DAY_MS),
        }),
        announcementRepo.create({
            scope: AnnouncementScope.Company,
            companyId: companies.nexo.id,
            projectId: null,
            createdBy: users.marta.id,
            title: "Fecho do escritório na véspera de Natal",
            body: "O escritório fecha no dia 24 de dezembro. Bom Natal a todos!",
            severity: AnnouncementSeverity.Info,
            pinned: true,
            endsAt: null,
        }),
        announcementRepo.create({
            scope: AnnouncementScope.Project,
            companyId: companies.nexo.id,
            projectId: projects.portal.id,
            createdBy: users.rui.id,
            title: "Demo ao cliente na próxima quinta",
            body: "Na quinta-feira mostramos o portal ao Banco Horizonte. O que estiver em revisão deve estar aprovado até quarta.",
            severity: AnnouncementSeverity.Warning,
            pinned: false,
            endsAt: new Date(Date.now() + 7 * DAY_MS),
        }),
    ]);

    const cycleRepo = manager.getRepository(ReviewCycle);
    const requestRepo = manager.getRepository(ReviewRequest);
    const reviewRepo = manager.getRepository(Review);

    const closedOn = ago(3);
    const closed = await cycleRepo.save(cycleRepo.create({
        companyId: companies.nexo.id,
        name: `Avaliação intercalar ${ago(4).slice(0, 4)}`,
        openedBy: users.marta.id,
        deadline: closedOn,
        closedAt: noon(closedOn),
        createdAt: noon(ago(4)),
    }));

    for (const [reviewer, reviewee, score, raise, comments] of CLOSED_REVIEWS) {
        const request = await requestRepo.save(requestRepo.create({
            companyId: companies.nexo.id,
            cycleId: closed.id,
            requestedBy: users.marta.id,
            reviewerId: users[reviewer].id,
            revieweeId: users[reviewee].id,
            status: ReviewRequestStatus.Submitted,
            dueDate: closedOn,
            createdAt: noon(ago(4)),
        }));

        await reviewRepo.save(reviewRepo.create({
            requestId: request.id,
            recommendsRaise: raise,
            performanceScore: score,
            comments,
            submittedAt: noon(addDays(ago(4), 10)),
        }));
    }

    const deadline = inDays(14);
    const open = await cycleRepo.save(cycleRepo.create({
        companyId: companies.nexo.id,
        name: `Avaliação anual ${today.slice(0, 4)}`,
        openedBy: users.marta.id,
        deadline,
        closedAt: null,
        createdAt: daysAgo(5),
    }));

    await requestRepo.save(OPEN_REQUESTS.map(([reviewer, reviewee]) => requestRepo.create({
        companyId: companies.nexo.id,
        cycleId: open.id,
        requestedBy: users.marta.id,
        reviewerId: users[reviewer].id,
        revieweeId: users[reviewee].id,
        status: ReviewRequestStatus.Pending,
        dueDate: deadline,
        createdAt: daysAgo(5),
    })));

    return (Object.keys(PEOPLE) as PersonKey[]).map((key) => ({ user: users[key], company: companies[PEOPLE[key].company] }));
}

if (!envIsDev()) {
    console.error("O seed só corre em desenvolvimento: com NODE_ENV=production não faz nada.");
    process.exit(1);
}

await AppDataSource.initialize();

try {
    if (await AppDataSource.getRepository(User).count({ withDeleted: true }) > 0) {
        throw new Error("A base de dados já tem utilizadores: o seed só corre numa base de dados vazia. Para recomeçar: docker compose down -v");
    }

    const passwordHash = await hash(PASSWORD, saltRounds);
    const accounts = await AppDataSource.transaction((manager) => seed(manager, passwordHash));

    console.log(`Seed concluído. Palavra-passe de todas as contas: ${PASSWORD}`);
    for (const { user, company } of accounts) {
        console.log(`  ${user.role.padEnd(14)} ${user.email.padEnd(32)} ${company.name}`);
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
} finally {
    await AppDataSource.destroy();
}
