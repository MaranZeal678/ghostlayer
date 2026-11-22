import { UserProfile } from "@clerk/nextjs";
import { ApiKeysCard } from "@/components/dashboard/ApiKeysCard";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">API keys for your agents, plus your profile, security and connected sign-in accounts. Signing in with GitHub never grants repository write access — that is handled separately by the GhostLayer GitHub App.</p>
      </div>
      <div className="max-w-3xl">
        <ApiKeysCard />
      </div>
      <UserProfile routing="hash" />
    </div>
  );
}
