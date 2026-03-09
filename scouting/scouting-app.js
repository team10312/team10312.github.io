import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const LINKS = {
  home: "/",
  about: "/about/",
  team: "/team/",
  robots: "/robots/",
  scouting: "/scouting/",
  sponsors: "/sponsors/",
  media: "/media/",
  contact: "/contact/"
};

const PAGE = "scouting";

const STORAGE_KEYS = {
  activeEventId: "bf-scouting-active-event-v1",
  activeTab: "bf-scouting-active-tab-v1",
  outbox: "bf-scouting-outbox-v1",
  lastSyncAt: "bf-scouting-last-sync-v1",
  matchDraft: "bf-scouting-match-draft-v1",
  matchDraftSavedAt: "bf-scouting-match-draft-saved-v1",
  pitDraft: "bf-scouting-pit-draft-v1",
  pitDraftSavedAt: "bf-scouting-pit-draft-saved-v1"
};

const MATCH_DEFAULTS = Object.freeze({
  scout_name: "",
  team_number: "",
  match_number: "",
  match_type: "Qualification",
  alliance_color: "Blue",
  station: "1",
  auto_fuel: 0,
  auto_tower_result: "None",
  transition_fuel: 0,
  shift_1_fuel: 0,
  shift_2_fuel: 0,
  shift_3_fuel: 0,
  shift_4_fuel: 0,
  endgame_fuel: 0,
  endgame_tower_result: "None",
  defense_rating: 3,
  penalty_count: 0,
  breakdown: false,
  no_show: false,
  notes: ""
});

const PIT_DEFAULTS = Object.freeze({
  scout_name: "",
  team_number: "",
  drivetrain: "Swerve",
  fuel_scoring_capability: "High volume",
  tower_capability: "Consistent",
  auto_summary: "",
  defense_capability: "Balanced",
  preferred_strategy: "",
  reliability_notes: "",
  notes: ""
});

const state = {
  config: null,
  client: null,
  session: null,
  events: [],
  activeEventId: loadStoredValue(STORAGE_KEYS.activeEventId, ""),
  matchEntries: [],
  pitEntries: [],
  teamSummary: [],
  outbox: loadStoredJson(STORAGE_KEYS.outbox, []),
  activeTab: loadStoredValue(STORAGE_KEYS.activeTab, "overview"),
  lastSyncAt: loadStoredValue(STORAGE_KEYS.lastSyncAt, ""),
  connectionOnline: navigator.onLine,
  isRefreshing: false,
  pendingAuthMessage: "",
  pendingAuthTone: ""
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  void init();
});

async function init() {
  cacheDom();
  state.config = normalizeConfig(window.SCOUTING_CONFIG || {});

  applyYear();
  wireLinks();
  setActive();
  initTheme();
  initLogoSwap();
  initPointerRipples();
  hydrateDraftForms();
  bindEvents();
  renderAll();

  if (!configReady()) {
    renderConfigState();
    return;
  }

  renderConfigState();

  state.client = createClient(state.config.supabaseUrl, state.config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  readOAuthErrorFromUrl();

  const { data, error } = await state.client.auth.getSession();
  if (error) {
    setAuthMessage(normalizeError(error, "Unable to restore the current session."), "danger");
  }

  state.client.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    void syncSession(session);
  });

  await syncSession(data?.session || null);
}

function cacheDom() {
  elements.year = document.getElementById("year");
  elements.themeToggle = document.getElementById("themeToggle");
  elements.lockView = document.getElementById("lockView");
  elements.appView = document.getElementById("appView");
  elements.unlockForm = document.getElementById("unlockForm");
  elements.googleSignInButton = document.getElementById("googleSignInButton");
  elements.authMessage = document.getElementById("authMessage");
  elements.eventSelect = document.getElementById("eventSelect");
  elements.refreshButton = document.getElementById("refreshButton");
  elements.retryOutboxButton = document.getElementById("retryOutboxButton");
  elements.retryOutboxInline = document.getElementById("retryOutboxInline");
  elements.signOutButton = document.getElementById("signOutButton");
  elements.authPill = document.getElementById("authPill");
  elements.connectionPill = document.getElementById("connectionPill");
  elements.syncPill = document.getElementById("syncPill");
  elements.queuePill = document.getElementById("queuePill");
  elements.currentEventName = document.getElementById("currentEventName");
  elements.currentEventMeta = document.getElementById("currentEventMeta");
  elements.appMessage = document.getElementById("appMessage");
  elements.tabButtons = Array.from(document.querySelectorAll(".tab-button"));
  elements.tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
  elements.statTeams = document.getElementById("statTeams");
  elements.statMatches = document.getElementById("statMatches");
  elements.statPits = document.getElementById("statPits");
  elements.statQueued = document.getElementById("statQueued");
  elements.outboxEmpty = document.getElementById("outboxEmpty");
  elements.outboxList = document.getElementById("outboxList");
  elements.teamSearch = document.getElementById("teamSearch");
  elements.summaryCount = document.getElementById("summaryCount");
  elements.summaryTableBody = document.getElementById("summaryTableBody");
  elements.matchForm = document.getElementById("matchForm");
  elements.matchSaveDraftButton = document.getElementById("matchSaveDraftButton");
  elements.matchSubmitButton = document.getElementById("matchSubmitButton");
  elements.matchDraftStamp = document.getElementById("matchDraftStamp");
  elements.matchFormMessage = document.getElementById("matchFormMessage");
  elements.pitForm = document.getElementById("pitForm");
  elements.pitSaveDraftButton = document.getElementById("pitSaveDraftButton");
  elements.pitSubmitButton = document.getElementById("pitSubmitButton");
  elements.pitDraftStamp = document.getElementById("pitDraftStamp");
  elements.pitFormMessage = document.getElementById("pitFormMessage");
  elements.exportMatchButton = document.getElementById("exportMatchButton");
  elements.exportPitButton = document.getElementById("exportPitButton");
  elements.exportSummaryButton = document.getElementById("exportSummaryButton");
}

