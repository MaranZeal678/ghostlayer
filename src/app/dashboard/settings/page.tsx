import { UserProfile } from "@clerk/nextjs";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
        <p className="text-sm text-muted">Profile, security and connected sign-in accounts. Signing in with GitHub never grants repository write access — that is handled separately by the GhostLayer GitHub App.</p>
      </div>
      <UserProfile routing="hash" />
    </div>
  );
}
