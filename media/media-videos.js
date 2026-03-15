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
    selectedSeason: null,
    selectedEventKey: "",
    currentPage: 0,
    totalPages: 0,
    requestToken: 0
  };

  let seasonSelect;
  let eventSelect;
  let statusEl;
  let carouselEl;
  let carouselTrackEl;
  let carouselMetaEl;
  let prevButtonEl;
  let nextButtonEl;
  let metaEl;
  let eventNameEl;
  let eventSubtitleEl;
  let eventSummaryEl;
  let linksEl;
  let eventLinkEl;
  let teamLinkEl;

  document.addEventListener("DOMContentLoaded", initMediaVideos);

  function initMediaVideos() {
    seasonSelect = document.getElementById("videoSeasonSelect");
    eventSelect = document.getElementById("videoEventSelect");
    statusEl = document.getElementById("videoStatus");
    carouselEl = document.getElementById("videoCarousel");
    carouselTrackEl = document.getElementById("videoCarouselTrack");
    carouselMetaEl = document.getElementById("videoCarouselMeta");
    prevButtonEl = document.getElementById("videoPrevButton");
    nextButtonEl = document.getElementById("videoNextButton");
    metaEl = document.getElementById("videoEventMeta");
    eventNameEl = document.getElementById("videoEventName");
    eventSubtitleEl = document.getElementById("videoEventSubtitle");
    eventSummaryEl = document.getElementById("videoEventSummary");
    linksEl = document.getElementById("videoLinks");
    eventLinkEl = document.getElementById("videoEventLink");
    teamLinkEl = document.getElementById("videoTeamLink");

    if (!seasonSelect || !eventSelect || !statusEl || !carouselEl || !carouselTrackEl || !teamLinkEl) {
      return;
    }

    state.config = normalizeConfig(window.MEDIA_VIDEO_CONFIG || {});
    updateTeamLink();
    updateEventLinks("");
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
        hideCarousel();
        setStatus("Choose a competition to load videos.");
        return;
      }
      loadEventVideos(eventKey);
    });

    prevButtonEl?.addEventListener("click", () => {
      if (state.currentPage <= 0) return;
      state.currentPage -= 1;
      syncCarouselPosition();
    });

    nextButtonEl?.addEventListener("click", () => {
      if (state.currentPage >= state.totalPages - 1) return;
      state.currentPage += 1;
      syncCarouselPosition();
    });

    if (!hasSupabaseConfig()) {
      seasonSelect.disabled = false;
      eventSelect.disabled = true;
      linksEl.hidden = false;
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
    const seasonPool = rawSeasons.concat([defaultSeason, defaultSeason - 1, defaultSeason - 2, defaultSeason - 3]);
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
    seasonSelect.value = String(seasons.includes(state.config.defaultSeason) ? state.config.defaultSeason : seasons[0]);
  }

  function resetEventSelection(message) {
    eventSelect.disabled = true;
    eventSelect.innerHTML = '<option value="">Loading competitions...</option>';
    metaEl.hidden = true;
    linksEl.hidden = true;
    hideCarousel();
    setStatus(message, "loading");
  }

  async function loadSeasonEvents(season) {
    const token = ++state.requestToken;
    resetEventSelection("Loading competitions...");

    try {
      const events = await getSeasonEvents(season);
      if (token !== state.requestToken) return;

      if (!events.length) {
        eventSelect.disabled = true;
        eventSelect.innerHTML = '<option value="">No competitions found</option>';
        metaEl.hidden = true;
        linksEl.hidden = false;
        updateEventLinks("");
        hideCarousel();
        setStatus(`No competitions were found for Team ${getTeamDisplayNumber()} in ${season}.`);
        return;
      }

      eventSelect.disabled = false;
      eventSelect.innerHTML = events.map((event) => `<option value="${escapeHtml(event.key)}">${escapeHtml(event.name)}</option>`).join("");
      const nextEventKey = events.some((event) => event.key === state.selectedEventKey) ? state.selectedEventKey : events[0].key;
      state.selectedEventKey = nextEventKey;
      eventSelect.value = nextEventKey;
      await loadEventVideos(nextEventKey, token);
    } catch (error) {
      if (token !== state.requestToken) return;
      console.error("Unable to load competitions", error);
      eventSelect.disabled = true;
      eventSelect.innerHTML = '<option value="">Unable to load competitions</option>';
      metaEl.hidden = true;
      linksEl.hidden = false;
      hideCarousel();
      updateEventLinks("");
      setStatus("Unable to load competitions right now.", "error");
    }
  }

  async function loadEventVideos(eventKey, inheritedToken) {
    const token = inheritedToken || ++state.requestToken;
    const seasonEvents = state.eventsBySeason.get(state.selectedSeason) || [];
    const event = seasonEvents.find((entry) => entry.key === eventKey) || null;

    updateEventLinks(eventKey);
    metaEl.hidden = !event;
    if (event) {
      renderEventMeta(event, null);
    }

    hideCarousel();
    setStatus("Loading videos...", "loading");

    try {
      const matches = await getEventMatches(eventKey);
      if (token !== state.requestToken) return;

      const videoMatches = matches
        .filter((match) => matchHasVideo(match))
        .map((match) => buildVideoCardData(match));

      renderEventMeta(event, {
        totalCount: videoMatches.length
      });
      linksEl.hidden = false;

      if (!videoMatches.length) {
        hideCarousel();
        setStatus("No published match videos are available for this competition yet.");
        return;
      }

      renderVideoCarousel(videoMatches);
      setStatus(`${videoMatches.length} video${videoMatches.length === 1 ? "" : "s"} loaded from The Blue Alliance.`);
    } catch (error) {
      if (token !== state.requestToken) return;
      console.error("Unable to load videos", error);
      hideCarousel();
      metaEl.hidden = !event;
      linksEl.hidden = false;
      setStatus("Unable to load videos right now.", "error");
    }
  }

  async function getSeasonEvents(season) {
    if (state.eventsBySeason.has(season)) {
      return state.eventsBySeason.get(season);
    }

    const payload = await requestMediaProxy({ mode: "events", season });
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const sortedEvents = events.slice().sort(sortEventsByDate);
    state.eventsBySeason.set(season, sortedEvents);
    return sortedEvents;
  }

  async function getEventMatches(eventKey) {
    if (state.matchesByEvent.has(eventKey)) {
      return state.matchesByEvent.get(eventKey);
    }

    const payload = await requestMediaProxy({ mode: "matches", eventKey });
    const matches = Array.isArray(payload?.matches) ? payload.matches : [];
    const sortedMatches = matches.slice().sort(compareMatches);
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
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Media request failed with ${response.status}.`);
    }

    return response.json();
  }

  function renderEventMeta(event, summary) {
    if (!event) {
      metaEl.hidden = true;
      return;
    }

    metaEl.hidden = false;
    eventNameEl.textContent = event.name || "Selected competition";
    eventSubtitleEl.textContent = buildEventSubtitle(event);
    eventSummaryEl.textContent = summary ? `${summary.totalCount} published video${summary.totalCount === 1 ? "" : "s"}` : "Loading videos...";
  }

  function renderVideoCarousel(videos) {
    const pages = chunkArray(videos, 4);
    state.totalPages = pages.length;
    state.currentPage = 0;
    carouselTrackEl.innerHTML = pages
      .map((page) => {
        return `
          <div class="media-video-slide">
            ${page.map((video) => renderVideoCard(video)).join("")}
          </div>
        `;
      })
      .join("");
    carouselEl.hidden = false;
    syncCarouselPosition();
  }

  function renderVideoCard(video) {
    return `
      <article class="media-video-card">
        <div class="media-video-card__player">
          <iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.youtubeKey)}" title="${escapeHtml(video.title)} video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
        </div>
        <h3 class="media-video-card__title">${escapeHtml(video.title)}</h3>
        <p class="media-video-card__meta">${escapeHtml(video.meta)}</p>
        <div class="media-video-card__actions">
          <a class="media-video-link" href="${video.watchUrl}" target="_blank" rel="noreferrer">Watch</a>
          <a class="media-video-link" href="${video.detailsUrl}" target="_blank" rel="noreferrer">Match Details</a>
        </div>
      </article>
    `;
  }

  function syncCarouselPosition() {
    carouselTrackEl.style.transform = `translateX(-${state.currentPage * 100}%)`;
    if (carouselMetaEl) {
      carouselMetaEl.textContent = state.totalPages > 1
        ? `Showing ${state.currentPage + 1} of ${state.totalPages}`
        : `${state.totalPages ? "Showing all videos" : ""}`;
    }
    if (prevButtonEl) {
      prevButtonEl.disabled = state.currentPage <= 0;
    }
    if (nextButtonEl) {
      nextButtonEl.disabled = state.currentPage >= state.totalPages - 1;
    }
  }

  function buildVideoCardData(match) {
    const video = getPrimaryVideo(match);
    return {
      title: formatMatchLabel(match),
      meta: buildVideoMeta(match),
      youtubeKey: video.key,
      watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.key)}`,
      detailsUrl: `https://www.thebluealliance.com/match/${encodeURIComponent(match.key)}`
    };
  }

  function buildVideoMeta(match) {
    const redTeams = formatTeamList(match?.alliances?.red?.team_keys || []);
    const blueTeams = formatTeamList(match?.alliances?.blue?.team_keys || []);
    return `${redTeams} vs ${blueTeams}`;
  }

  function formatTeamList(teamKeys) {
    const teams = Array.isArray(teamKeys) ? teamKeys : [];
    return teams.map((teamKey) => String(teamKey).replace(/^frc/i, "")).join(", ");
  }

  function matchHasVideo(match) {
    return Boolean(getPrimaryVideo(match));
  }

  function getPrimaryVideo(match) {
    const videos = Array.isArray(match?.videos) ? match.videos : [];
    return videos.find((video) => video && video.type === "youtube" && video.key) || null;
  }

  function compareMatches(a, b) {
    const levelDiff = (MATCH_LEVEL_ORDER[a?.comp_level] ?? 99) - (MATCH_LEVEL_ORDER[b?.comp_level] ?? 99);
    if (levelDiff !== 0) return levelDiff;
    const setDiff = compareNullableNumbers(a?.set_number, b?.set_number);
    if (setDiff !== 0) return setDiff;
    return compareNullableNumbers(a?.match_number, b?.match_number);
  }

  function compareNullableNumbers(left, right) {
    const leftValue = Number(left);
    const rightValue = Number(right);
    const leftValid = Number.isFinite(leftValue);
    const rightValid = Number.isFinite(rightValue);
    if (!leftValid && !rightValid) return 0;
    if (!leftValid) return 1;
    if (!rightValid) return -1;
    return leftValue - rightValue;
  }

  function sortEventsByDate(a, b) {
    const aDate = Date.parse(a?.end_date || a?.start_date || `${a?.year || 0}-01-01`);
    const bDate = Date.parse(b?.end_date || b?.start_date || `${b?.year || 0}-01-01`);
    if (aDate !== bDate) return bDate - aDate;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  }

  function formatMatchLabel(match) {
    const base = MATCH_LEVEL_LABELS[match?.comp_level] || "Match";
    if (match?.comp_level === "qm") {
      return `${base} ${match?.match_number || "?"}`;
    }
    if (match?.set_number && match?.match_number) {
      return `${base} ${match.set_number}-${match.match_number}`;
    }
    return `${base} ${match?.match_number || "?"}`;
  }

  function buildEventSubtitle(event) {
    const location = [event?.city, event?.state_prov, event?.country].filter(Boolean).join(", ");
    const dateText = formatDateRange(event?.start_date, event?.end_date);
    if (location && dateText) {
      return `${location} • ${dateText}`;
    }
    return location || dateText || "Blue Alliance competition archive";
  }

  function formatDateRange(startDate, endDate) {
    if (!startDate) return "";
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

  function chunkArray(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  function getTeamDisplayNumber() {
    return state.config.teamKey.replace(/^frc/i, "");
  }

  function hasSupabaseConfig() {
    return Boolean(state.config.supabaseUrl);
  }

  function updateEventLinks(eventKey) {
    if (!eventLinkEl) return;
    if (eventKey) {
      eventLinkEl.href = `https://www.thebluealliance.com/event/${encodeURIComponent(eventKey)}`;
      eventLinkEl.textContent = "Open Competition on The Blue Alliance";
      return;
    }
    eventLinkEl.href = `https://www.thebluealliance.com/team/${encodeURIComponent(getTeamDisplayNumber())}`;
    eventLinkEl.textContent = "Browse Team 10312 on The Blue Alliance";
  }

  function updateTeamLink() {
    if (teamLinkEl) {
      teamLinkEl.href = `https://www.thebluealliance.com/team/${encodeURIComponent(getTeamDisplayNumber())}`;
    }
  }

  function hideCarousel() {
    carouselEl.hidden = true;
    carouselTrackEl.innerHTML = "";
    state.currentPage = 0;
    state.totalPages = 0;
    syncCarouselPosition();
  }

  function setStatus(message, tone) {
    statusEl.hidden = false;
    statusEl.dataset.tone = tone || "";
    statusEl.textContent = message;
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