function bindEvents() {
  if (elements.themeToggle) {
    elements.themeToggle.addEventListener("click", toggleTheme);
  }

  if (elements.unlockForm) {
    elements.unlockForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void handleGoogleSignIn();
    });
  }

  if (elements.refreshButton) {
    elements.refreshButton.addEventListener("click", () => {
      void refreshData({ message: "Scouting data refreshed." });
    });
  }

  if (elements.retryOutboxButton) {
    elements.retryOutboxButton.addEventListener("click", () => {
      void flushOutbox();
    });
  }

  if (elements.retryOutboxInline) {
    elements.retryOutboxInline.addEventListener("click", () => {
      void flushOutbox();
    });
  }

  if (elements.signOutButton) {
    elements.signOutButton.addEventListener("click", () => {
      void handleSignOut();
    });
  }

  if (elements.eventSelect) {
    elements.eventSelect.addEventListener("change", () => {
      void handleEventChange(elements.eventSelect.value);
    });
  }

  if (elements.teamSearch) {
    elements.teamSearch.addEventListener("input", renderSummaryTable);
  }

  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showTab(button.dataset.tab || "overview");
    });
  });

  bindCounterButtons();
  bindDraftPersistence(elements.matchForm, "match");
  bindDraftPersistence(elements.pitForm, "pit");

  if (elements.matchSaveDraftButton) {
    elements.matchSaveDraftButton.addEventListener("click", () => {
      persistDraft("match", { manual: true });
    });
  }

  if (elements.pitSaveDraftButton) {
    elements.pitSaveDraftButton.addEventListener("click", () => {
      persistDraft("pit", { manual: true });
    });
  }

  if (elements.matchForm) {
    elements.matchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitMatchForm();
    });
  }

  if (elements.pitForm) {
    elements.pitForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitPitForm();
    });
  }

  if (elements.exportMatchButton) {
    elements.exportMatchButton.addEventListener("click", () => {
      exportMatchCsv();
    });
  }

  if (elements.exportPitButton) {
    elements.exportPitButton.addEventListener("click", () => {
      exportPitCsv();
    });
  }

  if (elements.exportSummaryButton) {
    elements.exportSummaryButton.addEventListener("click", () => {
      exportSummaryCsv();
    });
  }

  window.addEventListener("online", () => {
    state.connectionOnline = true;
    renderStatusPills();
  });

  window.addEventListener("offline", () => {
    state.connectionOnline = false;
    renderStatusPills();
  });
}

function bindCounterButtons() {
  document.querySelectorAll("[data-counter-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-counter-target");
      const step = Number(button.getAttribute("data-counter-step") || 0);
      const input = targetId ? document.getElementById(targetId) : null;
      if (!input) return;
      const current = Math.max(0, Number(input.value || 0));
      const next = Math.max(0, current + step);
      input.value = String(next);
      const form = input.form;
      if (form === elements.matchForm) persistDraft("match");
      if (form === elements.pitForm) persistDraft("pit");
    });
  });
}

function bindDraftPersistence(form, kind) {
  if (!form) return;

  const persist = () => {
    persistDraft(kind);
  };

  form.addEventListener("input", persist);
  form.addEventListener("change", persist);
}

function applyYear() {
  if (elements.year) {
    elements.year.textContent = String(new Date().getFullYear());
  }
}

function wireLinks() {
  document.querySelectorAll("[data-link]").forEach((link) => {
    const key = link.getAttribute("data-link");
    if (!key || !LINKS[key]) return;
    const href = link.getAttribute("href") || "";
    const hash = href.includes("#") ? href.slice(href.indexOf("#")) : "";
    link.setAttribute("href", LINKS[key] + hash);
  });
}

function setActive() {
  document.querySelectorAll(`.nav-links a[data-link="${PAGE}"]`).forEach((link) => {
    link.classList.add("active");
  });
}

function initTheme() {
  const html = document.documentElement;
  const stored = loadStoredValue("bf-theme", "");
  if (stored === "dark") html.setAttribute("data-theme", "dark");
  else if (stored === "light") html.setAttribute("data-theme", "light");
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    html.setAttribute("data-theme", "dark");
  }
  setThemeLabel();
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  saveStoredValue("bf-theme", isDark ? "light" : "dark");
  setThemeLabel();
}

function setThemeLabel() {
  if (!elements.themeToggle) return;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  elements.themeToggle.textContent = isDark ? "Light" : "Dark";
}

function initLogoSwap() {
  function forEachLogo(fn) {
    const images = document.querySelectorAll('img[src$="blacklogo.png"], img[src$="whitelogo.png"]');
    images.forEach(fn);
  }

  function isDarkMode() {
    const html = document.documentElement;
    const theme = (html.getAttribute("data-theme") || "").toLowerCase();
    if (theme === "dark") return true;
    if (theme === "light") return false;
    if (html.classList.contains("dark") || html.classList.contains("theme-dark")) return true;
    if (html.classList.contains("light") || html.classList.contains("theme-light")) return false;
    if (window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  }

  function setLogoByTheme() {
    const dark = isDarkMode();
    forEachLogo((image) => {
      const current = image.getAttribute("src") || "";
      const desired = current.replace(/(white|black)logo\.png$/i, dark ? "whitelogo.png" : "blacklogo.png");
      if (desired !== current) image.setAttribute("src", desired);
    });
  }

  setLogoByTheme();

  try {
    const observer = new MutationObserver(setLogoByTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"]
    });

    if (window.matchMedia) {
      const query = window.matchMedia("(prefers-color-scheme: dark)");
      if (query.addEventListener) query.addEventListener("change", setLogoByTheme);
      else if (query.addListener) query.addListener(setLogoByTheme);
    }

    window.addEventListener("storage", setLogoByTheme);
  } catch (error) {
    // ignore unsupported observer APIs
  }
}

function initPointerRipples() {
  document.querySelectorAll(".btn, .glass-button, .tab-button").forEach((button) => {
    button.addEventListener("mousemove", (event) => {
      const rect = button.getBoundingClientRect();
      button.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      button.style.setProperty("--my", `${event.clientY - rect.top}px`);
    });
  });
}

