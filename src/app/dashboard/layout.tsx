import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/dashboard/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  const conn = await db.gitHubConnection.count({ where: { userId: user.id, status: "ACTIVE" } });
  return (
    <div className="bg-atmosphere min-h-screen md:flex">
      <Sidebar githubConnected={conn > 0} />
      <main className="mx-auto w-full max-w-[87.5rem] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
