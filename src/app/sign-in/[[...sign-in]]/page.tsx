import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/dashboard/AuthShell";

export default function Page() {
  return (
    <AuthShell title="Return to Wonderland" subtitle="Sign in to your GhostLayer workspace">
      <SignIn />
    </AuthShell>
  );
}
