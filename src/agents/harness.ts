/**
 * Browser harness shared by Explorer, Investigator and Verifier.
 * Drives a Solari cloud browser over CDP with Playwright and turns every action into
 * deterministic observations: URL changes, DOM changes, mutation requests, console/page errors.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { solariBrowsers } from "@/lib/solari";

export type Step =
  | { kind: "goto"; path: string }
  | { kind: "click"; selector: string; label: string; count?: number }
  | { kind: "fill"; selector: string; label: string; value: string };

export interface NetEvent {
  method: string;
  path: string;
  status?: number;
  failed?: string;
  t: number;
}

export interface Observation {
  urlBefore: string;
  urlAfter: string;
  urlChanged: boolean;
  domChanged: boolean;
  mutations: NetEvent[]; // same-origin non-GET requests issued during the action
  failedRequests: NetEvent[];
  consoleErrors: string[];
  pageErrors: string[];
  navigationStatus?: number;
  error?: string;
}

export interface PageElement {
  ref: string; // stable within one extraction
  tag: string;
  role: string;
  type: string;
  text: string;
  href: string | null;
  name: string | null;
  label: string | null;
  required: boolean;
  disabled: boolean;
  inForm: string | null; // selector of enclosing form
  selector: string;
}

// Plain-string scripts: avoid bundler helpers leaking into page.evaluate.
const EXTRACT_SCRIPT = `(() => {
  const esc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  const cssPath = (el) => {
    if (el.id) return '#' + esc(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      if (node.id) { parts.unshift('#' + esc(node.id)); break; }
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (!parent) { parts.unshift(tag); break; }
      const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
      parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(node) + 1) + ')' : tag);
      node = parent;
    }
    if (!parts.length || !parts[0].startsWith('#')) parts.unshift('body');
    return parts.join(' > ');
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const labelFor = (el) => {
    if (el.labels && el.labels[0]) return el.labels[0].innerText.trim();
    return el.getAttribute('aria-label') || el.getAttribute('placeholder') || null;
  };
  const nodes = Array.from(document.querySelectorAll('a[href], button, input, textarea, select, [role=button], [onclick]'));
  return nodes.filter(visible).slice(0, 80).map((el, i) => {
    const tag = el.tagName.toLowerCase();
    const form = el.closest('form');
    return {
      ref: 'e' + i,
      tag,
      role: el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'button' ? 'button' : tag),
      type: (el.getAttribute('type') || (tag === 'button' && form ? 'submit' : '')).toLowerCase(),
      text: (el.innerText || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
      href: tag === 'a' ? el.href : null,
      name: el.getAttribute('name'),
      label: labelFor(el),
      required: !!el.required,
      disabled: !!el.disabled,
      inForm: form ? cssPath(form) : null,
      selector: cssPath(el),
    };
  });
})()`;

const DOM_SIG_SCRIPT = `(() => { const t = document.body ? document.body.innerText : ''; let h = 0; for (let i = 0; i < t.length; i++) { h = (h * 31 + t.charCodeAt(i)) | 0; } return t.length + ':' + h; })()`;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface HarnessOptions {
  /** Origin the agent is authorized to navigate (top-level navigations elsewhere are blocked). */
  origin: string;
  /** Extra headers sent only to `origin` (e.g. Solari preview token). Never sent to third parties. */
  originHeaders?: Record<string, string>;
  /** Reuse the CDP default context (Explorer only). Never close it: closing it disconnects the browser. */
  reuseDefault?: boolean;
  /** Visit this URL first (e.g. a preview URL carrying a one-time token that sets an auth cookie). */
  bootstrapUrl?: string;
  /** Install the request router (navigation guard + header injection). Disable only for GhostLayer-owned origins. */
  intercept?: boolean;
}

export class PageHarness {
  readonly page: Page;
  readonly origin: string;
  net: NetEvent[] = [];
  consoleErrors: string[] = [];
  pageErrors: string[] = [];
  blockedNavigations: string[] = [];
  private pending = 0;
  private t0 = Date.now();

  private constructor(page: Page, origin: string) {
    this.page = page;
    this.origin = origin;
  }

