# GhostLayer — Find what hides beneath the interface

*Down the rabbit hole. Beyond the bug.* · Cutie Hack 2026 · Dream to Wonderland

**Live app:** https://ghostlayer-ochre.vercel.app · **Demo target:** https://demo-shop-one-amber.vercel.app
**Code:** https://github.com/MaranZeal678/ghostlayer · **Demo repo:** https://github.com/MaranZeal678/mad-hatter-tea-emporium
**PR opened autonomously in our live run:** https://github.com/MaranZeal678/mad-hatter-tea-emporium/pull/1

## Inspiration
Tests only catch the bugs someone thought to write a test for. Real users double-click, wander, and take paths nobody planned for. We wanted an AI teammate that goes down the rabbit hole on its own. It should find what's broken, prove the bug is real, fix it, and then try hard to prove its own fix wrong before asking a human to review it.

## What it does
You give GhostLayer a deployed website and a GitHub repo. You don't give it any test cases or bug descriptions.

1. **Explorer** opens a Solari cloud browser, reads each page with an AI planner, and walks realistic user journeys using synthetic data: browse, add to cart, checkout. It flags anomalies only from *deterministic* signals:
   - duplicate state-changing requests
   - HTTP errors
   - uncaught exceptions
   - failed requests
   - dead controls

   It builds a live exploration graph as it goes.
2. **Investigator** replays the recorded "rabbit trail" in fresh, isolated browser contexts: the triggering action ×3, plus a normal-user control ×2. A signal becomes **CONFIRMED** only when the results are consistent. If a replay can't finish the journey, it counts as *inconclusive* rather than as evidence either way.
3. **Engineer** clones the repo into an isolated **Solari sandbox** using a read-only token scoped to that one repo. It finds the relevant source, writes a minimal patch plus a regression test, and runs the repo's own tests and build.
4. **Verifier** works in a separate sandbox with a separate model context, and actively tries to break the fix:
   - re-proves the bug on the live site
   - rebuilds from the base commit + the diff
   - re-runs the tests
   - launches the patched app and replays the journey through a Solari preview URL (double-click, triple-click, and a normal click)
   - does an adversarial code review

   Every check is reported separately; there's never a single "100% fixed" score. If it rejects the fix, its evidence goes back to the Engineer for a bounded retry.
5. **Publisher** waits for a human to approve, then pushes a new `ghostlayer/fix-…` branch and opens a **draft** PR. The PR carries the reproduction steps, the root cause, the actual check results, and known limitations. GhostLayer never touches the default branch and never merges.

In our live run, the Explorer found a **double-submit checkout bug** on its own: a single double-click on "Place order" sent 2× `POST /api/orders`. The Investigator confirmed it 3/3 times, with the control runs behaving correctly. The Engineer's first fix passed every deterministic check. The Verifier's adversarial review still **rejected** it, pointing out that the new guard could get stuck after a validation error. The Engineer's second attempt addressed that concern. It passed every check, including 3/3 patched replays with one order each and the adversarial review. After human approval, GhostLayer opened draft PR #1.

## How we built it
- **Next.js 16** (App Router) on **Vercel** · **Clerk** auth · **Supabase Postgres** with **Prisma 7** · Tailwind v4 · motion · React Three Fiber (rabbit-hole portal + live agent constellation)
- **Solari**:
  - **Cloud Browsers**, driven by Playwright over CDP with session recording
  - **Sandboxes** (microVMs) for cloning, installing, testing, building and running patched apps
  - **preview URLs**, so the Verifier's browser can reach the patched app
- **OpenAI** (gpt-5.5 for engineering, verification and reports; gpt-5.4-mini for fast page planning), always returning schema-validated JSON
- **GitHub App** (manifest-registered): minimal permissions, per-job tokens scoped to a single repo, users verified via OAuth before an installation is linked, drafts only
- **Durable Postgres job queue** (`FOR UPDATE SKIP LOCKED`): every agent phase is a short job run by a serverless worker on Vercel, which acknowledges immediately and does the work in the background. Live UI over SSE replays persisted events, so a page refresh never loses state or cancels a scan.

## Challenges
- Fitting long-running agent work into serverless time limits. We split it into five durable phases, including a Verifier that hands a live sandbox off between two jobs.
- Flaky signals. The Investigator and Verifier treat an incomplete journey as *inconclusive* instead of evidence.
- Keeping agents safe on real websites:
  - an SSRF guard covering IPv4, IPv6 and mapped addresses, plus a metadata-endpoint blocklist
  - top-level navigation restricted to the target origin
  - destructive controls skipped
  - page and repo text treated as untrusted model input
  - tokens scrubbed from logs

## What we're proud of
GhostLayer refused a fix that passed every test, and explained why.

## What's next
- Multiple explorers in parallel
- Accessibility probes
- Competing patch candidates using sandbox snapshots
- PR comment follow-ups
