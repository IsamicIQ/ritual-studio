/* Ritual Studio · public timetable, packages and booking dialog */
(() => {
  const S = window.SITE || {};
  const R = window.Reservas;
  if (!R) return;

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ── Packages ── */
  const listaPacotes = document.querySelector(".pacotes");
  if (listaPacotes) {
    listaPacotes.innerHTML = (S.pacotes || []).map((p) => `
      <li>
        <div><strong>${esc(p.name)}</strong><span>${esc(p.detail)}</span></div>
        <em>${p.price ? esc(p.price) : "Pricing coming soon"}</em>
      </li>`).join("");
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
      return `
        <li class="aula${pode ? "" : " aula--off"}">
          <time>${esc(a.time)}</time>
          <div><strong>${esc(a.name)}</strong><span>${esc(a.duration)} min${esc(com)} · ${esc(estado)}</span></div>
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

  form.querySelector(".pagar-opcoes").innerHTML = (S.pagamentos || []).map((p, i) => `
    <label class="opcao"><input type="radio" name="payment" value="${esc(p.id)}" ${i === 0 ? "checked" : ""}><span>${esc(p.rotulo)}</span></label>`).join("");

  aulas.addEventListener("click", (e) => {
    const b = e.target.closest("[data-aula]");
    if (!b || b.disabled) return;
    const o = R.aulasDoDia(semana[escolhido]).find((x) => x.aula.id === b.dataset.aula);
    if (!o) return;
    atual = o;
    form.querySelector(".reserva-aula").textContent = o.aula.name;
    form.querySelector(".reserva-quando").textContent = `${R.dataLonga(o.date)} · ${o.aula.time} · ${o.aula.duration} min`;
    form.querySelector(".reserva-espera").hidden = o.vagas > 0;
    enviar.textContent = o.vagas > 0 ? "Confirm booking" : "Join the waitlist";
    status.textContent = "";
    status.className = "form-status campo--inteiro";
    passoForm.hidden = false;
    passoOk.hidden = true;
    dlg.showModal();
    form.elements.name.focus();
  });

  const fechar = () => dlg.close();
  form.querySelector(".fechar").addEventListener("click", fechar);
  form.querySelector(".fechar-ok").addEventListener("click", fechar);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) fechar(); });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
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
      const metodo = (S.pagamentos || []).find((p) => p.id === b.payment);
      const primeiro = b.name.split(" ")[0];
      const espera = b.status === "waitlist";
      passoOk.querySelector("h3").textContent = espera ? "You're on the waitlist." : "See you on the reformer.";
      form.querySelector(".reserva-resumo").textContent = espera
        ? `${primeiro}, ${b.className} on ${R.dataLonga(b.date)} at ${b.time} is full, so you're on the waitlist. If a spot opens up, it's yours and the studio will let you know.`
        : `${primeiro}, you're booked into ${b.className} on ${R.dataLonga(b.date)} at ${b.time}. Payment: ${metodo ? metodo.rotulo : b.payment}.`;
      form.querySelector(".reserva-nota").textContent = b.payment === "studio"
        ? "You'll pay when you arrive for class."
        : "Online payment isn't switched on yet, so nothing was charged. The studio will be in touch about paying.";
      form.reset();
      form.querySelector('input[name="payment"]').checked = true;
      passoForm.hidden = true;
      passoOk.hidden = false;
      form.querySelector(".fechar-ok").focus();
      atualizar();
    } catch (e) {
      status.textContent = e.message;
      status.className = "form-status campo--inteiro falha";
      if (e.status === 409) atualizar();
    } finally {
      enviar.disabled = false;
    }
  });
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
