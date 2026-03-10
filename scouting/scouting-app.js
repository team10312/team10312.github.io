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

const SCOUT_RELOAD_NEW_VALUE = "__new__";

const AUTO_PATH_DEFAULTS = Object.freeze({
  drawColor: "#ff7f00",
  drawSize: 5,
  eraseSize: 18,
  minDrawSize: 2,
  maxDrawSize: 18,
  minEraseSize: 8,
  maxEraseSize: 48
});

const MATCH_DEFAULTS = Object.freeze({
  scout_name: "",
  team_number: "",
  match_number: "",
  match_type: "Qualification",
  alliance_color: "Blue",
  shift_pattern: "team",
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
  estimated_fuel_per_match: "",
  cycle_time: "",
  scoring_speed: "Unknown",
  intake_style: "Unknown",
  shooter_type: "Unknown",
  hopper_size: "",
  climb_level: "",
  auto_summary: "",
  auto_path_drawing: "",
  defense_capability: "Balanced",
  preferred_strategy: "",
  reliability_notes: "",
  notes: ""
});

const DEFAULT_SCOUTING_EVENTS = Object.freeze([
  {
    slug: "fit-san-antonio-2026",
    name: "FIT District San Antonio Event",
    event_code: "TXSAN",
    location: "Freeman Coliseum, San Antonio, TX",
    start_date: "2026-03-12",
    end_date: "2026-03-14",
    is_active: true
  },
  {
    slug: "fit-amarillo-2026",
    name: "FIT District Amarillo Event",
    event_code: "TXAMA",
    location: "Amarillo Civic Center, Amarillo, TX",
    start_date: "2026-04-02",
    end_date: "2026-04-04",
    is_active: false
  }
]);

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
  scoutReloadSelections: {
    match: SCOUT_RELOAD_NEW_VALUE,
    pit: SCOUT_RELOAD_NEW_VALUE
  },
  connectionOnline: navigator.onLine,
  isRefreshing: false,
  pendingAuthMessage: "",
  pendingAuthTone: ""
};

const elements = {};
const customSelectRegistry = new WeakMap();
let activeCustomSelect = null;
let customSelectEventsBound = false;
const autoPathState = {
  mode: "draw",
  drawColor: AUTO_PATH_DEFAULTS.drawColor,
  drawSize: AUTO_PATH_DEFAULTS.drawSize,
  eraseSize: AUTO_PATH_DEFAULTS.eraseSize,
  strokes: [],
  activeStroke: null,
  pointerId: null,
  initialized: false,
  resizeObserver: null
};

document.addEventListener("DOMContentLoaded", () => {
  void init();
});

async function init() {
  cacheDom();
  initCustomSelects();
  initAutoPathBoard();
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
  elements.matchEntryLoadSelect = document.getElementById("matchEntryLoadSelect");
  elements.matchSaveDraftButton = document.getElementById("matchSaveDraftButton");
  elements.matchSubmitButton = document.getElementById("matchSubmitButton");
  elements.matchDraftStamp = document.getElementById("matchDraftStamp");
  elements.matchFormMessage = document.getElementById("matchFormMessage");
  elements.shiftPatternInput = document.getElementById("shiftPatternInput");
  elements.shiftPatternToggle = document.getElementById("shiftPatternToggle");
  elements.pitForm = document.getElementById("pitForm");
  elements.pitEntryLoadSelect = document.getElementById("pitEntryLoadSelect");
  elements.pitSaveDraftButton = document.getElementById("pitSaveDraftButton");
  elements.pitSubmitButton = document.getElementById("pitSubmitButton");
  elements.pitDraftStamp = document.getElementById("pitDraftStamp");
  elements.pitFormMessage = document.getElementById("pitFormMessage");
  elements.autoPathField = document.getElementById("autoPathField");
  elements.autoPathBoard = document.getElementById("autoPathBoard");
  elements.autoPathCanvas = document.getElementById("autoPathCanvas");
  elements.autoPathFieldImage = document.getElementById("autoPathFieldImage");
  elements.autoPathDrawingInput = document.getElementById("autoPathDrawingInput");
  elements.autoPathDrawButton = document.getElementById("autoPathDrawButton");
  elements.autoPathEraseButton = document.getElementById("autoPathEraseButton");
  elements.autoPathColorInput = document.getElementById("autoPathColorInput");
  elements.autoPathColorValue = document.getElementById("autoPathColorValue");
  elements.autoPathDrawSizeInput = document.getElementById("autoPathDrawSizeInput");
  elements.autoPathDrawSizeValue = document.getElementById("autoPathDrawSizeValue");
  elements.autoPathEraseSizeInput = document.getElementById("autoPathEraseSizeInput");
  elements.autoPathEraseSizeValue = document.getElementById("autoPathEraseSizeValue");
  elements.autoPathUndoButton = document.getElementById("autoPathUndoButton");
  elements.autoPathClearButton = document.getElementById("autoPathClearButton");
  elements.exportMatchButton = document.getElementById("exportMatchButton");
  elements.exportPitButton = document.getElementById("exportPitButton");
  elements.exportSummaryButton = document.getElementById("exportSummaryButton");
}

function initCustomSelects(root = document) {
  root.querySelectorAll("select").forEach((select) => {
    if (customSelectRegistry.has(select)) {
      refreshCustomSelect(select);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const labelText =
      select.getAttribute("aria-label") ||
      select.closest(".field, label")?.querySelector("span")?.textContent?.trim() ||
      select.name ||
      "Select option";
    trigger.setAttribute("aria-label", labelText);

    const value = document.createElement("span");
    value.className = "custom-select__value";
    trigger.appendChild(value);

    const menu = document.createElement("div");
    menu.className = "custom-select__menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    const menuId = `custom-select-${createId()}`;
    menu.id = menuId;
    trigger.setAttribute("aria-controls", menuId);

    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select, trigger, menu);

    select.classList.add("custom-select__native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    customSelectRegistry.set(select, {
      wrapper,
      trigger,
      value,
      menu,
      highlightedIndex: -1
    });

    trigger.addEventListener("click", () => {
      if (isCustomSelectOpen(select)) {
        closeCustomSelect(select);
      } else {
        openCustomSelect(select);
      }
    });

    trigger.addEventListener("keydown", (event) => {
      handleCustomSelectKeydown(event, select);
    });

    menu.addEventListener("click", (event) => {
      const optionButton = event.target.closest(".custom-select__option");
      if (!optionButton) return;
      chooseCustomSelectOption(select, Number(optionButton.dataset.optionIndex));
    });

    select.addEventListener("change", () => {
      syncCustomSelect(select);
    });

    select.addEventListener("input", () => {
      syncCustomSelect(select);
    });

    refreshCustomSelect(select);
  });

  if (customSelectEventsBound) return;
  customSelectEventsBound = true;

  document.addEventListener("click", (event) => {
    if (!activeCustomSelect) return;
    const refs = customSelectRegistry.get(activeCustomSelect);
    if (!refs || refs.wrapper.contains(event.target)) return;
    closeCustomSelect(activeCustomSelect);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !activeCustomSelect) return;
    closeCustomSelect(activeCustomSelect);
  });

  window.addEventListener("blur", () => {
    closeCustomSelect(activeCustomSelect);
  });
}

