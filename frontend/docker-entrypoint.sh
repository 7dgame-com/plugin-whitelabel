#!/bin/sh
set -eu

APP_API_1_URL="${APP_API_1_URL:-http://api:80}"
APP_BACKEND_1_URL="${APP_BACKEND_1_URL:-http://plugin-whitelabel-backend:8093}"
export APP_API_1_URL APP_BACKEND_1_URL

envsubst '${APP_API_1_URL} ${APP_BACKEND_1_URL}' \
  < /etc/nginx/templates/whitelabel.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
