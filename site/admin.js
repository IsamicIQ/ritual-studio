/* Ritual Studio · admin (preview, browser-only storage) */
(() => {
  const S = window.SITE || {};
  const R = window.Reservas;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ── Preview lock ── */
  const SESSAO = "ritual-studio:admin";
  const trava = $("[data-trava]");
  const app = $("[data-app]");
  const abrir = () => { trava.hidden = true; app.hidden = false; desenhar(); };
  let ok = false;
  try { ok = sessionStorage.getItem(SESSAO) === "1"; } catch (e) { /* ignore */ }
  if (ok) abrir();
  $(".admin-trava-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const st = $(".admin-trava-form .form-status");
    if ($("#codigo").value === S.adminCodigoPreview) {
      try { sessionStorage.setItem(SESSAO, "1"); } catch (err) { /* ignore */ }
      abrir();
    } else {
      st.textContent = "That code isn't right.";
      st.className = "form-status falha";
    }
  });

  /* ── Tabs ── */
  document.querySelectorAll(".aba").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".aba").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    document.querySelectorAll("[data-painel]").forEach((p) => (p.hidden = p.dataset.painel !== b.dataset.aba));
  }));

  /* ── Helpers ── */
  const hoje = R.iso(new Date());
  const pagamento = (id) => ((S.pagamentos || []).find((p) => p.id === id) || {}).rotulo || id;
  const ROTULO_STATUS = { "confirmed": "Confirmed", "awaiting-payment": "Awaiting payment", "paid": "Paid", "cancelled": "Cancelled" };
  const quando = (b) => {
    const d = new Date(`${b.date}T00:00:00`);
    return `${d.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })} · ${b.time}`;
  };

  /* ── Bookings ── */
  const filtro = $("[data-filtro]");
  filtro.addEventListener("change", desenharReservas);

  function desenharReservas() {
    const { bookings } = R.dados();
    const f = filtro.value;
    const lista = bookings.filter((b) => {
      if (f === "all") return true;
      if (f === "cancelled") return b.status === "cancelled";
      if (b.status === "cancelled") return false;
      if (f === "today") return b.date === hoje;
      if (f === "awaiting-payment") return b.status === "awaiting-payment";
      return b.date >= hoje; // upcoming
    }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    const corpo = $("[data-reservas]");
    if (!lista.length) {
      corpo.innerHTML = `<tr><td colspan="6" class="vazio-tabela">No bookings here yet. Book a class on the website to see it appear.</td></tr>`;
      return;
    }
    corpo.innerHTML = lista.map((b) => `
      <tr>
        <td><strong>${esc(b.className)}</strong></td>
        <td>${esc(quando(b))}</td>
        <td>${esc(b.name)}<small>${esc(b.phone)} · ${esc(b.email)}</small></td>
        <td>${esc(pagamento(b.payment))}</td>
        <td><span class="selo selo--${esc(b.status)}">${esc(ROTULO_STATUS[b.status] || b.status)}</span></td>
        <td class="acoes">
          ${b.status === "awaiting-payment" || b.status === "confirmed" ? `<button type="button" class="mini" data-status="paid" data-id="${esc(b.id)}">Mark paid</button>` : ""}
          ${b.status !== "cancelled" ? `<button type="button" class="mini mini--perigo" data-status="cancelled" data-id="${esc(b.id)}">Cancel</button>`
            : `<button type="button" class="mini" data-status="confirmed" data-id="${esc(b.id)}">Restore</button>`}
        </td>
      </tr>`).join("");
  }

  $("[data-reservas]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-status]");
    if (!b) return;
    if (b.dataset.status === "cancelled" && !confirm("Cancel this booking? The spot opens up again.")) return;
    R.mudarStatus(b.dataset.id, b.dataset.status);
  });

  /* ── Timetable ── */
  const selDia = $("#n-dia");
  selDia.innerHTML = R.DIAS_LONGOS.slice(1).map((d, i) => `<option value="${i + 1}">${d}</option>`).join("");

  $("[data-nova]").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    if (!f.name.value.trim()) return f.name.focus();
    R.adicionarAula({
      day: Number(f.day.value), time: f.time.value, name: f.name.value.trim(),
      duration: Number(f.duration.value), capacity: Number(f.capacity.value),
    });
    f.name.value = "";
  });

  $("[data-restaurar]").addEventListener("click", () => {
    if (confirm("Replace the timetable with the sample and delete all preview bookings?")) R.restaurarExemplo();
  });

  function desenharSemana() {
    const { classes } = R.dados();
    $("[data-semana]").innerHTML = R.DIAS_LONGOS.slice(1).map((nome, i) => {
      const doDia = classes.filter((c) => c.day === i + 1).sort((a, b) => a.time.localeCompare(b.time));
      return `
        <div class="semana-dia">
          <h3>${nome}</h3>
          ${doDia.length ? doDia.map((c) => `
            <div class="semana-aula">
              <time>${esc(c.time)}</time>
              <div><strong>${esc(c.name)}</strong><span>${esc(c.duration)} min</span></div>
              <label class="cap">Spots <input type="number" min="1" max="60" value="${esc(c.capacity)}" data-cap="${esc(c.id)}" aria-label="Spots for ${esc(c.name)} at ${esc(c.time)}"></label>
              <button type="button" class="mini mini--perigo" data-remover="${esc(c.id)}" aria-label="Remove ${esc(c.name)} at ${esc(c.time)}">Remove</button>
            </div>`).join("") : `<p class="sem-aula">No classes</p>`}
        </div>`;
    }).join("");
  }

  $("[data-semana]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remover]");
    if (b && confirm("Remove this class from the weekly timetable?")) R.removerAula(b.dataset.remover);
  });
  $("[data-semana]").addEventListener("change", (e) => {
    const i = e.target.closest("[data-cap]");
    if (i && Number(i.value) > 0) R.atualizarAula(i.dataset.cap, { capacity: Number(i.value) });
  });

  /* ── Summary ── */
  function desenharResumo() {
    const { bookings, classes } = R.dados();
    const vivas = bookings.filter((b) => b.status !== "cancelled");
    $('[data-stat="hoje"]').textContent = vivas.filter((b) => b.date === hoje).length;
    $('[data-stat="futuras"]').textContent = vivas.filter((b) => b.date >= hoje).length;
    $('[data-stat="pagar"]').textContent = vivas.filter((b) => b.status === "awaiting-payment").length;
    $('[data-stat="aulas"]').textContent = classes.length;
  }

  function desenhar() {
    if (app.hidden) return;
    desenharResumo();
    desenharReservas();
    desenharSemana();
  }
  R.aoMudar(desenhar);
})();
