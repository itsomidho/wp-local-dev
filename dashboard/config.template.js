// Generated from this template by docker-entrypoint.sh on every container
// start (envsubst on API_PORT/APP_VERSION/NGINX_HTTPS_PORT) -- not baked in at image build
// time, so changing API_PORT in .env, or just running `wpdev up` again
// after pulling new commits, doesn't require rebuilding this image.
window.__WPDEV_API_BASE__ = "http://localhost:${API_PORT}";
window.__WPDEV_APP_VERSION__ = "${APP_VERSION}";
window.__WPDEV_HTTPS_PORT__ = "${NGINX_HTTPS_PORT}";
