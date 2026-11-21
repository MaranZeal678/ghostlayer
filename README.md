# 👻 GhostLayer

**Find what hides beneath the interface.** *Down the rabbit hole. Beyond the bug.*

GhostLayer is an autonomous AI quality-assurance and repair platform built for **Cutie Hack 2026** (theme: *Dream to Wonderland*). You give it a deployed website and an authorized GitHub repository. Its agents explore the site like real users **without being told what is broken**, reproduce what they find, patch the code in an isolated sandbox, independently try to prove the patch wrong, and open a **draft** pull request with the evidence.

## The agents (the Tea Party)

| Agent | Runs on | What it actually does |
|---|---|---|
| **Explorer** | Solari Cloud Browser + Playwright (CDP) + OpenAI | Visits pages, extracts interactive elements, asks the model for realistic user journeys and synthetic form data, executes them, and flags anomalies from **deterministic signals** (duplicate mutation requests, HTTP ≥ 400 navigations, uncaught exceptions, failed requests, unresponsive controls). Builds an exploration graph of pages and actions. |
| **Investigator** | Fresh Solari browser session | Replays the recorded *rabbit trail* in brand-new isolated contexts: trigger ×3 and normal-user control ×2. Promotes a signal to `CONFIRMED` only on consistent results, then writes a structured bug report. |
| **Engineer** | Solari Sandbox (4 vCPU / 8 GB) | Clones the repo with a **read-only, single-repo, short-lived** GitHub App token, installs deps, locates source by grep, asks the model for a minimal search/replace patch + regression test, applies it, runs `test` and `build`. |
| **Verifier** | *Separate* Solari Sandbox + browser, *separate* model context | Re-proves the bug on the live site, rebuilds from the **base commit + the diff artifact**, re-runs tests/build itself, launches the patched app, and replays the journey through a Solari preview URL (3 replays incl. triple-click, plus a normal single-click regression). An adversarial model review looks for ways the fix is wrong. Each check is reported separately — never a single "100% fixed". |
| **GitHub Publisher** | GitHub App (Octokit) | After **human approval**, commits to a new `ghostlayer/fix-…` branch via the Git Data API and opens a **draft PR** with reproduction steps, root cause, real check results, and limitations. Never pushes to the default branch, never merges. |

## Architecture

```
Next.js 16 (App Router)  ──►  Postgres (Prisma 7)  ◄──  Worker (tsx worker/index.ts)
  • Clerk auth (proxy.ts)        • projects, scans,          • claims jobs with
  • ownership-scoped APIs          findings, repairs,          FOR UPDATE SKIP LOCKED
  • SSE from AgentEvent table      PRs, evidence, Job        • runs agents → Solari / OpenAI / GitHub
```

* Long-running agent work never runs inside an HTTP request. Refreshing the page can't cancel a scan, and SSE resumes from `Last-Event-ID`.
* Idempotency: there is one active scan per project, one active repair per finding, an idempotency key on every job, and a PR is reused if one already exists for the branch.
* Safety:
  * Targets are checked for an http(s) scheme, DNS resolution, and private/reserved IP ranges, and cloud-metadata endpoints are blocked.
  * Top-level navigation off the target origin is blocked.
  * Destructive controls are skipped.
  * Page and repo content is treated as untrusted model input.
  * Tokens are sanitized out of logs.
  * Evidence is served only to the project owner.

## Setup

```bash
pnpm install
cp .env.example .env.local      # fill in Clerk, DATABASE_URL, SOLARI_API_KEY, OPENAI_API_KEY
pnpm prisma migrate dev         # creates tables
pnpm dev                        # http://localhost:3000
pnpm worker                     # in a second terminal
```

GitHub App: sign in, go to **Dashboard → GitHub → Register GitHub App (one click)**. That uses GitHub's manifest flow and writes the App credentials to `.env.local`. Then **Connect GitHub** and pick the repositories GhostLayer may repair.

Permissions requested: Metadata read, Contents read/write, Pull requests read/write.

## Demo target

[`mad-hatter-tea-emporium`](https://github.com/MaranZeal678/mad-hatter-tea-emporium) is a small Next.js tea shop with a realistic checkout. It uses synthetic data only and takes no real payments.
