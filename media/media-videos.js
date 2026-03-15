(function () {
  const MEDIA_PROXY_FUNCTION = "tba-media";
  const STATBOTICS_API_BASE = "https://api.statbotics.io/v3";
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
    tbaMatchesByEvent: new Map(),
    statboticsMatchesByEvent: new Map(),
    statboticsEventDataByKey: new Map(),
    selectedSeason: null,
    selectedEventKey: "",
    requestToken: 0
  };

  let seasonSelect;
  let eventSelect;
  let statusEl;
  let tableWrapEl;
  let tableBodyEl;
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
    tableWrapEl = document.getElementById("videoTableWrap");
    tableBodyEl = document.getElementById("videoTableBody");
    metaEl = document.getElementById("videoEventMeta");
    eventNameEl = document.getElementById("videoEventName");
    eventSubtitleEl = document.getElementById("videoEventSubtitle");
    eventSummaryEl = document.getElementById("videoEventSummary");
    linksEl = document.getElementById("videoLinks");
    eventLinkEl = document.getElementById("videoEventLink");
    teamLinkEl = document.getElementById("videoTeamLink");

    if (!seasonSelect || !eventSelect || !statusEl || !tableWrapEl || !tableBodyEl || !teamLinkEl) {
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
        hideTable();
        setStatus("Choose a competition to load videos and predictions.");
        return;
      }
      loadEventMatches(eventKey);
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
    const preferredSeason = seasons.includes(state.config.defaultSeason) ? state.config.defaultSeason : seasons[0];
    seasonSelect.value = String(preferredSeason);
  }

  function resetEventSelection(message) {
    eventSelect.disabled = true;
    eventSelect.innerHTML = '<option value="">Loading competitions...</option>';
    metaEl.hidden = true;
    linksEl.hidden = true;
    hideTable();
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
        hideTable();
        setStatus(`No competitions were found for Team ${getTeamDisplayNumber()} in ${season}.`);
        return;
      }

      eventSelect.disabled = false;
      eventSelect.innerHTML = events.map((event) => `<option value="${escapeHtml(event.key)}">${escapeHtml(event.name)}</option>`).join("");
      const nextEventKey = events.some((event) => event.key === state.selectedEventKey) ? state.selectedEventKey : events[0].key;
      state.selectedEventKey = nextEventKey;
      eventSelect.value = nextEventKey;
      await loadEventMatches(nextEventKey, token);
    } catch (error) {
      if (token !== state.requestToken) return;
      console.error("Unable to load competitions", error);
      eventSelect.disabled = true;
      eventSelect.innerHTML = '<option value="">Unable to load competitions</option>';
      metaEl.hidden = true;
      linksEl.hidden = false;
      hideTable();
      updateEventLinks("");
      setStatus("Unable to load competitions right now.", "error");
    }
  }

  async function loadEventMatches(eventKey, inheritedToken) {
    const token = inheritedToken || ++state.requestToken;
    const seasonEvents = state.eventsBySeason.get(state.selectedSeason) || [];
    const event = seasonEvents.find((entry) => entry.key === eventKey) || null;

    updateEventLinks(eventKey);
    metaEl.hidden = !event;
    if (event) {
      renderEventMeta(event, null);
    }

    hideTable();
    setStatus("Loading videos and predictions...", "loading");

    try {
      const [tbaMatches, statboticsMatches, statboticsEventData] = await Promise.all([
        getTbaEventMatches(eventKey),
        getStatboticsMatches(eventKey).catch((error) => {
          console.warn("Unable to load Statbotics matches for media page", error);
          return [];
        }),
        getStatboticsEventData(eventKey).catch((error) => {
          console.warn("Unable to load Statbotics event metrics for media page", error);
          return null;
        })
      ]);

      if (token !== state.requestToken) return;

      const rows = buildMediaRows(tbaMatches, statboticsMatches, state.config.teamKey);
      const summary = {
        totalCount: rows.length,
        videoCount: rows.filter((row) => Boolean(row.videoUrl)).length,
        accuracy: Number(statboticsEventData?.metrics?.win_prob?.acc || 0)
      };

      renderEventMeta(event, summary);
      linksEl.hidden = false;

      if (!rows.length) {
        hideTable();
        setStatus("No team matches are available for this competition yet.");
        return;
      }

      renderMatchTable(rows);
      setStatus(
        summary.videoCount
          ? `${summary.videoCount} team match video${summary.videoCount === 1 ? "" : "s"} ready to watch.`
          : "Predictions loaded. Match videos have not been posted yet."
      );
    } catch (error) {
      if (token !== state.requestToken) return;
      console.error("Unable to load match videos", error);
      hideTable();
      metaEl.hidden = !event;
      linksEl.hidden = false;
      setStatus("Unable to load match videos right now.", "error");
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

  async function getTbaEventMatches(eventKey) {
    if (state.tbaMatchesByEvent.has(eventKey)) {
      return state.tbaMatchesByEvent.get(eventKey);
    }

    const payload = await requestMediaProxy({ mode: "matches", eventKey });
    const matches = Array.isArray(payload?.matches) ? payload.matches : [];
    const sortedMatches = matches.slice().sort(compareMatches);
    state.tbaMatchesByEvent.set(eventKey, sortedMatches);
    return sortedMatches;
  }

  async function getStatboticsMatches(eventKey) {
    if (state.statboticsMatchesByEvent.has(eventKey)) {
      return state.statboticsMatchesByEvent.get(eventKey);
    }

    const matches = await fetchStatbotics(`matches?event=${encodeURIComponent(eventKey)}&limit=200`);
    const sortedMatches = (Array.isArray(matches) ? matches.slice() : []).sort(compareMatches);
    state.statboticsMatchesByEvent.set(eventKey, sortedMatches);
    return sortedMatches;
  }

  async function getStatboticsEventData(eventKey) {
    if (state.statboticsEventDataByKey.has(eventKey)) {
      return state.statboticsEventDataByKey.get(eventKey);
    }

    const eventData = await fetchStatbotics(`event/${encodeURIComponent(eventKey)}`);
    const normalized = eventData && !Array.isArray(eventData) ? eventData : null;
    state.statboticsEventDataByKey.set(eventKey, normalized);
    return normalized;
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
      let errorMessage = `Media request failed with ${response.status}.`;
      try {
        const errorPayload = await response.json();
        if (errorPayload && typeof errorPayload.error === "string" && errorPayload.error.trim()) {
          errorMessage = errorPayload.error.trim();
        }
      } catch (error) {
        // Ignore JSON parse failures and fall back to the HTTP status code.
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async function fetchStatbotics(path) {
    const response = await fetch(`${STATBOTICS_API_BASE}/${path}`, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Statbotics request failed (${response.status}).`);
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

    if (!summary) {
      eventSummaryEl.textContent = "Loading matches...";
      return;
    }

    eventSummaryEl.textContent = [
      `${summary.videoCount} video${summary.videoCount === 1 ? "" : "s"} from ${summary.totalCount} team match${summary.totalCount === 1 ? "" : "es"}`,
      summary.accuracy ? `model accuracy ${formatPercentage(summary.accuracy, 1)}` : ""
    ]
      .filter(Boolean)
      .join(" • ");
  }

  function renderMatchTable(rows) {
    tableWrapEl.hidden = false;
    tableBodyEl.innerHTML = rows
      .map((row) => {
        const actions = row.videoUrl
          ? `
            <div class="media-video-actions">
              <a class="btn secondary" href="${row.videoUrl}" target="_blank" rel="noreferrer">Watch</a>
              <a class="btn secondary" href="${row.detailsUrl}" target="_blank" rel="noreferrer">Details</a>
            </div>
          `
          : `
            <div class="media-video-actions">
              <span class="media-video-pending">Awaiting upload</span>
              <a class="btn secondary" href="${row.detailsUrl}" target="_blank" rel="noreferrer">Details</a>
            </div>
          `;

        return `
          <tr>
            <td>
              <div class="media-video-match">
                <strong>${escapeHtml(row.match)}</strong>
                <span class="media-video-cell-subtitle">${escapeHtml(row.matchup)}</span>
              </div>
            </td>
            <td>
              <span class="media-video-chip" data-alliance="${escapeHtml(row.allianceTone)}">${escapeHtml(row.alliance)}</span>
            </td>
            <td>${escapeHtml(row.winProb)}</td>
            <td>${escapeHtml(row.predicted)}</td>
            <td class="media-video-actual" data-tone="${escapeHtml(row.actualTone)}">${escapeHtml(row.actual)}</td>
            <td>${actions}</td>
          </tr>
        `;
      })
      .join("");
  }

  function buildMediaRows(tbaMatches, statboticsMatches, teamKey) {
    const statboticsByKey = new Map(
      (Array.isArray(statboticsMatches) ? statboticsMatches : []).map((match) => [normalizeMatchKey(match?.key), match])
    );

    return (Array.isArray(tbaMatches) ? tbaMatches : []).map((tbaMatch) => {
      const statboticsMatch = statboticsByKey.get(normalizeMatchKey(tbaMatch?.key)) || null;
      return buildMediaRow(tbaMatch, statboticsMatch, teamKey);
    });
  }

  function buildMediaRow(tbaMatch, statboticsMatch, teamKey) {
    const teamNumber = getTeamDisplayNumber();
    const alliance = getMatchAlliance(tbaMatch, statboticsMatch, teamKey, teamNumber);
    const opponentAlliance = alliance === "red" ? "blue" : alliance === "blue" ? "red" : "";
    const ourTeams = getMatchTeams(tbaMatch, statboticsMatch, alliance);
    const opponentTeams = getMatchTeams(tbaMatch, statboticsMatch, opponentAlliance);
    const actual = getActualLine(tbaMatch, statboticsMatch, alliance);
    const video = getPrimaryVideo(tbaMatch);

    return {
      match: statboticsMatch?.match_name || formatMatchLabel(tbaMatch),
      matchup: `${ourTeams.join(", ") || "Teams unavailable"} vs ${opponentTeams.join(", ") || "Teams unavailable"}`,
      alliance: alliance === "red" ? "Red" : alliance === "blue" ? "Blue" : "Unknown",
      allianceTone: alliance || "unknown",
      winProb: formatTrackedWinProbability(statboticsMatch, alliance),
      predicted: formatTrackedPredictedScore(statboticsMatch, alliance),
      actual: actual.label,
      actualTone: actual.tone,
      videoUrl: getVideoWatchUrl(tbaMatch, video),
      detailsUrl: `https://www.thebluealliance.com/match/${encodeURIComponent(tbaMatch?.key || "")}`
    };
  }

  function getMatchAlliance(tbaMatch, statboticsMatch, teamKey, teamNumber) {
    const statboticsAlliance = getStatboticsAlliance(statboticsMatch, teamNumber);
    if (statboticsAlliance) {
      return statboticsAlliance;
    }

    const redTeams = getTbaAllianceTeams(tbaMatch, "red", true);
    if (redTeams.includes(teamKey)) return "red";
    const blueTeams = getTbaAllianceTeams(tbaMatch, "blue", true);
    if (blueTeams.includes(teamKey)) return "blue";
    return "";
  }

  function getStatboticsAlliance(match, teamNumber) {
    const numericTeam = Number(teamNumber || 0);
    const redTeams = getStatboticsAllianceTeams(match, "red", true);
    if (redTeams.includes(numericTeam)) return "red";
    const blueTeams = getStatboticsAllianceTeams(match, "blue", true);
    if (blueTeams.includes(numericTeam)) return "blue";
    return "";
  }

  function getMatchTeams(tbaMatch, statboticsMatch, alliance) {
    const statboticsTeams = getStatboticsAllianceTeams(statboticsMatch, alliance);
    if (statboticsTeams.length) {
      return statboticsTeams;
    }
    return getTbaAllianceTeams(tbaMatch, alliance);
  }

  function getStatboticsAllianceTeams(match, alliance, rawNumbers) {
    const teams = match?.alliances?.[alliance]?.team_keys;
    const normalized = Array.isArray(teams) ? teams.map((team) => Number(team)).filter((team) => Number.isFinite(team)) : [];
    return rawNumbers ? normalized : normalized.map((team) => `Team ${team}`);
  }

  function getTbaAllianceTeams(match, alliance, rawKeys) {
    const teams = match?.alliances?.[alliance]?.team_keys;
    const normalized = Array.isArray(teams) ? teams.slice() : [];
    return rawKeys ? normalized : normalized.map((teamKey) => formatTeamKey(teamKey));
  }

  function getActualLine(tbaMatch, statboticsMatch, alliance) {
    if (statboticsMatch) {
      const statboticsActual = formatTrackedActual(statboticsMatch, alliance);
      if (statboticsActual.label !== "Scheduled") {
        return statboticsActual;
      }
    }

    const ownScore = getTbaAllianceScore(tbaMatch, alliance);
    const opponentScore = getTbaAllianceScore(tbaMatch, alliance === "blue" ? "red" : "blue");
    if (!Number.isFinite(ownScore) || !Number.isFinite(opponentScore) || ownScore < 0 || opponentScore < 0) {
      return { label: "Scheduled", tone: "" };
    }

    if (ownScore === opponentScore) {
      return { label: `Tied ${ownScore}-${opponentScore}`, tone: "" };
    }

    return {
      label: `${ownScore > opponentScore ? "Won" : "Lost"} ${ownScore}-${opponentScore}`,
      tone: ownScore > opponentScore ? "positive" : "negative"
    };
  }

  function formatTrackedWinProbability(match, alliance) {
    const redWinProbability = Number(match?.pred?.red_win_prob);
    if (!Number.isFinite(redWinProbability)) {
      return "Prediction unavailable";
    }
    const probability = alliance === "blue" ? 1 - redWinProbability : redWinProbability;
    return formatPercentage(probability, 1);
  }

  function formatTrackedPredictedScore(match, alliance) {
    const ownScore = alliance === "blue" ? Number(match?.pred?.blue_score) : Number(match?.pred?.red_score);
    const opponentScore = alliance === "blue" ? Number(match?.pred?.red_score) : Number(match?.pred?.blue_score);
    if (!Number.isFinite(ownScore) || !Number.isFinite(opponentScore)) {
      return "Prediction unavailable";
    }
    return `${Math.round(ownScore)} - ${Math.round(opponentScore)}`;
  }

  function formatTrackedActual(match, alliance) {
    if (String(match?.status || "").toLowerCase() !== "completed" || !match?.result) {
      return { label: "Scheduled", tone: "" };
    }

    const ownScore = alliance === "blue" ? Number(match?.result?.blue_score) : Number(match?.result?.red_score);
    const opponentScore = alliance === "blue" ? Number(match?.result?.red_score) : Number(match?.result?.blue_score);
    if (!Number.isFinite(ownScore) || !Number.isFinite(opponentScore)) {
      return { label: "Completed", tone: "" };
    }
    if (ownScore === opponentScore) {
      return { label: `Tied ${ownScore}-${opponentScore}`, tone: "" };
    }

    return {
      label: `${ownScore > opponentScore ? "Won" : "Lost"} ${ownScore}-${opponentScore}`,
      tone: ownScore > opponentScore ? "positive" : "negative"
    };
  }

  function getPrimaryVideo(match) {
    const videos = Array.isArray(match?.videos) ? match.videos : [];
    return videos.find((video) => video && video.type === "youtube" && video.key) || videos.find((video) => video && video.key) || null;
  }

  function getVideoWatchUrl(match, video) {
    if (!video) {
      return "";
    }
    if (video.type === "youtube") {
      return `https://www.youtube.com/watch?v=${encodeURIComponent(video.key)}`;
    }
    return `https://www.thebluealliance.com/match/${encodeURIComponent(match?.key || "")}`;
  }

  function getTbaAllianceScore(match, alliance) {
    const score = match?.alliances?.[alliance]?.score;
    return typeof score === "number" ? score : null;
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

  function formatPercentage(value, digits) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "Prediction unavailable";
    }
    return `${(numeric * 100).toFixed(typeof digits === "number" ? digits : 0)}%`;
  }

  function normalizeMatchKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function formatTeamKey(teamKey) {
    return String(teamKey || "").replace(/^frc/i, "Team ");
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

  function hideTable() {
    tableWrapEl.hidden = true;
    tableBodyEl.innerHTML = "";
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
