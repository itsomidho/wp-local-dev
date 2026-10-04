# Build stage -- Vite produces static files, nothing here needs to run at
# container start. Mirrors the real repo layout (README.md next to
# dashboard/, not flattened into it) -- DocsPage.jsx imports the actual
# root README.md via a relative path, which has to resolve to the same
# file at the same relative depth here as it does in local dev.
FROM node:20-slim AS build
WORKDIR /src
COPY README.md ./README.md
COPY dashboard/package.json dashboard/package-lock.json ./dashboard/
WORKDIR /src/dashboard
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Runtime -- just nginx serving the built static files. config.template.js
# is rendered into config.js on every container start (see
# docker-entrypoint.sh) so changing API_PORT in .env doesn't need a rebuild.
FROM nginx:alpine
COPY --from=build /src/dashboard/dist /usr/share/nginx/html
COPY --from=build /src/dashboard/config.template.js /usr/share/nginx/html/config.template.js
COPY dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 dashboard/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
