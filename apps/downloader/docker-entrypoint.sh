#!/bin/sh
set -eu

provider_port="${POT_PROVIDER_PORT:-4416}"
case "$provider_port" in
  ""|*[!0-9]*)
    echo "POT_PROVIDER_PORT must be numeric" >&2
    exit 1
    ;;
esac

node /app/build/main.js --port "$provider_port" &
provider_pid=$!

ready=0
attempt=0
while [ "$attempt" -lt 40 ]; do
  if ! kill -0 "$provider_pid" 2>/dev/null; then
    wait "$provider_pid" || true
    echo "PO-token provider stopped during startup" >&2
    exit 1
  fi

  if node -e "fetch('http://127.0.0.1:${provider_port}/ping').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"; then
    ready=1
    break
  fi

  attempt=$((attempt + 1))
  sleep 0.25
done

if [ "$ready" -ne 1 ]; then
  echo "PO-token provider did not become ready" >&2
  exit 1
fi

exec "$@"