function initAutoPathBoard() {
  if (
    autoPathState.initialized ||
    !elements.autoPathBoard ||
    !elements.autoPathCanvas ||
    !elements.autoPathDrawingInput
  ) {
    return;
  }

  autoPathState.initialized = true;

  if (elements.autoPathDrawButton) {
    elements.autoPathDrawButton.addEventListener("click", () => {
      setAutoPathMode("draw");
    });
  }

  if (elements.autoPathEraseButton) {
    elements.autoPathEraseButton.addEventListener("click", () => {
      setAutoPathMode("erase");
    });
  }

  if (elements.autoPathColorInput) {
    elements.autoPathColorInput.addEventListener("input", (event) => {
      autoPathState.drawColor = sanitizeAutoPathColor(event.target.value);
      syncAutoPathToolSettings();
    });
  }

  if (elements.autoPathDrawSizeInput) {
    elements.autoPathDrawSizeInput.addEventListener("input", (event) => {
      autoPathState.drawSize = normalizeAutoPathStrokeSize("draw", event.target.value);
      syncAutoPathToolSettings();
    });
  }

  if (elements.autoPathEraseSizeInput) {
    elements.autoPathEraseSizeInput.addEventListener("input", (event) => {
      autoPathState.eraseSize = normalizeAutoPathStrokeSize("erase", event.target.value);
      syncAutoPathToolSettings();
    });
  }

  if (elements.autoPathUndoButton) {
    elements.autoPathUndoButton.addEventListener("click", () => {
      if (!autoPathState.strokes.length) return;
      autoPathState.strokes.pop();
      persistAutoPathDrawing();
      renderAutoPathCanvas();
    });
  }

  if (elements.autoPathClearButton) {
    elements.autoPathClearButton.addEventListener("click", () => {
      if (!autoPathState.strokes.length && !autoPathState.activeStroke) return;
      const confirmed = window.confirm("Clear the entire auto path drawing?");
      if (!confirmed) return;

      autoPathState.strokes = [];
      autoPathState.activeStroke = null;
      autoPathState.pointerId = null;
      persistAutoPathDrawing();
      renderAutoPathCanvas();
    });
  }

  elements.autoPathCanvas.addEventListener("pointerdown", handleAutoPathPointerDown);
  elements.autoPathCanvas.addEventListener("pointermove", handleAutoPathPointerMove);
  elements.autoPathCanvas.addEventListener("pointerup", handleAutoPathPointerEnd);
  elements.autoPathCanvas.addEventListener("pointerleave", handleAutoPathPointerEnd);
  elements.autoPathCanvas.addEventListener("pointercancel", handleAutoPathPointerEnd);

  if (typeof ResizeObserver !== "undefined") {
    autoPathState.resizeObserver = new ResizeObserver(() => {
      syncAutoPathCanvasSize();
    });
    autoPathState.resizeObserver.observe(elements.autoPathBoard);
  }

  if (elements.autoPathFieldImage && !elements.autoPathFieldImage.complete) {
    elements.autoPathFieldImage.addEventListener("load", () => {
      syncAutoPathCanvasSize();
    });
  }

  setAutoPathMode("draw");
  syncAutoPathCanvasSize();
  loadAutoPathDrawing("");
}

function setAutoPathMode(mode) {
  autoPathState.mode = mode === "erase" ? "erase" : "draw";

  if (elements.autoPathDrawButton) {
    elements.autoPathDrawButton.classList.toggle("is-active", autoPathState.mode === "draw");
  }

  if (elements.autoPathEraseButton) {
    elements.autoPathEraseButton.classList.toggle("is-active", autoPathState.mode === "erase");
  }

  syncAutoPathToolSettings();
}

function syncAutoPathToolSettings() {
  autoPathState.drawColor = sanitizeAutoPathColor(autoPathState.drawColor);
  autoPathState.drawSize = normalizeAutoPathStrokeSize("draw", autoPathState.drawSize);
  autoPathState.eraseSize = normalizeAutoPathStrokeSize("erase", autoPathState.eraseSize);

  if (elements.autoPathColorInput) {
    elements.autoPathColorInput.value = autoPathState.drawColor;
  }

  if (elements.autoPathColorValue) {
    elements.autoPathColorValue.textContent = autoPathState.drawColor.toUpperCase();
  }

  if (elements.autoPathDrawSizeInput) {
    elements.autoPathDrawSizeInput.value = String(autoPathState.drawSize);
  }

  if (elements.autoPathDrawSizeValue) {
    elements.autoPathDrawSizeValue.textContent = `${autoPathState.drawSize} px`;
  }

  if (elements.autoPathEraseSizeInput) {
    elements.autoPathEraseSizeInput.value = String(autoPathState.eraseSize);
  }

  if (elements.autoPathEraseSizeValue) {
    elements.autoPathEraseSizeValue.textContent = `${autoPathState.eraseSize} px`;
  }

  updateAutoPathCursor();
}

function updateAutoPathCursor() {
  if (!elements.autoPathCanvas) return;

  const isErasing = autoPathState.mode === "erase";
  elements.autoPathCanvas.classList.toggle("is-erasing", isErasing);
  elements.autoPathCanvas.style.cursor = isErasing
    ? buildAutoPathEraserCursor(autoPathState.eraseSize)
    : "crosshair";
}

