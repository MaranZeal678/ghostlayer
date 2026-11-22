import { Solari } from "@solarisdk/browser";
import { SandboxClient } from "@solarisdk/sandbox";
import { currentSolariKey } from "./credentials";

const BASE_URL = "https://api.getsolari.com";

function key() {
  const k = currentSolariKey();
  if (!k) throw new Error("No Solari API key configured (add one in Settings → API keys)");
  return k;
}

// Clients are cached per key so a job running with a user's own key never shares a client with another user.
const browsers = new Map<string, Solari>();
const sandboxes = new Map<string, SandboxClient>();

export function solariBrowsers() {
  const k = key();
  let c = browsers.get(k);
  if (!c) browsers.set(k, (c = new Solari({ apiKey: k, baseUrl: BASE_URL })));
  return c;
}

export function solariSandboxes() {
  const k = key();
  let c = sandboxes.get(k);
  if (!c) sandboxes.set(k, (c = new SandboxClient({ apiKey: k, baseUrl: BASE_URL })));
  return c;
}
