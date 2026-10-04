// Generated from this template by docker-entrypoint.sh on every container
// start (envsubst on API_PORT) -- not baked in at image build time, so
// changing API_PORT in .env doesn't require rebuilding this image.
window.__WPDEV_API_BASE__ = "http://localhost:${API_PORT}";
