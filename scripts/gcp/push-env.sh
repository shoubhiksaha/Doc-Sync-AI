#!/usr/bin/env bash
# ==============================================================================
# DocSync AI — upload one environment's settings to Secret Manager.
#
# Usage: bash scripts/gcp/push-env.sh <staging|production> <env-file>
#
# Every KEY=value line in the file (same format as .env.example) becomes the secret
# "<environment>-KEY", which the next deploy exposes to the app as KEY. Values are piped to
# gcloud on stdin and never printed. Only the environment's runtime service account can read them.
# A new value takes effect on the next deploy. To remove a setting, delete its secret:
#   gcloud secrets delete <environment>-KEY --project docsyncai1
# ==============================================================================
set -euo pipefail

ENVIRONMENT="${1:?usage: push-env.sh <staging|production> <env-file>}"
FILE="${2:?usage: push-env.sh <staging|production> <env-file>}"
PROJECT="${GCP_PROJECT_ID:-docsyncai1}"
RUNTIME_SA="docsync-${ENVIRONMENT}@${PROJECT}.iam.gserviceaccount.com"

case "$ENVIRONMENT" in staging|production) ;; *) echo "Unknown environment: $ENVIRONMENT" >&2; exit 2 ;; esac
[ -f "$FILE" ] || { echo "❌ $FILE not found" >&2; exit 1; }

# Set by scripts/ci/deploy.sh for each environment, so they never come from a file.
RESERVED=" APP_ENV NEXTAUTH_URL FIRESTORE_DATABASE_ID PORT HOSTNAME NODE_ENV "

count=0
while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"
    key="${key#export }"
    key="$(echo "$key" | tr -d '[:space:]')"
    value="${line#*=}"
    [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "⚠️  Skipping a line that isn't KEY=value"; continue; }
    [ -n "$value" ] || continue
    if [[ "$RESERVED" == *" $key "* ]]; then
        echo "ℹ️  Skipping $key (set by the deploy)"
        continue
    fi
    # Strip one pair of matching surrounding quotes, as dotenv does.
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi

    secret="${ENVIRONMENT}-${key}"
    if ! gcloud secrets describe "$secret" --project="$PROJECT" >/dev/null 2>&1; then
        gcloud secrets create "$secret" --project="$PROJECT" --replication-policy=automatic \
            --labels="app=docsync,environment=${ENVIRONMENT}" >/dev/null
    fi
    printf '%s' "$value" | gcloud secrets versions add "$secret" --project="$PROJECT" --data-file=- >/dev/null
    # Secret Manager bills per stored version, so drop the ones the new value replaces.
    gcloud secrets versions list "$secret" --project="$PROJECT" --filter='state=ENABLED' \
        --sort-by='~createTime' --format='value(name.basename())' | tail -n +2 | while read -r old; do
        gcloud secrets versions destroy "$old" --secret="$secret" --project="$PROJECT" --quiet >/dev/null
    done
    gcloud secrets add-iam-policy-binding "$secret" --project="$PROJECT" \
        --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor >/dev/null
    echo "✅ $key"
    count=$((count + 1))
done <"$FILE"

echo "Uploaded $count settings for ${ENVIRONMENT}. They apply on the next deploy."
