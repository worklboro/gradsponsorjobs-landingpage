const ALLOWED_ORIGINS = new Set([
  "https://gradsponsorjobs.com",
  "https://www.gradsponsorjobs.com",
]);

const UPSTREAM_TIMEOUT_MS = 7000;
const WORKER_ID = "gradsponsorjobs-api-proxy";

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");

  // If no Origin header (curl/server-to-server), allow.
  if (!origin) {
    return {
      "Access-Control-Allow-Origin": "*",
      Vary: "Origin",
    };
  }

  if (ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    };
  }

  return {
    "Access-Control-Allow-Origin": "null",
    Vary: "Origin",
  };
}

function baseHeaders(request) {
  return {
    "Cache-Control": "no-store",
    "X-Worker": WORKER_ID,
    ...getCorsHeaders(request),
  };
}

function jsonResponse(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...baseHeaders(request),
    },
  });
}

function noContent(request, status = 204) {
  return new Response(null, {
    status,
    headers: {
      ...baseHeaders(request),
    },
  });
}

function sanitiseString(value, maxLength) {
  const stringValue = typeof value === "string" ? value : "";
  return stringValue
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function safeReadText(response, maxChars = 600) {
  try {
    const t = await response.text();
    return (t || "").slice(0, maxChars);
  } catch {
    return "";
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...baseHeaders(request),
          "Access-Control-Allow-Methods": "POST, GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Health/test endpoint (supports GET + HEAD so curl -I works)
    if (path === "/api/test") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return jsonResponse(request, 405, { message: "Method not allowed" });
      }
      return jsonResponse(request, 200, {
        ok: true,
        service: WORKER_ID,
        ts: new Date().toISOString(),
        hasSheetdb: Boolean(env?.SHEETDB_ENDPOINT),
      });
    }

    // Only handle /api/waitlist
    if (path !== "/api/waitlist") {
      if (path.startsWith("/api/")) {
        return jsonResponse(request, 404, { message: "Not found" });
      }
      return jsonResponse(request, 404, { message: "Not found" });
    }

    // Must be POST
    if (request.method !== "POST") {
      return jsonResponse(request, 405, { message: "Method not allowed" });
    }

    const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      return jsonResponse(request, 400, { message: "Invalid request. Please try again." });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(request, 400, { message: "Invalid request. Please try again." });
    }

    // Honeypot: silently succeed
    const website = sanitiseString(body?.website, 255);
    if (website) return noContent(request, 204);

    const full_name = sanitiseString(body?.full_name, 80);
    const email = sanitiseString(body?.email, 120).toLowerCase();
    const current_status = sanitiseString(body?.current_status, 120);
    const target_role_category = sanitiseString(body?.target_role_category, 120);
    const preferred_location = sanitiseString(body?.preferred_location, 120);
    const sponsorship_need = sanitiseString(body?.sponsorship_need, 120);
    const notes = sanitiseString(body?.notes, 800);

    // consent must be boolean true (matches your frontend)
    const consent = body?.consent === true;

    // Validate required
    if (!full_name || !email || !current_status || !target_role_category || !preferred_location || !sponsorship_need) {
      return jsonResponse(request, 400, { message: "Please fill in all required fields." });
    }
    if (!isValidEmail(email)) {
      return jsonResponse(request, 400, { message: "Please enter a valid email." });
    }
    if (!consent) {
      return jsonResponse(request, 400, { message: "Please tick the consent box to continue." });
    }

    const endpoint = env?.SHEETDB_ENDPOINT;
    if (!endpoint || typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
      // Log minimal info (no secret)
      console.log("Missing/invalid SHEETDB_ENDPOINT secret");
      return jsonResponse(request, 502, { message: "Something went wrong. Please try again in a moment." });
    }

    const submitted_at = new Date().toISOString();

    const upstreamPayload = {
      data: [
        {
          full_name,
          email,
          current_status,
          target_role_category,
          preferred_location,
          sponsorship_need,
          notes,
          consent: "yes",
          submitted_at,
        },
      ],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const upstreamRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(upstreamPayload),
        signal: controller.signal,
      });

      if (!upstreamRes.ok) {
        // SAFE DEBUG: status + short body snippet (doesn't expose the endpoint)
        const snippet = await safeReadText(upstreamRes);
        console.log("SheetDB non-OK:", upstreamRes.status, snippet);
        return jsonResponse(request, 502, { message: "We couldn’t save your request right now — please try again." });
      }

      // Optional: read body for logging, but not required
      return jsonResponse(request, 200, { ok: true });
    } catch (err) {
      // TIMEOUT or network error
      console.log("SheetDB fetch threw:", String(err));
      return jsonResponse(request, 502, { message: "We couldn’t save your request right now — please try again." });
    } finally {
      clearTimeout(timeoutId);
    }
  },
};
