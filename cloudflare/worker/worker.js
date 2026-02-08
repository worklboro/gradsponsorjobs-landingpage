const ALLOWED_ORIGINS = new Set([
  "https://gradsponsorjobs.com",
  "https://www.gradsponsorjobs.com",
]);

const UPSTREAM_TIMEOUT_MS = 7000;

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");

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

function jsonResponse(request, status, body) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...getCorsHeaders(request),
  };
  return new Response(JSON.stringify(body), { status, headers });
}

function noContent(request, status = 204) {
  const headers = {
    "Cache-Control": "no-store",
    ...getCorsHeaders(request),
  };
  return new Response(null, { status, headers });
}

function sanitiseString(value, maxLength) {
  const stringValue = typeof value === "string" ? value : "";
  const cleaned = stringValue
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...getCorsHeaders(request),
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname !== "/api/waitlist") {
      return jsonResponse(request, 404, { message: "Not found." });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: {
            ...getCorsHeaders(request),
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            Allow: "POST, OPTIONS",
          },
        }
      );
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonResponse(request, 400, {
        message: "Invalid request. Please try again.",
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(request, 400, {
        message: "Invalid request. Please try again.",
      });
    }

    const website = sanitiseString(body?.website, 255);
    if (website) {
      return noContent(request, 204);
    }

    const full_name = sanitiseString(body?.full_name, 80);
    const email = sanitiseString(body?.email, 120).toLowerCase();
    const current_status = sanitiseString(body?.current_status, 120);
    const target_role_category = sanitiseString(body?.target_role_category, 120);
    const preferred_location = sanitiseString(body?.preferred_location, 120);
    const sponsorship_need = sanitiseString(body?.sponsorship_need, 120);
    const notes = sanitiseString(body?.notes, 800);
    const consent = body?.consent === true;

    if (
      !full_name ||
      !email ||
      !current_status ||
      !target_role_category ||
      !preferred_location ||
      !sponsorship_need
    ) {
      return jsonResponse(request, 400, {
        message: "Please fill in all required fields.",
      });
    }

    if (!isValidEmail(email)) {
      return jsonResponse(request, 400, { message: "Please enter a valid email." });
    }

    if (!consent) {
      return jsonResponse(request, 400, {
        message: "Please tick the consent box to continue.",
      });
    }

    const endpoint = env?.SHEETDB_ENDPOINT;
    if (!endpoint) {
      return jsonResponse(request, 502, {
        message: "Something went wrong. Please try again in a moment.",
      });
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upstreamPayload),
        signal: controller.signal,
      });

      if (!upstreamRes.ok) {
        return jsonResponse(request, 502, {
          message: "Something went wrong. Please try again in a moment.",
        });
      }

      return jsonResponse(request, 200, { ok: true });
    } catch {
      return jsonResponse(request, 502, {
        message: "Something went wrong. Please try again in a moment.",
      });
    } finally {
      clearTimeout(timeoutId);
    }
  },
};

