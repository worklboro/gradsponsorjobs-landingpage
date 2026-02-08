/* eslint-disable no-console */

const form = document.getElementById("waitlistForm");
const submitBtn = document.getElementById("submitBtn");
const messageEl = document.getElementById("formMessage");
const successBox = document.getElementById("successBox");

const modal = document.getElementById("celebrationModal");
const modalCta = document.getElementById("modalCta");

function setMessage(type, text) {
  if (!messageEl) return;
  if (!text) {
    messageEl.hidden = true;
    messageEl.classList.remove("is-error", "is-success");
    messageEl.textContent = "";
    return;
  }
  messageEl.hidden = false;
  messageEl.classList.toggle("is-error", type === "error");
  messageEl.classList.toggle("is-success", type === "success");
  messageEl.textContent = text;
}

function setLoading(isLoading) {
  if (!submitBtn) return;
  submitBtn.classList.toggle("is-loading", isLoading);
  submitBtn.disabled = isLoading;
  submitBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function openModal() {
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  // Focus the CTA for a clear next action.
  if (modalCta) {
    window.setTimeout(() => modalCta.focus(), 0);
  }
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function setupModalEvents() {
  if (!modal) return;

  modal.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute("data-modal-close")) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });

  if (modalCta) {
    modalCta.addEventListener("click", () => closeModal());
  }
}

function setupSmoothScroll() {
  document.querySelectorAll("[data-scroll-to]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const targetId = el.getAttribute("data-scroll-to");
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      const firstField = target.querySelector("input, select, textarea, button");
      if (firstField instanceof HTMLElement) {
        window.setTimeout(() => firstField.focus(), 250);
      }
    });
  });
}

async function submitWaitlist(payload) {
  const res = await fetch("/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.status === 204) {
    return { ok: true, silent: true };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const message =
      body?.message ||
      "Something went wrong. Please try again in a moment.";
    throw new Error(message);
  }

  return body || { ok: true };
}

function getFormData() {
  const full_name = String(form.full_name?.value || "").trim();
  const email = String(form.email?.value || "").trim();
  const current_status = String(form.current_status?.value || "").trim();
  const target_role_category = String(form.target_role_category?.value || "").trim();
  const preferred_location = String(form.preferred_location?.value || "").trim();
  const sponsorship_need = String(form.sponsorship_need?.value || "").trim();
  const notes = String(form.notes?.value || "").trim();
  const consent = Boolean(form.consent?.checked);

  const honeypot = String(form.website?.value || "").trim();

  return {
    full_name,
    email,
    current_status,
    target_role_category,
    preferred_location,
    sponsorship_need,
    notes,
    consent,
    honeypot,
  };
}

function validate(data) {
  if (data.honeypot) return { ok: false, message: null, silent: true };
  if (!data.full_name) return { ok: false, message: "Please fill in all required fields." };
  if (!data.email || !isValidEmail(data.email)) return { ok: false, message: "Please enter a valid email." };
  if (!data.current_status) return { ok: false, message: "Please fill in all required fields." };
  if (!data.target_role_category) return { ok: false, message: "Please fill in all required fields." };
  if (!data.preferred_location) return { ok: false, message: "Please fill in all required fields." };
  if (!data.sponsorship_need) return { ok: false, message: "Please fill in all required fields." };
  if (!data.consent) return { ok: false, message: "Please tick the consent box to continue." };
  return { ok: true };
}

function buildPayload(data) {
  return {
    full_name: data.full_name,
    email: data.email,
    current_status: data.current_status,
    target_role_category: data.target_role_category,
    preferred_location: data.preferred_location,
    sponsorship_need: data.sponsorship_need,
    notes: data.notes,
    consent: data.consent,
    website: data.honeypot,
  };
}

function showSuccess() {
  setMessage("success", "You’re on the list — check your inbox soon.");
  if (successBox) successBox.hidden = false;
  openModal();
}

function resetUi() {
  setMessage(null, "");
  if (successBox) successBox.hidden = true;
}

function attachFormHandler() {
  if (!form) return;

  form.addEventListener("input", () => {
    // Keep the UX calm: only clear messages on user action.
    if (!messageEl?.hidden) setMessage(null, "");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    resetUi();

    const data = getFormData();
    const result = validate(data);

    if (!result.ok) {
      if (result.silent) return;
      setMessage("error", result.message || "Please fill in all required fields.");
      return;
    }

    setLoading(true);

    try {
      const payload = buildPayload(data);
      const response = await submitWaitlist(payload);
      if (response?.silent) return;

      form.reset();
      showSuccess();
    } catch (err) {
      console.error(err);
      setMessage(
        "error",
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again in a moment."
      );
    } finally {
      setLoading(false);
    }
  });
}

setupSmoothScroll();
setupModalEvents();
attachFormHandler();