function hydrateDraftForms() {
  setFormValues(elements.matchForm, normalizeMatchValues(loadStoredJson(STORAGE_KEYS.matchDraft, MATCH_DEFAULTS)));
  setFormValues(elements.pitForm, normalizePitValues(loadStoredJson(STORAGE_KEYS.pitDraft, PIT_DEFAULTS)));
  renderDraftStamp("match");
  renderDraftStamp("pit");
  showTab(state.activeTab);
}

async function handleGoogleSignIn() {
  if (!state.client || !configReady()) {
    setAuthMessage("Scouting sign-in is unavailable right now.", "warn");
    return;
  }

  setAuthMessage("Redirecting to Google sign-in...", "success");

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await state.client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        hd: state.config.allowedEmailDomain,
        prompt: "select_account"
      }
    }
  });

  if (error) {
    setAuthMessage(normalizeError(error, "Unable to start Google sign-in."), "danger");
  }
}

async function handleSignOut() {
  if (!state.client) return;
  state.pendingAuthMessage = "Signed out.";
  state.pendingAuthTone = "success";
  await state.client.auth.signOut();
  setAppMessage("");
}

async function syncSession(session) {
  state.session = session;

  if (!session) {
    state.events = [];
    state.matchEntries = [];
    state.pitEntries = [];
    state.teamSummary = [];
    state.isRefreshing = false;
    renderAll();

    if (state.pendingAuthMessage) {
      setAuthMessage(state.pendingAuthMessage, state.pendingAuthTone || "warn");
      state.pendingAuthMessage = "";
      state.pendingAuthTone = "";
    }
    return;
  }

  const email = getSessionEmail(session);
  if (!isAllowedEmail(email)) {
    state.pendingAuthMessage = `Only ${state.config.allowedEmailDomain} Google accounts can access scouting.`;
    state.pendingAuthTone = "danger";
    await state.client.auth.signOut();
    return;
  }

  setAuthMessage(`Signed in as ${email}.`, "success");
  await refreshData({ message: `Signed in as ${email}.` });
}

async function refreshData({ message = "" } = {}) {
  if (!state.client || !state.session) return;

  state.isRefreshing = true;
  renderStatusPills();
  renderFormAvailability();

  try {
    await loadEvents();
    await loadEntriesForActiveEvent();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
    setAppMessage(message || "Scouting data refreshed.", "success");
  } catch (error) {
    setAppMessage(normalizeError(error, "Unable to load scouting data from Supabase."), "danger");
  } finally {
    state.isRefreshing = false;
    renderAll();
  }
}