function buildAutoPathEraserCursor(size) {
  const diameter = normalizeAutoPathStrokeSize("erase", size);
  const cursorSize = clampInteger(Math.max(diameter + 12, 24), 24, 64);
  const center = Math.round(cursorSize / 2);
  const radius = Math.max(4, Math.min(center - 3, Math.round(diameter / 2)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cursorSize}" height="${cursorSize}" viewBox="0 0 ${cursorSize} ${cursorSize}"><circle cx="${center}" cy="${center}" r="${radius}" fill="#ffffff" fill-opacity="0.14" stroke="#ff7f00" stroke-width="2"/><circle cx="${center}" cy="${center}" r="1.5" fill="#ff7f00"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
}

function syncAutoPathCanvasSize() {
  const canvas = elements.autoPathCanvas;
  const board = elements.autoPathBoard;
  if (!canvas || !board) return;

  const rect = board.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  renderAutoPathCanvas();
}

function handleAutoPathPointerDown(event) {
  if (!elements.autoPathCanvas) return;
  event.preventDefault();

  const point = getAutoPathPoint(event);
  autoPathState.pointerId = event.pointerId;
  autoPathState.activeStroke = {
    mode: autoPathState.mode,
    color: autoPathState.mode === "erase" ? "" : autoPathState.drawColor,
    size:
      autoPathState.mode === "erase"
        ? normalizeAutoPathStrokeSize("erase", autoPathState.eraseSize)
        : normalizeAutoPathStrokeSize("draw", autoPathState.drawSize),
    points: [point]
  };

  elements.autoPathCanvas.setPointerCapture?.(event.pointerId);
  renderAutoPathCanvas();
}

function handleAutoPathPointerMove(event) {
  if (autoPathState.pointerId !== event.pointerId || !autoPathState.activeStroke) return;
  event.preventDefault();

  autoPathState.activeStroke.points.push(getAutoPathPoint(event));
  renderAutoPathCanvas();
}

function handleAutoPathPointerEnd(event) {
  if (autoPathState.pointerId !== event.pointerId || !autoPathState.activeStroke) return;
  event.preventDefault();

  const stroke = {
    ...autoPathState.activeStroke,
    points: normalizeStrokePoints(autoPathState.activeStroke.points)
  };

  if (stroke.points.length >= 1) {
    autoPathState.strokes.push(stroke);
    persistAutoPathDrawing();
  }

  autoPathState.pointerId = null;
  autoPathState.activeStroke = null;
  renderAutoPathCanvas();
}

function getAutoPathPoint(event) {
  const rect = elements.autoPathCanvas.getBoundingClientRect();
  const x = rect.width ? (event.clientX - rect.left) / rect.width : 0;
  const y = rect.height ? (event.clientY - rect.top) / rect.height : 0;

  return {
    x: clampNumber(x, 0, 1),
    y: clampNumber(y, 0, 1)
  };
}

function normalizeStrokePoints(points) {
  const normalized = [];

  points.forEach((point) => {
    const x = clampNumber(point.x, 0, 1);
    const y = clampNumber(point.y, 0, 1);
    const lastPoint = normalized[normalized.length - 1];
    if (lastPoint && Math.abs(lastPoint.x - x) < 0.0015 && Math.abs(lastPoint.y - y) < 0.0015) {
      return;
    }
    normalized.push({ x, y });
  });

  return normalized;
}

function renderAutoPathCanvas() {
  const canvas = elements.autoPathCanvas;
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;

  const width = canvas.clientWidth || 1;
  const height = canvas.clientHeight || 1;
  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";

  autoPathState.strokes.forEach((stroke) => {
    drawAutoPathStroke(context, stroke, width, height);
  });

  if (autoPathState.activeStroke) {
    drawAutoPathStroke(context, autoPathState.activeStroke, width, height);
  }
}

function drawAutoPathStroke(context, stroke, width, height) {
  const points = Array.isArray(stroke?.points) ? stroke.points : [];
  if (!points.length) return;

  const isErasing = stroke.mode === "erase";
  const strokeColor = isErasing ? "#000000" : sanitizeAutoPathColor(stroke.color);
  const strokeSize = normalizeAutoPathStrokeSize(stroke.mode, stroke.size);

  context.save();
  context.strokeStyle = isErasing ? "rgba(0, 0, 0, 1)" : strokeColor;
  context.globalCompositeOperation = isErasing ? "destination-out" : "source-over";
  context.lineWidth = strokeSize;
  context.shadowBlur = isErasing ? 0 : 14;
  context.shadowColor = isErasing ? "transparent" : hexToRgba(strokeColor, 0.35);

  context.beginPath();
  context.moveTo(points[0].x * width, points[0].y * height);

  if (points.length === 1) {
    context.lineTo(points[0].x * width + 0.01, points[0].y * height + 0.01);
  } else {
    points.slice(1).forEach((point) => {
      context.lineTo(point.x * width, point.y * height);
    });
  }

  context.stroke();
  context.restore();
}

function persistAutoPathDrawing() {
  if (!elements.autoPathDrawingInput) return;

  elements.autoPathDrawingInput.value = autoPathState.strokes.length
    ? JSON.stringify(autoPathState.strokes)
    : "";
  elements.autoPathDrawingInput.dispatchEvent(new Event("input", { bubbles: true }));
  elements.autoPathDrawingInput.dispatchEvent(new Event("change", { bubbles: true }));
}

function loadAutoPathDrawing(serialized) {
  autoPathState.strokes = parseAutoPathDrawing(serialized);
  autoPathState.activeStroke = null;
  autoPathState.pointerId = null;
  if (elements.autoPathDrawingInput) {
    elements.autoPathDrawingInput.value = serialized || "";
  }
  renderAutoPathCanvas();
}

function syncAutoPathBoardFromField() {
  if (!elements.autoPathDrawingInput) return;
  loadAutoPathDrawing(elements.autoPathDrawingInput.value || "");
}

function parseAutoPathDrawing(serialized) {
  if (!serialized) return [];

  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((stroke) => {
        const mode = stroke?.mode === "erase" ? "erase" : "draw";
        return {
          mode,
          color: mode === "erase" ? "" : sanitizeAutoPathColor(stroke?.color),
          size: normalizeAutoPathStrokeSize(mode, stroke?.size),
          points: normalizeStrokePoints(Array.isArray(stroke?.points) ? stroke.points : [])
        };
      })
      .filter((stroke) => stroke.points.length);
  } catch (error) {
    return [];
  }
}

function refreshCustomSelect(select) {
  const refs = customSelectRegistry.get(select);
  if (!refs) return;

  refs.menu.innerHTML = "";

  Array.from(select.options).forEach((option, index) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "custom-select__option";
    optionButton.dataset.optionIndex = String(index);
    optionButton.setAttribute("role", "option");
    optionButton.textContent = option.textContent || option.label || option.value || "Untitled option";
    optionButton.disabled = option.disabled;
    refs.menu.appendChild(optionButton);
  });

  syncCustomSelect(select);
}

function syncCustomSelect(select) {
  const refs = customSelectRegistry.get(select);
  if (!refs) return;

  const options = Array.from(select.options);
  if ((select.disabled || !options.length) && activeCustomSelect === select) {
    activeCustomSelect = null;
  }
  const selectedOption =
    options[select.selectedIndex] || options.find((option) => option.selected) || options[0] || null;
  const open = activeCustomSelect === select;

  refs.value.textContent = selectedOption
    ? selectedOption.textContent || selectedOption.label || selectedOption.value
    : "No options available";

  if (!options.length || select.disabled) {
    refs.highlightedIndex = -1;
  } else if (open && !isSelectableOption(options, refs.highlightedIndex)) {
    refs.highlightedIndex = findSelectableOptionIndex(options, Math.max(select.selectedIndex, 0), 1);
  }

  refs.wrapper.classList.toggle("is-open", open);
  refs.wrapper.classList.toggle("is-disabled", Boolean(select.disabled || !options.length));
  refs.trigger.disabled = Boolean(select.disabled || !options.length);
  refs.trigger.setAttribute("aria-expanded", open ? "true" : "false");
  refs.menu.hidden = !open;

  Array.from(refs.menu.children).forEach((optionButton, index) => {
    const option = options[index];
    const selected = index === select.selectedIndex;
    const highlighted = open && index === refs.highlightedIndex;
    optionButton.classList.toggle("is-selected", selected);
    optionButton.classList.toggle("is-highlighted", highlighted);
    optionButton.setAttribute("aria-selected", selected ? "true" : "false");
    optionButton.disabled = Boolean(option?.disabled);
  });
}

function openCustomSelect(select) {
  const refs = customSelectRegistry.get(select);
  if (!refs || refs.trigger.disabled) return;

  if (activeCustomSelect && activeCustomSelect !== select) {
    closeCustomSelect(activeCustomSelect);
  }

  activeCustomSelect = select;
  const options = Array.from(select.options);
  refs.highlightedIndex = findSelectableOptionIndex(options, Math.max(select.selectedIndex, 0), 1);
  syncCustomSelect(select);
  scrollCustomSelectOptionIntoView(select, refs.highlightedIndex);
}

function closeCustomSelect(select) {
  const refs = customSelectRegistry.get(select);
  if (!refs) return;

  if (activeCustomSelect === select) {
    activeCustomSelect = null;
  }

  refs.highlightedIndex = -1;
  syncCustomSelect(select);
}

function isCustomSelectOpen(select) {
  return activeCustomSelect === select;
}

function chooseCustomSelectOption(select, index) {
  const option = select.options[index];
  if (!option || option.disabled) return;

  const refs = customSelectRegistry.get(select);
  if (refs) refs.highlightedIndex = index;

  select.selectedIndex = index;
  closeCustomSelect(select);
  syncCustomSelect(select);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));

  if (refs) refs.trigger.focus();
}

