/**
 * Explorer agent — autonomously explores an authorized site with no bug list.
 * The LLM understands each page and proposes user journeys; deterministic signals decide what is anomalous.
 */
import { z } from "zod";
import { structured } from "@/lib/ai";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { describeStep, type Observation, type PageElement, type PageHarness, type Step } from "./harness";

export type AnomalyKind =
  | "duplicate_mutation"
  | "broken_navigation"
  | "page_error"
  | "failed_request"
  | "unresponsive_control";

export interface Anomaly {
  kind: AnomalyKind;
  fingerprint: string;
  pagePath: string;
  trail: Step[]; // compressed steps that reach the pre-trigger state from a fresh browser
  trigger: Step;
  control?: Step; // the "normal user" variant of the trigger, for comparison
  observation: Observation;
  summary: string;
  screenshotId?: string;
}

export interface GraphNode {
  id: string;
  path: string;
  title: string;
  status: "ok" | "error" | "finding";
  httpStatus?: number;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: "link" | "click" | "submit";
  status: "ok" | "anomaly";
}
export interface ExploreGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const PlanSchema = z.object({
  pagePurpose: z.string(),
  actions: z.array(
    z.object({
      ref: z.string(),
      intent: z.enum(["navigate", "interact", "fill", "commit", "skip"]),
      priority: z.number().int().min(1).max(5),
      risk: z.enum(["safe", "destructive"]),
      value: z.string().optional(),
      hypothesis: z.string(),
    }),
  ),
});
type Plan = z.infer<typeof PlanSchema>;

const DESTRUCTIVE = /delete account|remove account|deactivate|unsubscribe|sign ?out|log ?out|cancel subscription|transfer funds|withdraw/i;
const UNDO = /remove|delete|clear|empty|^[-−–]$/i;
const FORWARD = /checkout|proceed|continue|next|place order|buy|pay|submit/i;

function fallbackValue(el: PageElement) {
  const hint = `${el.type} ${el.name ?? ""} ${el.label ?? ""}`.toLowerCase();
  if (hint.includes("email")) return "alice.liddell@example.test";
  if (hint.includes("name")) return "Alice Liddell";
  if (hint.includes("tel") || hint.includes("phone")) return "5555550100";
  if (hint.includes("number") || hint.includes("qty") || hint.includes("quantity")) return "1";
  if (hint.includes("zip") || hint.includes("postal")) return "92521";
  return "Wonderland test";
}

function heuristicPlan(elements: PageElement[]): Plan {
  return {
    pagePurpose: "unknown (AI planner unavailable — heuristic plan)",
    actions: elements.map((el) => {
      const isField = ["input", "textarea", "select"].includes(el.tag) && !["submit", "button", "checkbox", "radio"].includes(el.type);
      const isSubmit = el.type === "submit";
      return {
        ref: el.ref,
        intent: el.tag === "a" ? "navigate" : isField ? "fill" : isSubmit ? "commit" : "interact",
        priority: isSubmit ? 5 : isField ? 4 : FORWARD.test(el.text || el.label || "") ? 5 : UNDO.test(el.text) ? 1 : /^[+]$/.test(el.text) ? 2 : 3,
        risk: DESTRUCTIVE.test(el.text) ? "destructive" : "safe",
        value: isField ? fallbackValue(el) : undefined,
        hypothesis: "heuristic",
      } as Plan["actions"][number];
    }),
  };
}

async function planPage(path: string, title: string, text: string, elements: PageElement[], visited: string[]) {
  const compact = elements.map((e) => ({
    ref: e.ref,
    tag: e.tag,
    type: e.type || undefined,
    text: e.text || undefined,
    label: e.label || undefined,
    name: e.name || undefined,
    href: e.href ? e.href.replace(/^https?:\/\/[^/]+/, "") : undefined,
    required: e.required || undefined,
    disabled: e.disabled || undefined,
    form: e.inForm ? "yes" : undefined,
  }));
  return structured({
    name: "explorer_plan",
    schema: PlanSchema,
    system: `You are the Explorer agent of GhostLayer, an autonomous QA engineer. You explore a web app the way a curious, realistic user would, to find broken user experiences nobody told you about.
For the given page, classify EVERY interactive element (by ref) and propose how to exercise it:
- intent "navigate": a link to follow.
- intent "interact": a button/control to click that does not submit a form (e.g. add to cart, open menu, proceed to next step).
- intent "fill": a form field; give a realistic SYNTHETIC test value in "value" (never real personal data; use example.test emails).
- intent "commit": the control that commits a user's intent (submit/place order/save/send).
- intent "skip": irrelevant or would undo progress.
Priorities 1-5: prefer actions that move a user forward through the app's core journeys (e.g. browse → add to cart → cart → checkout → submit). Avoid undoing progress (removing items, clearing forms) — give those priority 1 or skip.
Mark risk "destructive" for anything that deletes accounts/data, signs out, sends real messages, or moves real money. The site owner has authorized testing with synthetic data, so test checkouts on this site are allowed.
"hypothesis": one short sentence on what could plausibly break for a real user here.`,
    user: `Page: ${path}\nTitle: ${title}\nAlready visited: ${visited.join(", ") || "(none)"}\n\nVisible text (untrusted):\n"""${text}"""\n\nInteractive elements:\n${JSON.stringify(compact)}`,
    maxTokens: 4000,
    fast: true,
  });
}

