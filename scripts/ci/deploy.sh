#!/usr/bin/env bash
# ==============================================================================
# DocSync AI — environment deploy to Google Cloud Run (run by GitHub Actions only)
#
# Usage: deploy.sh <staging|production>
#
# Each environment is its own Cloud Run service in Mumbai (asia-south1), project docsyncai1:
#   production → service docsync-production, https://docsync.analogdigital.tech
#                (Firestore database "(default)")
#   staging    → service docsync-staging, https://$STAGING_DOMAIN when set
#                (Firestore database "staging")
# The public domains reach Cloud Run through the Cloudflare Worker in deploy/cloudflare-proxy.
#
# Runtime settings come from Secret Manager: every secret named "<environment>-<VARIABLE>"
# becomes the environment variable VARIABLE (upload them with scripts/gcp/push-env.sh).
# APP_ENV, NEXTAUTH_URL and FIRESTORE_DATABASE_ID are set here.
#
# Required: gcloud signed in as the deployer (google-github-actions/auth), GITHUB_SHA
# Optional: GCP_PROJECT_ID (default docsyncai1), STAGING_DOMAIN
# Output:   deployment_url=<url> appended to $GITHUB_OUTPUT
# ==============================================================================
set -euo pipefail

ENVIRONMENT="${1:?usage: deploy.sh <staging|production>}"
PROJECT="${GCP_PROJECT_ID:-docsyncai1}"
REGION="asia-south1"
SERVICE="docsync-${ENVIRONMENT}"
RUNTIME_SA="docsync-${ENVIRONMENT}@${PROJECT}.iam.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/docsync/web:${GITHUB_SHA:?GITHUB_SHA is not set}"

case "$ENVIRONMENT" in
    staging)
        PUBLIC_URL="${STAGING_DOMAIN:+https://${STAGING_DOMAIN#https://}}"
        FIRESTORE_DATABASE_ID="staging"
        MAX_INSTANCES=2
        ;;
    production)
        PUBLIC_URL="https://docsync.analogdigital.tech"
        FIRESTORE_DATABASE_ID="(default)"
        MAX_INSTANCES=5
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

echo "ℹ️  Building ${IMAGE}"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker build --build-arg "APP_BUILD_SHA=${GITHUB_SHA}" -t "$IMAGE" .
docker push "$IMAGE"

# "staging-NEXTAUTH_SECRET" → NEXTAUTH_SECRET=staging-NEXTAUTH_SECRET:latest
SECRETS=""
while read -r name; do
    case "$name" in
        "${ENVIRONMENT}-"*) SECRETS="${SECRETS:+$SECRETS,}${name#"${ENVIRONMENT}-"}=${name}:latest" ;;
    esac
done < <(gcloud secrets list --project="$PROJECT" --format='value(name.basename())')
if [ -z "$SECRETS" ]; then
    echo "❌ No '${ENVIRONMENT}-*' secrets in Secret Manager. Upload them with scripts/gcp/push-env.sh." >&2
    exit 1
fi

ENV_VARS="APP_ENV=${ENVIRONMENT}"
ENV_VARS+="@@FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_ID}"
[ -n "$PUBLIC_URL" ] && ENV_VARS+="@@NEXTAUTH_URL=${PUBLIC_URL}"

echo "ℹ️  Deploying ${SERVICE} (commit ${GITHUB_SHA})"
gcloud run deploy "$SERVICE" \
    --project="$PROJECT" --region="$REGION" --image="$IMAGE" \
    --service-account="$RUNTIME_SA" --allow-unauthenticated \
    --port=8080 --cpu=1 --memory=1Gi --cpu-boost --concurrency=40 --timeout=120 \
    --min-instances=0 --max-instances="$MAX_INSTANCES" \
    --set-env-vars="^@@^${ENV_VARS}" --set-secrets="$SECRETS" \
    --labels="app=docsync,environment=${ENVIRONMENT}" \
    --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
FINAL_URL="${PUBLIC_URL:-$SERVICE_URL}"
echo "✅ ${ENVIRONMENT} is live at ${FINAL_URL} (Cloud Run: ${SERVICE_URL})"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "deployment_url=${FINAL_URL}" >>"$GITHUB_OUTPUT"
fi
