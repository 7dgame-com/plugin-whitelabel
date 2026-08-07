#!/bin/sh
set -eu

TEMPLATE="${WHITELABEL_NGINX_TEMPLATE:-/etc/nginx/templates/whitelabel.conf.template}"
OUTPUT="${WHITELABEL_NGINX_OUTPUT:-/etc/nginx/conf.d/default.conf}"

APP_API_1_URL="${APP_API_1_URL:-http://api:80}"
APP_API_2_URL="${APP_API_2_URL:-}"
APP_BACKEND_1_URL="${APP_BACKEND_1_URL:-http://plugin-whitelabel-backend:8093}"
APP_BACKEND_2_URL="${APP_BACKEND_2_URL:-}"

validate_origin() {
  name="$1"
  value="$2"
  [ -z "$value" ] && return 0

  if ! printf '%s\n' "$value" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
    echo "[entrypoint] ${name} must be an http(s) origin without a path" >&2
    exit 1
  fi
}

origin_host() {
  printf '%s\n' "$1" | sed -E 's#^https?://##; s#:[0-9]+$##'
}

inject_marker() {
  marker="$1"
  content="$2"
  replacement="$(mktemp)"
  printf '%s' "$content" > "$replacement"
  awk -v file="$replacement" -v marker="$marker" '
    index($0, marker) {
      while ((getline line < file) > 0) print line
      close(file)
      next
    }
    { print }
  ' "$OUTPUT" > "${OUTPUT}.tmp"
  mv "${OUTPUT}.tmp" "$OUTPUT"
  rm -f "$replacement"
}

validate_origin APP_API_1_URL "$APP_API_1_URL"
validate_origin APP_API_2_URL "$APP_API_2_URL"
validate_origin APP_BACKEND_1_URL "$APP_BACKEND_1_URL"
validate_origin APP_BACKEND_2_URL "$APP_BACKEND_2_URL"

APP_API_1_HOST="$(origin_host "$APP_API_1_URL")"
APP_BACKEND_1_HOST="$(origin_host "$APP_BACKEND_1_URL")"
export APP_API_1_URL APP_API_1_HOST APP_BACKEND_1_URL APP_BACKEND_1_HOST

envsubst '${APP_API_1_URL} ${APP_API_1_HOST} ${APP_BACKEND_1_URL} ${APP_BACKEND_1_HOST}' \
  < "$TEMPLATE" > "$OUTPUT"

api_primary_failover=""
api_failover_location=""
if [ -n "$APP_API_2_URL" ]; then
  APP_API_2_HOST="$(origin_host "$APP_API_2_URL")"
  export APP_API_2_URL APP_API_2_HOST
  api_primary_failover='        proxy_intercept_errors on;
        error_page 502 503 504 = @api_failover;'
  api_failover_location="$(envsubst '${APP_API_2_URL} ${APP_API_2_HOST}' <<'EOF'
    location @api_failover {
        proxy_pass ${APP_API_2_URL};
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_ssl_name ${APP_API_2_HOST};
        proxy_set_header Host ${APP_API_2_HOST};
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }
EOF
)"
fi

backend_primary_failover=""
backend_failover_location=""
if [ -n "$APP_BACKEND_2_URL" ]; then
  APP_BACKEND_2_HOST="$(origin_host "$APP_BACKEND_2_URL")"
  export APP_BACKEND_2_URL APP_BACKEND_2_HOST
  backend_primary_failover='        proxy_intercept_errors on;
        error_page 502 503 504 = @backend_failover;'
  backend_failover_location="$(envsubst '${APP_BACKEND_2_URL} ${APP_BACKEND_2_HOST}' <<'EOF'
    location @backend_failover {
        proxy_pass ${APP_BACKEND_2_URL};
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_ssl_name ${APP_BACKEND_2_HOST};
        proxy_set_header Host ${APP_BACKEND_2_HOST};
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }
EOF
)"
fi

inject_marker '# __API_PRIMARY_FAILOVER__' "$api_primary_failover"
inject_marker '# __API_FAILOVER_LOCATION__' "$api_failover_location"
inject_marker '# __BACKEND_PRIMARY_FAILOVER__' "$backend_primary_failover"
inject_marker '# __BACKEND_FAILOVER_LOCATION__' "$backend_failover_location"

if [ "${WHITELABEL_NGINX_DRY_RUN:-0}" = "1" ]; then
  exit 0
fi

exec nginx -g 'daemon off;'
