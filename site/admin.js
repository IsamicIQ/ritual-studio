/* Ritual Studio · staff admin
   Sign-in: Clerk. Data: /api/admin (the studio's database). */
(() => {
  const S = window.SITE || {};
  const R = window.Reservas;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const PAG = { mpesa: "M-Pesa", card: "Card", studio: "At the studio", cash: "Cash", credit: "Class credit" };
  const STATUS = { confirmed: "Confirmed", "awaiting-payment": "Awaiting payment", paid: "Paid", cancelled: "Cancelled", waitlist: "Waitlist" };
  const PAPEL = { owner: "Owner", manager: "Manager", instructor: "Instructor" };
  const RANK = { instructor: 1, manager: 2, owner: 3 };
  const KES = (n) => Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 });

  let D = null;           // everything from /api/admin
  let diaAtual = null;    // date shown on "Today"
  let logado = false;

  const pode = (papel) => !!D && RANK[D.me.role] >= RANK[papel];
  const vivo = (b) => R.LIVE.has(b.status);

  /* ── Messages ── */
  const aviso = $("[data-aviso]");
  let avisoT = 0;
  function avisar(msg, tipo = "ok") {
    aviso.textContent = msg;
    aviso.className = `aviso-flutuante aviso--${tipo}`;
    aviso.hidden = false;
    clearTimeout(avisoT);
    avisoT = setTimeout(() => (aviso.hidden = true), tipo === "erro" ? 7000 : 4000);
  }

  /* ── API ── */
  const token = async () => (window.Clerk && window.Clerk.session ? window.Clerk.session.getToken() : null);
  async function carregar() {
    D = await R.api("/api/admin", { token: await token() });
    if (!diaAtual) diaAtual = D.today;
    desenhar();
  }
  async function acao(op, args = {}, ok) {
    try {
      const r = await R.api("/api/admin", { method: "POST", body: { op, ...args }, token: await token() });
      D = r.data;
      desenhar();
      const msg = typeof ok === "function" ? ok(r.result) : ok;
      if (msg) avisar(msg);
      return r.result;
    } catch (e) {
      avisar(e.message, "erro");
      throw e;
    }
  }
  const tentar = (p) => p.catch(() => {});

  /* ── Lookups ── */
  const staffPor = (id) => (D.staff.find((p) => p.id === id) || null);
  const clientePor = (id) => (D.clients.find((c) => c.id === id) || null);
  const aulaPor = (id) => (D.classes.find((c) => c.id === id) || null);
  const nomeStaff = (id) => (staffPor(id) || {}).name || "";
  const primeiroNome = (n) => String(n || "").split(" ")[0];

  function ocorrencia(c, date) {
    const o = D.overrides.find((x) => x.classId === c.id && x.date === date) || {};
    const todas = D.bookings.filter((b) => b.classId === c.id && b.date === date);
    const dentro = todas.filter(vivo).sort((a, b) => a.name.localeCompare(b.name));
    const espera = todas.filter((b) => b.status === "waitlist").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const canceladas = todas.filter((b) => b.status === "cancelled");
    return {
      aula: c, date, cancelled: !!o.cancelled, reason: o.reason || "",
      overrideInstructor: o.instructorId || null, instructorId: o.instructorId || c.instructorId || null,
      dentro, espera, canceladas, vagas: Math.max(0, c.capacity - dentro.length),
    };
  }
  function ocorrencias(date) {
    const dow = R.diaSemana(R.deIso(date));
    return D.classes
      .filter((c) => c.day === dow && (c.active || D.bookings.some((b) => b.classId === c.id && b.date === date)))
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((c) => ocorrencia(c, date));
  }

  /* ── Shared bits of markup ── */
  const selo = (b) => `<span class="selo selo--${esc(b.status)}">${esc(STATUS[b.status] || b.status)}</span>`;
  const pagamentoTexto = (b) => b.status === "paid" ? `Paid · ${esc(PAG[b.paidWith] || b.paidWith || "")}` : esc(PAG[b.payment] || b.payment);
  const quando = (b) => `${esc(R.dataCurta(b.date))} · ${esc(b.time)}`;

  function acoesReserva(b) {
    if (!pode("manager")) return "";
    const c = clientePor(b.clientId);
    const bts = [];
    if (b.status === "waitlist") bts.push(`<button type="button" class="mini" data-acao="promover" data-id="${esc(b.id)}">Move into class</button>`);
    if (b.status === "confirmed" || b.status === "awaiting-payment") {
      bts.push(`<button type="button" class="mini" data-acao="pagar" data-id="${esc(b.id)}">Mark paid</button>`);
      if (c && c.credits > 0) bts.push(`<button type="button" class="mini" data-acao="credito" data-id="${esc(b.id)}">Use credit (${esc(c.credits)})</button>`);
    }
    if (b.status !== "cancelled") bts.push(`<button type="button" class="mini mini--perigo" data-acao="cancelar" data-id="${esc(b.id)}">Cancel</button>`);
    else if (b.date >= D.today && b.cancelledBy === "studio") bts.push(`<button type="button" class="mini" data-acao="restaurar" data-id="${esc(b.id)}">Restore</button>`);
    return bts.join("");
  }

  function presenca(b) {
    if (!vivo(b) || b.date > D.today) return "";
    const bt = (v, txt) => `<button type="button" class="mini mini--presenca${b.attendance === v ? " ativo" : ""}" data-presenca="${v}" data-id="${esc(b.id)}" aria-pressed="${b.attendance === v}">${txt}</button>`;
    return `<span class="presenca">${bt("attended", "Came")}${bt("no-show", "No-show")}</span>`;
  }

  const clienteLink = (b) => `<button type="button" class="link-cliente" data-cliente="${esc(b.clientId)}">${esc(b.name)}</button>`;

  function etiquetas(b) {
    const c = clientePor(b.clientId);
    const saude = (c && c.health) || b.health;
    return `${b.firstTime ? `<span class="tag">First visit</span>` : ""}${saude ? `<small class="saude" title="Health notes">⚑ ${esc(saude)}</small>` : ""}`;
  }

  /* ── Today ── */
  function desenharDia() {
    const date = diaAtual;
    $("[data-dia-titulo]").textContent = date === D.today ? "Today" : R.dataLonga(date);
    $("[data-dia-escolha]").value = date;
    const lista = ocorrencias(date);
    const alvo = $("[data-dia-aulas]");
    if (!lista.length) {
      alvo.innerHTML = `<p class="vazio">No classes on ${esc(R.dataLonga(date))}.</p>`;
      return;
    }
    const ativos = D.staff.filter((p) => p.active);
    alvo.innerHTML = lista.map((o) => {
      const a = o.aula;
      const inst = staffPor(o.instructorId);
      const contagem = `${o.dentro.length} of ${a.capacity} booked${o.espera.length ? ` · ${o.espera.length} waiting` : ""}`;
      const seletor = pode("manager") && !o.cancelled ? `
        <label class="mini-campo">Instructor
          <select data-sub data-classe="${esc(a.id)}" data-date="${esc(o.date)}">
            <option value="">${a.instructorId ? "—" : "Not set"}</option>
            ${ativos.map((p) => `<option value="${esc(p.id)}" ${p.id === o.instructorId ? "selected" : ""}>${esc(p.name)}${p.id === a.instructorId ? " (usual)" : ""}</option>`).join("")}
          </select>
        </label>` : inst ? `<span class="mini-campo">With ${esc(inst.name)}</span>` : "";
      const botaoAula = !pode("manager") ? "" : o.cancelled
        ? `<button type="button" class="mini" data-reativar data-classe="${esc(a.id)}" data-date="${esc(o.date)}">Reinstate class</button>`
        : `<button type="button" class="mini mini--perigo" data-cancelar-aula data-classe="${esc(a.id)}" data-date="${esc(o.date)}">Cancel class</button>`;

      const linhas = o.dentro.map((b) => `
        <tr>
          <td>${clienteLink(b)}${etiquetas(b)}<small>${esc(b.phone)}</small></td>
          <td>${selo(b)}<small>${pagamentoTexto(b)}</small></td>
          <td>${presenca(b)}</td>
          <td class="acoes">${acoesReserva(b)}</td>
        </tr>`).join("");
      const espera = o.espera.length ? `
        <h4 class="sub-titulo">Waitlist</h4>
        <ol class="espera">${o.espera.map((b) => `
          <li><span>${clienteLink(b)} <small>${esc(b.phone)}</small></span><span class="acoes">${acoesReserva(b)}</span></li>`).join("")}
        </ol>` : "";
      const avisados = o.cancelled && o.canceladas.length ? `
        <h4 class="sub-titulo">Booked before the class was cancelled: let them know</h4>
        <ul class="espera">${o.canceladas.filter((b) => b.cancelledBy === "class-cancelled").map((b) => `
          <li><span>${clienteLink(b)} <small>${esc(b.phone)}${b.email ? ` · ${esc(b.email)}` : ""}</small></span></li>`).join("")}
        </ul>` : "";

      return `
        <article class="aula-card${o.cancelled ? " aula-card--cancelada" : ""}${R.passou(o.date, a.time) ? " aula-card--passou" : ""}">
          <header class="aula-card-topo">
            <div class="aula-card-nome">
              <time>${esc(a.time)}</time>
              <div><strong>${esc(a.name)}</strong>${a.active ? "" : ` <span class="tag">Removed from timetable</span>`}
                <span>${esc(a.duration)} min · ${esc(contagem)}${o.overrideInstructor && o.overrideInstructor !== a.instructorId ? ` · <span class="tag">Substitute</span>` : ""}</span></div>
            </div>
            <div class="aula-card-acoes">${seletor}${botaoAula}</div>
          </header>
          ${o.cancelled ? `<p class="aula-cancelada">Cancelled${o.reason ? `: ${esc(o.reason)}` : ""}. The website shows this class as cancelled.</p>` : ""}
          ${o.dentro.length ? `<div class="tabela-rolagem"><table class="tabela tabela--lista"><tbody>${linhas}</tbody></table></div>`
            : o.cancelled ? "" : `<p class="vazio vazio--pequeno">No bookings yet.</p>`}
          ${espera}${avisados}
        </article>`;
    }).join("");
  }

  $$("[data-dia]").forEach((b) => b.addEventListener("click", () => {
    const n = Number(b.dataset.dia);
    diaAtual = n === 0 ? D.today : R.somarDias(diaAtual, n);
    desenharDia();
  }));
  $("[data-dia-escolha]").addEventListener("change", (e) => { if (e.target.value) { diaAtual = e.target.value; desenharDia(); } });

  $("[data-dia-aulas]").addEventListener("change", (e) => {
    const s = e.target.closest("[data-sub]");
    if (!s) return;
    const a = aulaPor(s.dataset.classe);
    const v = s.value || null;
    tentar(acao("occurrence.set", { classId: a.id, date: s.dataset.date, cancelled: false, instructorId: v && v !== a.instructorId ? v : null },
      v && v !== a.instructorId ? `${nomeStaff(v)} is covering ${a.name}.` : `${a.name} is back with its usual instructor.`));
  });

  $("[data-dia-aulas]").addEventListener("click", (e) => {
    const c = e.target.closest("[data-cancelar-aula]");
    if (c) {
      const o = ocorrencia(aulaPor(c.dataset.classe), c.dataset.date);
      const n = o.dentro.length + o.espera.length;
      const motivo = prompt(`Cancel ${o.aula.name} on ${R.dataLonga(o.date)}?${n ? `\n\n${n} booking${n === 1 ? "" : "s"} will be cancelled, so let ${n === 1 ? "that client" : "those clients"} know.` : ""}\n\nReason shown on the website (optional):`, "");
      if (motivo === null) return;
      tentar(acao("occurrence.set", { classId: o.aula.id, date: o.date, cancelled: true, reason: motivo.trim(), instructorId: o.overrideInstructor },
        (r) => `Class cancelled.${r.cancelledBookings ? ` ${r.cancelledBookings} booking${r.cancelledBookings === 1 ? " was" : "s were"} cancelled: their contacts are listed under the class.` : ""}`));
      return;
    }
    const r = e.target.closest("[data-reativar]");
    if (r && confirm("Put this class back on the timetable for this date? Cancelled bookings stay cancelled; add people back with Add booking.")) {
      tentar(acao("occurrence.set", { classId: r.dataset.classe, date: r.dataset.date, cancelled: false, instructorId: null }, "Class reinstated."));
    }
  });

  /* ── Bookings ── */
  const filtro = $("[data-filtro]");
  const buscaReservas = $("[data-busca-reservas]");
  filtro.addEventListener("change", desenharReservas);
  buscaReservas.addEventListener("input", desenharReservas);

  function bate(texto, ...campos) {
    const q = texto.trim().toLowerCase();
    if (!q) return true;
    const qd = q.replace(/\D/g, "");
    return campos.some((c) => String(c || "").toLowerCase().includes(q) || (qd.length >= 3 && String(c || "").replace(/\D/g, "").includes(qd)));
  }

  function desenharReservas() {
    const f = filtro.value, hoje = D.today;
    let lista = D.bookings.filter((b) => {
      if (!bate(buscaReservas.value, b.name, b.phone, b.email, b.className)) return false;
      switch (f) {
        case "all": return true;
        case "cancelled": return b.status === "cancelled";
        case "today": return b.date === hoje && b.status !== "cancelled";
        case "awaiting-payment": return b.status === "awaiting-payment";
        case "waitlist": return b.status === "waitlist" && b.date >= hoje;
        case "past": return b.date < hoje && b.status !== "cancelled";
        default: return b.date >= hoje && b.status !== "cancelled";
      }
    });
    const desc = f === "past" || f === "cancelled" || f === "all";
    lista.sort((a, b) => (desc ? -1 : 1) * (a.date + a.time).localeCompare(b.date + b.time));
    const corte = lista.length > 300;
    lista = lista.slice(0, 300);
    const corpo = $("[data-reservas]");
    if (!lista.length) {
      corpo.innerHTML = `<tr><td colspan="6" class="vazio-tabela">No bookings here.</td></tr>`;
      return;
    }
    corpo.innerHTML = lista.map((b) => `
      <tr>
        <td><strong>${esc(b.className)}</strong>${b.source === "studio" ? `<small>Added by staff</small>` : ""}</td>
        <td>${quando(b)}</td>
        <td>${clienteLink(b)}${etiquetas(b)}<small>${esc(b.phone)}${b.email ? ` · ${esc(b.email)}` : ""}</small></td>
        <td>${pagamentoTexto(b)}</td>
        <td>${selo(b)}${b.attendance ? `<small>${b.attendance === "attended" ? "Came" : "No-show"}</small>` : ""}</td>
        <td class="acoes">${acoesReserva(b)}</td>
      </tr>`).join("") + (corte ? `<tr><td colspan="6" class="vazio-tabela">Showing the first 300. Search to narrow it down.</td></tr>` : "");
  }

  /* Booking buttons, wherever they appear */
  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-presenca]");
    if (p) {
      const b = D.bookings.find((x) => x.id === p.dataset.id);
      tentar(acao("booking.attendance", { id: b.id, value: b.attendance === p.dataset.presenca ? null : p.dataset.presenca }));
      return;
    }
    const cl = e.target.closest("[data-cliente]");
    if (cl) { abrirCliente(cl.dataset.cliente); return; }
    const a = e.target.closest("[data-acao]");
    if (!a) return;
    const b = D.bookings.find((x) => x.id === a.dataset.id);
    if (!b) return;
    const nome = primeiroNome(b.name);
    switch (a.dataset.acao) {
      case "pagar": abrirPagamento({ booking: b }); break;
      case "credito":
        tentar(acao("booking.useCredit", { id: b.id }, `Paid with a class credit. ${nome} has ${Math.max(0, (clientePor(b.clientId)?.credits || 1) - 1)} left.`));
        break;
      case "cancelar":
        if (confirm(`Cancel ${b.name}'s booking for ${b.className} on ${R.dataLonga(b.date)}?${b.status !== "waitlist" ? " The spot goes to the first person on the waitlist, if there is one." : ""}`)) {
          tentar(acao("booking.cancel", { id: b.id }, (r) => r.promoted ? `Cancelled. ${r.promoted.name} moved off the waitlist into the class: let them know.` : "Booking cancelled."));
        }
        break;
      case "restaurar":
        tentar(acao("booking.restore", { id: b.id }, (r) => r.status === "waitlist" ? "The class is full, so the booking went back on the waitlist." : "Booking restored."));
        break;
      case "promover":
        tentar(acao("booking.promote", { id: b.id }, `${nome} is in the class: let them know.`));
        break;
    }
  });

  /* ── Timetable ── */
  const opcoesStaff = (sel, vazio = "No instructor") => `<option value="">${vazio}</option>` +
    D.staff.filter((p) => p.active || p.id === sel).map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? "selected" : ""}>${esc(p.name)}</option>`).join("");

  $("#n-dia").innerHTML = R.DIAS_LONGOS.slice(1).map((d, i) => `<option value="${i + 1}">${d}</option>`).join("");

  $("[data-nova]").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    if (!f.name.value.trim()) return f.name.focus();
    tentar(acao("class.add", {
      day: Number(f.day.value), time: f.time.value, name: f.name.value.trim(), type: f.type.value,
      duration: Number(f.duration.value), capacity: Number(f.capacity.value), instructorId: f.instructorId.value || null,
    }, `${f.name.value.trim()} added to ${R.DIAS_LONGOS[f.day.value]}s.`).then(() => { f.name.value = ""; }));
  });

  function desenharSemana() {
    const editar = pode("manager");
    const novoInst = $("[data-instrutores]");
    const escolhido = novoInst.value;
    novoInst.innerHTML = opcoesStaff("");
    novoInst.value = escolhido;
    $("[data-semana]").innerHTML = R.DIAS_LONGOS.slice(1).map((nome, i) => {
      const doDia = D.classes.filter((c) => c.active && c.day === i + 1).sort((a, b) => a.time.localeCompare(b.time));
      return `
        <div class="semana-dia">
          <h3>${nome}</h3>
          ${doDia.length ? doDia.map((c) => editar ? `
            <div class="semana-aula semana-aula--edita" data-classe="${esc(c.id)}">
              <input type="time" value="${esc(c.time)}" data-campo="time" data-foco="${esc(c.id)}-time" aria-label="Start time">
              <input value="${esc(c.name)}" data-campo="name" data-foco="${esc(c.id)}-name" aria-label="Class name">
              <label>Min <input type="number" min="10" max="240" step="5" value="${esc(c.duration)}" data-campo="duration" data-foco="${esc(c.id)}-duration"></label>
              <label>Spots <input type="number" min="1" max="100" value="${esc(c.capacity)}" data-campo="capacity" data-foco="${esc(c.id)}-capacity"></label>
              <select data-campo="type" data-foco="${esc(c.id)}-type" aria-label="Type">
                ${[["reformer", "Reformer"], ["mat", "Hot Pilates / mat"], ["private", "Private"]].map(([t, rot]) => `<option value="${t}" ${c.type === t ? "selected" : ""}>${rot}</option>`).join("")}
              </select>
              <select data-campo="instructorId" data-foco="${esc(c.id)}-inst" aria-label="Instructor">${opcoesStaff(c.instructorId)}</select>
              <button type="button" class="mini mini--perigo" data-remover="${esc(c.id)}">Remove</button>
            </div>` : `
            <div class="semana-aula">
              <time>${esc(c.time)}</time>
              <div><strong>${esc(c.name)}</strong><span>${esc(c.duration)} min · ${esc(c.capacity)} spots${c.instructorId ? ` · ${esc(nomeStaff(c.instructorId))}` : ""}</span></div>
            </div>`).join("") : `<p class="sem-aula">No classes</p>`}
        </div>`;
    }).join("");
  }

  $("[data-semana]").addEventListener("change", (e) => {
    const campo = e.target.closest("[data-campo]");
    if (!campo) return;
    const id = campo.closest("[data-classe]").dataset.classe;
    let v = campo.value;
    if (campo.type === "number") { v = Number(v); if (!(v > 0)) return desenharSemana(); }
    if (campo.dataset.campo === "name" && !v.trim()) return desenharSemana();
    tentar(acao("class.update", { id, [campo.dataset.campo]: v || null }, "Timetable updated.")).then(() => {}, () => desenharSemana());
  });
  $("[data-semana]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remover]");
    if (!b) return;
    const c = aulaPor(b.dataset.remover);
    const futuras = D.bookings.filter((x) => x.classId === c.id && x.date >= D.today && (vivo(x) || x.status === "waitlist")).length;
    if (confirm(`Remove ${c.name} (${R.DIAS_LONGOS[c.day]} ${c.time}) from the weekly timetable?${futuras ? `\n\n${futuras} upcoming booking${futuras === 1 ? "" : "s"} will be cancelled, so let ${futuras === 1 ? "that client" : "those clients"} know.` : ""}`)) {
      tentar(acao("class.remove", { id: c.id }, (r) => `Class removed.${r.cancelledBookings ? ` ${r.cancelledBookings} booking${r.cancelledBookings === 1 ? " was" : "s were"} cancelled.` : ""}`));
    }
  });

  /* ── Clients ── */
  const buscaClientes = $("[data-busca-clientes]");
  buscaClientes.addEventListener("input", desenharClientes);

  function resumoCliente(c) {
    const bs = D.bookings.filter((b) => b.clientId === c.id && vivo(b) && b.date <= D.today);
    const ultima = bs.reduce((m, b) => (b.date > m ? b.date : m), "");
    return { aulas: bs.length, ultima };
  }

  function desenharClientes() {
    const lista = D.clients.filter((c) => bate(buscaClientes.value, c.name, c.phone, c.email));
    const corpo = $("[data-clientes]");
    if (!lista.length) {
      corpo.innerHTML = `<tr><td colspan="6" class="vazio-tabela">${D.clients.length ? "No clients match." : "No clients yet. They're added automatically when someone books."}</td></tr>`;
      return;
    }
    corpo.innerHTML = lista.slice(0, 400).map((c) => {
      const r = resumoCliente(c);
      return `
        <tr class="linha-clicavel" data-cliente="${esc(c.id)}" tabindex="0">
          <td><strong>${esc(c.name)}</strong>${c.health ? `<small class="saude">⚑ Health notes</small>` : ""}</td>
          <td>${esc(c.phone)}</td>
          <td>${esc(c.email)}</td>
          <td>${esc(c.credits)}</td>
          <td>${r.ultima ? esc(R.dataCurta(r.ultima)) : "—"}</td>
          <td>${r.aulas}</td>
        </tr>`;
    }).join("");
  }
  $("[data-clientes]").addEventListener("keydown", (e) => {
    const l = e.target.closest("[data-cliente]");
    if (l && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirCliente(l.dataset.cliente); }
  });

  const dlgCliente = $("[data-dlg-cliente]");
  const formCliente = $("[data-dc-form]");
  let clienteAberto = null;

  function abrirCliente(id) {
    clienteAberto = id || null;
    desenharCliente();
    if (!dlgCliente.open) dlgCliente.showModal();
    if (!id) formCliente.elements.name.focus();
  }

  function desenharCliente() {
    const c = clienteAberto ? clientePor(clienteAberto) : null;
    const f = formCliente.elements;
    const editar = pode("manager");
    $("[data-dc-nome]").textContent = c ? c.name : "New client";
    f.name.value = c ? c.name : ""; f.phone.value = c ? c.phone : ""; f.email.value = c ? c.email : "";
    f.credits.value = c ? c.credits : 0; f.health.value = c ? c.health : ""; f.notes.value = c ? c.notes : "";
    $$("input, textarea", formCliente).forEach((i) => (i.readOnly = !editar));
    $$(".dc-acoes", formCliente).forEach((x) => (x.hidden = !editar));
    $("[data-dc-pagar]").hidden = !c || !editar;
    $(".form-status", formCliente).textContent = "";
    $("[data-dc-extra]").hidden = !c;
    if (!c) return;

    const notas = D.notes.filter((n) => n.clientId === c.id);
    $("[data-dc-notas]").innerHTML = notas.length ? notas.map((n) => `
      <li><p>${esc(n.text)}</p><small>${esc(nomeStaff(n.staffId) || "Staff")} · ${esc(new Date(n.date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }))}</small></li>`).join("")
      : `<li class="vazio-lista">No notes yet.</li>`;

    const hist = D.bookings.filter((b) => b.clientId === c.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    $("[data-dc-historico]").innerHTML = hist.length ? hist.slice(0, 40).map((b) => `
      <li><span><strong>${esc(b.className)}</strong> · ${quando(b)}</span><span>${selo(b)}${b.attendance === "no-show" ? ` <span class="tag">No-show</span>` : ""}</span></li>`).join("")
      : `<li class="vazio-lista">No classes in the last 90 days.</li>`;

    const pags = D.payments.filter((p) => p.clientId === c.id);
    $("[data-dc-pagamentos]").innerHTML = !pode("manager") ? `<li class="vazio-lista">Managers can see payments.</li>`
      : pags.length ? pags.map((p) => `
        <li><span>${esc(new Date(p.date).toLocaleDateString("en-KE", { day: "numeric", month: "short" }))} · ${esc(oQue(p))}</span><span>KES ${KES(p.amount)} · ${esc(PAG[p.method] || p.method)}</span></li>`).join("")
      : `<li class="vazio-lista">No payments recorded.</li>`;
  }

  formCliente.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formCliente.elements;
    const st = $(".form-status", formCliente);
    const dados = { name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), health: f.health.value, notes: f.notes.value, credits: Number(f.credits.value || 0) };
    const p = clienteAberto
      ? acao("client.update", { id: clienteAberto, ...dados }, "Client saved.")
      : acao("client.create", dados).then((c) => { clienteAberto = c.id; if (dados.health || dados.notes || dados.credits) return acao("client.update", { id: c.id, ...dados }); }).then(() => avisar("Client added."));
    p.then(() => { st.textContent = ""; desenharCliente(); }, (err) => { st.textContent = err.message; st.className = "form-status campo--inteiro falha"; });
  });
  $("[data-dc-nota]").addEventListener("submit", (e) => {
    e.preventDefault();
    const i = e.target.elements.text;
    if (!i.value.trim()) return;
    tentar(acao("client.note", { clientId: clienteAberto, text: i.value.trim() }, "Note added.").then(() => { i.value = ""; desenharCliente(); }));
  });
  $("[data-dc-pagar]").addEventListener("click", () => abrirPagamento({ clientId: clienteAberto }));
  $("[data-novo-cliente]").addEventListener("click", () => abrirCliente(null));

  /* ── Payments ── */
  /* Price list from config.js: choosing an item fills in the amount and the class credits it adds. */
  const PACOTES = [
    { v: "class", rotulo: "A class paid on the day (no credits)", kind: "class", creditos: 0, grupo: "" },
    ...(S.precos || []).flatMap((g) => g.itens.map((p) => ({
      v: `${g.grupo}: ${p.name}`, grupo: g.grupo, preco: p.price, creditos: p.credits || 0,
      rotulo: `${p.name}${p.detail ? ` (${p.detail})` : ""} · KES ${KES(p.price)}${p.credits ? ` · ${p.credits} credit${p.credits === 1 ? "" : "s"}` : ""}`,
      kind: /plunge/i.test(g.grupo) ? "other" : "package",
    }))),
    { v: "other", rotulo: "Something else", kind: "other", creditos: 0, grupo: "" },
  ];
  const precoDaAula = (b) => {
    const g = (S.precos || []).find((x) => (/hot/i.test(b.className) ? /hot/i : /reformer/i).test(x.grupo));
    const item = g && g.itens.find((i) => i.credits === 1);
    return item ? item.price : "";
  };
  const oQue = (p) => p.bookingId ? (D.bookings.find((b) => b.id === p.bookingId) || {}).className || "Class"
    : p.packageName || (p.kind === "class" ? "Class" : p.kind === "other" ? "Other" : "Package");
  const rotuloCliente = (c) => `${c.name} · ${c.phone || c.email}`;

  function desenharPagamentos() {
    if (!pode("manager")) return;
    const mes = D.today.slice(0, 7);
    const doMes = D.payments.filter((p) => R.iso(new Date(p.date)).slice(0, 7) === mes);
    const soma = (l) => l.reduce((s, p) => s + Number(p.amount || 0), 0);
    const porMetodo = (m) => soma(doMes.filter((p) => p.method === m));
    $("[data-pag-resumo]").innerHTML = `
      <div class="painel stat"><span>This month</span><b>KES ${KES(soma(doMes))}</b></div>
      <div class="painel stat"><span>M-Pesa</span><b>${KES(porMetodo("mpesa"))}</b></div>
      <div class="painel stat"><span>Card</span><b>${KES(porMetodo("card"))}</b></div>
      <div class="painel stat"><span>Cash</span><b>${KES(porMetodo("cash"))}</b></div>`;
    $("[data-pagamentos]").innerHTML = D.payments.length ? D.payments.slice(0, 400).map((p) => {
      const c = clientePor(p.clientId);
      return `
        <tr>
          <td>${esc(new Date(p.date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }))}</td>
          <td>${c ? `<button type="button" class="link-cliente" data-cliente="${esc(c.id)}">${esc(c.name)}</button>` : "—"}</td>
          <td>${esc(oQue(p))}${p.credits ? `<small>+${esc(p.credits)} credits</small>` : ""}</td>
          <td>${esc(PAG[p.method] || p.method)}</td>
          <td>${esc(p.reference)}</td>
          <td class="num">${KES(p.amount)}</td>
          <td>${esc(primeiroNome(nomeStaff(p.staffId)))}</td>
        </tr>`;
    }).join("") : `<tr><td colspan="7" class="vazio-tabela">No payments recorded yet.</td></tr>`;
  }

  const dlgPag = $("[data-dlg-pagamento]");
  const formPag = $("form", dlgPag);
  let pagContexto = null;
  const opcao = (p) => `<option value="${esc(p.v)}">${esc(p.rotulo)}</option>`;
  $("#dp-tipo").innerHTML = opcao(PACOTES[0]) +
    [...new Set(PACOTES.map((p) => p.grupo).filter(Boolean))].map((g) =>
      `<optgroup label="${esc(g)}">${PACOTES.filter((p) => p.grupo === g).map(opcao).join("")}</optgroup>`).join("") +
    opcao(PACOTES[PACOTES.length - 1]);
  const mostrarCreditos = () => {
    const p = PACOTES.find((x) => x.v === formPag.elements.pack.value);
    $("[data-dp-creditos-campo]").hidden = !p || !p.creditos;
  };
  formPag.elements.pack.addEventListener("change", () => {
    const p = PACOTES.find((x) => x.v === formPag.elements.pack.value);
    if (p && p.preco) formPag.elements.amount.value = p.preco;
    formPag.elements.credits.value = p ? p.creditos : 0;
    mostrarCreditos();
  });

  function abrirPagamento(ctx = {}) {
    pagContexto = ctx;
    formPag.reset();
    const st = $(".form-status", formPag);
    st.textContent = ""; st.className = "form-status campo--inteiro";
    const b = ctx.booking;
    const clienteFixo = b ? clientePor(b.clientId) : ctx.clientId ? clientePor(ctx.clientId) : null;
    $("[data-dp-sobre]").textContent = b ? `${b.name} · ${b.className}, ${R.dataLonga(b.date)} at ${b.time}` : clienteFixo ? clienteFixo.name : "";
    $("[data-dp-cliente-campo]").hidden = !!clienteFixo;
    $("[data-dp-tipo-campo]").hidden = !!b;
    $("#dp-clientes").innerHTML = D.clients.map((c) => `<option value="${esc(rotuloCliente(c))}"></option>`).join("");
    if (b && b.payment === "card") formPag.elements.method.value = "card";
    if (b) formPag.elements.amount.value = precoDaAula(b);
    mostrarCreditos();
    if (b) $("[data-dp-creditos-campo]").hidden = true;
    dlgPag.showModal();
    (clienteFixo ? formPag.elements.amount : formPag.elements.client).focus();
  }

  formPag.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formPag.elements;
    const st = $(".form-status", formPag);
    const b = pagContexto.booking;
    let clientId = b ? b.clientId : pagContexto.clientId;
    if (!clientId) {
      const c = D.clients.find((x) => rotuloCliente(x) === f.client.value.trim()) || D.clients.find((x) => x.name.toLowerCase() === f.client.value.trim().toLowerCase());
      if (!c) { st.textContent = "Pick a client from the list (add new clients on the Clients tab)."; st.className = "form-status campo--inteiro falha"; return; }
      clientId = c.id;
    }
    if (f.amount.value === "" || Number(f.amount.value) < 0) { st.textContent = "Enter the amount paid."; st.className = "form-status campo--inteiro falha"; return; }
    const pacote = b ? PACOTES[0] : PACOTES.find((x) => x.v === f.pack.value);
    tentar(acao("payment.record", {
      clientId, bookingId: b ? b.id : null, amount: Number(f.amount.value), method: f.method.value, reference: f.reference.value.trim(),
      kind: pacote.kind, packageName: pacote.v === "class" || pacote.v === "other" ? "" : pacote.v,
      credits: pacote.creditos ? Number(f.credits.value || 0) : 0,
    }, "Payment saved.").then(() => { dlgPag.close(); if (dlgCliente.open) desenharCliente(); }));
  });
  $("[data-novo-pagamento]").addEventListener("click", () => abrirPagamento({}));

  /* ── Add booking (walk-in / phone) ── */
  const dlgRes = $("[data-dlg-reserva]");
  const formRes = $("form", dlgRes);
  function aulasPara(date) {
    const lista = ocorrencias(date).filter((o) => !o.cancelled && o.aula.active);
    formRes.elements.classId.innerHTML = lista.length
      ? lista.map((o) => `<option value="${esc(o.aula.id)}">${esc(o.aula.time)} ${esc(o.aula.name)} · ${o.vagas ? `${o.vagas} left` : "full (waitlist)"}</option>`).join("")
      : `<option value="">No classes this day</option>`;
  }
  $("[data-walkin]").addEventListener("click", () => {
    formRes.reset();
    $(".form-status", formRes).textContent = "";
    formRes.elements.date.value = diaAtual;
    aulasPara(diaAtual);
    $("#dr-clientes").innerHTML = D.clients.map((c) => `<option value="${esc(c.name)}">${esc(c.phone)}</option>`).join("");
    dlgRes.showModal();
    formRes.elements.name.focus();
  });
  formRes.elements.date.addEventListener("change", (e) => aulasPara(e.target.value));
  formRes.elements.name.addEventListener("change", (e) => {
    const c = D.clients.find((x) => x.name === e.target.value);
    if (c) { formRes.elements.phone.value = c.phone; formRes.elements.email.value = c.email; }
  });
  formRes.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formRes.elements;
    const st = $(".form-status", formRes);
    if (!f.classId.value) { st.textContent = "Pick a class."; st.className = "form-status campo--inteiro falha"; return; }
    acao("booking.create", {
      classId: f.classId.value, date: f.date.value, name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(),
      health: f.health.value.trim(), payment: f.payment.value, firstTime: f.firstTime.checked,
    }, (b) => b.status === "waitlist" ? `${primeiroNome(b.name)} is on the waitlist: the class is full.` : `${primeiroNome(b.name)} is booked in.`)
      .then(() => { diaAtual = f.date.value; desenharDia(); dlgRes.close(); }, (err) => { st.textContent = err.message; st.className = "form-status campo--inteiro falha"; });
  });

  /* ── Staff ── */
  function desenharEquipe() {
    if (!pode("owner")) return;
    $("[data-equipe]").innerHTML = D.staff.map((p) => `
      <tr${p.active ? "" : ` class="inativo"`}>
        <td><strong>${esc(p.name || "—")}</strong>${p.id === D.me.id ? ` <span class="tag">You</span>` : ""}</td>
        <td>${esc(p.email)}${p.signedIn ? "" : `<small>Hasn't signed in yet</small>`}</td>
        <td><select data-papel-staff="${esc(p.id)}" aria-label="Role for ${esc(p.name)}">
          ${Object.entries(PAPEL).map(([v, t]) => `<option value="${v}" ${p.role === v ? "selected" : ""}>${t}</option>`).join("")}
        </select></td>
        <td>${p.active ? "Active" : "Inactive"}</td>
        <td class="acoes">${p.id === D.me.id ? "" : `<button type="button" class="mini${p.active ? " mini--perigo" : ""}" data-ativo="${esc(p.id)}">${p.active ? "Deactivate" : "Reactivate"}</button>`}</td>
      </tr>`).join("");
  }
  $("[data-novo-staff]").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    tentar(acao("staff.add", { name: f.name.value.trim(), email: f.email.value.trim(), role: f.role.value },
      `${f.name.value.trim()} added. They can now sign in here with ${f.email.value.trim()}.`).then(() => e.target.reset()));
  });
  $("[data-equipe]").addEventListener("change", (e) => {
    const s = e.target.closest("[data-papel-staff]");
    if (s) tentar(acao("staff.update", { id: s.dataset.papelStaff, role: s.value }, "Role updated.")).then(() => {}, () => desenharEquipe());
  });
  $("[data-equipe]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ativo]");
    if (!b) return;
    const p = staffPor(b.dataset.ativo);
    if (p.active && !confirm(`Deactivate ${p.name}? They won't be able to open the admin.`)) return;
    tentar(acao("staff.update", { id: p.id, active: !p.active }, p.active ? `${p.name} deactivated.` : `${p.name} reactivated.`));
  });

  /* ── Tabs, summary, render ── */
  $$(".aba").forEach((b) => b.addEventListener("click", () => {
    $$(".aba").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    $$("[data-painel]").forEach((p) => (p.hidden = p.dataset.painel !== b.dataset.aba));
    try { sessionStorage.setItem("ritual-admin-aba", b.dataset.aba); } catch { /* ignore */ }
  }));

  function desenharResumo() {
    const vivas = D.bookings.filter(vivo);
    $('[data-stat="hoje"]').textContent = vivas.filter((b) => b.date === D.today).length;
    $('[data-stat="futuras"]').textContent = vivas.filter((b) => b.date >= D.today).length;
    $('[data-stat="pagar"]').textContent = D.bookings.filter((b) => b.status === "awaiting-payment").length;
    $('[data-stat="espera"]').textContent = D.bookings.filter((b) => b.status === "waitlist" && b.date >= D.today).length;
  }

  function desenhar() {
    if (!D) return;
    const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.foco : null;
    $$("[data-papel]").forEach((el) => (el.hidden = !pode(el.dataset.papel)));
    desenharResumo();
    desenharDia();
    desenharReservas();
    desenharSemana();
    desenharClientes();
    desenharPagamentos();
    desenharEquipe();
    if (dlgCliente.open && clienteAberto) desenharCliente();
    if (foco) { const el = $(`[data-foco="${CSS.escape(foco)}"]`); if (el) el.focus(); }
  }

  $$("[data-fechar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  $$("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

  /* Keep the screen current for the front desk */
  setInterval(() => {
    if (!logado || !D || document.hidden || $("dialog[open]")) return;
    const ativo = document.activeElement;
    if (ativo && /INPUT|SELECT|TEXTAREA/.test(ativo.tagName) && ativo.closest("[data-app]")) return;
    tentar(carregar());
  }, 60_000);
  addEventListener("focus", () => { if (logado && D && !$("dialog[open]")) tentar(carregar()); });

  /* ── Sign-in (Clerk) ── */
  const trava = $("[data-trava]");
  const app = $("[data-app]");
  const travaTexto = $("[data-trava-texto]");
  const caixaEntrar = $("[data-entrar]");

  const carregarScript = (src, attrs = {}) => new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.crossOrigin = "anonymous";
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
    s.onload = ok; s.onerror = () => falha(new Error(`Couldn't load ${src}`));
    document.head.appendChild(s);
  });

  async function entrar() {
    logado = true;
    travaTexto.textContent = "Opening the admin…";
    try { window.Clerk.unmountSignIn(caixaEntrar); } catch { /* not mounted */ }
    try {
      await carregar();
      trava.hidden = true;
      app.hidden = false;
      const eu = $("[data-eu]");
      eu.textContent = `${D.me.name || D.me.email} · ${PAPEL[D.me.role]}`;
      eu.hidden = false;
      window.Clerk.mountUserButton($("[data-botao-usuario]"));
      let aba = null;
      try { aba = sessionStorage.getItem("ritual-admin-aba"); } catch { /* ignore */ }
      const bt = aba && $(`.aba[data-aba="${aba}"]`);
      if (bt && !bt.hidden) bt.click();
    } catch (e) {
      travaTexto.textContent = "";
      $("[data-negado]").hidden = false;
      $("[data-negado-texto]").textContent = e.message;
    }
  }
  $("[data-sair]").addEventListener("click", () => window.Clerk.signOut().then(() => location.reload()));

  async function iniciar() {
    try {
      const { clerkPublishableKey: pk } = await R.api("/api/config");
      if (!pk) throw new Error("Staff sign-in isn't set up yet.");
      const fapi = atob(pk.split("_")[2]).replace(/\$$/, "");
      await carregarScript(`https://${fapi}/npm/@clerk/ui@1/dist/ui.browser.js`);
      await carregarScript(`https://${fapi}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, { "data-clerk-publishable-key": pk });
      await window.Clerk.load({
        ui: { ClerkUI: window.__internal_ClerkUICtor },
        appearance: { variables: { colorPrimary: "#4F6B57", colorText: "#26382E", fontFamily: "Figtree, system-ui, sans-serif", borderRadius: "12px" } },
      });
    } catch (e) {
      travaTexto.textContent = `Sign-in couldn't load. Check your connection and refresh the page. (${e.message})`;
      return;
    }
    window.Clerk.addListener(({ user }) => {
      if (user && !logado) entrar();
      if (!user && logado) location.reload();
    });
    if (window.Clerk.user) return entrar();
    travaTexto.textContent = "Sign in with the email address the studio added you with. The first time, Clerk emails you a code to set up your account.";
    window.Clerk.mountSignIn(caixaEntrar, { forceRedirectUrl: location.pathname, signUpForceRedirectUrl: location.pathname, withSignUp: true });
  }
  iniciar();
})();
