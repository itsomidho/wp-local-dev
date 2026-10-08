<?php
/**
 * Plugin Name: wpdev admin domain
 * Description: Rewrites wp-admin's own URLs to the admin domain for requests that came in through it. Managed by `wpdev admin-domain`, removed by `wpdev admin-domain <site> off`.
 *
 * wpdev:managed admin-domain
 *
 * The admin domain is a reverse proxy in front of this site: WordPress
 * sees the site's own Host, plus X-Forwarded-Host set to the admin domain.
 * WordPress builds its URLs from siteurl/home, so without this, every
 * link, form and asset in wp-admin would point back at the site domain,
 * where you aren't logged in. Only URLs on this site's own host are
 * rewritten (not CDNs or other sites), and only for those requests.
 */

defined('ABSPATH') || exit;

const WPDEV_ADMIN_DOMAIN = '__WPDEV_ADMIN_DOMAIN__';
const WPDEV_ADMIN_ORIGIN = '__WPDEV_ADMIN_ORIGIN__';

/**
 * Whether this request came in through the admin domain: nginx's admin
 * server block forwards from 127.0.0.1 and sets X-Forwarded-Host itself,
 * so a browser sending that header straight to the site doesn't count.
 */
function wpdev_admin_domain_request(): bool
{
    return ($_SERVER['HTTP_X_FORWARDED_HOST'] ?? '') === WPDEV_ADMIN_DOMAIN
        && ($_SERVER['REMOTE_ADDR'] ?? '') === '127.0.0.1';
}

/*
 * Core builds some URLs from the Host it was sent rather than from
 * siteurl: list-table sort links, wp-admin's canonical <link> (which a
 * script copies into the address bar), auth_redirect()'s redirect_to. Make
 * that the admin domain for requests that came through it. Site lookup
 * (multisite) has already happened by the time mu-plugins load.
 */
if (wpdev_admin_domain_request()) {
    $_SERVER['HTTP_HOST'] = (string) wp_parse_url(WPDEV_ADMIN_ORIGIN, PHP_URL_HOST)
        . (wp_parse_url(WPDEV_ADMIN_ORIGIN, PHP_URL_PORT) ? ':' . wp_parse_url(WPDEV_ADMIN_ORIGIN, PHP_URL_PORT) : '');
}

/**
 * This site's own hosts, read from the options directly: calling
 * site_url()/home_url() here would recurse through the filters below.
 */
function wpdev_admin_domain_own_hosts(): array
{
    static $hosts = null;
    if ($hosts === null) {
        $hosts = array_values(array_unique(array_filter([
            strtolower((string) wp_parse_url((string) get_option('home'), PHP_URL_HOST)),
            strtolower((string) wp_parse_url((string) get_option('siteurl'), PHP_URL_HOST)),
        ])));
    }
    return $hosts;
}

/**
 * <url> on the admin domain when this request came through it and <url> is
 * on this site's own host; otherwise unchanged. Path, query and fragment
 * are kept.
 */
function wpdev_admin_domain_url($url)
{
    if (!is_string($url) || $url === '' || !wpdev_admin_domain_request()) {
        return $url;
    }
    $parts = wp_parse_url($url);
    if (empty($parts['host']) || !in_array(strtolower($parts['host']), wpdev_admin_domain_own_hosts(), true)) {
        return $url;
    }
    return WPDEV_ADMIN_ORIGIN
        . ($parts['path'] ?? '/')
        . (isset($parts['query']) ? '?' . $parts['query'] : '')
        . (isset($parts['fragment']) ? '#' . $parts['fragment'] : '');
}

foreach ([
    'admin_url',
    'includes_url',
    'content_url',
    'plugins_url',
    'rest_url',          // REST calls from wp-admin need the login cookie, which only the admin domain gets
    'lostpassword_url',
    'register_url',
    'preview_post_link',
    'style_loader_src',
    'script_loader_src',
] as $wpdev_hook) {
    add_filter($wpdev_hook, 'wpdev_admin_domain_url', 99);
}
unset($wpdev_hook);

// wp-login.php (login, logout, password reset) is built through site_url().
add_filter('site_url', function ($url, $path) {
    return strpos(ltrim((string) $path, '/'), 'wp-login.php') === 0 ? wpdev_admin_domain_url($url) : $url;
}, 99, 2);

// auth_redirect() builds redirect_to from the Host WordPress saw.
add_filter('login_url', function ($login_url, $redirect) {
    $login_url = wpdev_admin_domain_url($login_url);
    if ($redirect !== '' && wpdev_admin_domain_request()) {
        $login_url = add_query_arg('redirect_to', urlencode(wpdev_admin_domain_url($redirect)), remove_query_arg('redirect_to', $login_url));
    }
    return $login_url;
}, 99, 2);

// Let wp_safe_redirect() go to the admin domain (e.g. redirect_to after login).
add_filter('allowed_redirect_hosts', function ($hosts) {
    $hosts[] = WPDEV_ADMIN_DOMAIN;
    return $hosts;
});


// Script/style base URLs are fixed once from siteurl, before these filters
// run; load-scripts.php/load-styles.php (wp-admin's concatenation) and
// relative core handles are built from them.
foreach (['wp_default_scripts', 'wp_default_styles'] as $wpdev_hook) {
    add_action($wpdev_hook, function ($deps) {
        if (wpdev_admin_domain_request() && is_string($deps->base_url) && $deps->base_url !== '') {
            $deps->base_url = untrailingslashit(wpdev_admin_domain_url(trailingslashit($deps->base_url)));
        }
    }, 99);
}
unset($wpdev_hook);


// The Customizer previews home_url(), on the site domain, where you aren't
// logged in -- so its preview fails. While customizing through the admin
// domain, keep the site's own links on the admin domain too: the preview
// frame, and the pages you click to inside it, then load through the
// admin domain with your login.
add_filter('home_url', function ($url) {
    if (function_exists('is_customize_preview') && is_customize_preview()) {
        return wpdev_admin_domain_url($url);
    }
    return $url;
}, 99);
