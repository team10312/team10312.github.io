/*
  ===== Device-aware mobile enhancements (desktop layout preserved) =====

  - Adds `body.is-mobile` ONLY when the visitor is on a mobile device.
  - On mobile, injects a hamburger button + dropdown menu.
  - On desktop, removes the mobile menu and restores the original DOM.

  This avoids desktop layout shifts and only changes the site for mobile visitors.
*/

(function() {
  const MOBILE_MAX_WIDTH = 900; // matches site nav breakpoint in page CSS
  const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
  const coarse = window.matchMedia('(pointer: coarse)');

  const ua = (navigator.userAgent || '').toLowerCase();
  const uaMobile = /android|iphone|ipod|ipad|iemobile|windows phone|blackberry|opera mini|mobile/.test(ua);

  let containerNav, navLeft, navLinks, navCta;
  let original = null;
  let lastMobile = null;
  let mobileListenersOn = false;

  function cacheDom() {
    containerNav = document.querySelector('header .container.nav');
    if (!containerNav) return;
    navLeft = containerNav.querySelector('.nav-left');
    navLinks = containerNav.querySelector('.nav-links');
    navCta = containerNav.querySelector('.nav-cta');

    if (!original && navLinks && navCta) {
      original = {
        navLinksParent: navLinks.parentNode,
        navLinksNext: navLinks.nextSibling,
        navCtaParent: navCta.parentNode,
        navCtaNext: navCta.nextSibling
      };
    }
  }

  function isMobileDevice() {
    // Intentional: prefer device signal over just viewport width.
    // - UA match OR (coarse pointer + small viewport)
    return uaMobile || (coarse.matches && mq.matches);
  }

  function ensureToggle() {
    if (!containerNav) return;
    if (containerNav.querySelector('.nav-toggle')) return;

    const btn = document.createElement('button');
    btn.className = 'nav-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span></span>';

    // Put toggle at the far right on mobile (container is flex).
    containerNav.appendChild(btn);

    btn.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function ensureMobileMenu() {
    if (!containerNav || !navLinks || !navCta || !original) return;

    let menu = containerNav.querySelector('#mobile-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'mobile-menu';
      menu.setAttribute('role', 'menu');
      containerNav.appendChild(menu);

      // Close the menu when any link inside is clicked
      menu.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.tagName === 'A') {
          document.body.classList.remove('nav-open');
          const btn = containerNav.querySelector('.nav-toggle');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Move the existing nav groups into the mobile menu (mobile only)
    if (navLinks.parentNode !== menu) menu.appendChild(navLinks);
    if (navCta.parentNode !== menu) menu.appendChild(navCta);

    // Tap outside to close (only bind once)
    if (!mobileListenersOn) {
      document.addEventListener('click', onOutsideClick, true);
      document.addEventListener('keydown', onEscape);
      mobileListenersOn = true;
    }
  }

  function restoreDesktopNav() {
    if (!original || !navLinks || !navCta) return;

    const menu = document.querySelector('#mobile-menu');
    if (menu) menu.remove();

    // Restore navLinks
    if (original.navLinksParent) {
      if (original.navLinksNext && original.navLinksNext.parentNode === original.navLinksParent) {
        original.navLinksParent.insertBefore(navLinks, original.navLinksNext);
      } else {
        original.navLinksParent.appendChild(navLinks);
      }
    }

    // Restore navCta
    if (original.navCtaParent) {
      if (original.navCtaNext && original.navCtaNext.parentNode === original.navCtaParent) {
        original.navCtaParent.insertBefore(navCta, original.navCtaNext);
      } else {
        original.navCtaParent.appendChild(navCta);
      }
    }

    // Remove toggle button
    const btn = document.querySelector('.nav-toggle');
    if (btn) btn.remove();

    // Remove mobile-only listeners
    if (mobileListenersOn) {
      document.removeEventListener('click', onOutsideClick, true);
      document.removeEventListener('keydown', onEscape);
      mobileListenersOn = false;
    }

    document.body.classList.remove('nav-open');
  }

  function onOutsideClick(e) {
    if (!document.body.classList.contains('nav-open')) return;
    const menu = document.querySelector('#mobile-menu');
    const btn = document.querySelector('.nav-toggle');
    if (!menu || !btn) return;
    if (menu.contains(e.target) || btn.contains(e.target)) return;
    document.body.classList.remove('nav-open');
    btn.setAttribute('aria-expanded', 'false');
  }

  function onEscape(e) {
    if (e.key !== 'Escape') return;
    if (!document.body.classList.contains('nav-open')) return;
    document.body.classList.remove('nav-open');
    const btn = document.querySelector('.nav-toggle');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function apply() {
    cacheDom();
    const mobile = isMobileDevice();
    if (mobile === lastMobile) return;
    lastMobile = mobile;

    document.body.classList.toggle('is-mobile', mobile);
    document.body.classList.toggle('is-desktop', !mobile);

    if (mobile) {
      ensureToggle();
      ensureMobileMenu();
    } else {
      restoreDesktopNav();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  // If the device rotates / resizes, re-check (won't affect desktop unless it becomes mobile)
  window.addEventListener('resize', () => {
    // Only re-evaluate on resize if we're on a coarse pointer or UA indicates mobile.
    // This avoids desktop users accidentally entering mobile mode just by resizing a window.
    if (uaMobile || coarse.matches) apply();
  });

  coarse.addEventListener?.('change', apply);
  mq.addEventListener?.('change', () => { if (uaMobile || coarse.matches) apply(); });
})();
