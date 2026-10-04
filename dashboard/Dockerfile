# Build stage -- Vite produces static files, nothing here needs to run at
# container start.
FROM node:20-slim AS build
WORKDIR /src
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Runtime -- just nginx serving the built static files. config.template.js
# is rendered into config.js on every container start (see
# docker-entrypoint.sh) so changing API_PORT in .env doesn't need a rebuild.
FROM nginx:alpine
COPY --from=build /src/dist /usr/share/nginx/html
COPY --from=build /src/config.template.js /usr/share/nginx/html/config.template.js
COPY dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 dashboard/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
