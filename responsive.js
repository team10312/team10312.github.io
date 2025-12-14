/* ======= Device / Layout Detection ======= */
(function() {
  // Treat "mobile" as: small viewport AND touch-capable (or obvious mobile UA).
  // This prevents narrow desktop windows from getting the mobile-only nav.
  // NOTE: The site hides the desktop nav below 900px, so we align to that breakpoint.
  const mq = window.matchMedia("(max-width: 899px)");
  const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isTouch = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ("ontouchstart" in window);

  function classify() {
    const mobileLike = mq.matches && (uaMobile || isTouch);
    document.body.classList.toggle("is-mobile", mobileLike);
    document.body.classList.toggle("is-desktop", !mobileLike);

    // If we leave mobile, force-close the mobile menu.
    if (!mobileLike) {
      document.body.classList.remove("nav-open");
    }
  }

  classify();
  window.addEventListener("resize", classify);
  mq.addEventListener?.("change", classify);

  // ======= Auto-inject hamburger for existing navs =======
  function setupNav(nav) {
    if (!nav) return;
    if (nav.dataset.enhanced) return;
    nav.dataset.enhanced = "true";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-toggle";
    btn.setAttribute("aria-label", "Toggle navigation");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = "<span class=\"bar\"></span>";
    nav.prepend(btn);

    // Ensure we have a full-screen overlay that can sit above everything.
    let overlay = document.getElementById("nav-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "nav-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    btn.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // Close when tapping the overlay
    overlay.addEventListener("click", () => {
      if (!document.body.classList.contains("nav-open")) return;
      document.body.classList.remove("nav-open");
      btn.setAttribute("aria-expanded", "false");
    });

    // Close on ESC
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("nav-open")) {
        document.body.classList.remove("nav-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Try common selectors
  setupNav(document.querySelector(".site-nav"));
  setupNav(document.querySelector("header nav"));
  setupNav(document.querySelector("nav"));

  // Also support `.container.nav` + `.nav-links` structure used on Team10312
  (function() {
    const bar = document.querySelector("header .container.nav");
    const links = bar?.querySelector(".nav-links");
    if (!bar || !links || bar.dataset.enhanced) return;
    bar.dataset.enhanced = "true";

    // Insert toggle button to the right side (after existing left items)
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-toggle";
    btn.setAttribute("aria-label", "Toggle menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = "<span class=\"bar\"></span>";
    // Prefer placing button before .nav-links so it shows on the right
    bar.insertBefore(btn, links);

    // Ensure we have a full-screen overlay that can sit above everything.
    let overlay = document.getElementById("nav-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "nav-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    btn.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // Close when tapping the overlay
    overlay.addEventListener("click", () => {
      if (!document.body.classList.contains("nav-open")) return;
      document.body.classList.remove("nav-open");
      btn.setAttribute("aria-expanded", "false");
    });

    // Close on ESC
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("nav-open")) {
        document.body.classList.remove("nav-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });

    // Close on link click (single-page feel)
    links.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.tagName === "A") {
        document.body.classList.remove("nav-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  })();

})();
