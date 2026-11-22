import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { GitPullRequest, Sparkles, Plus } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { projectCards } from "@/lib/queries";
import { Badge, Card, Stat, buttonVariants } from "@/components/ui/primitives";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { EmptyWonderland } from "@/components/dashboard/EmptyWonderland";
import { timeAgo } from "@/lib/format";
import { DemoResetCard } from "@/components/dashboard/DemoResetCard";
import { demoConfig } from "@/lib/demo-reset";

export default async function DashboardHome() {
  const user = await pageUser();
  const cu = await currentUser();
  const scope = { project: { userId: user.id } };
  const [cards, scans, findings, verified, prs, events, conn] = await Promise.all([
    projectCards(user.id),
    db.scan.count({ where: { ...scope, status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] } } }),
    db.finding.count({ where: { ...scope, confidence: "CONFIRMED" } }),
    db.verificationResult.count({ where: { approved: true, repairAttempt: scope } }),
    db.pullRequest.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 5, include: { project: { select: { name: true } } } }),
    db.agentEvent.findMany({
      where: { OR: [{ scan: scope }, { repairAttempt: scope }], eventType: { notIn: ["repair.meta"] } },
      orderBy: { id: "desc" },
      take: 14,
      include: { scan: { select: { id: true, projectId: true } } },
    }),
    db.gitHubConnection.count({ where: { userId: user.id, status: "ACTIVE" } }),
  ]);
  const name = cu?.firstName ?? user.displayName ?? "there";
  // Demo owners (DEMO_OWNER_EMAILS) get the Revert control right on the dashboard.
  const owners = (process.env.DEMO_OWNER_EMAILS ?? "contact@elamaran.co").toLowerCase().split(",").map((e) => e.trim());
  const emails = [user.email, ...(cu?.emailAddresses ?? []).map((e) => e.emailAddress)].filter(Boolean).map((e) => e!.toLowerCase());
  const isDemoOwner = emails.some((e) => owners.includes(e));
  const demoProject = isDemoOwner
    ? await db.project.findFirst({ where: { userId: user.id, status: "ACTIVE", repositoryFullName: { equals: demoConfig().repo, mode: "insensitive" } } })
    : null;
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Welcome back, {name}</p>
          <h1 className="font-display text-4xl italic tracking-tight text-ink md:text-5xl">What lies beneath today?</h1>
        </div>
        <div className="flex items-center gap-2">
          {!conn && (
            <Link href="/dashboard/connections" className={buttonVariants({ variant: "secondary" })}>
              Connect GitHub
            </Link>
          )}
          <Link href="/dashboard/projects/new" className={buttonVariants({})}>
            <Plus size={16} /> New project
          </Link>
        </div>
      </header>

      {demoProject && <DemoResetCard projectId={demoProject.id} repo={demoProject.repositoryFullName!} compact />}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Projects" value={cards.length} />
        <Stat label="Completed scans" value={scans} />
        <Stat label="Confirmed findings" value={findings} />
        <Stat label="Verified fixes" value={verified} />
        <Stat label="PRs opened" value={prs.length} />
      </section>

      {cards.length === 0 ? (
        <EmptyWonderland />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-faint">Projects</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {cards.map((p, i) => (
                <ProjectCard key={p.id} p={p} i={i} />
              ))}
            </div>
          </section>
          <aside className="space-y-6">
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                <Sparkles size={14} className="text-lavender" /> Recent agent activity
              </h2>
              <ActivityFeed
                events={events.map((e) => ({
                  id: e.id.toString(),
                  agentType: e.agentType,
                  eventType: e.eventType,
                  message: e.message,
                  timestamp: e.timestamp.toISOString(),
                  href: e.scan ? `/dashboard/projects/${e.scan.projectId}/scans/${e.scan.id}` : undefined,
                }))}
              />
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                <GitPullRequest size={14} className="text-emerald" /> Pull requests
              </h2>
              {prs.length === 0 ? (
                <p className="text-sm text-muted">No pull requests yet. Verified fixes appear here as draft PRs.</p>
              ) : (
                <ul className="space-y-2">
                  {prs.map((pr) => (
                    <li key={pr.id}>
                      <a href={pr.githubUrl} target="_blank" rel="noreferrer" className="block rounded-lg p-2 hover:bg-white/5">
                        <div className="truncate text-sm text-ink">#{pr.githubNumber} {pr.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          <Badge tone="emerald">{pr.status.toLowerCase()}</Badge> {pr.project.name} · {timeAgo(pr.createdAt)}
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