async function loadEvents() {
  const { data, error } = await state.client
    .from("scouting_events")
    .select("*")
    .order("is_active", { ascending: false })
    .order("start_date", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw error;

  state.events = Array.isArray(data) ? data : [];

  const currentStillExists = state.events.some((event) => event.id === state.activeEventId);
  if (!currentStillExists) {
    const preferred =
      state.events.find((event) => event.id === loadStoredValue(STORAGE_KEYS.activeEventId, "")) ||
      state.events.find((event) => event.is_active) ||
      state.events[0] ||
      null;

    state.activeEventId = preferred ? preferred.id : "";
  }

  saveStoredValue(STORAGE_KEYS.activeEventId, state.activeEventId);
}

async function loadEntriesForActiveEvent() {
  if (!state.activeEventId) {
    state.matchEntries = [];
    state.pitEntries = [];
    state.teamSummary = [];
    return;
  }

  const [matchResponse, pitResponse, summaryResponse] = await Promise.all([
    state.client
      .from("match_scout_entries")
      .select("*")
      .eq("event_id", state.activeEventId)
      .order("created_at", { ascending: false }),
    state.client
      .from("pit_scout_entries")
      .select("*")
      .eq("event_id", state.activeEventId)
      .order("created_at", { ascending: false }),
    state.client
      .from("team_summary_2026")
      .select("*")
      .eq("event_id", state.activeEventId)
      .order("team_number", { ascending: true })
  ]);

  if (matchResponse.error) throw matchResponse.error;
  if (pitResponse.error) throw pitResponse.error;

  state.matchEntries = Array.isArray(matchResponse.data) ? matchResponse.data : [];
  state.pitEntries = Array.isArray(pitResponse.data) ? pitResponse.data : [];

  if (summaryResponse.error) {
    state.teamSummary = buildTeamSummary(state.matchEntries, state.pitEntries);
    return;
  }

  const summaryRows = Array.isArray(summaryResponse.data) ? summaryResponse.data : [];
  state.teamSummary = summaryRows.length
    ? summaryRows.map(normalizeSummaryRow).sort((left, right) => left.team_number - right.team_number)
    : buildTeamSummary(state.matchEntries, state.pitEntries);
}

async function handleEventChange(eventId) {
  state.activeEventId = eventId;
  saveStoredValue(STORAGE_KEYS.activeEventId, state.activeEventId);

  if (!state.session) {
    renderAll();
    return;
  }

  try {
    state.isRefreshing = true;
    renderAll();
    await loadEntriesForActiveEvent();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
    setAppMessage("Event data loaded.", "success");
  } catch (error) {
    setAppMessage(normalizeError(error, "Unable to switch events."), "danger");
  } finally {
    state.isRefreshing = false;
    renderAll();
  }
}

async function submitMatchForm() {
  if (!state.client || !state.session) {
    setFormMessage(elements.matchFormMessage, "Sign in before submitting match entries.", "warn");
    return;
  }

  const payload = buildMatchPayload();
  const validationError = validateMatchPayload(payload);
  if (validationError) {
    setFormMessage(elements.matchFormMessage, validationError, "danger");
    return;
  }

  setFormMessage(elements.matchFormMessage, "Submitting match entry...", "success");
  elements.matchSubmitButton.disabled = true;

  try {
    if (!state.connectionOnline) {
      throw new Error("Device is offline.");
    }

    const { error } = await state.client.from("match_scout_entries").insert(payload);
    if (error) throw error;

    resetMatchDraft(payload.scout_name);
    await loadEntriesForActiveEvent();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
    setFormMessage(elements.matchFormMessage, "Match entry synced.", "success");
    setAppMessage("Match entry saved to Supabase.", "success");
  } catch (error) {
    enqueueOutbox("match", payload);
    setFormMessage(
      elements.matchFormMessage,
      "Sync failed. The match entry was saved to this device outbox.",
      "warn"
    );
    setAppMessage(normalizeError(error, "Entry queued in the outbox for retry."), "warn");
  } finally {
    elements.matchSubmitButton.disabled = false;
    renderAll();
  }
}

async function submitPitForm() {
  if (!state.client || !state.session) {
    setFormMessage(elements.pitFormMessage, "Sign in before submitting pit entries.", "warn");
    return;
  }

  const payload = buildPitPayload();
  const validationError = validatePitPayload(payload);
  if (validationError) {
    setFormMessage(elements.pitFormMessage, validationError, "danger");
    return;
  }

  setFormMessage(elements.pitFormMessage, "Submitting pit entry...", "success");
  elements.pitSubmitButton.disabled = true;

  try {
    if (!state.connectionOnline) {
      throw new Error("Device is offline.");
    }

    const { error } = await state.client.from("pit_scout_entries").insert(payload);
    if (error) throw error;

    resetPitDraft(payload.scout_name);
    await loadEntriesForActiveEvent();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
    setFormMessage(elements.pitFormMessage, "Pit entry synced.", "success");
    setAppMessage("Pit entry saved to Supabase.", "success");
  } catch (error) {
    enqueueOutbox("pit", payload);
    setFormMessage(
      elements.pitFormMessage,
      "Sync failed. The pit entry was saved to this device outbox.",
      "warn"
    );
    setAppMessage(normalizeError(error, "Entry queued in the outbox for retry."), "warn");
  } finally {
    elements.pitSubmitButton.disabled = false;
    renderAll();
  }
}

async function flushOutbox() {
  if (!state.client || !state.session) {
    setAppMessage("Sign in before retrying the outbox.", "warn");
    return;
  }

  if (!state.outbox.length) {
    setAppMessage("The outbox is already empty.", "success");
    return;
  }

  state.isRefreshing = true;
  renderAll();

  const remaining = [];
  let syncedCount = 0;

  for (const item of state.outbox) {
    try {
      const tableName = item.type === "match" ? "match_scout_entries" : "pit_scout_entries";
      const { error } = await state.client.from(tableName).insert(item.payload);
      if (error) throw error;
      syncedCount += 1;
    } catch (error) {
      remaining.push(item);
    }
  }

  state.outbox = remaining;
  saveStoredJson(STORAGE_KEYS.outbox, state.outbox);

  if (syncedCount > 0) {
    await loadEntriesForActiveEvent();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
  }

  state.isRefreshing = false;

  if (remaining.length) {
    setAppMessage(`Synced ${syncedCount} queued entries. ${remaining.length} still need retry.`, "warn");
  } else {
    setAppMessage(`Synced ${syncedCount} queued entries. Outbox cleared.`, "success");
  }

  renderAll();
}

function showTab(tabName) {
  const validTab = elements.tabButtons.some((button) => button.dataset.tab === tabName)
    ? tabName
    : "overview";

  state.activeTab = validTab;
  saveStoredValue(STORAGE_KEYS.activeTab, state.activeTab);

  elements.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === validTab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  elements.tabPanels.forEach((panel) => {
    const isActive = panel.id === `panel-${validTab}`;
    panel.classList.toggle("hidden", !isActive);
  });
}

function renderAll() {
  renderConfigState();
  renderAuthState();
  renderEventOptions();
  renderCurrentEvent();
  renderStatusPills();
  renderStats();
  renderOutbox();
  renderSummaryTable();
  renderDraftStamp("match");
  renderDraftStamp("pit");
  renderFormAvailability();
}

function renderConfigState() {
  const configured = configReady();

  if (elements.googleSignInButton) {
    elements.googleSignInButton.disabled = !configured;
  }
}

function renderAuthState() {
  const signedIn = Boolean(state.session && isAllowedEmail(getSessionEmail(state.session)));
  elements.lockView.classList.toggle("hidden", signedIn);
  elements.appView.classList.toggle("hidden", !signedIn);

  if (signedIn) {
    const email = getSessionEmail(state.session);
    setStatusPill(elements.authPill, `Signed in: ${email}`, "success");
    return;
  }

  setStatusPill(elements.authPill, "Locked", "warn");
}

function renderEventOptions() {
  if (!elements.eventSelect) return;

  const select = elements.eventSelect;
  select.innerHTML = "";

  if (!state.events.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = state.session ? "No events configured" : "Sign in to load events";
    select.appendChild(option);
    select.value = "";
    select.disabled = true;
    return;
  }

  state.events.forEach((event) => {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = `${event.name} (${event.event_code})`;
    select.appendChild(option);
  });

  select.disabled = false;
  select.value = state.activeEventId;
}

function renderCurrentEvent() {
  const event = getActiveEvent();

  if (!event) {
    elements.currentEventName.textContent = "No active event selected";
    elements.currentEventMeta.textContent = state.session
      ? "Create or activate a scouting_events row in Supabase to enable submissions."
      : "Sign in with Google to load team events.";
    return;
  }

  elements.currentEventName.textContent = event.name;
  elements.currentEventMeta.textContent = [
    event.event_code,
    event.location || "Location TBD",
    formatDateRange(event.start_date, event.end_date)
  ]
    .filter(Boolean)
    .join(" • ");
}

function renderStatusPills() {
  setStatusPill(
    elements.connectionPill,
    state.connectionOnline ? "Online" : "Offline",
    state.connectionOnline ? "success" : "danger"
  );

  if (state.isRefreshing) {
    setStatusPill(elements.syncPill, "Refreshing data...", "warn");
  } else if (state.lastSyncAt) {
    setStatusPill(elements.syncPill, `Last sync ${formatTime(state.lastSyncAt)}`, "success");
  } else {
    setStatusPill(elements.syncPill, "Waiting for first sync", "warn");
  }

  const queueTone = state.outbox.length ? "warn" : "success";
  setStatusPill(elements.queuePill, `Outbox: ${state.outbox.length}`, queueTone);
}

function renderStats() {
  elements.statTeams.textContent = String(state.teamSummary.length);
  elements.statMatches.textContent = String(state.matchEntries.length);
  elements.statPits.textContent = String(state.pitEntries.length);
  elements.statQueued.textContent = String(state.outbox.length);
}

function renderOutbox() {
  elements.outboxList.innerHTML = "";
  elements.outboxEmpty.classList.toggle("hidden", state.outbox.length > 0);

  if (!state.outbox.length) {
    return;
  }

  const fragment = document.createDocumentFragment();

  state.outbox.forEach((item) => {
    const payload = item.payload || {};
    const wrapper = document.createElement("div");
    wrapper.className = "outbox-item";

    const heading = document.createElement("strong");
    heading.textContent =
      item.type === "match"
        ? `Match • Team ${payload.team_number || "?"} • ${payload.match_type || "Match"} ${payload.match_number || ""}`.trim()
        : `Pit • Team ${payload.team_number || "?"}`;

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = [
      getEventName(payload.event_id),
      payload.scout_name || "Unknown scout",
      formatDateTime(item.created_at)
    ]
      .filter(Boolean)
      .join(" • ");

    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent =
      item.type === "match"
        ? `${payload.alliance_color || "Alliance"} ${payload.station || ""} • Defense ${payload.defense_rating ?? "-"}`
        : `${payload.drivetrain || "Drive unknown"} • ${payload.fuel_scoring_capability || "Fuel unknown"}`;

    wrapper.append(heading, meta, detail);
    fragment.appendChild(wrapper);
  });

  elements.outboxList.appendChild(fragment);
}

function renderSummaryTable() {
  const query = (elements.teamSearch.value || "").trim().toLowerCase();
  const rows = state.teamSummary.filter((row) => {
    const pitSnapshot = buildPitSnapshot(row).toLowerCase();
    return (
      row.team_number.toString().includes(query) ||
      pitSnapshot.includes(query) ||
      (row.preferred_strategy || "").toLowerCase().includes(query) ||
      (row.auto_summary || "").toLowerCase().includes(query)
    );
  });

  elements.summaryCount.textContent = `${rows.length} team${rows.length === 1 ? "" : "s"} visible`;
  elements.summaryTableBody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "No teams match the current filter.";
    tr.appendChild(td);
    elements.summaryTableBody.appendChild(tr);
    return;
  }

  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const values = [
      row.team_number,
      row.matches_scouted,
      formatDecimal(row.avg_auto_fuel),
      formatDecimal(row.avg_total_fuel),
      `${formatDecimal(row.tower_success_rate)}%`,
      formatDecimal(row.avg_defense_rating),
      row.breakdown_count,
      buildPitSnapshot(row)
    ];

    values.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.appendChild(td);
    });

    fragment.appendChild(tr);
  });

  elements.summaryTableBody.appendChild(fragment);
}

