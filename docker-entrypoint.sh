#!/bin/sh
set -eu

runtime_config=/usr/share/nginx/html/runtime-config.js
printf '%s\n' "window.__PIPEDIN_CONFIG__ = { googleClientId: '${VITE_GOOGLE_CLIENT_ID:-}' }" > "$runtime_config"
exec nginx -g 'daemon off;'
