/* Ritual Studio · data layer (timetable, bookings, clients, payments, staff)

   PREVIEW: everything lives in this browser's localStorage.
   Built to be swapped for a real backend without touching the pages:
     - reads are synchronous, from an in-memory copy loaded once (`pronto`)
     - every change is async (returns a Promise), like a call to a server would be
   In phase 2, `carregar()` becomes a fetch and each change becomes a POST/PATCH. */
(() => {
  const S = window.SITE || {};
  const CHAVE = "ritual-studio:v2";
  const DIAS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DIAS_LONGOS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const novoId = () => Math.random().toString(36).slice(2, 10);
  const agora = () => new Date().toISOString();
  const normTel = (t) => {
    let d = String(t || "").replace(/\D/g, "");
    if (d.startsWith("254")) d = "0" + d.slice(3);
    return d;
  };

  /* ── seed ── */
  function semear() {
    const staff = (S.equipeExemplo || []).map((p) => ({ ...p }));
    const instrutor = staff.find((p) => p.role === "instructor");
    return {
      versao: 2,
      staff,
      classes: (S.horarioExemplo || []).map((c) => ({
        id: novoId(), level: "All levels", type: /mat/i.test(c.name) ? "mat" : "reformer",
        instructorId: instrutor ? instrutor.id : null, ...c,
      })),
      overrides: [],   // one-off changes to a single date: { classId, date, cancelled, reason, instructorId }
      bookings: [],
      clients: [],
      payments: [],
    };
  }

  let dados = null;
  const ouvintes = new Set();
  const avisar = () => ouvintes.forEach((fn) => { try { fn(dados); } catch (e) { console.error(e); } });

  function lerLocal() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE));
      if (d && d.versao === 2) return d;
    } catch (e) { /* storage blocked or corrupt */ }
    return null;
  }

  async function carregar() {
    dados = lerLocal() || semear();
    for (const k of ["staff", "classes", "overrides", "bookings", "clients", "payments"]) dados[k] = dados[k] || [];
    return dados;
  }

  async function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch (e) { /* private mode */ }
    avisar();
  }

  addEventListener("storage", (e) => {
    if (e.key === CHAVE) { const d = lerLocal(); if (d) { dados = d; avisar(); } }
  });

  /* ── dates ── */
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deIso = (s) => new Date(`${s}T00:00:00`);
  const diaSemana = (d) => ((d.getDay() + 6) % 7) + 1; // 1 = Monday
  const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const somarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const proximosDias = (n = 7) => Array.from({ length: n }, (_, i) => somarDias(hoje0(), i));
  const semanaDe = (d) => { const seg = somarDias(d, 1 - diaSemana(d)); seg.setHours(0, 0, 0, 0); return Array.from({ length: 7 }, (_, i) => somarDias(seg, i)); };
  const inicioDe = (time, data) => { const [h, m] = time.split(":").map(Number); const x = new Date(data); x.setHours(h, m, 0, 0); return x; };

  const VIVAS = new Set(["confirmed", "awaiting-payment", "paid"]);
  const conta = (b) => VIVAS.has(b.status);

  /* ── reads ── */
  const staffPor = (id) => dados.staff.find((p) => p.id === id) || null;
  const aulaPor = (id) => dados.classes.find((c) => c.id === id) || null;
  const clientePor = (id) => dados.clients.find((c) => c.id === id) || null;
  const override = (classId, date) => dados.overrides.find((o) => o.classId === classId && o.date === date) || null;

  function reservasDe(classId, date) {
    return dados.bookings.filter((b) => b.classId === classId && b.date === date);
  }

  function ocorrencia(aula, data) {
    const date = typeof data === "string" ? data : iso(data);
    const o = override(aula.id, date) || {};
    const todas = reservasDe(aula.id, date);
    const dentro = todas.filter(conta);
    const espera = todas.filter((b) => b.status === "waitlist").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const instructorId = o.instructorId || aula.instructorId || null;
    return {
      aula, date, key: `${aula.id}@${date}`,
      cancelled: !!o.cancelled, reason: o.reason || "",
      instructorId, instrutor: staffPor(instructorId), substituto: !!o.instructorId && o.instructorId !== aula.instructorId,
      reservas: dentro, espera, vagas: Math.max(0, aula.capacity - dentro.length),
      passou: inicioDe(aula.time, deIso(date)) < new Date(),
      inicio: inicioDe(aula.time, deIso(date)),
    };
  }

  function ocorrencias(data) {
    const dia = diaSemana(data);
    return dados.classes.filter((c) => c.day === dia)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((c) => ocorrencia(c, data));
  }

  function clientePorContato(phone, email) {
    const t = normTel(phone), e = String(email || "").trim().toLowerCase();
    return dados.clients.find((c) => (t && normTel(c.phone) === t) || (e && c.email && c.email.toLowerCase() === e)) || null;
  }

  function historico(clientId) {
    return dados.bookings.filter((b) => b.clientId === clientId).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }

  /* ── changes (async, like a server) ── */
  function garantirCliente({ name, phone, email, health, firstTime }) {
    let c = clientePorContato(phone, email);
    if (!c) {
      c = { id: novoId(), name, phone, email: email || "", health: "", notes: "", credits: 0, createdAt: agora(), firstTime: !!firstTime };
      dados.clients.push(c);
    } else {
      if (name) c.name = name;
      if (phone) c.phone = phone;
      if (email) c.email = email;
    }
    if (health && health.trim() && !c.health.includes(health.trim())) {
      c.health = c.health ? `${c.health}\n${health.trim()}` : health.trim();
    }
    return c;
  }

  function promoverPrimeiro(classId, date) {
    const oc = ocorrencia(aulaPor(classId), date);
    if (oc.vagas > 0 && oc.espera.length) {
      const b = oc.espera[0];
      b.status = b.payment === "studio" ? "confirmed" : "awaiting-payment";
      b.promotedAt = agora();
      return b;
    }
    return null;
  }

  const API = {
    DIAS, DIAS_LONGOS, iso, deIso, diaSemana, proximosDias, semanaDe, somarDias, hoje0, normTel,
    pronto: null,
    dados: () => dados,
    aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    staffPor, aulaPor, clientePor, ocorrencia, ocorrencias, reservasDe, clientePorContato, historico,
    contaComoReserva: conta,

    /* public booking */
    async reservar({ classId, date, name, phone, email, payment, health, firstTime, source = "online", status }) {
      const aula = aulaPor(classId);
      if (!aula) throw new Error("This class no longer exists.");
      const oc = ocorrencia(aula, date);
      if (oc.cancelled) throw new Error("This class has been cancelled.");
      const cliente = garantirCliente({ name, phone, email, health, firstTime });
      if (reservasDe(classId, date).some((b) => b.clientId === cliente.id && (conta(b) || b.status === "waitlist"))) {
        throw new Error("You're already booked into this class.");
      }
      const cheia = oc.vagas < 1;
      if (cheia && S.listaDeEspera === false) throw new Error("Sorry, this class just filled up.");
      const b = {
        id: novoId(), classId, date, clientId: cliente.id, name, phone, email: email || "", payment,
        className: aula.name, time: aula.time, health: health || "", firstTime: !!firstTime, source,
        status: status || (cheia ? "waitlist" : payment === "studio" ? "confirmed" : "awaiting-payment"),
        attendance: null, createdAt: agora(),
      };
      dados.bookings.push(b);
      await salvar();
      return b;
    },

    /* staff: bookings */
    async atualizarReserva(id, campos) {
      const b = dados.bookings.find((x) => x.id === id);
      if (b) { Object.assign(b, campos); await salvar(); }
      return b;
    },
    async cancelarReserva(id, por = "studio") {
      const b = dados.bookings.find((x) => x.id === id);
      if (!b) return null;
      b.status = "cancelled"; b.cancelledBy = por; b.cancelledAt = agora();
      const promovida = promoverPrimeiro(b.classId, b.date);
      await salvar();
      return promovida;
    },
    async restaurarReserva(id) {
      const b = dados.bookings.find((x) => x.id === id);
      if (!b) return;
      const oc = ocorrencia(aulaPor(b.classId), b.date);
      b.status = oc.vagas > 0 ? (b.payment === "studio" ? "confirmed" : "awaiting-payment") : "waitlist";
      await salvar();
    },
    async promover(id) {
      const b = dados.bookings.find((x) => x.id === id);
      if (!b) return;
      b.status = b.payment === "studio" ? "confirmed" : "awaiting-payment";
      b.promotedAt = agora();
      await salvar();
    },
    async marcarPresenca(id, valor) {
      const b = dados.bookings.find((x) => x.id === id);
      if (b) { b.attendance = b.attendance === valor ? null : valor; await salvar(); }
    },
    async usarCredito(bookingId) {
      const b = dados.bookings.find((x) => x.id === bookingId);
      const c = b && clientePor(b.clientId);
      if (!c || c.credits < 1) throw new Error("This client has no class credits left.");
      c.credits -= 1;
      b.status = "paid"; b.paidWith = "credit"; b.paidAt = agora();
      await salvar();
    },
    async registrarPagamento({ clientId, bookingId, amount, method, reference, kind, packageName, credits, staffId }) {
      const p = {
        id: novoId(), clientId, bookingId: bookingId || null, amount: Number(amount) || 0, method,
        reference: reference || "", kind: kind || (bookingId ? "class" : "package"), packageName: packageName || "",
        credits: Number(credits) || 0, staffId: staffId || null, date: agora(),
      };
      dados.payments.push(p);
      if (bookingId) {
        const b = dados.bookings.find((x) => x.id === bookingId);
        if (b) { b.status = "paid"; b.paidWith = method; b.paidAt = p.date; }
      }
      if (p.credits) { const c = clientePor(clientId); if (c) c.credits = (c.credits || 0) + p.credits; }
      await salvar();
      return p;
    },

    /* staff: clients */
    async atualizarCliente(id, campos) {
      const c = clientePor(id);
      if (c) { Object.assign(c, campos); await salvar(); }
      return c;
    },
    async adicionarNota(clientId, texto, staffId) {
      const c = clientePor(clientId);
      if (!c || !texto.trim()) return;
      c.log = c.log || [];
      c.log.unshift({ id: novoId(), text: texto.trim(), staffId, date: agora() });
      await salvar();
    },

    /* staff: timetable */
    async adicionarAula(aula) { const a = { id: novoId(), ...aula }; dados.classes.push(a); await salvar(); return a; },
    async atualizarAula(classId, campos) { const a = aulaPor(classId); if (a) { Object.assign(a, campos); await salvar(); } },
    async removerAula(classId) { dados.classes = dados.classes.filter((c) => c.id !== classId); await salvar(); },
    async mudarOcorrencia(classId, date, campos) {
      let o = override(classId, date);
      if (!o) { o = { classId, date }; dados.overrides.push(o); }
      Object.assign(o, campos);
      if (campos.cancelled) {
        for (const b of reservasDe(classId, date)) if (conta(b) || b.status === "waitlist") { b.status = "cancelled"; b.cancelledBy = "class-cancelled"; b.cancelledAt = agora(); }
      }
      if (!o.cancelled && !o.instructorId) dados.overrides = dados.overrides.filter((x) => x !== o);
      await salvar();
    },

    /* staff: team (preview login: real auth happens on the server in phase 2) */
    entrar(staffId, pin) {
      const p = staffPor(staffId);
      return p && String(p.pin) === String(pin) && p.active !== false ? p : null;
    },
    async adicionarStaff(p) { const n = { id: novoId(), active: true, ...p }; dados.staff.push(n); await salvar(); return n; },
    async atualizarStaff(id, campos) { const p = staffPor(id); if (p) { Object.assign(p, campos); await salvar(); } },

    async restaurarExemplo() { dados = semear(); await salvar(); },
  };

  API.pronto = carregar();
  window.Reservas = API;
})();
