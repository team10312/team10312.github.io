(function () {
  const MEDIA_PROXY_FUNCTION = "tba-media";
  const MATCH_LEVEL_ORDER = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
  const MATCH_LEVEL_LABELS = {
    qm: "Qual",
    ef: "Eighthfinal",
    qf: "Quarterfinal",
    sf: "Semifinal",
    f: "Final"
  };

  const state = {
    config: null,
    eventsBySeason: new Map(),
    matchesByEvent: new Map(),
    renderedMatches: [],
    selectedSeason: null,
    selectedEventKey: "",
    requestToken: 0
  };

  let seasonSelect;
  let eventSelect;
  let statusEl;
  let carouselEl;
  let viewportEl;
  let prevButtonEl;
  let nextButtonEl;
  let gridEl;
  let metaEl;
  let eventNameEl;
  let eventSubtitleEl;
  let eventSummaryEl;

  document.addEventListener("DOMContentLoaded", initMediaVideos);

  function initMediaVideos() {
    seasonSelect = document.getElementById("videoSeasonSelect");
    eventSelect = document.getElementById("videoEventSelect");
    statusEl = document.getElementById("videoStatus");
    carouselEl = document.getElementById("videoCarousel");
    viewportEl = document.getElementById("videoViewport");
    prevButtonEl = document.getElementById("videoPrevButton");
    nextButtonEl = document.getElementById("videoNextButton");
    gridEl = document.getElementById("videoGrid");
    metaEl = document.getElementById("videoEventMeta");
    eventNameEl = document.getElementById("videoEventName");
    eventSubtitleEl = document.getElementById("videoEventSubtitle");
    eventSummaryEl = document.getElementById("videoEventSummary");

    if (!seasonSelect || !eventSelect || !statusEl || !gridEl) {
      return;
    }

    state.config = normalizeConfig(window.MEDIA_VIDEO_CONFIG || {});
    renderSeasonOptions();

    seasonSelect.addEventListener("change", () => {
      state.selectedSeason = Number(seasonSelect.value);
      state.selectedEventKey = "";
      resetEventSelection("Loading competitions...");
      if (!hasSupabaseConfig()) {
        setStatus("Video browser is unavailable right now.", "error");
        return;
      }
      loadSeasonEvents(state.selectedSeason);
    });

    eventSelect.addEventListener("change", () => {
      const eventKey = eventSelect.value;
      state.selectedEventKey = eventKey;
      if (!eventKey) {
        hideGrid();
        setStatus("Choose a competition to load match videos.");
        return;
      }
      loadEventMatches(eventKey);
    });

    if (viewportEl) {
      viewportEl.addEventListener("scroll", syncCarouselNav);
    }

    if (prevButtonEl) {
      prevButtonEl.addEventListener("click", () => {
        scrollCarousel(-1);
      });
    }

    if (nextButtonEl) {
      nextButtonEl.addEventListener("click", () => {
        scrollCarousel(1);
      });
    }

    if (!hasSupabaseConfig()) {
      seasonSelect.disabled = false;
      eventSelect.disabled = true;
      setStatus("Video browser is unavailable right now.", "error");
      return;
    }

    state.selectedSeason = Number(seasonSelect.value);
    resetEventSelection("Loading competitions...");
    loadSeasonEvents(state.selectedSeason);
  }

  function normalizeConfig(rawConfig) {
    const defaultSeason = Number(rawConfig.defaultSeason) || new Date().getFullYear();
    const rawSeasons = Array.isArray(rawConfig.seasons) ? rawConfig.seasons : [];
    const seasonPool = rawSeasons.concat([
      defaultSeason,
      defaultSeason - 1,
      defaultSeason - 2,
      defaultSeason - 3
    ]);
    const seasons = Array.from(new Set(seasonPool.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 1992)))
      .sort((a, b) => b - a);

    return {
      supabaseUrl: typeof rawConfig.supabaseUrl === "string" ? rawConfig.supabaseUrl.trim() : "",
      teamKey: typeof rawConfig.teamKey === "string" && rawConfig.teamKey.trim() ? rawConfig.teamKey.trim() : "frc10312",
      defaultSeason,
      seasons
    };
  }

  function renderSeasonOptions() {
    const seasons = state.config.seasons.length ? state.config.seasons : [state.config.defaultSeason];
    seasonSelect.innerHTML = seasons.map((season) => `<option value="${season}">${season}</option>`).join("");

    const preferredSeason = seasons.includes(state.config.defaultSeason) ? state.config.defaultSeason : seasons[0];
    seasonSelect.value = String(preferredSeason);
  }

  function resetEventSelection(message) {
    eventSelect.disabled = true;
    eventSelect.innerHTML = '<option value="">Loading competitions...</option>';
    metaEl.hidden = true;
    hideGrid();
    setStatus(message, "loading");
  }

  async function loadSeasonEvents(season) {
    const token = ++state.requestToken;
    resetEventSelection("Loading competitions...");

    try {
      const events = await getSeasonEvents(season);
      if (token !== state.requestToken) {
        return;
      }

      if (!events.length) {
        eventSelect.disabled = true;
        eventSelect.innerHTML = '<option value="">No competitions found</option>';
        metaEl.hidden = true;
        hideGrid();
        setStatus(`No competitions were found for Team ${getTeamDisplayNumber()} in ${season}.`);
        return;
      }

      eventSelect.disabled = false;
      eventSelect.innerHTML = events.map((event) => {
        return `<option value="${escapeHtml(event.key)}">${escapeHtml(event.name)}</option>`;
      }).join("");

      const nextEventKey = events.some((event) => event.key === state.selectedEventKey)
        ? state.selectedEventKey
        : getDefaultEventKey(events);
      state.selectedEventKey = nextEventKey;
      eventSelect.value = nextEventKey;
      await loadEventMatches(nextEventKey, token);
    } catch (error) {
      if (token !== state.requestToken) {
        return;
      }
      console.error("Unable to load competitions", error);
      eventSelect.disabled = true;
      eventSelect.innerHTML = '<option value="">Unable to load competitions</option>';
      metaEl.hidden = true;
      hideGrid();
      setStatus("Unable to load competitions right now.", "error");
    }
  }

  async function loadEventMatches(eventKey, inheritedToken) {
    const token = inheritedToken || ++state.requestToken;
    const seasonEvents = state.eventsBySeason.get(state.selectedSeason) || [];
    const event = seasonEvents.find((entry) => entry.key === eventKey);

    metaEl.hidden = !event;
    if (event) {
      renderEventMeta(event, null);
    }

    hideGrid();
    setStatus("Loading match videos...", "loading");

    try {
      const matches = await getEventMatches(eventKey);
      if (token !== state.requestToken) {
        return;
      }

      renderEventMeta(event, matches);

      const videoMatches = matches
        .map((match) => decorateMatch(match, state.config.teamKey))
        .filter((match) => Array.isArray(match.videos) && match.videos.length);

      if (!videoMatches.length) {
        hideGrid();
        setStatus("No videos available for this event.");
        return;
      }

      renderVideoCards(videoMatches);
    } catch (error) {
      if (token !== state.requestToken) {
        return;
      }
      console.error("Unable to load match videos", error);
      hideGrid();
      metaEl.hidden = !event;
      setStatus("Unable to load match videos right now.", "error");
    }
  }

  async function getSeasonEvents(season) {
    if (state.eventsBySeason.has(season)) {
      return state.eventsBySeason.get(season);
    }

    const payload = await requestMediaProxy({ mode: "events", season });
    const events = Array.isArray(payload && payload.events) ? payload.events : [];
    const sortedEvents = Array.isArray(events) ? events.slice().sort(sortEventsByDate) : [];
    state.eventsBySeason.set(season, sortedEvents);
    return sortedEvents;
  }

  async function getEventMatches(eventKey) {
    if (state.matchesByEvent.has(eventKey)) {
      return state.matchesByEvent.get(eventKey);
    }

    const payload = await requestMediaProxy({ mode: "matches", eventKey });
    const matches = Array.isArray(payload && payload.matches) ? payload.matches : [];
    const sortedMatches = Array.isArray(matches) ? matches.slice().sort(compareMatches) : [];
    state.matchesByEvent.set(eventKey, sortedMatches);
    return sortedMatches;
  }

  async function requestMediaProxy(params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value != null && value !== "") {
        query.set(key, String(value));
      }
    });

    const response = await fetch(`${state.config.supabaseUrl}/functions/v1/${MEDIA_PROXY_FUNCTION}?${query.toString()}`, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      let errorMessage = `Media request failed with ${response.status}.`;
      try {
        const errorPayload = await response.json();
        if (errorPayload && typeof errorPayload.error === "string" && errorPayload.error.trim()) {
          errorMessage = errorPayload.error.trim();
        }
      } catch (error) {
        // Ignore JSON parse failures and fall back to the HTTP status message.
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  function renderEventMeta(event, matches) {
    if (!event) {
      metaEl.hidden = true;
      return;
    }

    metaEl.hidden = false;
    eventNameEl.textContent = event.name || "Selected competition";
    eventSubtitleEl.textContent = buildEventSubtitle(event);

    if (!matches) {
      eventSummaryEl.textContent = "Loading matches...";
      return;
    }

    const videoCount = matches.filter((match) => Array.isArray(match.videos) && match.videos.length).length;
    const totalCount = matches.length;
    eventSummaryEl.textContent = `${videoCount} videos from ${totalCount} team match${totalCount === 1 ? "" : "es"}`;
  }

  function renderVideoCards(matches) {
    state.renderedMatches = Array.isArray(matches) ? matches.slice() : [];
    if (!state.renderedMatches.length) {
      hideGrid();
      return;
    }

    if (carouselEl) carouselEl.hidden = false;
    gridEl.hidden = false;
    gridEl.innerHTML = state.renderedMatches.map((match) => renderVideoCard(match)).join("");
    statusEl.hidden = true;
    requestAnimationFrame(syncCarouselNav);
  }

  function renderVideoCard(match) {
    const video = getPrimaryVideo(match);
    const subtitle = `${match.resultLine} • ${match.scoreLine}`;
    const teamSummary = `${match.allianceLabel} • ${match.teamLine}`;
    const videoMarkup = hasPlayableEmbed(match)
      ? `<div class="media-video-card__frame">
          <iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.key)}?rel=0" title="${escapeHtml(match.label)} video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
        </div>`
      : `<div class="media-video-card__fallback">
          <strong>${escapeHtml(match.label)}</strong>
          <p>Video source is available on The Blue Alliance.</p>
          <a class="btn secondary" href="${getWatchUrl(match)}" target="_blank" rel="noreferrer">Watch Source</a>
        </div>`;

    return `
      <article class="media-video-card" data-match-key="${escapeHtml(match.key)}">
        ${videoMarkup}
        <div class="media-video-card__body">
          <h3 class="media-video-card__title">${escapeHtml(match.label)}</h3>
          <p class="media-video-card__summary">${escapeHtml(subtitle)}</p>
          <p class="media-video-card__teams">${escapeHtml(teamSummary)}</p>
        </div>
      </article>
    `;
  }

  function decorateMatch(match, teamKey) {
    const alliance = getAllianceForTeam(match, teamKey);
    const opponentAlliance = alliance === "red" ? "blue" : "red";
    const ourTeams = getAllianceTeams(match, alliance);
    const opponentTeams = getAllianceTeams(match, opponentAlliance);
    const ourScore = getAllianceScore(match, alliance);
    const opponentScore = getAllianceScore(match, opponentAlliance);
    const played = Number.isFinite(ourScore) && ourScore >= 0 && Number.isFinite(opponentScore) && opponentScore >= 0;
    let scoreLine = "Score not posted yet";
    let resultLine = `${formatMatchLabel(match)} footage`;

    if (played) {
      const didWin = ourScore > opponentScore;
      const didTie = ourScore === opponentScore;
      resultLine = didTie ? "Match ended in a tie" : didWin ? "Match win" : "Match loss";
      scoreLine = `${didTie ? "Tied" : didWin ? "Won" : "Lost"} ${ourScore}-${opponentScore}`;
    } else {
      const scheduledAt = match.actual_time || match.predicted_time || match.time;
      if (scheduledAt) {
        resultLine = `${formatMatchLabel(match)} scheduled`;
        scoreLine = `Scheduled ${formatDateTime(scheduledAt)}`;
      }
    }

    return Object.assign({}, match, {
      label: formatMatchLabel(match),
      alliance,
      allianceLabel: alliance === "red" ? "Red Alliance" : alliance === "blue" ? "Blue Alliance" : "Alliance TBD",
      resultLine,
      scoreLine,
      teamLine: ourTeams.join(", ") || "Team list unavailable",
      opponentLine: opponentTeams.join(", ") || "Team list unavailable"
    });
  }

  function getPrimaryVideo(match) {
    const videos = Array.isArray(match.videos) ? match.videos : [];
    return videos.find((video) => video && video.type === "youtube" && video.key) || videos.find((video) => video && video.key) || null;
  }

  function hasPlayableEmbed(match) {
    const video = getPrimaryVideo(match);
    return Boolean(video && video.type === "youtube" && video.key);
  }

  function getWatchUrl(match) {
    const video = getPrimaryVideo(match);
    if (video && video.type === "youtube" && video.key) {
      return `https://www.youtube.com/watch?v=${encodeURIComponent(video.key)}`;
    }
    return getMatchDetailUrl(match);
  }

  function getMatchDetailUrl(match) {
    return `https://www.thebluealliance.com/match/${encodeURIComponent(match.key)}`;
  }

  function getAllianceForTeam(match, teamKey) {
    const redTeams = getAllianceTeams(match, "red", true);
    if (redTeams.includes(teamKey)) {
      return "red";
    }

    const blueTeams = getAllianceTeams(match, "blue", true);
    if (blueTeams.includes(teamKey)) {
      return "blue";
    }

    return "unknown";
  }

  function getAllianceTeams(match, alliance, rawKeys) {
    const teams = match && match.alliances && match.alliances[alliance] && Array.isArray(match.alliances[alliance].team_keys)
      ? match.alliances[alliance].team_keys
      : [];

    return rawKeys ? teams : teams.map(formatTeamKey);
  }

  function getAllianceScore(match, alliance) {
    const score = match && match.alliances && match.alliances[alliance] ? match.alliances[alliance].score : null;
    return typeof score === "number" ? score : null;
  }

  function compareMatches(a, b) {
    const levelDiff = (MATCH_LEVEL_ORDER[a.comp_level] ?? 99) - (MATCH_LEVEL_ORDER[b.comp_level] ?? 99);
    if (levelDiff !== 0) {
      return levelDiff;
    }

    const setDiff = (a.set_number || 0) - (b.set_number || 0);
    if (setDiff !== 0) {
      return setDiff;
    }

    return (a.match_number || 0) - (b.match_number || 0);
  }

  function sortEventsByDate(a, b) {
    const aDate = Date.parse(a.end_date || a.start_date || `${a.year || 0}-01-01`);
    const bDate = Date.parse(b.end_date || b.start_date || `${b.year || 0}-01-01`);

    if (aDate !== bDate) {
      return bDate - aDate;
    }

    return (a.name || "").localeCompare(b.name || "");
  }

  function getDefaultEventKey(events) {
    const rows = Array.isArray(events) ? events : [];
    return rows.length ? rows[rows.length - 1].key : "";
  }

  function formatMatchLabel(match) {
    const base = MATCH_LEVEL_LABELS[match.comp_level] || "Match";
    if (match.comp_level === "qm") {
      return `${base} ${match.match_number || "?"}`;
    }

    if (match.set_number && match.match_number) {
      return `${base} ${match.set_number}-${match.match_number}`;
    }

    return `${base} ${match.match_number || "?"}`;
  }

  function buildEventSubtitle(event) {
    const location = [event.city, event.state_prov, event.country].filter(Boolean).join(", ");
    const dateText = formatDateRange(event.start_date, event.end_date);

    if (location && dateText) {
      return `${location} • ${dateText}`;
    }

    return location || dateText || "Blue Alliance competition archive";
  }

  function formatDateRange(startDate, endDate) {
    if (!startDate) {
      return "";
    }

    const start = new Date(`${startDate}T12:00:00`);
    const end = endDate ? new Date(`${endDate}T12:00:00`) : null;
    const opts = { month: "short", day: "numeric" };

    if (!end || startDate === endDate) {
      return `${start.toLocaleDateString(undefined, opts)}, ${start.getFullYear()}`;
    }

    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    if (sameMonth) {
      return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}-${end.getDate()}, ${end.getFullYear()}`;
    }

    return `${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)}, ${end.getFullYear()}`;
  }

  function formatDateTime(unixSeconds) {
    const date = new Date(unixSeconds * 1000);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatTeamKey(teamKey) {
    return teamKey ? teamKey.replace(/^frc/i, "Team ") : "Unknown team";
  }

  function getTeamDisplayNumber() {
    return state.config.teamKey.replace(/^frc/i, "");
  }

  function hasSupabaseConfig() {
    return Boolean(state.config.supabaseUrl);
  }

  function hideGrid() {
    state.renderedMatches = [];
    if (carouselEl) carouselEl.hidden = true;
    if (gridEl) {
      gridEl.hidden = true;
      gridEl.innerHTML = "";
    }
    if (viewportEl) {
      viewportEl.scrollLeft = 0;
    }
  }

  function setStatus(message, tone) {
    statusEl.hidden = false;
    statusEl.dataset.tone = tone || "";
    statusEl.innerHTML = message;
  }

  function scrollCarousel(direction) {
    if (!viewportEl) return;
    const card = gridEl ? gridEl.querySelector(".media-video-card") : null;
    const cardWidth = card ? card.getBoundingClientRect().width : viewportEl.clientWidth;
    const gap = getGridGap();
    viewportEl.scrollBy({
      left: direction * (cardWidth + gap),
      behavior: "smooth"
    });
  }

  function syncCarouselNav() {
    if (!viewportEl) return;
    const maxScrollLeft = Math.max(viewportEl.scrollWidth - viewportEl.clientWidth, 0);
    const currentScrollLeft = viewportEl.scrollLeft;
    if (prevButtonEl) prevButtonEl.disabled = currentScrollLeft <= 8;
    if (nextButtonEl) nextButtonEl.disabled = currentScrollLeft >= maxScrollLeft - 8;
  }

  function getGridGap() {
    if (!gridEl || !window.getComputedStyle) return 0;
    const styles = window.getComputedStyle(gridEl);
    const gap = parseFloat(styles.columnGap || styles.gap || "0");
    return Number.isFinite(gap) ? gap : 0;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

})();