function renderFormAvailability() {
  const enabled = Boolean(state.session && getActiveEvent() && !state.isRefreshing);
  const canRetry = Boolean(state.session && state.outbox.length && !state.isRefreshing);

  if (elements.refreshButton) elements.refreshButton.disabled = !state.session || state.isRefreshing;
  if (elements.retryOutboxButton) elements.retryOutboxButton.disabled = !canRetry;
  if (elements.retryOutboxInline) elements.retryOutboxInline.disabled = !canRetry;
  if (elements.signOutButton) elements.signOutButton.disabled = !state.session;
  if (elements.matchSubmitButton) elements.matchSubmitButton.disabled = !enabled;
  if (elements.pitSubmitButton) elements.pitSubmitButton.disabled = !enabled;
  if (elements.exportMatchButton) elements.exportMatchButton.disabled = !state.matchEntries.length;
  if (elements.exportPitButton) elements.exportPitButton.disabled = !state.pitEntries.length;
  if (elements.exportSummaryButton) elements.exportSummaryButton.disabled = !state.teamSummary.length;
}

function persistDraft(kind, { manual = false } = {}) {
  const isMatch = kind === "match";
  const storageKey = isMatch ? STORAGE_KEYS.matchDraft : STORAGE_KEYS.pitDraft;
  const stampKey = isMatch ? STORAGE_KEYS.matchDraftSavedAt : STORAGE_KEYS.pitDraftSavedAt;
  const form = isMatch ? elements.matchForm : elements.pitForm;
  const values = isMatch ? collectMatchValues() : collectPitValues();

  saveStoredJson(storageKey, values);
  const savedAt = new Date().toISOString();
  saveStoredValue(stampKey, savedAt);
  renderDraftStamp(kind);

  if (manual) {
    setFormMessage(
      isMatch ? elements.matchFormMessage : elements.pitFormMessage,
      "Draft saved locally on this device.",
      "success"
    );
  }
}

function renderDraftStamp(kind) {
  const isMatch = kind === "match";
  const stampKey = isMatch ? STORAGE_KEYS.matchDraftSavedAt : STORAGE_KEYS.pitDraftSavedAt;
  const stamp = loadStoredValue(stampKey, "");
  const target = isMatch ? elements.matchDraftStamp : elements.pitDraftStamp;

  if (!target) return;
  target.textContent = stamp ? `Saved ${formatTime(stamp)}` : "";
}

function resetMatchDraft(scoutName) {
  const next = { ...MATCH_DEFAULTS, scout_name: scoutName || "" };
  saveStoredJson(STORAGE_KEYS.matchDraft, next);
  removeStoredValue(STORAGE_KEYS.matchDraftSavedAt);
  setFormValues(elements.matchForm, next);
  renderDraftStamp("match");
}

function resetPitDraft(scoutName) {
  const next = { ...PIT_DEFAULTS, scout_name: scoutName || "" };
  saveStoredJson(STORAGE_KEYS.pitDraft, next);
  removeStoredValue(STORAGE_KEYS.pitDraftSavedAt);
  setFormValues(elements.pitForm, next);
  renderDraftStamp("pit");
}

