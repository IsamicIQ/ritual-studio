/* Ritual Studio · public timetable, packages and booking dialog */
(() => {
  const S = window.SITE || {};
  const R = window.Reservas;
  if (!R) return;

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dataLonga = (d) => d.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" });

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
  const semana = R.proximosDias(7);
  let escolhido = 0;

  function desenharDias() {
    dias.innerHTML = semana.map((d, i) => `
      <button type="button" role="tab" class="dia" aria-selected="${i === escolhido}" data-i="${i}">
        <span>${i === 0 ? "Today" : R.DIAS[R.diaSemana(d)]}</span><b>${d.getDate()}</b>
      </button>`).join("");
  }

  function desenharAulas() {
    const d = semana[escolhido];
    const lista = R.aulasDoDia(d);
    if (!lista.length) {
      aulas.innerHTML = `<li class="vazio">No classes on ${esc(R.DIAS_LONGOS[R.diaSemana(d)])}. Pick another day.</li>`;
      return;
    }
    aulas.innerHTML = lista.map((a) => {
      const vagas = R.vagas(a, d);
      const passou = R.jaPassou(a, d);
      const estado = passou ? "Started" : vagas === 0 ? "Full" : `${vagas} ${vagas === 1 ? "spot" : "spots"} left`;
      const pode = !passou && vagas > 0;
      return `
        <li class="aula${pode ? "" : " aula--off"}">
          <time>${esc(a.time)}</time>
          <div><strong>${esc(a.name)}</strong><span>${esc(a.duration)} min · ${estado}</span></div>
          <button type="button" class="botao botao--pequeno" data-aula="${esc(a.id)}" ${pode ? "" : "disabled"}>${vagas === 0 && !passou ? "Full" : "Book"}</button>
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

  desenharDias();
  desenharAulas();
  R.aoMudar(desenharAulas);

  /* ── Booking dialog ── */
  const dlg = document.querySelector("dialog.reserva");
  const form = dlg.querySelector("form");
  const status = form.querySelector(".form-status");
  const passoForm = form.querySelector('[data-passo="form"]');
  const passoOk = form.querySelector('[data-passo="ok"]');
  let atual = null;

  form.querySelector(".pagar-opcoes").innerHTML = (S.pagamentos || []).map((p, i) => `
    <label class="opcao"><input type="radio" name="payment" value="${esc(p.id)}" ${i === 0 ? "checked" : ""}><span>${esc(p.rotulo)}</span></label>`).join("");

  aulas.addEventListener("click", (e) => {
    const b = e.target.closest("[data-aula]");
    if (!b || b.disabled) return;
    const d = semana[escolhido];
    const aula = R.dados().classes.find((c) => c.id === b.dataset.aula);
    if (!aula) return;
    atual = { aula, data: d };
    form.querySelector(".reserva-aula").textContent = aula.name;
    form.querySelector(".reserva-quando").textContent = `${dataLonga(d)} · ${aula.time} · ${aula.duration} min`;
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

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!atual) return;
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
    try {
      const b = R.reservar({
        classId: atual.aula.id,
        date: R.iso(atual.data),
        name: f.name.value.trim(),
        phone: f.phone.value.trim(),
        email: f.email.value.trim(),
        payment: f.payment.value,
      });
      const metodo = (S.pagamentos || []).find((p) => p.id === b.payment);
      form.querySelector(".reserva-resumo").textContent =
        `${b.name.split(" ")[0]}, you're booked into ${b.className} on ${dataLonga(atual.data)} at ${b.time}. Payment: ${metodo ? metodo.rotulo : b.payment}.`;
      form.reset();
      form.querySelector('input[name="payment"]').checked = true;
      passoForm.hidden = true;
      passoOk.hidden = false;
      form.querySelector(".fechar-ok").focus();
    } catch (e) {
      status.textContent = e.message;
      status.className = "form-status campo--inteiro falha";
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
