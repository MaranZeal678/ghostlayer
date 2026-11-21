import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/dashboard/AuthShell";

export default function Page() {
  return (
    <AuthShell title="Follow the white rabbit" subtitle="Create your GhostLayer account">
      <SignUp />
    </AuthShell>
  );
}
