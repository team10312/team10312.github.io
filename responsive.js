/* ======= Device / Layout Detection ======= */
(function() {
  // Treat the site as "mobile" only when the layout is in a small-screen
  // breakpoint. Avoid pointer-based detection so touch laptops don't get the
  // mobile nav behavior.
  const mq = window.matchMedia("(max-width: 768px)");

  // Best-effort device hint (used only as a tie-breaker; width is primary)
  const uaIsMobile = (() => {
    try {
      if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
        return navigator.userAgentData.mobile;
      }
    } catch (_) {}
    return /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  })();

  function classify() {
    const mobileLike = mq.matches; // width-based
    document.body.classList.toggle("is-mobile", mobileLike);
    document.body.classList.toggle("is-desktop", !mobileLike);
  }

  classify();
  window.addEventListener("resize", classify);
  mq.addEventListener?.("change", classify);

  // ======= Mobile nav for Team10312 header (.container.nav + .nav-links) =======
  (function() {
    const bar = document.querySelector("header .container.nav");
    const links = bar?.querySelector(".nav-links");
    if (!bar || !links || bar.dataset.enhanced) return;
    bar.dataset.enhanced = "true";

    // Insert toggle button before the link list
    const btn = document.createElement("button");
    btn.className = "nav-toggle";
    btn.setAttribute("aria-label", "Toggle menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = "<span class=\"bar\"></span><span class=\"bar\"></span><span class=\"bar\"></span>";
    bar.insertBefore(btn, links);

    function setOpen(nextOpen) {
      document.body.classList.toggle("nav-open", nextOpen);
      btn.classList.toggle("open", nextOpen);
      btn.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    }

    btn.addEventListener("click", () => {
      const next = !document.body.classList.contains("nav-open");
      setOpen(next);
    });

    // Close on link click
    links.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.tagName === "A") setOpen(false);
    });

    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });

    // Close when leaving mobile breakpoint
    mq.addEventListener?.("change", () => {
      if (!mq.matches) setOpen(false);
    });
  })();

})();