function buildMatchPayload() {
  const values = collectMatchValues();
  return {
    event_id: state.activeEventId,
    scout_name: values.scout_name,
    team_number: toPositiveInteger(values.team_number),
    match_number: toPositiveInteger(values.match_number),
    match_type: values.match_type,
    alliance_color: values.alliance_color,
    station: clampInteger(values.station, 1, 3),
    auto_fuel: toNonNegativeInteger(values.auto_fuel),
    auto_tower_result: values.auto_tower_result,
    transition_fuel: toNonNegativeInteger(values.transition_fuel),
    shift_1_fuel: toNonNegativeInteger(values.shift_1_fuel),
    shift_2_fuel: toNonNegativeInteger(values.shift_2_fuel),
    shift_3_fuel: toNonNegativeInteger(values.shift_3_fuel),
    shift_4_fuel: toNonNegativeInteger(values.shift_4_fuel),
    endgame_fuel: toNonNegativeInteger(values.endgame_fuel),
    endgame_tower_result: values.endgame_tower_result,
    defense_rating: clampInteger(values.defense_rating, 0, 5),
    penalty_count: toNonNegativeInteger(values.penalty_count),
    breakdown: Boolean(values.breakdown),
    no_show: Boolean(values.no_show),
    notes: values.notes
  };
}

function buildPitPayload() {
  const values = collectPitValues();
  return {
    event_id: state.activeEventId,
    scout_name: values.scout_name,
    team_number: toPositiveInteger(values.team_number),
    drivetrain: values.drivetrain,
    fuel_scoring_capability: values.fuel_scoring_capability,
    tower_capability: values.tower_capability,
    auto_summary: values.auto_summary,
    defense_capability: values.defense_capability,
    preferred_strategy: values.preferred_strategy,
    reliability_notes: values.reliability_notes,
    notes: values.notes
  };
}

function validateMatchPayload(payload) {
  if (!payload.event_id) return "Select an active event before scouting.";
  if (!payload.scout_name) return "Scout name is required.";
  if (!payload.team_number) return "Enter a valid team number.";
  if (!payload.match_number) return "Enter a valid match number.";
  if (!payload.match_type) return "Match type is required.";
  if (!payload.alliance_color) return "Alliance color is required.";
  return "";
}

function validatePitPayload(payload) {
  if (!payload.event_id) return "Select an active event before scouting.";
  if (!payload.scout_name) return "Scout name is required.";
  if (!payload.team_number) return "Enter a valid team number.";
  return "";
}

function collectMatchValues() {
  const form = elements.matchForm;
  return normalizeMatchValues({
    scout_name: readFieldValue(form, "scout_name"),
    team_number: readFieldValue(form, "team_number"),
    match_number: readFieldValue(form, "match_number"),
    match_type: readFieldValue(form, "match_type"),
    alliance_color: readRadioValue(form, "alliance_color", "Blue"),
    station: readRadioValue(form, "station", "1"),
    auto_fuel: readFieldValue(form, "auto_fuel"),
    auto_tower_result: readFieldValue(form, "auto_tower_result"),
    transition_fuel: readFieldValue(form, "transition_fuel"),
    shift_1_fuel: readFieldValue(form, "shift_1_fuel"),
    shift_2_fuel: readFieldValue(form, "shift_2_fuel"),
    shift_3_fuel: readFieldValue(form, "shift_3_fuel"),
    shift_4_fuel: readFieldValue(form, "shift_4_fuel"),
    endgame_fuel: readFieldValue(form, "endgame_fuel"),
    endgame_tower_result: readFieldValue(form, "endgame_tower_result"),
    defense_rating: readFieldValue(form, "defense_rating"),
    penalty_count: readFieldValue(form, "penalty_count"),
    breakdown: readCheckboxValue(form, "breakdown"),
    no_show: readCheckboxValue(form, "no_show"),
    notes: readFieldValue(form, "notes")
  });
}

function collectPitValues() {
  const form = elements.pitForm;
  return normalizePitValues({
    scout_name: readFieldValue(form, "scout_name"),
    team_number: readFieldValue(form, "team_number"),
    drivetrain: readFieldValue(form, "drivetrain"),
    fuel_scoring_capability: readFieldValue(form, "fuel_scoring_capability"),
    tower_capability: readFieldValue(form, "tower_capability"),
    auto_summary: readFieldValue(form, "auto_summary"),
    defense_capability: readFieldValue(form, "defense_capability"),
    preferred_strategy: readFieldValue(form, "preferred_strategy"),
    reliability_notes: readFieldValue(form, "reliability_notes"),
    notes: readFieldValue(form, "notes")
  });
}

function enqueueOutbox(type, payload) {
  state.outbox.unshift({
    id: createId(),
    type,
    payload,
    created_at: new Date().toISOString()
  });
  saveStoredJson(STORAGE_KEYS.outbox, state.outbox);
}

