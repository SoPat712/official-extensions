(function () {
  function formatClock(date, timeZone, locale) {
    return date.toLocaleTimeString(locale || undefined, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  function formatOffset(date, timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en", {
        timeZone,
        timeZoneName: "shortOffset",
      }).formatToParts(date);
      return parts.find((part) => part.type === "timeZoneName")?.value || "";
    } catch {
      return "";
    }
  }

  function formatDate(date, timeZone, locale) {
    const dateStr = date.toLocaleDateString(locale || undefined, {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const offset = formatOffset(date, timeZone);
    return offset ? `${dateStr} (${offset})` : dateStr;
  }

  function tick(card) {
    const timeZone = card.dataset.timezone;
    if (!timeZone) return;

    const locale = card.dataset.locale || undefined;
    const now = new Date();
    const clock = card.querySelector("[data-plugin-time-clock]");
    const date = card.querySelector("[data-plugin-time-date]");

    if (clock) clock.textContent = formatClock(now, timeZone, locale);
    if (date) date.textContent = formatDate(now, timeZone, locale);
  }

  function initCard(card) {
    tick(card);
    if (card.dataset.pluginTimeInterval) return;

    const interval = window.setInterval(() => tick(card), 1000);
    card.dataset.pluginTimeInterval = String(interval);
  }

  function init() {
    document.querySelectorAll("[data-plugin-time-card]").forEach(initCard);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
