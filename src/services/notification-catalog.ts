import { z } from "zod";
import { AbsenceType, ProjectStatus } from "../types/enums.js";
import { ABSENT } from "./absence-policy.js";

/**
 * Todas as notificações que existem. Acrescentar uma é uma entrada aqui e uma
 * chamada a notifier.notify() onde a coisa acontece: o schema valida o que se
 * grava, e a mensagem é o texto que a API devolve.
 *
 * O `data` guarda ids, e os nomes como estavam na altura (o projeto pode mudar
 * de nome depois). Nomes de pessoas não: o frontend resolve-os pelo id.
 */

interface NotificationDefinition<S extends z.ZodObject> {
    data: S;
    message: (data: z.infer<S>) => string;
}

const defineNotification = <S extends z.ZodObject>(
    data: S,
    message: (data: z.infer<S>) => string,
): NotificationDefinition<S> => ({ data, message });

const STATUS_LABELS: Record<ProjectStatus, string> = {
    [ProjectStatus.Planned]: "planeado",
    [ProjectStatus.Active]: "ativo",
    [ProjectStatus.OnHold]: "em pausa",
    [ProjectStatus.Completed]: "concluído",
    [ProjectStatus.Cancelled]: "cancelado",
};

const until = (date: string | null) => (date ? ` até ${date}` : "");

const ABSENCE_LABELS: Record<AbsenceType, string> = {
    [AbsenceType.Vacation]: "férias",
    [AbsenceType.Sick]: "baixa",
    [AbsenceType.Leave]: "ausência",
    [AbsenceType.Unjustified]: "falta injustificada",
};

const period = (d: { startDate: string; endDate: string }) =>
    d.startDate === d.endDate ? `a ${d.startDate}` : `de ${d.startDate} a ${d.endDate}`;

const because = (reason: string | null) => (reason ? `: ${reason}` : "");

const project = {
    projectId: z.uuid(),
    projectName: z.string(),
};

const allocation = {
    allocationId: z.uuid(),
    ...project,
};

const task = {
    taskId: z.uuid(),
    taskTitle: z.string(),
    ...project,
};

const absence = {
    absenceId: z.uuid(),
    userId: z.uuid(),
    type: z.enum(AbsenceType),
    startDate: z.string(),
    endDate: z.string(),
};