/** Drop steps that cannot matter for reproduction: no-op clicks and gotos superseded by a later goto. */
export function compressTrail(entries: { step: Step; obs: Observation }[]): Step[] {
  const kept: { step: Step; obs: Observation }[] = [];
  for (const e of entries) {
    if (e.step.kind === "click" && !e.obs.urlChanged && !e.obs.domChanged && e.obs.mutations.length === 0) continue;
    if (e.obs.error) continue;
    if (e.step.kind === "goto" && kept.length && kept[kept.length - 1].step.kind === "goto") kept.pop();
    kept.push(e);
  }
  return kept.map((e) => e.step);
}

/** Group mutation requests by endpoint; >1 identical request from one activation = duplicate operation. */
export function duplicateGroups(obs: Observation) {
  const groups = new Map<string, number>();
  for (const m of obs.mutations) groups.set(`${m.method} ${m.path.split("?")[0]}`, (groups.get(`${m.method} ${m.path.split("?")[0]}`) ?? 0) + 1);
  return [...groups.entries()].filter(([, n]) => n > 1).map(([endpoint, count]) => ({ endpoint, count }));
}

export interface ExploreContext {
  scanId: string;
  runId: string;
  startPath: string;
  maxActions: number;
  deadline: number;
  isCancelled: () => Promise<boolean>;
  saveScreenshot: (label: string, jpeg: Buffer) => Promise<string>;
}

