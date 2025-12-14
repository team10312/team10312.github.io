/* ======= Device / Layout Detection + Mobile Nav ======= */
(function() {
  const mq = window.matchMedia("(max-width: 768px)");
  const coarse = window.matchMedia("(pointer: coarse)");

  function classify() {
    const mobileLike = mq.matches || coarse.matches;
    document.body.classList.toggle("is-mobile", mobileLike);
    document.body.classList.toggle("is-desktop", !mobileLike);
    if (!mobileLike) document.body.classList.remove("nav-open");
  }

  classify();
  window.addEventListener("resize", classify);
  coarse.addEventListener?.("change", classify);
  mq.addEventListener?.("change", classify);

  // ===== Team10312 layout: .container.nav + .nav-links (links are direct <a>, not <ul>) =====
  function injectToggleIntoTeamBar() {
    const bar = document.querySelector("header .container.nav");
    const links = bar?.querySelector(".nav-links");
    if (!bar || !links) return false;
    if (bar.dataset.navEnhanced === "true") return true;

    bar.dataset.navEnhanced = "true";

    const btn = document.createElement("button");
    btn.className = "nav-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "Toggle menu");
    btn.innerHTML = "<span></span>";

    // Place the hamburger at the right edge of the bar on mobile
    const navCta = bar.querySelector(".nav-cta");
    if (navCta) bar.insertBefore(btn, navCta);
    else bar.appendChild(btn);

    btn.addEventListener("click", () => {
      document.body.classList.toggle("nav-open");
    });

    // Close on link click
    links.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.tagName === "A") document.body.classList.remove("nav-open");
    });

    return true;
  }

  // ===== Generic nav: expects a <ul> inside nav =====
  function setupNav(nav) {
    if (!nav) return;
    if (nav.dataset.navEnhanced === "true") return;
    if (!nav.querySelector("ul")) return; // avoid injecting into link-only navs

    nav.dataset.navEnhanced = "true";

    const btn = document.createElement("button");
    btn.className = "nav-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "Toggle navigation");
    btn.innerHTML = "<span></span>";
    nav.prepend(btn);

    btn.addEventListener("click", () => {
      document.body.classList.toggle("nav-open");
    });
  }

  // Prefer Team10312 bar injection; fall back to generic navs
  const usedTeamBar = injectToggleIntoTeamBar();
  if (!usedTeamBar) {
    setupNav(document.querySelector(".site-nav"));
    setupNav(document.querySelector("header nav"));
    setupNav(document.querySelector("nav"));
  }
})();