function handleCustomSelectKeydown(event, select) {
  const options = Array.from(select.options);
  if (!options.length || select.disabled) return;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      if (!isCustomSelectOpen(select)) openCustomSelect(select);
      moveCustomSelectHighlight(select, 1);
      break;
    case "ArrowUp":
      event.preventDefault();
      if (!isCustomSelectOpen(select)) openCustomSelect(select);
      moveCustomSelectHighlight(select, -1);
      break;
    case "Home":
      event.preventDefault();
      if (!isCustomSelectOpen(select)) openCustomSelect(select);
      setCustomSelectHighlight(select, findSelectableOptionIndex(options, 0, 1));
      break;
    case "End":
      event.preventDefault();
      if (!isCustomSelectOpen(select)) openCustomSelect(select);
      setCustomSelectHighlight(select, findSelectableOptionIndex(options, options.length - 1, -1));
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      if (!isCustomSelectOpen(select)) {
        openCustomSelect(select);
        break;
      }
      chooseCustomSelectOption(select, getCustomSelectHighlightedIndex(select));
      break;
    case "Tab":
      closeCustomSelect(select);
      break;
    default:
      break;
  }
}

function moveCustomSelectHighlight(select, delta) {
  const refs = customSelectRegistry.get(select);
  if (!refs) return;

  const options = Array.from(select.options);
  const currentIndex = refs.highlightedIndex >= 0 ? refs.highlightedIndex : select.selectedIndex;
  const startIndex = currentIndex >= 0 ? currentIndex + delta : delta > 0 ? 0 : options.length - 1;
  const nextIndex = findSelectableOptionIndex(options, startIndex, delta);
  if (nextIndex < 0) return;

  refs.highlightedIndex = nextIndex;
  syncCustomSelect(select);
  scrollCustomSelectOptionIntoView(select, nextIndex);
}

function setCustomSelectHighlight(select, index) {
  if (index < 0) return;
  const refs = customSelectRegistry.get(select);
  if (!refs) return;

  refs.highlightedIndex = index;
  syncCustomSelect(select);
  scrollCustomSelectOptionIntoView(select, index);
}

function getCustomSelectHighlightedIndex(select) {
  const refs = customSelectRegistry.get(select);
  if (!refs) return -1;
  if (refs.highlightedIndex >= 0) return refs.highlightedIndex;
  return findSelectableOptionIndex(Array.from(select.options), Math.max(select.selectedIndex, 0), 1);
}

function scrollCustomSelectOptionIntoView(select, index) {
  const refs = customSelectRegistry.get(select);
  const optionButton = refs?.menu.querySelector(`[data-option-index="${index}"]`);
  if (!optionButton) return;
  optionButton.scrollIntoView({ block: "nearest" });
}

function findSelectableOptionIndex(options, startIndex, step) {
  if (!options.length) return -1;

  let index = startIndex;
  while (index >= 0 && index < options.length) {
    if (isSelectableOption(options, index)) return index;
    index += step;
  }

  return -1;
}

function isSelectableOption(options, index) {
  return index >= 0 && index < options.length && !options[index].disabled;
}

function normalizeAutoPathStrokeSize(mode, value) {
  const isErasing = mode === "erase";
  const fallback = isErasing ? AUTO_PATH_DEFAULTS.eraseSize : AUTO_PATH_DEFAULTS.drawSize;
  const min = isErasing ? AUTO_PATH_DEFAULTS.minEraseSize : AUTO_PATH_DEFAULTS.minDrawSize;
  const max = isErasing ? AUTO_PATH_DEFAULTS.maxEraseSize : AUTO_PATH_DEFAULTS.maxDrawSize;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clampInteger(parsed, min, max);
}

function sanitizeAutoPathColor(value) {
  const normalized = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : AUTO_PATH_DEFAULTS.drawColor;
}

