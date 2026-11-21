import Link from "next/link";
import { Plus } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { projectCards } from "@/lib/queries";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { EmptyWonderland } from "@/components/dashboard/EmptyWonderland";
import { buttonVariants } from "@/components/ui/primitives";

export default async function ProjectsPage() {
  const user = await pageUser();
  const cards = await projectCards(user.id, true);
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted">Websites and repositories GhostLayer can explore and repair.</p>
        </div>
        <Link href="/dashboard/projects/new" className={buttonVariants({})}>
          <Plus size={16} /> New project
        </Link>
      </header>
      {cards.length === 0 ? (
        <EmptyWonderland />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((p, i) => (
            <ProjectCard key={p.id} p={p} i={i} />
          ))}
        </div>
      )}
    </div>
  );
}
