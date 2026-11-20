/* Ritual Studio · data client
   Talks to the studio's API (/api/*), which stores everything in the database.
   Used by the public timetable and booking (horario.js). */
(() => {
  const DIAS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DIAS_LONGOS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const LIVE = new Set(["confirmed", "awaiting-payment", "paid"]);

  /* Dates are plain "YYYY-MM-DD" strings in studio time (Kenya, UTC+3). */
  const deIso = (s) => new Date(`${s}T00:00:00`);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const diaSemana = (d) => ((d.getDay() + 6) % 7) + 1; // 1 = Monday
  const somarDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const inicio = (date, time) => new Date(`${date}T${time}:00+03:00`);
  const passou = (date, time) => inicio(date, time) < new Date();
  const dataLonga = (s) => deIso(s).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" });
  const dataCurta = (s) => deIso(s).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });

  async function api(path, { method = "GET", body, token } = {}) {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw Object.assign(new Error("Can't reach the studio's server. Check your connection and try again."), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Please try again."), { status: res.status });
    return data;
  }

  /* ── Public timetable ── */
  let horario = null;
  async function carregarHorario() {
    horario = await api("/api/timetable");
    return horario;
  }
  function diasPublicos() {
    if (!horario) return [];
    return Array.from({ length: horario.daysAhead }, (_, i) => somarDias(horario.today, i));
  }
  function aulasDoDia(date) {
    if (!horario) return [];
    const dow = diaSemana(deIso(date));
    return horario.classes.filter((c) => c.day === dow).map((c) => {
      const o = horario.occurrences[`${c.id}@${date}`] || { cancelled: false, reason: "", instructor: null, booked: 0 };
      return {
        aula: c, date, cancelled: o.cancelled, reason: o.reason, instructor: o.instructor || c.instructor || null,
        vagas: Math.max(0, c.capacity - o.booked), passou: passou(date, c.time),
        mesmoDia: date <= horario.today, // same-day bookings aren't allowed
      };
    });
  }
  const reservar = (dados) => api("/api/book", { method: "POST", body: dados });

  window.Reservas = {
    DIAS, DIAS_LONGOS, LIVE, deIso, iso, diaSemana, somarDias, inicio, passou, dataLonga, dataCurta, api,
    carregarHorario, diasPublicos, aulasDoDia, reservar,
    horario: () => horario,
  };
})();