function hexToRgba(color, alpha = 1) {
  const normalized = sanitizeAutoPathColor(color).slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clampNumber(alpha, 0, 1)})`;
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

  if (elements.matchEntryLoadSelect) {
    elements.matchEntryLoadSelect.addEventListener("change", () => {
      handleScoutReload("match");
    });
  }

  if (elements.pitEntryLoadSelect) {
    elements.pitEntryLoadSelect.addEventListener("change", () => {
      handleScoutReload("pit");
    });
  }

  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showTab(button.dataset.tab || "overview");
    });
  });

  bindCounterButtons();
  bindDraftPersistence(elements.matchForm, "match");
  bindDraftPersistence(elements.pitForm, "pit");
  bindShiftAvailability();
  bindFormValidation(elements.matchForm, "match");
  bindFormValidation(elements.pitForm, "pit");

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
      input.dispatchEvent(new Event("input", { bubbles: true }));
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
  updateShiftFieldAvailability();
  renderDraftStamp("match");
  renderDraftStamp("pit");
  showTab(state.activeTab);
}

function bindShiftAvailability() {
  if (!elements.matchForm) return;

  if (elements.shiftPatternToggle) {
    elements.shiftPatternToggle.addEventListener("click", () => {
      const nextValue = getMatchShiftPatternValue(elements.matchForm) === "alternate" ? "team" : "alternate";
      setMatchShiftPatternValue(nextValue, { dispatch: true });
      updateShiftFieldAvailability();
    });
  }

  elements.matchForm.querySelectorAll('[name="alliance_color"]').forEach((field) => {
    field.addEventListener("change", () => {
      updateShiftFieldAvailability();
    });
  });

  elements.matchForm.querySelectorAll('[name="shift_pattern"]').forEach((field) => {
    field.addEventListener("change", () => {
      updateShiftFieldAvailability();
    });
  });
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
  await refreshData({ message: "" });
}

async function refreshData({ message } = {}) {
  if (!state.client || !state.session) return;

  state.isRefreshing = true;
  renderStatusPills();
  renderFormAvailability();

  try {
    await loadEvents();
    await loadEntriesForActiveEvent();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
    if (typeof message === "string") {
      setAppMessage(message, message ? "success" : "");
    } else {
      setAppMessage("Scouting data refreshed.", "success");
    }
  } catch (error) {
    setAppMessage(normalizeError(error, "Unable to load scouting data from Supabase."), "danger");
  } finally {
    state.isRefreshing = false;
    renderAll();
  }
}

async function loadEvents() {
  const { data, error } = await fetchScoutingEvents();
  if (error) throw error;

  let events = Array.isArray(data) ? data : [];
  events = await ensureDefaultScoutingEvents(events);
  state.events = events.filter((event) => !isHiddenScoutingEvent(event));

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

async function fetchScoutingEvents() {
  return state.client
    .from("scouting_events")
    .select("*")
    .order("is_active", { ascending: false })
    .order("start_date", { ascending: false })
    .order("name", { ascending: true });
}

async function ensureDefaultScoutingEvents(existingEvents) {
  if (!state.client || !state.session) return existingEvents;

  const existingSlugs = new Set(existingEvents.map((event) => event.slug));
  const missingEvents = DEFAULT_SCOUTING_EVENTS.filter((event) => !existingSlugs.has(event.slug));

  if (!missingEvents.length) {
    return existingEvents;
  }

  let insertedAny = false;

  for (const event of missingEvents) {
    const { error } = await state.client.from("scouting_events").insert(event);
    if (error) {
      if (isUniqueConflictError(error)) continue;
      throw error;
    }
    insertedAny = true;
  }

  if (!insertedAny) {
    return existingEvents;
  }

  const refreshed = await fetchScoutingEvents();
  if (refreshed.error) throw refreshed.error;
  return Array.isArray(refreshed.data) ? refreshed.data : existingEvents;
}

function isHiddenScoutingEvent(event) {
  const values = [event?.name, event?.event_code, event?.slug]
    .map((value) => String(value || "").trim().toLowerCase());

  return values.some((value) => {
    return (
      value === "sample" ||
      value === "sample event" ||
      value.includes("sample event") ||
      value.startsWith("sample-") ||
      value.endsWith("-sample")
    );
  });
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

  activateFormValidation(elements.matchForm);
  const validation = validateMatchForm({ apply: true });
  if (!validation.valid) {
    setFormMessage(elements.matchFormMessage, validation.message, "danger");
    focusFormValidationTarget(elements.matchForm, validation.focusName);
    return;
  }

  const payload = buildMatchPayload();
  setFormMessage(elements.matchFormMessage, "Submitting match entry...", "success");
  elements.matchSubmitButton.disabled = true;

  try {
    if (!state.connectionOnline) {
      throw new Error("Device is offline.");
    }

    const result = await insertMatchEntry(payload);

    resetMatchDraft(payload.scout_name);
    await loadEntriesForActiveEvent();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
    setFormMessage(elements.matchFormMessage, "Match entry synced.", "success");
    if (result.missingColumns.length) {
      console.warn("Match entry saved with legacy schema fallback:", result.missingColumns);
    }
    setAppMessage("Match entry saved.", "success");
  } catch (error) {
    if (shouldQueueSyncError(error)) {
      enqueueOutbox("match", payload);
      setFormMessage(
        elements.matchFormMessage,
        "Sync failed. The match entry was saved to this device outbox.",
        "warn"
      );
      setAppMessage(normalizeError(error, "Entry queued in the outbox for retry."), "warn");
    } else {
      setFormMessage(elements.matchFormMessage, normalizeError(error, "Unable to save match entry."), "danger");
      setAppMessage(normalizeError(error, "Unable to save match entry."), "danger");
    }
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

  activateFormValidation(elements.pitForm);
  const validation = validatePitForm({ apply: true });
  if (!validation.valid) {
    setFormMessage(elements.pitFormMessage, validation.message, "danger");
    focusFormValidationTarget(elements.pitForm, validation.focusName);
    return;
  }

  const payload = buildPitPayload();
  setFormMessage(elements.pitFormMessage, "Submitting pit entry...", "success");
  elements.pitSubmitButton.disabled = true;

  try {
    if (!state.connectionOnline) {
      throw new Error("Device is offline.");
    }

    const result = await insertPitEntry(payload);

    resetPitDraft(payload.scout_name);
    await loadEntriesForActiveEvent();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
    setFormMessage(elements.pitFormMessage, "Pit entry synced.", "success");
    if (result.missingColumns.length) {
      console.warn("Pit entry saved with legacy schema fallback:", result.missingColumns);
    }
    setAppMessage("Pit entry saved.", "success");
  } catch (error) {
    if (shouldQueueSyncError(error)) {
      enqueueOutbox("pit", payload);
      setFormMessage(
        elements.pitFormMessage,
        "Sync failed. The pit entry was saved to this device outbox.",
        "warn"
      );
      setAppMessage(normalizeError(error, "Entry queued in the outbox for retry."), "warn");
    } else {
      setFormMessage(elements.pitFormMessage, normalizeError(error, "Unable to save pit entry."), "danger");
      setAppMessage(normalizeError(error, "Unable to save pit entry."), "danger");
    }
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
      if (item.type === "match") {
        await insertMatchEntry(item.payload);
      } else {
        await insertPitEntry(item.payload);
      }
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

  if (validTab === "pit") {
    requestAnimationFrame(() => {
      syncAutoPathCanvasSize();
    });
  }
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
  renderScoutReloadOptions();
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
    refreshCustomSelect(select);
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
  refreshCustomSelect(select);
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
  if (!elements.outboxList || !elements.outboxEmpty) {
    return;
  }

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

    if (item.type !== "match") {
      detail.textContent = [
        payload.drivetrain || "Drive unknown",
        payload.fuel_scoring_capability || "Fuel unknown",
        Number(payload.estimated_fuel_per_match || 0) > 0
          ? `Fuel ${payload.estimated_fuel_per_match}/match`
          : ""
      ]
        .filter(Boolean)
        .join(" â€¢ ");
    }

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
      (row.cycle_time || "").toLowerCase().includes(query) ||
      (row.scoring_speed || "").toLowerCase().includes(query) ||
      (row.intake_style || "").toLowerCase().includes(query) ||
      (row.shooter_type || "").toLowerCase().includes(query) ||
      (row.hopper_size || "").toLowerCase().includes(query) ||
      (row.climb_level || "").toLowerCase().includes(query) ||
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

function renderScoutReloadOptions() {
  renderScoutReloadSelect("match", state.matchEntries);
  renderScoutReloadSelect("pit", state.pitEntries);
}

function renderScoutReloadSelect(kind, entries) {
  const select = kind === "match" ? elements.matchEntryLoadSelect : elements.pitEntryLoadSelect;
  if (!select) return;

  const event = getActiveEvent();
  const rows = Array.isArray(entries) ? entries : [];
  const enabled = Boolean(state.session && event && !state.isRefreshing);

  select.innerHTML = "";

  const newOption = document.createElement("option");
  newOption.value = SCOUT_RELOAD_NEW_VALUE;
  newOption.textContent = `New ${kind} scout`;
  select.appendChild(newOption);

  if (enabled) {
    rows.forEach((entry) => {
      const option = document.createElement("option");
      option.value = getScoutReloadEntryValue(entry, kind);
      option.textContent = formatScoutReloadOptionLabel(entry, kind);
      select.appendChild(option);
    });
  }

  select.disabled = !enabled;
  syncScoutReloadSelect(kind);
  refreshCustomSelect(select);
}

function formatScoutReloadOptionLabel(entry, kind) {
  if (kind === "match") {
    return [
      `Team ${entry.team_number || "?"}`,
      `${entry.match_type || "Match"} ${entry.match_number || ""}`.trim(),
      entry.scout_name || "",
      formatDateTime(entry.created_at)
    ]
      .filter(Boolean)
      .join(" • ");
  }

  return [
    `Team ${entry.team_number || "?"}`,
    entry.scout_name || "",
    formatDateTime(entry.created_at)
  ]
    .filter(Boolean)
    .join(" • ");
}

function getScoutReloadEntryValue(entry, kind) {
  const fallback =
    kind === "match"
      ? `match:${entry.team_number || ""}:${entry.match_number || ""}:${entry.created_at || ""}`
      : `pit:${entry.team_number || ""}:${entry.created_at || ""}`;
  return String(entry?.id || fallback);
}

function handleScoutReload(kind) {
  const isMatch = kind === "match";
  const select = isMatch ? elements.matchEntryLoadSelect : elements.pitEntryLoadSelect;
  const messageTarget = isMatch ? elements.matchFormMessage : elements.pitFormMessage;
  const entries = isMatch ? state.matchEntries : state.pitEntries;
  const selectedValue = String(select?.value || "");

  if (!selectedValue) return;

  if (selectedValue === SCOUT_RELOAD_NEW_VALUE) {
    setScoutReloadSelection(kind, SCOUT_RELOAD_NEW_VALUE);
    if (isMatch) {
      resetMatchDraft("");
    } else {
      resetPitDraft("");
    }
    setFormMessage(messageTarget, `Started a new ${kind} scout.`, "success");
    return;
  }

  const entry = entries.find((row) => getScoutReloadEntryValue(row, kind) === selectedValue);

  if (!entry) {
    resetScoutReloadSelect(kind);
    setFormMessage(messageTarget, "That scout entry is no longer available.", "warn");
    return;
  }

  setScoutReloadSelection(kind, selectedValue);
  syncScoutReloadSelect(kind);
  refreshCustomSelect(select);
  setFormValues(isMatch ? elements.matchForm : elements.pitForm, isMatch ? normalizeMatchValues(entry) : normalizePitValues(entry));
  deactivateFormValidation(isMatch ? elements.matchForm : elements.pitForm);
  persistDraft(kind);

  const detail = isMatch
    ? `Team ${entry.team_number || "?"}, ${entry.match_type || "Match"} ${entry.match_number || ""}`.trim()
    : `Team ${entry.team_number || "?"}`;
  setFormMessage(messageTarget, `Loaded past ${kind} scout for ${detail}.`, "success");
}

function syncScoutReloadSelect(kind) {
  const select = kind === "match" ? elements.matchEntryLoadSelect : elements.pitEntryLoadSelect;
  if (!select) return;

  const selectedValue = getScoutReloadSelection(kind);
  const availableValues = Array.from(select.options, (option) => option.value);
  const nextValue = availableValues.includes(selectedValue) ? selectedValue : SCOUT_RELOAD_NEW_VALUE;
  setScoutReloadSelection(kind, nextValue);
  select.value = nextValue;
}

function resetScoutReloadSelect(kind) {
  setScoutReloadSelection(kind, SCOUT_RELOAD_NEW_VALUE);
  syncScoutReloadSelect(kind);
  refreshCustomSelect(kind === "match" ? elements.matchEntryLoadSelect : elements.pitEntryLoadSelect);
}

function getScoutReloadSelection(kind) {
  return state.scoutReloadSelections?.[kind] || SCOUT_RELOAD_NEW_VALUE;
}

function setScoutReloadSelection(kind, value) {
  state.scoutReloadSelections[kind] = value || SCOUT_RELOAD_NEW_VALUE;
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
  resetScoutReloadSelect("match");
  deactivateFormValidation(elements.matchForm);
  renderDraftStamp("match");
}

function resetPitDraft(scoutName) {
  const next = { ...PIT_DEFAULTS, scout_name: scoutName || "" };
  saveStoredJson(STORAGE_KEYS.pitDraft, next);
  removeStoredValue(STORAGE_KEYS.pitDraftSavedAt);
  setFormValues(elements.pitForm, next);
  loadAutoPathDrawing("");
  resetScoutReloadSelect("pit");
  deactivateFormValidation(elements.pitForm);
  renderDraftStamp("pit");
}

function buildMatchPayload() {
  const values = collectMatchValues();
  const shift1Alliance = getShift1Alliance(values.alliance_color, values.shift_pattern);
  return {
    event_id: state.activeEventId,
    scout_name: values.scout_name,
    team_number: toPositiveInteger(values.team_number),
    match_number: toPositiveInteger(values.match_number),
    match_type: values.match_type,
    alliance_color: values.alliance_color,
    shift_1_alliance: shift1Alliance,
    station: clampInteger(values.station, 1, 3),
    auto_fuel: toNonNegativeInteger(values.auto_fuel),
    auto_tower_result: values.auto_tower_result,
    transition_fuel: toNonNegativeInteger(values.transition_fuel),
    shift_1_fuel: normalizeShiftFuel(1, values),
    shift_2_fuel: normalizeShiftFuel(2, values),
    shift_3_fuel: normalizeShiftFuel(3, values),
    shift_4_fuel: normalizeShiftFuel(4, values),
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
    estimated_fuel_per_match: toNonNegativeInteger(values.estimated_fuel_per_match),
    auto_path_drawing: values.auto_path_drawing,
    tower_capability: "",
    cycle_time: values.cycle_time,
    scoring_speed: values.scoring_speed,
    intake_style: values.intake_style,
    shooter_type: values.shooter_type,
    hopper_size: values.hopper_size,
    climb_level: values.climb_level,
    auto_summary: values.auto_summary,
    defense_capability: values.defense_capability,
    preferred_strategy: values.preferred_strategy,
    reliability_notes: values.reliability_notes,
    notes: values.notes
  };
}

function validateMatchForm({ apply = false } = {}) {
  const form = elements.matchForm;
  const values = collectMatchValues();
  const showState = apply && isFormValidationActive(form);
  let message = "";
  let focusName = "";

  if (!state.activeEventId) {
    message = "Select an active event before scouting.";
  }

  const checkField = (name, valid, nextMessage) => {
    if (apply) {
      setFieldValidationState(form, name, valid, showState);
    }
    if (!valid && !message) {
      message = nextMessage;
      focusName = name;
    }
  };

  checkField("scout_name", Boolean(values.scout_name), "Scout name is required.");
  checkField("team_number", toPositiveInteger(values.team_number) > 0, "Enter a valid team number.");
  checkField("match_number", toPositiveInteger(values.match_number) > 0, "Enter a valid match number.");
  checkField("match_type", Boolean(values.match_type), "Match type is required.");
  checkField("alliance_color", Boolean(values.alliance_color), "Alliance color is required.");
  checkField("shift_pattern", Boolean(values.shift_pattern), "Choose the shift pattern.");
  checkField("station", ["1", "2", "3"].includes(String(values.station)), "Choose a driver station.");

  const hasObservation = hasMatchObservation(values);
  if (apply) {
    setFieldValidationState(form, "auto_tower_result", hasObservation, showState);
    setFieldValidationState(form, "endgame_tower_result", hasObservation, showState);
    setFieldValidationState(form, "defense_rating", hasObservation, showState);
    setFieldValidationState(form, "notes", hasObservation, showState);
    setToggleValidationState(form, "breakdown", hasObservation, showState);
    setToggleValidationState(form, "no_show", hasObservation, showState);
    setCounterCardsValidationState(form, hasObservation, showState);
  }

  if (!hasObservation && !message) {
    message = "Add at least one real match observation before submitting.";
    focusName = "notes";
  }

  return {
    valid: !message,
    message,
    focusName
  };
}

function validatePitForm({ apply = false } = {}) {
  const form = elements.pitForm;
  const values = collectPitValues();
  const showState = apply && isFormValidationActive(form);
  let message = "";
  let focusName = "";

  if (!state.activeEventId) {
    message = "Select an active event before scouting.";
  }

  const checkField = (name, valid, nextMessage) => {
    if (apply) {
      setFieldValidationState(form, name, valid, showState);
    }
    if (!valid && !message) {
      message = nextMessage;
      focusName = name;
    }
  };

  checkField("scout_name", Boolean(values.scout_name), "Scout name is required.");
  checkField("team_number", toPositiveInteger(values.team_number) > 0, "Enter a valid team number.");
  checkField("cycle_time", Boolean(values.cycle_time), "Add the team's cycle time.");
  checkField(
    "estimated_fuel_per_match",
    toNonNegativeInteger(values.estimated_fuel_per_match) > 0,
    "Add the team's estimated total fuel per match."
  );
  checkField(
    "scoring_speed",
    Boolean(values.scoring_speed) && values.scoring_speed !== "Unknown",
    "Choose the team's scoring speed."
  );
  checkField(
    "intake_style",
    Boolean(values.intake_style) && values.intake_style !== "Unknown",
    "Choose the team's intake style."
  );
  checkField(
    "shooter_type",
    Boolean(values.shooter_type) && values.shooter_type !== "Unknown",
    "Choose the team's shooter type."
  );
  const hasAutoDetail = hasAutoPathDrawing(values.auto_path_drawing);
  if (apply) {
    setFieldValidationState(form, "auto_path_drawing", hasAutoDetail, showState);
  }
  if (!hasAutoDetail && !message) {
    message = "Draw the team's auto path.";
    focusName = "auto_path_drawing";
  }
  checkField(
    "preferred_strategy",
    Boolean(values.preferred_strategy),
    "Add the team's preferred strategy."
  );

  return {
    valid: !message,
    message,
    focusName
  };
}

function collectMatchValues() {
  const form = elements.matchForm;
  return normalizeMatchValues({
    scout_name: readFieldValue(form, "scout_name"),
    team_number: readFieldValue(form, "team_number"),
    match_number: readFieldValue(form, "match_number"),
    match_type: readFieldValue(form, "match_type"),
    alliance_color: readRadioValue(form, "alliance_color", "Blue"),
    shift_pattern: getMatchShiftPatternValue(form),
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
    estimated_fuel_per_match: readFieldValue(form, "estimated_fuel_per_match"),
    cycle_time: readFieldValue(form, "cycle_time"),
    scoring_speed: readFieldValue(form, "scoring_speed"),
    intake_style: readFieldValue(form, "intake_style"),
    shooter_type: readFieldValue(form, "shooter_type"),
    hopper_size: readFieldValue(form, "hopper_size"),
    climb_level: readFieldValue(form, "climb_level"),
    auto_summary: readFieldValue(form, "auto_summary"),
    auto_path_drawing: readFieldValue(form, "auto_path_drawing"),
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

async function insertMatchEntry(payload) {
  return insertRowWithSchemaFallback("match_scout_entries", payload);
}

async function insertPitEntry(payload) {
  return insertRowWithSchemaFallback("pit_scout_entries", payload);
}

async function insertRowWithSchemaFallback(tableName, payload) {
  const legacyPayload = { ...payload };
  const missingColumns = [];

  while (true) {
    const { error } = await state.client.from(tableName).insert(legacyPayload);
    if (!error) {
      return { missingColumns };
    }

    const missingColumn = extractMissingColumnName(error, legacyPayload);
    if (!missingColumn || missingColumns.includes(missingColumn)) {
      throw error;
    }

    delete legacyPayload[missingColumn];
    missingColumns.push(missingColumn);
  }
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
      estimated_fuel_per_match: Number(pit?.estimated_fuel_per_match || 0),
      cycle_time: pit?.cycle_time || "",
      scoring_speed: pit?.scoring_speed || "",
      intake_style: pit?.intake_style || "",
      shooter_type: pit?.shooter_type || "",
      hopper_size: pit?.hopper_size || "",
      climb_level: pit?.climb_level || "",
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
    estimated_fuel_per_match: Number(row.estimated_fuel_per_match || 0),
    cycle_time: row.cycle_time || "",
    scoring_speed: row.scoring_speed || "",
    intake_style: row.intake_style || "",
    shooter_type: row.shooter_type || "",
    hopper_size: row.hopper_size || "",
    climb_level: row.climb_level || "",
    auto_summary: row.auto_summary || "",
    defense_capability: row.defense_capability || "",
    preferred_strategy: row.preferred_strategy || "",
    reliability_notes: row.reliability_notes || "",
    pit_notes: row.pit_notes || ""
  };
}

function buildPitSnapshot(row) {
  const snapshot = [
    row.drivetrain,
    row.shooter_type,
    row.intake_style,
    row.estimated_fuel_per_match ? `Fuel ${row.estimated_fuel_per_match}/match` : "",
    row.cycle_time ? `Cycle ${row.cycle_time}` : "",
    row.scoring_speed,
    row.climb_level ? `Climb ${row.climb_level}` : "",
    row.hopper_size ? `Hopper ${row.hopper_size}` : ""
  ]
    .filter((value) => value && value !== "Unknown")
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
    shift_1_alliance: entry.shift_1_alliance,
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
    estimated_fuel_per_match: Number(entry.estimated_fuel_per_match || 0),
    cycle_time: entry.cycle_time,
    scoring_speed: entry.scoring_speed,
    intake_style: entry.intake_style,
    shooter_type: entry.shooter_type,
    hopper_size: entry.hopper_size,
    climb_level: entry.climb_level,
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
    estimated_fuel_per_match: row.estimated_fuel_per_match,
    cycle_time: row.cycle_time,
    scoring_speed: row.scoring_speed,
    intake_style: row.intake_style,
    shooter_type: row.shooter_type,
    hopper_size: row.hopper_size,
    climb_level: row.climb_level,
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

    if (fields[0].tagName === "SELECT") {
      fields[0].value = String(value ?? "");
      syncCustomSelect(fields[0]);
      return;
    }

    fields[0].value = String(value ?? "");
  });

  if (form === elements.matchForm) {
    updateShiftFieldAvailability();
  } else if (form === elements.pitForm) {
    syncAutoPathBoardFromField();
  }
}

function bindFormValidation(form, kind) {
  if (!form) return;

  const validate = () => {
    if (!isFormValidationActive(form)) return;
    if (kind === "match") validateMatchForm({ apply: true });
    else validatePitForm({ apply: true });
  };

  form.addEventListener("input", validate);
  form.addEventListener("change", validate);
}

function activateFormValidation(form) {
  if (!form) return;
  form.dataset.validationActive = "true";
}

function deactivateFormValidation(form) {
  if (!form) return;
  delete form.dataset.validationActive;
  clearValidationState(form);
}

function isFormValidationActive(form) {
  return form?.dataset.validationActive === "true";
}

function clearValidationState(form) {
  if (!form) return;
  form
    .querySelectorAll(".field, .counter-card, .toggle-card")
    .forEach((target) => target.classList.remove("is-valid", "is-invalid"));
}

function setValidationState(target, valid, active) {
  if (!target) return;
  target.classList.remove("is-valid", "is-invalid");
  if (!active) return;
  target.classList.add(valid ? "is-valid" : "is-invalid");
}

function getFieldContainer(form, name) {
  const field = form?.querySelector(`[name="${name}"]`);
  return field?.closest(".field") || null;
}

function setFieldValidationState(form, name, valid, active) {
  setValidationState(getFieldContainer(form, name), valid, active);
}

function setToggleValidationState(form, name, valid, active) {
  const toggle = form?.querySelector(`[name="${name}"]`)?.closest(".toggle-card");
  setValidationState(toggle, valid, active);
}

function setCounterCardsValidationState(form, valid, active) {
  form?.querySelectorAll(".counter-card").forEach((card) => {
    setValidationState(card, valid, active);
  });
}

function focusFormValidationTarget(form, name) {
  if (!name) return;

  if (name === "shift_pattern" && elements.shiftPatternToggle) {
    elements.shiftPatternToggle.focus();
    return;
  }

  const field = form?.querySelector(`[name="${name}"]`);
  if (!field) return;

  if (field.tagName === "SELECT") {
    customSelectRegistry.get(field)?.trigger?.focus();
    return;
  }

  if (field.type === "radio" || field.type === "checkbox") {
    field.focus();
    return;
  }

  field.focus();
}

function hasMeaningfulText(value, minLength = 6) {
  return String(value || "").trim().length >= minLength;
}

function hasAutoPathDrawing(serialized) {
  return parseAutoPathDrawing(serialized).length > 0;
}

function hasMatchObservation(values) {
  const numericObservationFields = [
    "auto_fuel",
    "transition_fuel",
    "shift_1_fuel",
    "shift_2_fuel",
    "shift_3_fuel",
    "shift_4_fuel",
    "endgame_fuel",
    "penalty_count"
  ];

  if (numericObservationFields.some((field) => toNonNegativeInteger(values[field]) > 0)) {
    return true;
  }

  if (values.auto_tower_result !== "None" || values.endgame_tower_result !== "None") {
    return true;
  }

  if (clampInteger(values.defense_rating, 0, 5) !== MATCH_DEFAULTS.defense_rating) {
    return true;
  }

  if (values.breakdown || values.no_show) {
    return true;
  }

  return hasMeaningfulText(values.notes, 6);
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
  const allianceColor = normalizeAllianceColor(values.alliance_color ?? MATCH_DEFAULTS.alliance_color);
  const shiftPattern = normalizeShiftPattern(
    values.shift_pattern,
    values.shift_1_alliance,
    allianceColor
  );

  return {
    ...MATCH_DEFAULTS,
    ...values,
    scout_name: String(values.scout_name ?? MATCH_DEFAULTS.scout_name).trim(),
    team_number: normalizeNumericDraftValue(values.team_number),
    match_number: normalizeNumericDraftValue(values.match_number),
    alliance_color: allianceColor,
    shift_pattern: shiftPattern,
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
    estimated_fuel_per_match: normalizeNumericDraftValue(values.estimated_fuel_per_match),
    cycle_time: String(values.cycle_time ?? "").trim(),
    scoring_speed: String(values.scoring_speed ?? PIT_DEFAULTS.scoring_speed).trim(),
    intake_style: String(values.intake_style ?? PIT_DEFAULTS.intake_style).trim(),
    shooter_type: String(values.shooter_type ?? PIT_DEFAULTS.shooter_type).trim(),
    hopper_size: String(values.hopper_size ?? "").trim(),
    climb_level: String(values.climb_level ?? "").trim(),
    auto_summary: String(values.auto_summary ?? "").trim(),
    auto_path_drawing: String(values.auto_path_drawing ?? ""),
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

function normalizeAllianceColor(value) {
  return String(value || "").trim().toLowerCase() === "red" ? "Red" : "Blue";
}

function normalizeShiftPattern(value, legacyShift1Alliance, allianceColor) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "alternate") return "alternate";
  if (normalized === "team") return "team";

  if (legacyShift1Alliance) {
    return normalizeAllianceColor(legacyShift1Alliance) === allianceColor ? "team" : "alternate";
  }

  return MATCH_DEFAULTS.shift_pattern;
}

function getOpposingAlliance(allianceColor) {
  return normalizeAllianceColor(allianceColor) === "Red" ? "Blue" : "Red";
}

function getMatchShiftPatternValue(form = elements.matchForm) {
  const hiddenField = form?.querySelector('[name="shift_pattern"]');
  if (hiddenField) {
    return normalizeShiftPattern(hiddenField.value);
  }

  return normalizeShiftPattern(readRadioValue(form, "shift_pattern", MATCH_DEFAULTS.shift_pattern));
}

function setMatchShiftPatternValue(value, { dispatch = false } = {}) {
  const normalized = normalizeShiftPattern(value);

  if (elements.shiftPatternInput) {
    elements.shiftPatternInput.value = normalized;
  }

  syncShiftPatternToggle(normalized);

  if (dispatch && elements.shiftPatternInput) {
    elements.shiftPatternInput.dispatchEvent(new Event("input", { bubbles: true }));
    elements.shiftPatternInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return normalized;
}

function syncShiftPatternToggle(value = getMatchShiftPatternValue(elements.matchForm)) {
  if (!elements.shiftPatternToggle) return;

  const isAlternate = normalizeShiftPattern(value) === "alternate";
  elements.shiftPatternToggle.classList.toggle("is-active", isAlternate);
  elements.shiftPatternToggle.setAttribute("aria-pressed", isAlternate ? "true" : "false");
}

function getShift1Alliance(allianceColor, shiftPattern) {
  const selectedAlliance = normalizeAllianceColor(allianceColor);
  return shiftPattern === "alternate" ? getOpposingAlliance(selectedAlliance) : selectedAlliance;
}

function isTrackedShift(shiftNumber, shiftPattern) {
  const startOnTeam = normalizeShiftPattern(shiftPattern) === "team";
  return shiftNumber % 2 === 1 ? startOnTeam : !startOnTeam;
}

function updateShiftFieldAvailability() {
  if (!elements.matchForm) return;

  const shiftPattern = getMatchShiftPatternValue(elements.matchForm);
  const selectedAlliance = readRadioValue(elements.matchForm, "alliance_color", MATCH_DEFAULTS.alliance_color);
  const shift1Alliance = getShift1Alliance(selectedAlliance, shiftPattern);
  let valuesChanged = false;

  syncShiftPatternToggle(shiftPattern);

  [1, 2, 3, 4].forEach((shiftNumber) => {
    const active = isTrackedShift(shiftNumber, shiftPattern);
    const shiftAlliance = shiftNumber % 2 === 1 ? shift1Alliance : getOpposingAlliance(shift1Alliance);
    const card = elements.matchForm.querySelector(`[data-shift-card="${shiftNumber}"]`);
    const label = document.getElementById(`shift-${shiftNumber}-label`);
    const note = document.getElementById(`shift-${shiftNumber}-note`);
    const input = document.getElementById(`match-shift_${shiftNumber}_fuel`);
    const buttons = elements.matchForm.querySelectorAll(
      `[data-counter-target="match-shift_${shiftNumber}_fuel"]`
    );

    if (label) label.textContent = `Shift ${shiftNumber} · ${shiftAlliance}`;
    if (note) note.textContent = active ? "Your scoring shift" : "Opposing scoring shift";
    if (card) card.classList.toggle("counter-card--disabled", !active);

    if (input) {
      input.disabled = !active;
      if (!active && Number(input.value || 0) !== 0) {
        input.value = "0";
        valuesChanged = true;
      }
    }

    buttons.forEach((button) => {
      button.disabled = !active;
    });
  });

  if (valuesChanged) {
    saveStoredJson(STORAGE_KEYS.matchDraft, collectMatchValues());
  }
}

function normalizeShiftFuel(shiftNumber, values) {
  const fieldName = `shift_${shiftNumber}_fuel`;
  if (!isTrackedShift(shiftNumber, values.shift_pattern)) return 0;
  return toNonNegativeInteger(values[fieldName]);
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
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

function shouldQueueSyncError(error) {
  const message = normalizeError(error, "").toLowerCase();
  return (
    !message ||
    message.includes("offline") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("timed out")
  );
}

function isUniqueConflictError(error) {
  return error?.code === "23505";
}

function extractMissingColumnName(error, payload) {
  const message = normalizeError(error, "");
  const patterns = [
    /could not find the ['"]([^'"]+)['"] column/i,
    /column ['"]([^'"]+)['"] of relation/i,
    /column ['"]([^'"]+)['"] does not exist/i,
    /unknown column ['"]([^'"]+)['"]/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    const columnName = match?.[1];
    if (columnName && Object.prototype.hasOwnProperty.call(payload, columnName)) {
      return columnName;
    }
  }

  return "";
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
