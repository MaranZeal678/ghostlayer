import { db } from "./db";
import type { AgentType } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

export type EventScope = { scanId?: string; repairAttemptId?: string; agentRunId?: string };

/** Persist an agent event. The SSE endpoints stream these rows, so the UI only ever shows real execution. */
export async function emit(
  scope: EventScope,
  agentType: AgentType | null,
  eventType: string,
  message: string,
  payload?: Record<string, unknown>,
) {
  const row = await db.agentEvent.create({
    data: {
      scanId: scope.scanId,
      repairAttemptId: scope.repairAttemptId,
      agentRunId: scope.agentRunId,
      agentType: agentType ?? undefined,
      eventType,
      message,
      structuredPayload: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  const tag = agentType ? agentType.padEnd(12) : "SYSTEM".padEnd(12);
  console.log(`[${tag}] ${eventType}: ${message}`);
  return row;
}

export async function startAgentRun(
  scope: { scanId?: string; repairAttemptId?: string },
  agentType: AgentType,
  taskDescription: string,
) {
  const run = await db.agentRun.create({
    data: { ...scope, agentType, taskDescription, status: "RUNNING", startedAt: new Date() },
  });
  await emit({ ...scope, agentRunId: run.id }, agentType, "agent.started", taskDescription);
  return run;
}

export async function finishAgentRun(
  runId: string,
  status: "COMPLETED" | "FAILED" | "CANCELLED",
  outputSummary?: string,
  errorMessage?: string,
) {
  const run = await db.agentRun.update({
    where: { id: runId },
    data: { status, completedAt: new Date(), outputSummary, errorMessage },
  });
  await emit(
    { scanId: run.scanId ?? undefined, repairAttemptId: run.repairAttemptId ?? undefined, agentRunId: run.id },
    run.agentType,
    status === "COMPLETED" ? "agent.completed" : status === "FAILED" ? "agent.failed" : "agent.cancelled",
    outputSummary ?? errorMessage ?? status.toLowerCase(),
  );
  return run;
}