  static async create(context: BrowserContext, opts: HarnessOptions) {
    const blocked: string[] = [];
    if (opts.intercept !== false) await context.route("**/*", async (route) => {
      const req = route.request();
      let reqOrigin = "";
      try {
        reqOrigin = new URL(req.url()).origin;
      } catch {
        /* data: / blob: urls */
      }
      if (req.isNavigationRequest() && req.frame().parentFrame() === null && reqOrigin && reqOrigin !== opts.origin) {
        blocked.push(req.url());
        return route.abort("blockedbyclient");
      }
      if (opts.originHeaders && reqOrigin === opts.origin) {
        return route.continue({ headers: { ...req.headers(), ...opts.originHeaders } });
      }
      return route.continue();
    });
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(8000);
    const h = new PageHarness(page, opts.origin);
    h.blockedNavigations = blocked;
    h.instrument();
    if (opts.bootstrapUrl) {
      await page.goto(opts.bootstrapUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    }
    return h;
  }

  private rel(url: string) {
    try {
      const u = new URL(url);
      return u.origin === this.origin ? u.pathname + u.search : url;
    } catch {
      return url;
    }
  }

  private instrument() {
    const p = this.page;
    p.on("request", (r) => {
      if (!r.url().startsWith(this.origin)) return;
      if (MUTATING.has(r.method())) {
        this.pending++;
        this.net.push({ method: r.method(), path: this.rel(r.url()), t: Date.now() - this.t0 });
      }
    });
    const settle = (url: string, method: string, patch: Partial<NetEvent>) => {
      if (!url.startsWith(this.origin) || !MUTATING.has(method)) return;
      const ev = [...this.net].reverse().find((e) => e.path === this.rel(url) && e.method === method && e.status === undefined && !e.failed);
      if (ev) Object.assign(ev, patch);
      this.pending = Math.max(0, this.pending - 1);
    };
    p.on("requestfinished", async (r) => {
      const res = await r.response().catch(() => null);
      settle(r.url(), r.method(), { status: res?.status() ?? 0 });
    });
    p.on("requestfailed", (r) => settle(r.url(), r.method(), { failed: r.failure()?.errorText ?? "failed" }));
    p.on("console", (m) => {
      if (m.type() === "error") this.consoleErrors.push(m.text().slice(0, 400));
    });
    p.on("pageerror", (e) => this.pageErrors.push(String(e.message ?? e).slice(0, 400)));
  }

  url(path: string) {
    return new URL(path, this.origin).toString();
  }

  currentPath() {
    return this.rel(this.page.url());
  }

  async goto(path: string) {
    let res = await this.page.goto(this.url(path), { waitUntil: "domcontentloaded", timeout: 20000 });
    // Gateways (e.g. a sandbox preview waking up) answer 425/502/503 transiently: retry before judging the page.
    for (let i = 0; i < 6 && res && [425, 502, 503].includes(res.status()); i++) {
      await this.page.waitForTimeout(1000 * (i + 1));
      res = await this.page.goto(this.url(path), { waitUntil: "domcontentloaded", timeout: 20000 });
    }
    await this.page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    return { status: res?.status() ?? 0, title: await this.page.title().catch(() => "") };
  }

  async extract(): Promise<PageElement[]> {
    return (await this.page.evaluate(EXTRACT_SCRIPT)) as PageElement[];
  }

  async domSignature(): Promise<string> {
    return (await this.page.evaluate(DOM_SIG_SCRIPT).catch(() => "")) as string;
  }

  async screenshot(): Promise<Buffer> {
    return this.page.screenshot({ type: "jpeg", quality: 60 });
  }

  async bodyText(limit = 1500): Promise<string> {
    const t = (await this.page.evaluate("document.body ? document.body.innerText : ''").catch(() => "")) as string;
    return t.slice(0, limit);
  }

  private async waitQuiet(maxMs = 5000) {
    const start = Date.now();
    await this.page.waitForTimeout(250);
    while (this.pending > 0 && Date.now() - start < maxMs) await this.page.waitForTimeout(150);
    await this.page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
    await this.page.waitForTimeout(300);
  }

  /** Execute one step and report everything deterministic that changed. */
  async observe(step: Step): Promise<Observation> {
    const urlBefore = this.currentPath();
    const sigBefore = await this.domSignature();
    const netIdx = this.net.length;
    const ceIdx = this.consoleErrors.length;
    const peIdx = this.pageErrors.length;
    let navigationStatus: number | undefined;
    let error: string | undefined;
    try {
      if (step.kind === "goto") {
        navigationStatus = (await this.goto(step.path)).status;
      } else if (step.kind === "fill") {
        await this.page.locator(step.selector).first().fill(step.value);
      } else {
        const loc = this.page.locator(step.selector).first();
        const navWait = this.page
          .waitForEvent("framenavigated", { timeout: 2500 })
          .then(() => true)
          .catch(() => false);
        // clickCount > 1 = rapid repeated activation (mousedown/up pairs ~0ms apart), like an impatient user.
        await loc.click({ clickCount: step.count ?? 1, timeout: 6000 });
        if (await navWait) await this.page.waitForLoadState("domcontentloaded").catch(() => {});
      }
      await this.waitQuiet();
    } catch (err) {
      error = String((err as Error).message ?? err).split("\n")[0].slice(0, 300);
    }
    const urlAfter = this.currentPath();
    const sigAfter = await this.domSignature();
    const mutations = this.net.slice(netIdx);
    return {
      urlBefore,
      urlAfter,
      urlChanged: urlBefore !== urlAfter,
      domChanged: sigBefore !== sigAfter,
      mutations,
      failedRequests: mutations.filter((m) => m.failed || (m.status ?? 0) >= 500),
      consoleErrors: this.consoleErrors.slice(ceIdx),
      pageErrors: this.pageErrors.slice(peIdx),
      navigationStatus,
      error,
    };
  }

  /** Replay a rabbit trail; returns the observation of every step. */
  async replay(steps: Step[]) {
    const out: Observation[] = [];
    for (const s of steps) out.push(await this.observe(s));
    return out;
  }
}

/** Close a context safely: the CDP default context must never be closed (it would disconnect the browser). */
export async function releaseContext(browser: Browser, context: BrowserContext) {
  if (browser.contexts().indexOf(context) === 0) {
    await Promise.all(context.pages().map((pg) => pg.close().catch(() => {})));
    await context.clearCookies().catch(() => {});
    return;
  }
  await context.close().catch(() => {});
}

export interface BrowserSession {
  sessionId: string;
  browser: Browser;
  newHarness(opts: HarnessOptions): Promise<{ harness: PageHarness; context: BrowserContext }>;
  close(): Promise<void>;
}

/** Open a recorded Solari cloud browser session and connect Playwright over CDP. */
/** Release GhostLayer browser sessions leaked by jobs that were cut off (older than maxAgeMs, so live ones are safe). */
export async function reclaimStaleBrowsers(maxAgeMs = 8 * 60_000) {
  const solari = solariBrowsers();
  const page = await solari.sessions.list({ limit: 50, metadata: { app: "ghostlayer" } }).catch(() => null);
  let released = 0;
  for (const s of page?.sessions ?? []) {
    const age = s.createdAt ? Date.now() - new Date(s.createdAt).getTime() : Infinity;
    if (/released|ended|closed/i.test(s.status) || age < maxAgeMs) continue;
    solari.sessions.release(s.id);
    released++;
  }
  return released;
}

export async function openSolariBrowser(meta: Record<string, string>): Promise<BrowserSession> {
  const solari = solariBrowsers();
  const create = () =>
    solari.sessions.create({
      recording: true,
      sessionTimeoutMs: 20 * 60_000,
      userMetadata: { app: "ghostlayer", ...meta },
    });
  let session;
  try {
    session = await create();
  } catch (err) {
    if (!/concurren|too many|limit/i.test(String((err as Error).message ?? err))) throw err;
    const n = await reclaimStaleBrowsers();
    console.warn(`[browser] concurrency limit hit; released ${n} stale GhostLayer session(s), retrying`);
    await new Promise((r) => setTimeout(r, 3000));
    session = await create();
  }
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(session.cdpEndpoint, { timeout: 30000 });
  } catch (err) {
    solari.sessions.release(session.id);
    throw err;
  }
  return {
    sessionId: session.id,
    browser,
    async newHarness(opts) {
      // Replays always get a fresh, isolated context (clean storage). Only the Explorer may opt into the default one.
      const context: BrowserContext =
        opts.reuseDefault && browser.contexts()[0] ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const harness = await PageHarness.create(context, opts);
      await harness.page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
      return { harness, context };
    },
    async close() {
      await browser.close().catch(() => {});
      await solari.sessions.releaseAndWait(session.id).catch(() => {});
    },
  };
}

/** Rebase helper: trails store paths, so a trail recorded on prod replays on a preview origin unchanged. */
export function describeStep(s: Step) {
  if (s.kind === "goto") return `Navigate to ${s.path}`;
  if (s.kind === "fill") return `Type "${s.value}" into ${s.label}`;
  return s.count && s.count > 1 ? `Click "${s.label}" ${s.count}× rapidly` : `Click "${s.label}"`;
}
