/**
 * Mobile menu: move panel out of the nav bar and toggle open state reliably.
 */
(function () {
    'use strict';

    function initMobileMenu() {
        var btn = document.getElementById('mobile-menu-btn');
        var menu = document.getElementById('mobile-menu');
        var overlay = document.getElementById('mobile-overlay');
        if (!btn || !menu || !overlay) {
            return;
        }

        /* Escape clipped stacking inside #main-nav (fixed 56px bar) */
        if (menu.closest('#main-nav')) {
            var header = menu.closest('header');
            if (header) {
                header.appendChild(menu);
                header.appendChild(overlay);
            } else {
                document.body.appendChild(menu);
                document.body.appendChild(overlay);
            }
        }

        function setHamburger(open) {
            var hb1 = document.getElementById('hb1');
            var hb2 = document.getElementById('hb2');
            var hb3 = document.getElementById('hb3');
            if (hb1) {
                hb1.style.transform = open ? 'rotate(45deg) translate(5px, 5px)' : '';
            }
            if (hb2) {
                hb2.style.opacity = open ? '0' : '1';
            }
            if (hb3) {
                hb3.style.transform = open ? 'rotate(-45deg) translate(5px, -5px)' : '';
            }
        }

        function setOpen(open) {
            menu.classList.toggle('open', open);
            document.body.classList.toggle('mobile-menu-active', open);
            overlay.hidden = !open;
            overlay.style.display = open ? 'block' : 'none';
            menu.setAttribute('aria-hidden', open ? 'false' : 'true');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            document.body.style.overflow = open ? 'hidden' : '';
            setHamburger(open);
        }

        function toggle() {
            setOpen(!menu.classList.contains('open'));
        }

        function close() {
            if (menu.classList.contains('open')) {
                setOpen(false);
            }
        }

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggle();
        });

        overlay.addEventListener('click', function (e) {
            e.preventDefault();
            close();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                close();
            }
        });

        /* Reset if page restored from bfcache */
        setOpen(false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileMenu);
    } else {
        initMobileMenu();
    }
})();
