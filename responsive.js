/* ======= Device / Layout Detection ======= */
(function() {
  const mq = window.matchMedia("(max-width: 768px)");
  const coarse = window.matchMedia("(pointer: coarse)");

  function classify() {
    const mobileLike = mq.matches || coarse.matches;
    document.body.classList.toggle("is-mobile", mobileLike);
    document.body.classList.toggle("is-desktop", !mobileLike);
  }

  classify();
  window.addEventListener("resize", classify);
  coarse.addEventListener?.("change", classify);

  // ======= Auto-inject hamburger for existing navs =======
  function setupNav(nav) {
    if (!nav) return;
    if (nav.dataset.enhanced) return;
    nav.dataset.enhanced = "true";

    const btn = document.createElement("button");
    btn.className = "nav-toggle";
    btn.setAttribute("aria-label", "Toggle navigation");
    btn.innerHTML = "<span></span>";
    nav.prepend(btn);

    btn.addEventListener("click", () => {
      document.body.classList.toggle("nav-open");
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
    btn.className = "nav-toggle";
    btn.setAttribute("aria-label", "Toggle menu");
    btn.innerHTML = "<span></span>";
    // Prefer placing button before .nav-links so it shows on the right
    bar.insertBefore(btn, links);

    btn.addEventListener("click", () => {
      document.body.classList.toggle("nav-open");
    });

    // Close on link click (single-page feel)
    links.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.tagName === "A") {
        document.body.classList.remove("nav-open");
      }
    });
  })();

})();
