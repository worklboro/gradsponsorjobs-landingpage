const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const DUPLICATE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 7000;

const rateLimitByIp = new Map();
const emailCooldowns = new Map();

const ALLOWED_CURRENT_STATUS = new Set([
  "International student (currently in the UK)",
  "International applicant (outside the UK)",
  "Graduate (already in the UK)",
  "Career switcher (needs sponsorship)",
  "Not sure / depends on the role",
]);

const ALLOWED_ROLE_CATEGORIES = new Set([
  "Software / IT",
  "Data / Analytics",
  "Engineering",
  "Finance",
  "Business / Ops",
  "Healthcare",
  "Other",
]);

const ALLOWED_LOCATIONS = new Set([
  "London",
  "Birmingham",
  "Manchester",
  "Leeds",
  "Glasgow",
  "Remote",
  "Any UK",
]);

const ALLOWED_SPONSORSHIP_NEED = new Set([
  "Yes — I need sponsorship",
  "No — I already have the right to work",
  "Not sure",
]);

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, "");
}

function sanitiseString(value, maxLength) {
  const stringValue = typeof value === "string" ? value : "";
  const cleaned = stripHtml(stringValue).replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLength);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getClientIp(req) {
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string" && xForwardedFor.length > 0) {
    return xForwardedFor.split(",")[0].trim();
  }

  const xRealIp = req.headers["x-real-ip"];
  if (typeof xRealIp === "string" && xRealIp.length > 0) {
    return xRealIp.trim();
  }

  return "unknown";
}

function cleanOldEntries(now) {
  for (const [ip, entry] of rateLimitByIp.entries()) {
    if (entry.resetAt <= now) {
      rateLimitByIp.delete(ip);
    }
  }

  for (const [email, timestamp] of emailCooldowns.entries()) {
    if (timestamp + DUPLICATE_COOLDOWN_MS <= now) {
      emailCooldowns.delete(email);
    }
  }
}

function applyRateLimit(ip, now) {
  const current = rateLimitByIp.get(ip);

  if (!current || current.resetAt <= now) {
    const next = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
    rateLimitByIp.set(ip, next);
    return {
      allowed: true,
      limit: RATE_LIMIT_MAX,
      remaining: RATE_LIMIT_MAX - 1,
      resetAt: next.resetAt,
    };
  }

  if (current.count >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      limit: RATE_LIMIT_MAX,
      remaining: 0,
      resetAt: current.resetAt,
    };
  }

  current.count += 1;
  return {
    allowed: true,
    limit: RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - current.count),
    resetAt: current.resetAt,
  };
}

function setRateHeaders(res, rateInfo) {
  res.setHeader("X-RateLimit-Limit", String(rateInfo.limit));
  res.setHeader("X-RateLimit-Remaining", String(rateInfo.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.floor(rateInfo.resetAt / 1000)));
}

function normaliseConsent(consent) {
  if (typeof consent === "boolean") return consent;
  if (typeof consent === "string") {
    const value = consent.trim().toLowerCase();
    return value === "yes" || value === "true";
  }
  return false;
}

function validateAndSanitise(payload) {
  const full_name = sanitiseString(payload?.full_name, 80);
  const email = sanitiseString(payload?.email, 120).toLowerCase();
  const current_status = sanitiseString(payload?.current_status, 80);
  const target_role_category = sanitiseString(payload?.target_role_category, 40);
  const preferred_location = sanitiseString(payload?.preferred_location, 40);
  const sponsorship_need = sanitiseString(payload?.sponsorship_need, 80);
  const notes = sanitiseString(payload?.notes, 800);
  const consent = normaliseConsent(payload?.consent);
  const website = sanitiseString(payload?.website, 255);

  if (website) {
    return { honeypot: true };
  }

  if (full_name.length < 2 || full_name.length > 80) {
    return { error: "Please enter your full name (2 to 80 characters)." };
  }

  if (!email || email.length > 120 || !isValidEmail(email)) {
    return { error: "Please enter a valid email address." };
  }

  if (!ALLOWED_CURRENT_STATUS.has(current_status)) {
    return { error: "Please select a valid current status." };
  }

  if (!ALLOWED_ROLE_CATEGORIES.has(target_role_category)) {
    return { error: "Please select a valid target role category." };
  }

  if (!ALLOWED_LOCATIONS.has(preferred_location)) {
    return { error: "Please select a valid preferred location." };
  }

  if (!ALLOWED_SPONSORSHIP_NEED.has(sponsorship_need)) {
    return { error: "Please select a valid sponsorship need." };
  }

  if (!consent) {
    return { error: "Please agree to the Privacy Policy and Terms to continue." };
  }

  return {
    data: {
      full_name,
      email,
      current_status,
      target_role_category,
      preferred_location,
      sponsorship_need,
      notes,
      consent: "yes",
    },
  };
}

async function forwardToSheetDB(row) {
  const endpoint = process.env.SHEETDB_ENDPOINT;
  if (!endpoint) {
    throw new Error("Missing SHEETDB_ENDPOINT environment variable");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: [row] }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`SheetDB responded with ${response.status}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed." });
  }

  const now = Date.now();
  cleanOldEntries(now);

  const ip = getClientIp(req);
  const rateInfo = applyRateLimit(ip, now);
  setRateHeaders(res, rateInfo);

  if (!rateInfo.allowed) {
    return res.status(429).json({
      ok: false,
      message: "Too many requests. Please wait a few minutes and try again.",
    });
  }

  const validation = validateAndSanitise(req.body || {});

  if (validation.honeypot) {
    return res.status(204).end();
  }

  if (validation.error) {
    return res.status(400).json({ ok: false, message: validation.error });
  }

  const emailKey = validation.data.email;
  const lastSubmittedAt = emailCooldowns.get(emailKey);
  if (lastSubmittedAt && now - lastSubmittedAt < DUPLICATE_COOLDOWN_MS) {
    return res.status(409).json({
      ok: false,
      message:
        "Looks like you’ve already joined recently — thank you! If you didn’t get a confirmation, try again tomorrow.",
    });
  }

  const row = {
    ...validation.data,
    submitted_at: new Date().toISOString(),
  };

  try {
    await forwardToSheetDB(row);
    emailCooldowns.set(emailKey, now);

    return res.status(200).json({
      ok: true,
      message: "Thanks — you’re on the early access list.",
    });
  } catch (error) {
    console.error("waitlist proxy error", error);
    return res.status(502).json({
      ok: false,
      message: "We couldn’t save your request right now — please try again in a moment.",
    });
  }
};