function buildTeamSummary(matchEntries, pitEntries) {
  const matchMap = new Map();
  const pitLatest = new Map();

  pitEntries.forEach((entry) => {
    if (!pitLatest.has(entry.team_number)) {
      pitLatest.set(entry.team_number, entry);
    }
  });

  matchEntries.forEach((entry) => {
    const key = entry.team_number;
    const totalFuel =
      Number(entry.auto_fuel || 0) +
      Number(entry.transition_fuel || 0) +
      Number(entry.shift_1_fuel || 0) +
      Number(entry.shift_2_fuel || 0) +
      Number(entry.shift_3_fuel || 0) +
      Number(entry.shift_4_fuel || 0) +
      Number(entry.endgame_fuel || 0);

    const summary = matchMap.get(key) || {
      event_id: entry.event_id,
      team_number: Number(entry.team_number),
      matches_scouted: 0,
      autoFuelTotal: 0,
      totalFuelTotal: 0,
      towerSuccessCount: 0,
      defenseTotal: 0,
      breakdown_count: 0
    };

    summary.matches_scouted += 1;
    summary.autoFuelTotal += Number(entry.auto_fuel || 0);
    summary.totalFuelTotal += totalFuel;
    summary.towerSuccessCount +=
      entry.auto_tower_result === "Complete" || entry.endgame_tower_result === "Complete" ? 1 : 0;
    summary.defenseTotal += Number(entry.defense_rating || 0);
    summary.breakdown_count += entry.breakdown ? 1 : 0;

    matchMap.set(key, summary);
  });

  const teamNumbers = Array.from(
    new Set([...matchMap.keys(), ...pitLatest.keys()].map((value) => Number(value)))
  ).sort((left, right) => left - right);

  return teamNumbers.map((teamNumber) => {
    const matchSummary = matchMap.get(teamNumber);
    const pit = pitLatest.get(teamNumber);
    const matches = matchSummary?.matches_scouted || 0;

    return {
      event_id: state.activeEventId,
      team_number: teamNumber,
      matches_scouted: matches,
      avg_auto_fuel: matches ? roundToTwo(matchSummary.autoFuelTotal / matches) : 0,
      avg_total_fuel: matches ? roundToTwo(matchSummary.totalFuelTotal / matches) : 0,
      tower_success_rate: matches ? roundToTwo((matchSummary.towerSuccessCount / matches) * 100) : 0,
      avg_defense_rating: matches ? roundToTwo(matchSummary.defenseTotal / matches) : 0,
      breakdown_count: matchSummary?.breakdown_count || 0,
      drivetrain: pit?.drivetrain || "",
      fuel_scoring_capability: pit?.fuel_scoring_capability || "",
      tower_capability: pit?.tower_capability || "",
      auto_summary: pit?.auto_summary || "",
      defense_capability: pit?.defense_capability || "",
      preferred_strategy: pit?.preferred_strategy || "",
      reliability_notes: pit?.reliability_notes || "",
      pit_notes: pit?.notes || ""
    };
  });
}

function normalizeSummaryRow(row) {
  return {
    event_id: row.event_id,
    team_number: Number(row.team_number),
    matches_scouted: Number(row.matches_scouted || 0),
    avg_auto_fuel: Number(row.avg_auto_fuel || 0),
    avg_total_fuel: Number(row.avg_total_fuel || 0),
    tower_success_rate: Number(row.tower_success_rate || 0),
    avg_defense_rating: Number(row.avg_defense_rating || 0),
    breakdown_count: Number(row.breakdown_count || 0),
    drivetrain: row.drivetrain || "",
    fuel_scoring_capability: row.fuel_scoring_capability || "",
    tower_capability: row.tower_capability || "",
    auto_summary: row.auto_summary || "",
    defense_capability: row.defense_capability || "",
    preferred_strategy: row.preferred_strategy || "",
    reliability_notes: row.reliability_notes || "",
    pit_notes: row.pit_notes || ""
  };
}

function buildPitSnapshot(row) {
  const snapshot = [row.drivetrain, row.fuel_scoring_capability, row.tower_capability]
    .filter(Boolean)
    .join(" • ");

  return snapshot || "No pit data";
}

function exportMatchCsv() {
  if (!state.matchEntries.length) {
    setAppMessage("No match entries are loaded for export.", "warn");
    return;
  }

  const rows = state.matchEntries.map((entry) => ({
    event_id: entry.event_id,
    team_number: entry.team_number,
    match_number: entry.match_number,
    match_type: entry.match_type,
    alliance_color: entry.alliance_color,
    station: entry.station,
    scout_name: entry.scout_name,
    auto_fuel: entry.auto_fuel,
    auto_tower_result: entry.auto_tower_result,
    transition_fuel: entry.transition_fuel,
    shift_1_fuel: entry.shift_1_fuel,
    shift_2_fuel: entry.shift_2_fuel,
    shift_3_fuel: entry.shift_3_fuel,
    shift_4_fuel: entry.shift_4_fuel,
    endgame_fuel: entry.endgame_fuel,
    endgame_tower_result: entry.endgame_tower_result,
    defense_rating: entry.defense_rating,
    penalty_count: entry.penalty_count,
    breakdown: entry.breakdown,
    no_show: entry.no_show,
    notes: entry.notes,
    created_at: entry.created_at
  }));

  downloadCsv(`${buildExportPrefix()}-matches.csv`, rows);
}

function exportPitCsv() {
  if (!state.pitEntries.length) {
    setAppMessage("No pit entries are loaded for export.", "warn");
    return;
  }

  const rows = state.pitEntries.map((entry) => ({
    event_id: entry.event_id,
    team_number: entry.team_number,
    scout_name: entry.scout_name,
    drivetrain: entry.drivetrain,
    fuel_scoring_capability: entry.fuel_scoring_capability,
    tower_capability: entry.tower_capability,
    auto_summary: entry.auto_summary,
    defense_capability: entry.defense_capability,
    preferred_strategy: entry.preferred_strategy,
    reliability_notes: entry.reliability_notes,
    notes: entry.notes,
    created_at: entry.created_at
  }));

  downloadCsv(`${buildExportPrefix()}-pits.csv`, rows);
}

function exportSummaryCsv() {
  if (!state.teamSummary.length) {
    setAppMessage("No summary data is loaded for export.", "warn");
    return;
  }

  const rows = state.teamSummary.map((row) => ({
    event_id: row.event_id,
    team_number: row.team_number,
    matches_scouted: row.matches_scouted,
    avg_auto_fuel: row.avg_auto_fuel,
    avg_total_fuel: row.avg_total_fuel,
    tower_success_rate: row.tower_success_rate,
    avg_defense_rating: row.avg_defense_rating,
    breakdown_count: row.breakdown_count,
    drivetrain: row.drivetrain,
    fuel_scoring_capability: row.fuel_scoring_capability,
    tower_capability: row.tower_capability,
    auto_summary: row.auto_summary,
    defense_capability: row.defense_capability,
    preferred_strategy: row.preferred_strategy,
    reliability_notes: row.reliability_notes,
    pit_notes: row.pit_notes
  }));

  downloadCsv(`${buildExportPrefix()}-summary.csv`, rows);
}

function downloadCsv(filename, rows) {
  const csv = toCsv(rows);
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","))
  ];
  return lines.join("\n");
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value).replace(/"/g, "\"\"");
  return /[",\n]/.test(stringValue) ? `"${stringValue}"` : stringValue;
}

