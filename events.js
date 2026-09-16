const FALLBACK_EVENTS = [
  { id: "seed-20260920", date: "2026-09-20", title: "Fecha ocupada", category: "Evento agendado" },
  { id: "seed-20260926", date: "2026-09-26", title: "Fecha ocupada", category: "Evento agendado" }
];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    "x-content-type-options": "nosniff"
  }
});

function unfoldIcs(text) {
  return String(text || "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function parseDateValue(line) {
  const i = line.indexOf(":");
  if (i < 0) return null;
  const value = line.slice(i + 1).trim();
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function toUtcDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
}

function fromUtcDay(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addBusyRange(target, start, endExclusive, uid) {
  const startMs = toUtcDay(start);
  if (!Number.isFinite(startMs)) return;
  const endMs = Number.isFinite(toUtcDay(endExclusive)) ? toUtcDay(endExclusive) : startMs + 86400000;
  const cappedEnd = Math.min(Math.max(endMs, startMs + 86400000), startMs + 31 * 86400000);
  for (let ms = startMs; ms < cappedEnd; ms += 86400000) {
    const date = fromUtcDay(ms);
    target.push({ id: `${uid || "gcal"}-${date}`, date, title: "Fecha ocupada", category: "Evento agendado" });
  }
}

function parseCalendar(ics) {
  const lines = unfoldIcs(ics);
  const out = [];
  let inEvent = false;
  let current = {};

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { inEvent = true; current = {}; continue; }
    if (line === "END:VEVENT") {
      if (inEvent && current.start && String(current.status || "").toUpperCase() !== "CANCELLED") {
        addBusyRange(out, current.start, current.end, current.uid);
      }
      inEvent = false; current = {}; continue;
    }
    if (!inEvent) continue;
    if (line.startsWith("DTSTART")) current.start = parseDateValue(line);
    else if (line.startsWith("DTEND")) current.end = parseDateValue(line);
    else if (line.startsWith("UID:")) current.uid = line.slice(4).trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    else if (line.startsWith("STATUS:")) current.status = line.slice(7).trim();
  }

  const unique = new Map();
  for (const ev of out) if (!unique.has(ev.date)) unique.set(ev.date, ev);
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function onRequestGet({ env }) {
  const url = String(env.GOOGLE_CALENDAR_ICS_URL || "").trim();
  if (!url) return json({ events: FALLBACK_EVENTS, source: "fallback", configured: false });

  try {
    const response = await fetch(url, { headers: { "user-agent": "GrupoImperioAgenda/1.0" } });
    if (!response.ok) throw new Error(`Google Calendar respondió ${response.status}`);
    const events = parseCalendar(await response.text());
    return json({ events, source: "google-calendar", configured: true });
  } catch (error) {
    return json({ events: FALLBACK_EVENTS, source: "fallback", configured: true, warning: "No fue posible sincronizar Google Calendar en este momento." });
  }
}

export async function onRequest() {
  return json({ error: "Método no permitido." }, 405);
}
