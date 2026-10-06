#!/bin/sh
set -e

envsubst '${API_PORT} ${APP_VERSION} ${NGINX_HTTPS_PORT}' < /usr/share/nginx/html/config.template.js > /usr/share/nginx/html/config.js

exec "$@"
