import { corsHeaders } from "../_shared/cors.ts";

const TBA_API_BASE = "https://www.thebluealliance.com/api/v3";
const DEFAULT_TEAM_KEY = "frc10312";
const MIN_YEAR = 1992;
const MAX_YEAR = 2100;

type ErrorDetails = {
  status?: number;
  error: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const tbaAuthKey = Deno.env.get("TBA_AUTH_KEY");
  if (!tbaAuthKey) {
    return jsonResponse({ error: "Missing Supabase secret TBA_AUTH_KEY." }, 500);
  }

  const requestUrl = new URL(request.url);
  const mode = requestUrl.searchParams.get("mode");
  const teamKey = normalizeTeamKey(Deno.env.get("TBA_TEAM_KEY") || DEFAULT_TEAM_KEY);

  try {
    if (mode === "events") {
      const season = parseSeason(requestUrl.searchParams.get("season"));
      const events = await fetchBlueAllianceJson(`/team/${encodeURIComponent(teamKey)}/events/${season}/simple`, tbaAuthKey);
      return jsonResponse({ teamKey, season, events });
    }

    if (mode === "matches") {
      const eventKey = parseEventKey(requestUrl.searchParams.get("eventKey"));
      const matches = await fetchBlueAllianceJson(`/team/${encodeURIComponent(teamKey)}/event/${encodeURIComponent(eventKey)}/matches`, tbaAuthKey);
      return jsonResponse({ teamKey, eventKey, matches });
    }

    if (mode === "alliances") {
      const eventKey = parseEventKey(requestUrl.searchParams.get("eventKey"));
      const alliances = await fetchBlueAllianceJson(`/event/${encodeURIComponent(eventKey)}/alliances`, tbaAuthKey);
      return jsonResponse({ eventKey, alliances });
    }

    if (mode === "team_media") {
      const eventKey = requestUrl.searchParams.get("eventKey");
      const teamKeyParam = requestUrl.searchParams.get("teamKey");
      const year = requestUrl.searchParams.get("year");

      if (eventKey) {
        const parsedEventKey = parseEventKey(eventKey);
        const media = await fetchBlueAllianceJson(`/event/${encodeURIComponent(parsedEventKey)}/team_media`, tbaAuthKey);
        return jsonResponse({ eventKey: parsedEventKey, media });
      }

      if (teamKeyParam && year) {
        const parsedTeamKey = normalizeTeamKey(teamKeyParam);
        const parsedYear = parseSeason(year);
        const media = await fetchBlueAllianceJson(`/team/${encodeURIComponent(parsedTeamKey)}/media/${parsedYear}`, tbaAuthKey);
        return jsonResponse({ teamKey: parsedTeamKey, year: parsedYear, media });
      }

      return jsonResponse({ error: "team_media mode requires either eventKey or both teamKey and year parameters." }, 400);
    }

    return jsonResponse({ error: "Expected mode=events, mode=matches, mode=alliances, or mode=team_media." }, 400);
  } catch (error) {
    const details = normalizeError(error);
    return jsonResponse({ error: details.error }, details.status || 500);
  }
});

async function fetchBlueAllianceJson(path: string, authKey: string) {
  const upstream = await fetch(`${TBA_API_BASE}${path}`, {
    headers: {
      "X-TBA-Auth-Key": authKey,
      Accept: "application/json"
    }
  });

  if (!upstream.ok) {
    if (upstream.status === 401) {
      throw { status: 502, error: "The Blue Alliance rejected the configured auth key." } satisfies ErrorDetails;
    }

    if (upstream.status === 404) {
      throw { status: 404, error: "The requested Blue Alliance resource was not found." } satisfies ErrorDetails;
    }

    throw { status: 502, error: `The Blue Alliance returned ${upstream.status}.` } satisfies ErrorDetails;
  }

  return upstream.json();
}

function parseSeason(value: string | null) {
  const season = Number(value);
  if (!Number.isInteger(season) || season < MIN_YEAR || season > MAX_YEAR) {
    throw { status: 400, error: "A valid season query parameter is required." } satisfies ErrorDetails;
  }

  return season;
}

function parseEventKey(value: string | null) {
  const eventKey = String(value || "").trim().toLowerCase();
  if (!/^\d{4}[a-z0-9_-]+$/.test(eventKey)) {
    throw { status: 400, error: "A valid eventKey query parameter is required." } satisfies ErrorDetails;
  }

  return eventKey;
}

function normalizeTeamKey(value: string) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (/^frc[a-z0-9]+$/.test(trimmed)) {
    return trimmed;
  }

  return DEFAULT_TEAM_KEY;
}

function normalizeError(error: unknown): ErrorDetails {
  if (typeof error === "object" && error && "error" in error) {
    const details = error as ErrorDetails;
    return {
      status: details.status || 500,
      error: typeof details.error === "string" ? details.error : "Unexpected proxy error."
    };
  }

  if (error instanceof Error && error.message) {
    return { status: 500, error: error.message };
  }

  return { status: 500, error: "Unexpected proxy error." };
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