function readOAuthErrorFromUrl() {
  const url = new URL(window.location.href);
  const errorDescription = url.searchParams.get("error_description");
  const message = url.searchParams.get("message");
  const authError = errorDescription || message;
  if (!authError) return;

  state.pendingAuthMessage = authError;
  state.pendingAuthTone = "danger";
}

function normalizeConfig(rawConfig) {
  return {
    supabaseUrl: String(rawConfig.supabaseUrl || "").trim(),
    supabaseAnonKey: String(rawConfig.supabaseAnonKey || "").trim(),
    allowedEmailDomain: String(rawConfig.allowedEmailDomain || "team10312.com")
      .trim()
      .replace(/^@/, "")
      .toLowerCase()
  };
}

function configReady() {
  return (
    Boolean(state.config?.supabaseUrl) &&
    !state.config.supabaseUrl.includes("YOUR-PROJECT") &&
    Boolean(state.config?.supabaseAnonKey) &&
    !state.config.supabaseAnonKey.includes("YOUR-PUBLIC-ANON-KEY")
  );
}

function isAllowedEmail(email) {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${state.config.allowedEmailDomain}`);
}

function getSessionEmail(session) {
  return String(session?.user?.email || "").trim().toLowerCase();
}

function getActiveEvent() {
  return state.events.find((event) => event.id === state.activeEventId) || null;
}

function getEventName(eventId) {
  return state.events.find((event) => event.id === eventId)?.name || "Unknown event";
}

function buildExportPrefix() {
  const event = getActiveEvent();
  return event?.slug || event?.event_code?.toLowerCase() || "scouting-export";
}

function setStatusPill(target, text, tone = "") {
  if (!target) return;
  target.textContent = text;
  target.classList.remove("is-success", "is-warn", "is-danger");
  if (tone) {
    target.classList.add(`is-${tone}`);
  }
}

function setAuthMessage(text = "", tone = "") {
  setMessage(elements.authMessage, text, tone);
}

function setAppMessage(text = "", tone = "") {
  setMessage(elements.appMessage, text, tone);
}

function setFormMessage(target, text = "", tone = "") {
  setMessage(target, text, tone);
}

function setMessage(target, text = "", tone = "") {
  if (!target) return;
  target.textContent = text;
  target.classList.remove("is-success", "is-warn", "is-danger");
  if (tone) target.classList.add(`is-${tone}`);
}

function setFormValues(form, values) {
  if (!form) return;
  Object.entries(values).forEach(([name, value]) => {
    const fields = form.querySelectorAll(`[name="${name}"]`);
    if (!fields.length) return;

    if (fields[0].type === "radio") {
      fields.forEach((field) => {
        field.checked = String(field.value) === String(value);
      });
      return;
    }

    if (fields[0].type === "checkbox") {
      fields[0].checked = Boolean(value);
      return;
    }

    fields[0].value = String(value ?? "");
  });
}

function readFieldValue(form, name) {
  const field = form?.elements?.namedItem(name);
  if (!field) return "";
  return typeof field.value === "string" ? field.value.trim() : "";
}

function readRadioValue(form, name, fallback = "") {
  const selected = form?.querySelector(`[name="${name}"]:checked`);
  return selected ? selected.value : fallback;
}

function readCheckboxValue(form, name) {
  const field = form?.querySelector(`[name="${name}"]`);
  return Boolean(field?.checked);
}

function normalizeMatchValues(values) {
  return {
    ...MATCH_DEFAULTS,
    ...values,
    scout_name: String(values.scout_name ?? MATCH_DEFAULTS.scout_name).trim(),
    team_number: normalizeNumericDraftValue(values.team_number),
    match_number: normalizeNumericDraftValue(values.match_number),
    station: String(values.station ?? MATCH_DEFAULTS.station),
    auto_fuel: toNonNegativeInteger(values.auto_fuel),
    transition_fuel: toNonNegativeInteger(values.transition_fuel),
    shift_1_fuel: toNonNegativeInteger(values.shift_1_fuel),
    shift_2_fuel: toNonNegativeInteger(values.shift_2_fuel),
    shift_3_fuel: toNonNegativeInteger(values.shift_3_fuel),
    shift_4_fuel: toNonNegativeInteger(values.shift_4_fuel),
    endgame_fuel: toNonNegativeInteger(values.endgame_fuel),
    defense_rating: clampInteger(values.defense_rating, 0, 5),
    penalty_count: toNonNegativeInteger(values.penalty_count),
    breakdown: Boolean(values.breakdown),
    no_show: Boolean(values.no_show),
    notes: String(values.notes ?? "").trim()
  };
}

function normalizePitValues(values) {
  return {
    ...PIT_DEFAULTS,
    ...values,
    scout_name: String(values.scout_name ?? PIT_DEFAULTS.scout_name).trim(),
    team_number: normalizeNumericDraftValue(values.team_number),
    drivetrain: String(values.drivetrain ?? PIT_DEFAULTS.drivetrain).trim(),
    fuel_scoring_capability: String(
      values.fuel_scoring_capability ?? PIT_DEFAULTS.fuel_scoring_capability
    ).trim(),
    tower_capability: String(values.tower_capability ?? PIT_DEFAULTS.tower_capability).trim(),
    auto_summary: String(values.auto_summary ?? "").trim(),
    defense_capability: String(values.defense_capability ?? PIT_DEFAULTS.defense_capability).trim(),
    preferred_strategy: String(values.preferred_strategy ?? "").trim(),
    reliability_notes: String(values.reliability_notes ?? "").trim(),
    notes: String(values.notes ?? "").trim()
  };
}

function normalizeNumericDraftValue(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(Math.max(0, Number(value) || 0));
}

function toPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toNonNegativeInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}

function formatDecimal(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "");
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return "";
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (start && end) {
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  return (start || end)?.toLocaleDateString() || "";
}

function normalizeError(error, fallback) {
  return String(error?.message || fallback).trim();
}

function loadStoredValue(key, fallback = "") {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function saveStoredValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // ignore storage failures
  }
}

function removeStoredValue(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // ignore storage failures
  }
}

function loadStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function saveStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // ignore storage failures
  }
}
