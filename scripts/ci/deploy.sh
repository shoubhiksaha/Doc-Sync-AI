#!/usr/bin/env bash
# ==============================================================================
# DocSync AI — environment deploy to Vercel (run by GitHub Actions only)
#
# Usage: deploy.sh <staging|production>
#
# Both environments live in one Vercel project:
#   production → Vercel "Production" environment, https://docsync.analogdigital.tech
#                (Firestore database "(default)")
#   staging    → Vercel "Preview" environment, aliased to $STAGING_DOMAIN when set
#                (Firestore database "staging" via FIRESTORE_DATABASE_ID)
#
# Each environment's runtime variables are managed in Vercel (Settings → Environment
# Variables → Preview / Production); `vercel pull` brings the right set into the build.
#
# Required env:  VERCEL_TOKEN (environment secret), VERCEL_ORG_ID, VERCEL_PROJECT_ID (variables)
# Optional env:  STAGING_DOMAIN  custom domain to alias the staging deployment to
# Output:        deployment_url=<url> appended to $GITHUB_OUTPUT
# ==============================================================================
set -euo pipefail

ENVIRONMENT="${1:?usage: deploy.sh <staging|production>}"
VERCEL_CLI_VERSION="65.0.0"
PRODUCTION_URL="https://docsync.analogdigital.tech"

case "$ENVIRONMENT" in
    staging)
        PULL_ENV="preview"
        PROD_FLAG=()
        ;;
    production)
        PULL_ENV="production"
        PROD_FLAG=(--prod)
        ;;
    *)
        echo "Unknown environment: $ENVIRONMENT" >&2
        exit 2
        ;;
esac

if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
    echo "❌ deploy.sh only runs inside GitHub Actions. Open a PR instead (see docs/RELEASE_FLOW.md)." >&2
    exit 1
fi

for v in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
    if [ -z "${!v:-}" ]; then
        echo "❌ $v is not set. Configure it on the '$ENVIRONMENT' GitHub environment (see docs/RELEASE_FLOW.md)." >&2
        exit 1
    fi
done
export VERCEL_ORG_ID VERCEL_PROJECT_ID

echo "ℹ️  Installing Vercel CLI ${VERCEL_CLI_VERSION}"
npm install --global --no-audit --no-fund "vercel@${VERCEL_CLI_VERSION}" >/dev/null

# The token is passed via argument only; `set -x` is never enabled so it is not echoed.
echo "ℹ️  Pulling Vercel '${PULL_ENV}' environment settings"
vercel pull --yes --environment="$PULL_ENV" --token="$VERCEL_TOKEN" >/dev/null

echo "ℹ️  Building for ${ENVIRONMENT} (commit ${GITHUB_SHA:-unknown})"
vercel build ${PROD_FLAG[@]+"${PROD_FLAG[@]}"} --token="$VERCEL_TOKEN"

echo "ℹ️  Deploying prebuilt output"
DEPLOY_URL="$(vercel deploy --prebuilt ${PROD_FLAG[@]+"${PROD_FLAG[@]}"} --token="$VERCEL_TOKEN" | tail -n 1)"
case "$DEPLOY_URL" in
    https://*) ;;
    *)
        echo "❌ Could not read the deployment URL from the Vercel CLI output: '$DEPLOY_URL'" >&2
        exit 1
        ;;
esac
echo "✅ Deployed: $DEPLOY_URL"

FINAL_URL="$DEPLOY_URL"
if [ "$ENVIRONMENT" = "staging" ] && [ -n "${STAGING_DOMAIN:-}" ]; then
    echo "ℹ️  Aliasing staging deployment to ${STAGING_DOMAIN}"
    vercel alias set "$DEPLOY_URL" "$STAGING_DOMAIN" --token="$VERCEL_TOKEN"
    FINAL_URL="https://${STAGING_DOMAIN#https://}"
elif [ "$ENVIRONMENT" = "production" ]; then
    FINAL_URL="$PRODUCTION_URL"
fi

echo "✅ ${ENVIRONMENT} is live at ${FINAL_URL}"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "deployment_url=${FINAL_URL}" >>"$GITHUB_OUTPUT"
fi