export const notificationCatalog = {
    "absence.requested": defineNotification(
        z.object(absence),
        (d) => `Há um pedido de ${ABSENCE_LABELS[d.type]} ${period(d)} para aprovar`,
    ),
    "absence.approved": defineNotification(
        z.object(absence),
        (d) => `O seu pedido de ${ABSENCE_LABELS[d.type]} ${period(d)} foi aprovado`,
    ),
    "absence.rejected": defineNotification(
        z.object({ ...absence, reason: z.string().nullable() }),
        (d) => `O seu pedido de ${ABSENCE_LABELS[d.type]} ${period(d)} foi recusado${because(d.reason)}`,
    ),
    // Uma baixa não espera por ninguém: quem decide fica só a saber.
    "absence.auto_approved": defineNotification(
        z.object(absence),
        (d) => `Foi registado um pedido de ${ABSENCE_LABELS[d.type]} ${period(d)}, aprovado automaticamente`,
    ),
    // Para a pessoa, quando um admin regista uma ausência dela: uma falta, ou outra já aprovada.
    "absence.registered": defineNotification(
        z.object(absence),
        (d) => d.type === AbsenceType.Unjustified
            ? `Foi-lhe marcada uma falta injustificada ${period(d)}`
            : `Foi registado em seu nome um pedido de ${ABSENCE_LABELS[d.type]} ${period(d)}, já aprovado`,
    ),
    // Vai para a pessoa, se foi um admin, ou para quem decide, se foi a pessoa.
    "absence.cancelled": defineNotification(
        z.object({ ...absence, reason: z.string().nullable() }),
        (d) => `O pedido de ${ABSENCE_LABELS[d.type]} ${period(d)} foi cancelado${because(d.reason)}`,
    ),
    // Para os gestores de projeto, que são colegas: o tipo já vem tapado.
    "absence.teammate_away": defineNotification(
        z.object({ ...absence, type: z.enum([AbsenceType.Vacation, ABSENT]) }),
        (d) => d.type === AbsenceType.Vacation
            ? `Alguém da sua equipa vai estar de férias ${period(d)}`
            : `Alguém da sua equipa vai estar ausente ${period(d)}`,
    ),
    // Para quem decide: a pessoa juntou uma justificação a um pedido que ainda espera por eles.
    "absence.document_added": defineNotification(
        z.object(absence),
        (d) => `Foi junto um documento ao pedido de ${ABSENCE_LABELS[d.type]} ${period(d)} para aprovar`,
    ),
    "allocation.created": defineNotification(
        z.object({
            ...allocation,
            allocationPercent: z.int(),
            roleOnProject: z.string().nullable(),
            startDate: z.string(),
            endDate: z.string().nullable(),
        }),
        (d) => `Tem uma nova alocação no projeto ${d.projectName} (${d.allocationPercent}%)`,
    ),
    "allocation.updated": defineNotification(
        z.object({
            ...allocation,
            allocationPercent: z.int(),
            roleOnProject: z.string().nullable(),
            endDate: z.string().nullable(),
            changes: z.array(z.enum(["allocationPercent", "roleOnProject", "endDate"])),
        }),
        (d) => `A sua alocação no projeto ${d.projectName} foi alterada`,
    ),
    "allocation.ended": defineNotification(
        z.object({ ...allocation, endDate: z.string() }),
        (d) => `A sua alocação no projeto ${d.projectName} foi fechada (fim a ${d.endDate})`,
    ),
    // Os admins contam com o custo em pessoas; o gestor só com as despesas.
    "project.budget_threshold": defineNotification(
        z.object({ ...project, threshold: z.union([z.literal(80), z.literal(100)]) }),
        (d) => d.threshold === 100
            ? `O projeto ${d.projectName} esgotou o orçamento`
            : `O projeto ${d.projectName} já gastou ${d.threshold}% do orçamento`,
    ),
    "project.manager_assigned": defineNotification(
        z.object(project),
        (d) => `Passou a gerir o projeto ${d.projectName}`,
    ),
    "project.status_changed": defineNotification(
        z.object({ ...project, from: z.enum(ProjectStatus), to: z.enum(ProjectStatus) }),
        (d) => `O projeto ${d.projectName} passou de ${STATUS_LABELS[d.from]} a ${STATUS_LABELS[d.to]}`,
    ),
    "task.assigned": defineNotification(
        z.object(task),
        (d) => `Tem uma nova tarefa no projeto ${d.projectName}: ${d.taskTitle}`,
    ),
    "task.commented": defineNotification(
        z.object(task),
        (d) => `Novo comentário na tarefa ${d.taskTitle} (${d.projectName})`,
    ),
    // Para o gestor do projeto: é ele quem aprova o que está em revisão.
    "task.review_requested": defineNotification(
        z.object(task),
        (d) => `A tarefa ${d.taskTitle} (${d.projectName}) está à espera de revisão`,
    ),
    "task.reviewed": defineNotification(
        z.object({ ...task, approved: z.boolean() }),
        (d) => d.approved
            ? `A sua tarefa ${d.taskTitle} (${d.projectName}) foi aprovada`
            : `A sua tarefa ${d.taskTitle} (${d.projectName}) voltou da revisão`,
    ),
    "review_cycle.opened": defineNotification(
        z.object({ cycleId: z.uuid(), cycleName: z.string(), deadline: z.string().nullable() }),
        (d) => `Abriu o ciclo de avaliação ${d.cycleName}: tem colegas para avaliar${until(d.deadline)}`,
    ),
    "review_cycle.closed": defineNotification(
        z.object({ cycleId: z.uuid(), cycleName: z.string() }),
        (d) => `O ciclo de avaliação ${d.cycleName} fechou e os seus pedidos por responder expiraram`,
    ),
    "review_request.created": defineNotification(
        z.object({ requestId: z.uuid(), revieweeId: z.uuid(), dueDate: z.string().nullable() }),
        (d) => `Tem um novo pedido de avaliação${until(d.dueDate)}`,
    ),
    "review_request.declined": defineNotification(
        z.object({ requestId: z.uuid(), reviewerId: z.uuid(), revieweeId: z.uuid() }),
        () => "Um pedido de avaliação que fez foi recusado",
    ),
    // Anónima de propósito: nem o pedido, nem quem avaliou, nem o conteúdo. Com o
    // pedido e a hora, cruzava-se com as datas das avaliações e via-se quem foi.
    "review.submitted": defineNotification(
        z.object({ revieweeId: z.uuid() }),
        () => "Foi submetida uma avaliação que pediu",
    ),
    "user.activated": defineNotification(
        z.object({ userId: z.uuid(), email: z.string() }),
        (d) => `${d.email} ativou a conta`,
    ),
} as const;

export type NotificationType = keyof typeof notificationCatalog;

/** O que quem chama passa. O parse tira tudo o que o schema não conhece. */
export type NotificationData<T extends NotificationType> = z.input<(typeof notificationCatalog)[T]["data"]>;

export const isNotificationType = (type: string): type is NotificationType =>
    Object.hasOwn(notificationCatalog, type);

/**
 * O texto de uma notificação gravada. Um tipo que entretanto saiu do catálogo,
 * ou dados que já não batem com ele, mostram o próprio tipo em vez de rebentar.
 */
export function renderNotificationMessage(type: string, data: unknown): string {
    if (!isNotificationType(type)) {
        return type;
    }

    const entry = notificationCatalog[type] as unknown as NotificationDefinition<z.ZodObject>;
    const parsed = entry.data.safeParse(data);

    return parsed.success ? entry.message(parsed.data) : type;
}