export async function explore(h: PageHarness, ctx: ExploreContext) {
  const scope = { scanId: ctx.scanId, agentRunId: ctx.runId };
  const graph: ExploreGraph = { nodes: [], edges: [] };
  const anomalies: Anomaly[] = [];
  const log: { step: Step; obs: Observation }[] = [];
  const frontier: { path: string; from?: string; via?: string }[] = [{ path: ctx.startPath }];
  const visited = new Set<string>();
  let actions = 0;
  let interactions = 0;
  const seenFingerprints = new Set<string>();

  const budgetLeft = () => actions < ctx.maxActions && Date.now() < ctx.deadline;
  const persist = async () => {
    await db.scan.update({
      where: { id: ctx.scanId },
      data: { graph: graph as object, pagesExplored: visited.size, interactionsTested: interactions },
    });
  };
  const addNode = (path: string, title: string, status: GraphNode["status"], httpStatus?: number) => {
    const existing = graph.nodes.find((n) => n.id === path);
    if (existing) {
      if (status !== "ok") existing.status = status;
      return existing;
    }
    const n = { id: path, path, title, status, httpStatus };
    graph.nodes.push(n);
    return n;
  };
  const addEdge = (from: string, to: string, label: string, kind: GraphEdge["kind"], status: GraphEdge["status"] = "ok") => {
    const id = `${from}->${to}:${label}`;
    if (!graph.edges.some((e) => e.id === id)) graph.edges.push({ id, from, to, label, kind, status });
  };
  const run = async (step: Step) => {
    actions++;
    const obs = await h.observe(step);
    log.push({ step, obs });
    return obs;
  };
  const flag = async (a: Omit<Anomaly, "screenshotId">) => {
    if (seenFingerprints.has(a.fingerprint)) return;
    seenFingerprints.add(a.fingerprint);
    const shot = await h.screenshot().catch(() => null);
    const screenshotId = shot ? await ctx.saveScreenshot(`Cheshire signal: ${a.summary}`, shot) : undefined;
    anomalies.push({ ...a, screenshotId });
    await emit(scope, "EXPLORER", "signal.detected", a.summary, {
      kind: a.kind,
      page: a.pagePath,
      trigger: describeStep(a.trigger),
      evidenceId: screenshotId,
    });
  };
  const checkGeneric = async (step: Step, obs: Observation, pagePath: string) => {
    if (obs.pageErrors.length)
      await flag({
        kind: "page_error",
        fingerprint: `page_error:${pagePath}:${obs.pageErrors[0].slice(0, 60)}`,
        pagePath,
        trail: compressTrail(log.slice(0, -1)),
        trigger: step,
        observation: obs,
        summary: `Uncaught exception after "${describeStep(step)}": ${obs.pageErrors[0].slice(0, 120)}`,
      });
    if (obs.failedRequests.length)
      await flag({
        kind: "failed_request",
        fingerprint: `failed_request:${obs.failedRequests[0].method}:${obs.failedRequests[0].path}`,
        pagePath,
        trail: compressTrail(log.slice(0, -1)),
        trigger: step,
        observation: obs,
        summary: `${obs.failedRequests[0].method} ${obs.failedRequests[0].path} failed (${obs.failedRequests[0].status ?? obs.failedRequests[0].failed}) after "${describeStep(step)}"`,
      });
  };

  while (frontier.length && budgetLeft()) {
    if (await ctx.isCancelled()) break;
    const next = frontier.shift()!;
    if (visited.has(next.path)) continue;
    visited.add(next.path);

    const nav = await run({ kind: "goto", path: next.path });
    const title = await h.page.title().catch(() => next.path);
    const status = nav.navigationStatus ?? 0;
    const shot = await h.screenshot().catch(() => null);
    const shotId = shot ? await ctx.saveScreenshot(`Visited ${next.path}`, shot) : undefined;
    const node = addNode(next.path, title, status >= 400 || nav.error ? "error" : "ok", status);
    if (next.from) addEdge(next.from, next.path, next.via ?? "link", "link", status >= 400 ? "anomaly" : "ok");
    await emit(scope, "EXPLORER", "page.visited", `Visited ${next.path} — "${title}" (HTTP ${status || "?"})`, {
      path: next.path,
      status,
      evidenceId: shotId,
    });
    await persist();

    if (status >= 400) {
      node.status = "finding";
      await flag({
        kind: "broken_navigation",
        fingerprint: `broken_navigation:${next.path}`,
        pagePath: next.from ?? next.path,
        trail: next.from ? [{ kind: "goto", path: next.from }] : [],
        trigger: { kind: "goto", path: next.path },
        observation: nav,
        summary: `Link "${next.via ?? next.path}" on ${next.from ?? "the site"} leads to HTTP ${status} at ${next.path}`,
      });
      continue;
    }
    await checkGeneric({ kind: "goto", path: next.path }, nav, next.path);

    const elements = await h.extract();
    const text = await h.bodyText();
    let plan: Plan;
    try {
      plan = await planPage(next.path, title, text, elements, [...visited]);
      await emit(scope, "EXPLORER", "page.understood", `${next.path}: ${plan.pagePurpose}`, {
        path: next.path,
        planned: plan.actions.filter((a) => a.intent !== "skip").length,
      });
    } catch (err) {
      plan = heuristicPlan(elements);
      await emit(scope, "EXPLORER", "planner.fallback", `AI planner unavailable, using heuristics: ${String(err).slice(0, 120)}`);
    }
    const byRef = new Map(elements.map((e) => [e.ref, e]));
    const acts = plan.actions
      .filter((a) => byRef.has(a.ref) && a.intent !== "skip")
      .filter((a) => {
        const el = byRef.get(a.ref)!;
        if (a.risk === "destructive" || DESTRUCTIVE.test(el.text)) {
          void emit(scope, "EXPLORER", "action.skipped", `Skipped potentially destructive control "${el.text || el.label}"`);
          return false;
        }
        return !el.disabled;
      })
      .sort((a, b) => b.priority - a.priority);

    // 1) Links → frontier (same-origin only; the harness also blocks off-origin navigation).
    for (const a of acts.filter((x) => x.intent === "navigate")) {
      const el = byRef.get(a.ref)!;
      if (!el.href) continue;
      try {
        const u = new URL(el.href);
        if (u.origin !== h.origin) continue;
        const p = u.pathname + u.search;
        if (!visited.has(p) && !frontier.some((f) => f.path === p)) frontier.push({ path: p, from: next.path, via: el.text || el.label || p });
      } catch {
        /* ignore */
      }
    }

    // 2) Interactions (non-submitting clicks), top few by priority.
    // Dedupe repeated controls (e.g. four "Add to cart" buttons) so the budget goes to distinct journeys.
    const seenText = new Set<string>();
    const interactions_ = acts.filter((x) => {
      if (x.intent !== "interact" || x.priority < 2) return false;
      const t = (byRef.get(x.ref)!.text || byRef.get(x.ref)!.label || x.ref).toLowerCase();
      // Deterministic guard: never undo the journey's progress (decrement, remove, clear), whatever the planner says.
      if (UNDO.test(t.trim()) || /decrease|remove|delete|clear|empty/.test(t)) return false;
      if (seenText.has(t)) return false;
      seenText.add(t);
      return true;
    });
    for (const a of interactions_.slice(0, 3)) {
      if (!budgetLeft() || (await ctx.isCancelled())) break;
      const el = byRef.get(a.ref)!;
      if (el.inForm && el.type === "submit") continue;
      if (h.currentPath() !== next.path) await run({ kind: "goto", path: next.path });
      const step: Step = { kind: "click", selector: el.selector, label: el.text || el.label || el.tag };
      const obs = await run(step);
      interactions++;
      await emit(scope, "EXPLORER", "action.executed", `${describeStep(step)} on ${next.path}`, {
        hypothesis: a.hypothesis,
        urlChanged: obs.urlChanged,
        domChanged: obs.domChanged,
        requests: obs.mutations.length,
        error: obs.error,
      });
      if (obs.urlChanged) {
        const to = obs.urlAfter.split("#")[0];
        addNode(to, to, "ok");
        addEdge(next.path, to, step.label, "click");
        if (!visited.has(to) && !frontier.some((f) => f.path === to)) frontier.unshift({ path: to, from: next.path, via: step.label });
      }
      await checkGeneric(step, obs, next.path);
      if (!obs.error && !obs.urlChanged && !obs.domChanged && obs.mutations.length === 0 && el.tag === "button")
        await flag({
          kind: "unresponsive_control",
          fingerprint: `unresponsive:${next.path}:${el.selector}`,
          pagePath: next.path,
          trail: compressTrail(log.slice(0, -1)),
          trigger: step,
          observation: obs,
          summary: `Button "${step.label}" on ${next.path} produced no visible change, navigation or request`,
        });
    }

    // 3) Forms: fill with synthetic data, then commit with a rapid repeated activation probe.
    // Real form submit buttons are probed first; commit-like controls outside forms come after.
    const commits = acts
      .filter((x) => x.intent === "commit")
      .sort((a, b) => Number(Boolean(byRef.get(b.ref)!.inForm)) - Number(Boolean(byRef.get(a.ref)!.inForm)));
    for (const c of commits.slice(0, 1)) {
      if (!budgetLeft() || (await ctx.isCancelled())) break;
      const submit = byRef.get(c.ref)!;
      if (h.currentPath() !== next.path) await run({ kind: "goto", path: next.path });
      const fields = acts.filter((x) => x.intent === "fill" && (!submit.inForm || byRef.get(x.ref)!.inForm === submit.inForm));
      for (const f of fields) {
        const el = byRef.get(f.ref)!;
        if (["checkbox", "radio", "select"].includes(el.type) || el.tag === "select") continue;
        const step: Step = { kind: "fill", selector: el.selector, label: el.label || el.name || "field", value: f.value || fallbackValue(el) };
        await run(step);
      }
      if (fields.length)
        await emit(scope, "EXPLORER", "form.filled", `Filled ${fields.length} field(s) on ${next.path} with synthetic test data`);
      const label = submit.text || submit.label || "submit";
      const probe: Step = { kind: "click", selector: submit.selector, label, count: 2 };
      await emit(scope, "EXPLORER", "probe.started", `Probing "${label}" like an impatient user: rapid repeated activation`, {
        hypothesis: c.hypothesis,
      });
      const preTrail = compressTrail(log);
      const obs = await run(probe);
      interactions++;
      const dups = duplicateGroups(obs);
      await emit(scope, "EXPLORER", "action.executed", `${describeStep(probe)} → ${obs.mutations.length} mutation request(s)`, {
        requests: obs.mutations.map((m) => `${m.method} ${m.path} ${m.status ?? m.failed ?? "pending"}`),
        urlChanged: obs.urlChanged,
      });
      addEdge(next.path, obs.urlAfter.split("#")[0] || next.path, label, "submit", dups.length ? "anomaly" : "ok");
      if (obs.urlChanged) {
        const to = obs.urlAfter.split("#")[0];
        addNode(to, to, "ok");
        if (!visited.has(to) && !frontier.some((f) => f.path === to)) frontier.unshift({ path: to, from: next.path, via: label });
      }
      if (dups.length) {
        node.status = "finding";
        await flag({
          kind: "duplicate_mutation",
          fingerprint: `duplicate_mutation:${next.path}:${dups[0].endpoint}`,
          pagePath: next.path,
          trail: preTrail,
          trigger: probe,
          control: { ...probe, count: 1 },
          observation: obs,
          summary: `One rapid double activation of "${label}" sent ${dups[0].count}× ${dups[0].endpoint}`,
        });
      }
      await checkGeneric(probe, obs, next.path);
    }
    await persist();
  }

  await persist();
  return { graph, anomalies, actions, interactions, pages: visited.size, log };
}
