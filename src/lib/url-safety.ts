import { lookup } from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
  "169.254.169.254",
  "fd00:ec2::254",
]);

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function inCidr(ip: string, cidr: string) {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

const PRIVATE_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

const V6_BLOCK = new net.BlockList();
for (const [a, p] of [
  ["::", 128], ["::1", 128], ["::", 96], ["64:ff9b::", 96], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) V6_BLOCK.addSubnet(a, p, "ipv6");

/** Expand an IPv6 address to 8 hextets. */
function expandV6(ip: string): number[] | null {
  let v = ip.toLowerCase().split("%")[0];
  const dotted = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const n = ipv4ToInt(dotted[1]);
    v = v.slice(0, -dotted[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = v.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const fill = v.includes("::") ? 8 - h.length - t.length : 0;
  const parts = [...h, ...Array(Math.max(0, fill)).fill("0"), ...t].map((x) => parseInt(x || "0", 16));
  return parts.length === 8 && parts.every((x) => !Number.isNaN(x)) ? parts : null;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return PRIVATE_V4.some((c) => inCidr(ip, c));
  if (net.isIPv6(ip)) {
    const parts = expandV6(ip);
    if (!parts) return true;
    // IPv4-mapped (::ffff:a.b.c.d in any notation) → check the embedded IPv4 address.
    if (parts.slice(0, 5).every((x) => x === 0) && parts[5] === 0xffff) {
      const v4 = `${parts[6] >> 8}.${parts[6] & 255}.${parts[7] >> 8}.${parts[7] & 255}`;
      return isPrivateIp(v4);
    }
    return V6_BLOCK.check(ip.split("%")[0], "ipv6");
  }
  return true;
}

/**
 * Validate a user-supplied scan target: http(s) only, no credentials, public DNS only.
 * Every resolved address must be public (blocks DNS answers that mix in private IPs).
 */
export async function assertSafeTarget(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Website URL is not a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) URLs can be scanned");
  if (url.username || url.password) throw new Error("URLs with embedded credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    throw new Error("Internal hosts cannot be scanned");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Private network addresses cannot be scanned");
    return url;
  }
  const addrs = await lookup(host, { all: true }).catch(() => {
    throw new Error(`Could not resolve ${host}`);
  });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address)))
    throw new Error("Target resolves to a private or reserved address");
  return url;
}

/** Same-origin check used by the browser route guard. */
export function sameOrigin(a: string, origin: string) {
  try {
    return new URL(a).origin === origin;
  } catch {
    return false;
  }
}
