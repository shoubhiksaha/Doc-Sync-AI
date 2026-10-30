#!/usr/bin/env bash
# ==============================================================================
# DocSync AI — upload one environment's settings to Secret Manager.
#
# Usage: bash scripts/gcp/push-env.sh <staging|production> <env-file>
#
# The whole file (same format as .env.example) becomes ONE secret, "<environment>-env", which
# Cloud Run mounts at /secrets/app.env and Node loads at start (see Dockerfile). One secret per
# environment keeps Secret Manager inside its free tier (6 stored versions, 10,000 reads a
# month); a secret per setting would be billed. Only the previous version is kept.
#
# The file is uploaded via stdin and never printed. Only the environment's runtime service
# account can read the secret. New settings apply on the next deploy.
# ==============================================================================
set -euo pipefail

ENVIRONMENT="${1:?usage: push-env.sh <staging|production> <env-file>}"
FILE="${2:?usage: push-env.sh <staging|production> <env-file>}"
PROJECT="${GCP_PROJECT_ID:-docsyncai1}"
SECRET="${ENVIRONMENT}-env"
RUNTIME_SA="docsync-${ENVIRONMENT}@${PROJECT}.iam.gserviceaccount.com"

case "$ENVIRONMENT" in staging|production) ;; *) echo "Unknown environment: $ENVIRONMENT" >&2; exit 2 ;; esac
[ -f "$FILE" ] || { echo "❌ $FILE not found" >&2; exit 1; }

# Set by scripts/ci/deploy.sh for each environment; the deploy's values would win anyway.
RESERVED='^(export[[:space:]]+)?(APP_ENV|NEXTAUTH_URL|FIRESTORE_DATABASE_ID|PORT|HOSTNAME|NODE_ENV)='
grep -Eq "$RESERVED" "$FILE" && echo "ℹ️  Ignoring APP_ENV / NEXTAUTH_URL / FIRESTORE_DATABASE_ID: the deploy sets them"

# Settings only: drop comments, blank lines, empty values and the reserved names.
if ! gcloud secrets describe "$SECRET" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud secrets create "$SECRET" --project="$PROJECT" --replication-policy=automatic \
        --labels="app=docsync,environment=${ENVIRONMENT}" >/dev/null
fi
grep -Ev '^[[:space:]]*(#|$)' "$FILE" | grep -Ev '^[^=]+=[[:space:]]*$' | grep -Ev "$RESERVED" \
    | gcloud secrets versions add "$SECRET" --project="$PROJECT" --data-file=- >/dev/null
gcloud secrets add-iam-policy-binding "$SECRET" --project="$PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor >/dev/null

# Keep the new version and the one before it (running instances may still be on it); destroy
# the rest, since every stored version counts toward the free tier.
gcloud secrets versions list "$SECRET" --project="$PROJECT" --filter='state!=DESTROYED' \
    --sort-by='~createTime' --format='value(name.basename())' | tail -n +3 | while read -r old; do
    gcloud secrets versions destroy "$old" --secret="$SECRET" --project="$PROJECT" --quiet >/dev/null
done

count="$(grep -Ev '^[[:space:]]*(#|$)' "$FILE" | grep -Ev '^[^=]+=[[:space:]]*$' | grep -Evc "$RESERVED" || true)"
echo "✅ Uploaded $count settings to ${SECRET}. They apply on the next ${ENVIRONMENT} deploy."
