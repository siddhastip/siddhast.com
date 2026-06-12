/**
 * Cookie consent banner — persists via cookie (path=/, optional domain) and localStorage.
 */
(function () {
    'use strict';

    if (window.__siddhastCookieBannerInit) {
        return;
    }
    window.__siddhastCookieBannerInit = true;

    var STORAGE_KEY = 'siddhast-cookie-consent';
    var MAX_AGE_DAYS = 365;
    var VALID = { accepted: true, declined: true };

    function cookieDomain() {
        var host = location.hostname;
        if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
            return '';
        }
        var parts = host.split('.');
        if (parts.length < 3) {
            return '';
        }
        return '; domain=.' + parts.slice(-2).join('.');
    }

    function setConsent(value) {
        if (!VALID[value]) {
            return;
        }

        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch (e) { /* private mode / blocked */ }

        try {
            var maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
            var expires = new Date(Date.now() + maxAge * 1000).toUTCString();
            var secure = location.protocol === 'https:' ? '; Secure' : '';
            document.cookie =
                STORAGE_KEY + '=' + encodeURIComponent(value) +
                '; path=/; max-age=' + maxAge + '; expires=' + expires +
                '; SameSite=Lax' + secure + cookieDomain();
        } catch (e) { /* cookies disabled */ }

        document.documentElement.setAttribute('data-cookie-consent', value);
    }

    function getConsent() {
        var match = document.cookie.match(
            new RegExp('(?:^|;\\s*)' + STORAGE_KEY + '=([^;]*)')
        );
        if (match) {
            var fromCookie = decodeURIComponent(match[1]);
            if (VALID[fromCookie]) {
                return fromCookie;
            }
        }

        try {
            var stored = localStorage.getItem(STORAGE_KEY);
            if (VALID[stored]) {
                return stored;
            }
        } catch (e) { /* blocked */ }

        return null;
    }

    function hideBanner(banner) {
        banner.classList.add('is-hidden');
        banner.setAttribute('aria-hidden', 'true');
    }

    function syncHtmlAttr(consent) {
        if (consent) {
            document.documentElement.setAttribute('data-cookie-consent', consent);
        }
    }

    function init() {
        var banner =
            document.getElementById('cookie-banner') ||
            document.querySelector('.js-cookie-banner');
        if (!banner) {
            return;
        }

        var consent = getConsent();
        if (consent) {
            syncHtmlAttr(consent);
            hideBanner(banner);
            return;
        }

        var accept =
            document.getElementById('cookie-accept') ||
            document.querySelector('.js-cookie-accept');
        var decline =
            document.getElementById('cookie-decline') ||
            document.querySelector('.js-cookie-decline');

        function onChoice(value) {
            setConsent(value);
            hideBanner(banner);
        }

        if (accept) {
            accept.addEventListener('click', function () {
                onChoice('accepted');
            });
        }
        if (decline) {
            decline.addEventListener('click', function () {
                onChoice('declined');
            });
        }
    }

    syncHtmlAttr(getConsent());

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
