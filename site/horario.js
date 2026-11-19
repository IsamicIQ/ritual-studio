/* Ritual Studio · public timetable, packages and booking dialog */
(() => {
  const S = window.SITE || {};
  const R = window.Reservas;
  if (!R) return;

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ── Prices ── */
  const KES = (n) => `KES ${Number(n).toLocaleString("en-KE")}`;
  const precos = document.querySelector(".precos");
  if (precos) {
    precos.innerHTML = (S.precos || []).map((g) => `
      <div class="precos-grupo">
        <h3>${esc(g.grupo)}</h3>
        <ul class="pacotes">${g.itens.map((p) => `
          <li>
            <div><strong>${esc(p.name)}</strong>${p.detail ? `<span>${esc(p.detail)}</span>` : ""}</div>
            <em>${p.price ? KES(p.price) : "Ask the studio"}</em>
          </li>`).join("")}
        </ul>
      </div>`).join("");
  }

  /* ── Timetable ── */
  const dias = document.querySelector(".dias");
  const aulas = document.querySelector(".aulas");
  if (!dias || !aulas) return;
  let semana = [];
  let escolhido = 0;

  function desenharDias() {
    dias.innerHTML = semana.map((d, i) => `
      <button type="button" role="tab" class="dia" aria-selected="${i === escolhido}" data-i="${i}">
        <span>${i === 0 ? "Today" : R.DIAS[R.diaSemana(R.deIso(d))]}</span><b>${R.deIso(d).getDate()}</b>
      </button>`).join("");
  }

  function desenharAulas() {
    const d = semana[escolhido];
    const lista = R.aulasDoDia(d);
    if (!lista.length) {
      aulas.innerHTML = `<li class="vazio">No classes on ${esc(R.DIAS_LONGOS[R.diaSemana(R.deIso(d))])}. Pick another day.</li>`;
      return;
    }
    aulas.innerHTML = lista.map((o) => {
      const a = o.aula;
      const cheia = o.vagas === 0;
      const estado = o.cancelled ? `Cancelled${o.reason ? `: ${o.reason}` : ""}`
        : o.passou ? "Started"
        : cheia ? "Full · join the waitlist"
        : `${o.vagas} ${o.vagas === 1 ? "spot" : "spots"} left`;
      const pode = !o.cancelled && !o.passou;
      const com = o.instructor ? ` · with ${o.instructor}` : "";
      const nivel = a.level && a.level !== "All levels" ? ` · ${a.level}` : "";
      return `
        <li class="aula${pode ? "" : " aula--off"}">
          <time>${esc(a.time)}</time>
          <div><strong>${esc(a.name)}</strong><span>${esc(a.duration)} min${esc(nivel)}${esc(com)} · ${esc(estado)}</span></div>
          <button type="button" class="botao botao--pequeno${cheia && pode ? " botao--linha" : ""}" data-aula="${esc(a.id)}" ${pode ? "" : "disabled"}>${o.cancelled ? "Cancelled" : cheia && pode ? "Waitlist" : "Book"}</button>
        </li>`;
    }).join("");
  }

  dias.addEventListener("click", (e) => {
    const b = e.target.closest(".dia");
    if (!b) return;
    escolhido = Number(b.dataset.i);
    desenharDias();
    desenharAulas();
  });

  async function atualizar() {
    try {
      await R.carregarHorario();
      semana = R.diasPublicos();
      if (escolhido >= semana.length) escolhido = 0;
      desenharDias();
      desenharAulas();
    } catch (e) {
      if (!semana.length) aulas.innerHTML = `<li class="vazio">The timetable couldn't load. Please refresh the page in a moment.</li>`;
    }
  }
  aulas.innerHTML = `<li class="vazio">Loading the timetable…</li>`;
  atualizar();
  addEventListener("focus", atualizar); // spots left stay current when people come back to the tab

  /* ── Booking dialog ── */
  const dlg = document.querySelector("dialog.reserva");
  const form = dlg.querySelector("form");
  const status = form.querySelector(".form-status");
  const passoForm = form.querySelector('[data-passo="form"]');
  const passoOk = form.querySelector('[data-passo="ok"]');
  const enviar = form.querySelector('button[type="submit"]');
  let atual = null;

  const C = S.contato || {};
  const KESv = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
  const mpesaBox = form.querySelector("[data-mpesa]");
  const mpesaStatus = form.querySelector("[data-mpesa-status]");
  const mpesaEnviar = form.querySelector("[data-mpesa-enviar]");
  const dica = form.querySelector("[data-pagar-dica]");
  if (C.telefone) form.querySelector("[data-mpesa-numero]").textContent = C.telefone;
  let reservaFeita = null;

  form.querySelector(".pagar-opcoes").innerHTML = (S.pagamentos || []).map((p, i) => `
    <label class="opcao"><input type="radio" name="payment" value="${esc(p.id)}" ${i === 0 ? "checked" : ""}><span>${esc(p.rotulo)}</span></label>`).join("");

  function mostrarDica() {
    const v = form.elements.payment.value;
    const preco = atual ? KESv(atual.aula.price) : "";
    dica.textContent = !atual ? ""
      : atual.vagas < 1 ? "You won't pay anything unless a spot opens up for you."
      : v === "mpesa" ? `After booking, you'll send ${preco} by M-Pesa to ${C.telefone || "the studio"}.`
      : v === "card" ? `After booking, you'll pay ${preco} securely by card.`
      : `Pay ${preco} when you arrive for class.`;
  }
  form.querySelector(".pagar-opcoes").addEventListener("change", mostrarDica);

  aulas.addEventListener("click", (e) => {
    const b = e.target.closest("[data-aula]");
    if (!b || b.disabled) return;
    const o = R.aulasDoDia(semana[escolhido]).find((x) => x.aula.id === b.dataset.aula);
    if (!o) return;
    atual = o;
    reservaFeita = null;
    form.querySelector(".reserva-aula").textContent = o.aula.name;
    form.querySelector(".reserva-quando").textContent = `${R.dataLonga(o.date)} · ${o.aula.time} · ${o.aula.duration} min${o.aula.price ? ` · ${KESv(o.aula.price)}` : ""}`;
    form.querySelector(".reserva-espera").hidden = o.vagas > 0;
    enviar.textContent = o.vagas > 0 ? "Confirm booking" : "Join the waitlist";
    status.textContent = "";
    status.className = "form-status campo--inteiro";
    passoForm.hidden = false;
    passoOk.hidden = true;
    mostrarDica();
    dlg.showModal();
    form.elements.name.focus();
  });

  const fechar = () => dlg.close();
  form.querySelector(".fechar").addEventListener("click", fechar);
  form.querySelector(".fechar-ok").addEventListener("click", fechar);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) fechar(); });

  /* M-Pesa: the client sends the confirmation code from their M-Pesa SMS */
  async function enviarCodigo() {
    if (!reservaFeita || mpesaEnviar.disabled) return;
    const code = form.elements.mpesaCode.value.trim();
    if (!code) { mpesaStatus.textContent = "Type the code from your M-Pesa SMS first."; mpesaStatus.className = "form-status falha"; return; }
    mpesaEnviar.disabled = true;
    mpesaStatus.textContent = "Sending…"; mpesaStatus.className = "form-status";
    try {
      await R.api("/api/mpesa-code", { method: "POST", body: { bookingId: reservaFeita.id, code } });
      mpesaStatus.textContent = "Thank you! The studio will check your payment and confirm it.";
      mpesaStatus.className = "form-status ok";
      form.elements.mpesaCode.disabled = true;
    } catch (e) {
      mpesaStatus.textContent = e.message; mpesaStatus.className = "form-status falha";
      mpesaEnviar.disabled = false;
    }
  }
  mpesaEnviar.addEventListener("click", enviarCodigo);

  /* Card: Stripe Checkout */
  async function pagarComCartao(b) {
    const nota = form.querySelector(".reserva-nota");
    nota.textContent = "Taking you to the secure card payment page…";
    try {
      const { url } = await R.api("/api/checkout", { method: "POST", body: { bookingId: b.id } });
      location.href = url;
    } catch (e) {
      nota.textContent = `Your spot is booked, but card payment didn't open (${e.message}) You can pay by M-Pesa to ${C.telefone || "the studio"} or at the studio.`;
    }
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!passoOk.hidden) { enviarCodigo(); return; } // Enter in the M-Pesa code box
    if (!atual || enviar.disabled) return;
    let valido = true;
    form.querySelectorAll("[required]").forEach((c) => {
      const v = c.value.trim();
      const ok = c.type === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
        : c.type === "tel" ? v.replace(/\D/g, "").length >= 9
        : v.length > 1;
      c.closest(".campo").classList.toggle("erro", !ok);
      if (!ok) valido = false;
    });
    if (!valido) {
      status.textContent = "Please check the highlighted fields.";
      status.className = "form-status campo--inteiro falha";
      return;
    }
    const f = form.elements;
    enviar.disabled = true;
    status.textContent = "Booking…";
    status.className = "form-status campo--inteiro";
    try {
      const { booking: b } = await R.reservar({
        classId: atual.aula.id,
        date: atual.date,
        name: f.name.value.trim(),
        phone: f.phone.value.trim(),
        email: f.email.value.trim(),
        payment: f.payment.value,
        health: f.health.value.trim(),
        firstTime: f.firstTime.checked,
        website: f.website.value,
      });
      reservaFeita = b;
      const metodo = (S.pagamentos || []).find((p) => p.id === b.payment);
      const primeiro = b.name.split(" ")[0];
      const espera = b.status === "waitlist";
      const aPagar = b.status === "awaiting-payment";
      passoOk.querySelector("h3").textContent = espera ? "You're on the waitlist." : "See you on the reformer.";
      form.querySelector(".reserva-resumo").textContent = espera
        ? `${primeiro}, ${b.className} on ${R.dataLonga(b.date)} at ${b.time} is full, so you're on the waitlist. If a spot opens up, it's yours and the studio will let you know. Don't pay anything yet.`
        : `${primeiro}, you're booked into ${b.className} on ${R.dataLonga(b.date)} at ${b.time}. Payment: ${metodo ? metodo.rotulo : b.payment}.`;
      mpesaBox.hidden = !(aPagar && b.payment === "mpesa");
      form.querySelector("[data-mpesa-valor]").textContent = KESv(b.price);
      mpesaStatus.textContent = "";
      form.elements.mpesaCode.value = "";
      form.elements.mpesaCode.disabled = false;
      mpesaEnviar.disabled = false;
      form.querySelector(".reserva-nota").textContent = espera ? ""
        : b.payment === "studio" ? `You'll pay ${KESv(b.price)} when you arrive for class.`
        : b.payment === "mpesa" ? `Questions? Call or WhatsApp ${C.telefone || "the studio"}.`
        : "";
      f.name.value = ""; f.phone.value = ""; f.email.value = ""; f.health.value = ""; f.firstTime.checked = false;
      passoForm.hidden = true;
      passoOk.hidden = false;
      (b.payment === "mpesa" && aPagar ? form.elements.mpesaCode : form.querySelector(".fechar-ok")).focus();
      atualizar();
      if (aPagar && b.payment === "card") pagarComCartao(b);
    } catch (e) {
      status.textContent = e.message;
      status.className = "form-status campo--inteiro falha";
      if (e.status === 409) atualizar();
    } finally {
      enviar.disabled = false;
    }
  });

  /* Back from the Stripe payment page */
  const volta = new URLSearchParams(location.search);
  if (volta.has("paid") || volta.get("payment") === "cancelled") {
    const pago = volta.has("paid");
    atual = null; reservaFeita = null;
    passoForm.hidden = true;
    passoOk.hidden = false;
    mpesaBox.hidden = true;
    passoOk.querySelector("h3").textContent = pago ? "Payment received." : "Payment not completed.";
    form.querySelector(".reserva-resumo").textContent = pago
      ? "Thank you, your card payment went through and your spot is confirmed. See you on the reformer."
      : `Your spot is still booked, but the card payment was cancelled. You can pay by M-Pesa to ${C.telefone || "the studio"} or at the studio.`;
    form.querySelector(".reserva-nota").textContent = "";
    history.replaceState(null, "", location.pathname + location.hash);
    dlg.showModal();
  }
})();

/* Classes: open / close the list */
document.querySelectorAll(".abre").forEach((b) => {
  const corpo = document.getElementById(b.getAttribute("aria-controls"));
  const texto = b.querySelector(".abre-texto");
  b.addEventListener("click", () => {
    const abrir = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", String(abrir));
    corpo.classList.toggle("aberto", abrir);
    if (texto) texto.textContent = abrir ? "Hide classes" : "View classes";
  });
});
