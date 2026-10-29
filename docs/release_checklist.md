# Release checklist

The flow itself is described in [RELEASE_FLOW.md](RELEASE_FLOW.md). This is the per-release checklist.

## 1. Before opening the staging PR

- [ ] Branch was cut from `main` (`git checkout -b feature/x origin/main`)
- [ ] `npm run check:conflicts`, `npm run check:secrets`
- [ ] `npm run lint`, `npm run typecheck`, `npm run test:coverage`
- [ ] `npm run build` then `npm run test:e2e` (smoke suite in mock mode)
- [ ] New environment variable? Added to Vercel for **both** Preview and Production, and to `.env.example`

## 2. Staging

- [ ] PR `feature/x → staging` is green and merged with a **merge commit**
- [ ] Approved the `staging` deployment in Actions
- [ ] "Post-Deploy Verification (Staging)" passed
- [ ] Manual check on the staging URL in a private window:
      Google login with a test account → scan the sample NGO receipt → review fields → sync →
      a sheet is created in the test account's Drive with the new row
- [ ] `/api/health` on staging shows `environment: staging` and no unexpected `circuit: open`

## 3. Production

- [ ] `npm run promote` from the same feature branch (opens `feature/x → main`)
- [ ] "Branch Policy" passed (every commit already on staging, no staging merges)
- [ ] Merged with a merge commit and approved the `production` deployment
- [ ] "Post-Deploy Verification (Production)" passed
- [ ] Quick check on https://docsync.analogdigital.tech; no new 5xx in Vercel → Logs

## Rollback

1. Vercel → Project → Deployments → previous production deployment → **Instant Rollback** (immediate).
2. `git revert -m 1 <merge-sha>` on a new branch, then ship it through staging → main as usual.
3. Never run `vercel deploy --prod` from a laptop; production deploys only from the `Production Deploy` workflow.
