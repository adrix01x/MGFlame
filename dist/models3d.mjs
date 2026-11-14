import { icon } from "./icons.mjs";

const esc = text => String(text).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
const seconds = value => value.toFixed(1).replace(".", ",") + " s";
const catalog = "assets/experimentos/manifest.json";

// Los modelos se generan con scripts/build_experiment_models.py y se describen en el manifiesto.
export function mountModels(root, loadViewer, requested) {
  const controller = new AbortController();
  const { signal } = controller;
  root.innerHTML = `
    <section class="ship-intro">
      <div><span class="overline">MODELOS 3D</span><h1>Ensayos en 3D</h1>
        <p>Cinco ensayos de combustión en microgravedad a escala. Reproduce la secuencia, gira el modelo y pulsa los puntos para consultar cada componente.</p></div>
      <a class="button button-outline" href="#simulacion">${icon("play")} Simulación con datos</a>
    </section>
    <p class="loading-message" role="status">Cargando modelos…</p>`;

  let disposed = false;
  fetch(catalog).then(response => {
    if (!response.ok) throw new Error(catalog);
    return response.json();
  }).then(({ modelos }) => {
    if (!disposed) draw(modelos);
  }).catch(error => {
    console.error(error);
    if (disposed) return;
    root.querySelector(".loading-message").outerHTML = '<div class="empty card"><h2>No pudimos cargar los modelos</h2><p>Abre el panel desde un servidor local con <code>python -m http.server 4181 --directory dist</code>.</p></div>';
  });

  function draw(models) {
    root.querySelector(".loading-message").remove();
    root.insertAdjacentHTML("beforeend", `
      <div class="ship-layout">
        <section class="card ship-stage" aria-labelledby="model-title">
          <div class="ship-stage-toolbar"><div><span class="overline" id="model-place"></span><h2 id="model-title"></h2></div>
            <div class="ship-tabs" role="group" aria-label="Ensayos">
              ${models.map(model => `<button type="button" data-model="${model.id}" aria-pressed="false">${esc(model.titulo.split(" · ")[0])}</button>`).join("")}
            </div>
          </div>
          <div class="ship-viewport" id="model-viewport"></div>
          <div class="model-timeline">
            <button class="icon-button" type="button" id="model-play" aria-label="Pausar" disabled></button>
            <input type="range" id="model-scrub" min="0" max="1" step="0.01" value="0" aria-label="Tiempo del ensayo" disabled>
            <output class="mono" id="model-time">0,0 s</output>
            <select id="model-speed" aria-label="Velocidad de reproducción"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
          </div>
          <div class="model-phases" id="model-phases" role="group" aria-label="Fases del ensayo"></div>
          <div class="ship-model-footer"><span id="model-scale"></span><a class="text-link" id="model-download" download>${icon("download")} Descargar modelo GLB</a></div>
          <div id="model-parts" class="ship-components" role="group" aria-label="Componentes del modelo"></div>
        </section>
        <section class="card ship-inspector" id="model-info" aria-live="polite"></section>
      </div>
      <section class="card ship-scope">
        <span class="metric-icon blue">${icon("info")}</span>
        <div><h2>Escala y límites de los modelos</h2>
          <p>Las dimensiones de FLEX, BASS y Saffire proceden de las publicaciones de NASA indicadas en cada ficha. SAME es un esquema conceptual porque no hay planos acotados públicos.</p>
          <p>Las animaciones comprimen el tiempo y no reproducen velocidades medidas. Los valores experimentales están en la tabla de cada ensayo.</p></div>
      </section>`);

    const $ = selector => root.querySelector(selector);
    const viewport = $("#model-viewport"), info = $("#model-info"), parts = $("#model-parts");
    const play = $("#model-play"), scrub = $("#model-scrub"), speed = $("#model-speed");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let current, viewer, frame, scrubbing = false;

    function setPlaying(on) {
      play.innerHTML = icon(on ? "pause" : "play");
      play.setAttribute("aria-label", on ? "Pausar" : "Reproducir");
    }

    function pickPart(index) {
      const part = current.hotspots[index];
      for (const control of root.querySelectorAll("[data-part]")) control.setAttribute("aria-pressed", String(Number(control.dataset.part) === index));
      if (viewer?.loaded) viewer.cameraTarget = part.posicion.map(value => value + "m").join(" ");
      $("#model-part-note").innerHTML = `<strong>${esc(part.titulo)}</strong><p>${esc(part.texto)}</p>`;
    }

    function select(id) {
      if (current?.id === id) return;
      current = models.find(model => model.id === id);
      cancelAnimationFrame(frame);
      for (const button of root.querySelectorAll("[data-model]")) button.setAttribute("aria-pressed", String(button.dataset.model === id));
      $("#model-place").textContent = current.lugar.toUpperCase();
      $("#model-title").textContent = current.titulo;
      $("#model-scale").textContent = current.escala;
      $("#model-download").href = current.archivo;
      $("#model-phases").innerHTML = current.fases.map(([time, label]) => `<button type="button" data-time="${time}">${esc(label)}</button>`).join("");
      parts.innerHTML = current.hotspots.map((part, index) => `<button class="ship-component" type="button" data-part="${index}" aria-pressed="false"><span class="mono">${index + 1}</span>${esc(part.titulo)}${icon("chevron-right")}</button>`).join("");
      info.innerHTML = `
        <div class="ship-part">
          <header><span class="ship-part-index mono">${models.indexOf(current) + 1}</span><div><span class="overline">${esc(current.experimento)}</span><h2>${esc(current.titulo)}</h2></div></header>
          <p class="ship-part-summary">${esc(current.resumen)}</p>
          <div class="ship-reference" id="model-part-note"></div>
          <dl class="ship-specs">${current.datos.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>
          <details class="ship-citations" open><summary>Fuentes de esta ficha (${current.fuentes.length})</summary>
            <ul>${current.fuentes.map(([label, url]) => `<li><a class="text-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ${icon("arrow-up-right")}</a></li>`).join("")}</ul></details>
          <a class="button button-outline button-small" href="#experimentos">${icon("book")} Ver tablas de ${esc(current.experimento)}</a>
        </div>`;
      viewport.innerHTML = `
        <model-viewer class="ship-viewer" src="${current.archivo}" ${current.poster ? `poster="${current.poster}"` : ""} alt="${esc(current.titulo + ". " + current.escala)}"
          camera-controls disable-tap loading="eager" interaction-prompt="none" touch-action="pan-y" animation-name="Ensayo"
          shadow-intensity=".6" exposure="1.05" environment-image="neutral" camera-orbit="35deg 68deg auto"
          min-camera-orbit="auto auto 0%" max-camera-orbit="auto auto 400%" ar ar-modes="webxr scene-viewer quick-look">
          ${current.hotspots.map((part, index) => `
            <button slot="hotspot-${index}" class="ship-hotspot" data-part="${index}" data-position="${part.posicion.map(value => value + "m").join(" ")}" data-normal="0m 1m 0m" data-visibility-attribute="visible"
              aria-label="Punto ${index + 1}. ${esc(part.titulo)}" aria-pressed="false" type="button">
              <span class="ship-pin">${index + 1}</span><span class="ship-bubble">${esc(part.titulo)}</span>
            </button>`).join("")}
        </model-viewer>
        <span class="ship-model-status" role="status">Cargando modelo 3D…</span>
        <div class="ship-camera" role="group" aria-label="Cámara 3D">
          <button class="icon-button" type="button" data-model-camera="reset" aria-label="Restablecer cámara" disabled>${icon("globe")}</button>
          <button class="icon-button" type="button" data-model-camera="ar" aria-label="Ver en tu espacio con realidad aumentada" hidden>${icon("planet")}</button>
        </div>`;
      const mine = viewer = viewport.querySelector("model-viewer");
      const status = viewport.querySelector(".ship-model-status");
      viewport.classList.remove("ship-loaded");
      play.disabled = scrub.disabled = true;
      pickPart(0);
      mine.addEventListener("load", () => {
        if (viewer !== mine) return;
        status.textContent = "Arrastra para girar · Desplaza para acercar";
        viewport.classList.add("ship-loaded");
        scrub.max = mine.duration || 1;
        play.disabled = scrub.disabled = false;
        mine.timeScale = Number(speed.value);
        for (const button of viewport.querySelectorAll("[data-model-camera]")) button.disabled = false;
        if (mine.canActivateAR) viewport.querySelector('[data-model-camera="ar"]').hidden = false;
        if (reduced) { mine.pause(); setPlaying(false); } else { mine.play({ repetitions: Infinity }); setPlaying(true); }
        tick();
      }, { once: true });
      mine.addEventListener("error", () => {
        status.textContent = "El modelo 3D no está disponible en este navegador. Puedes descargar el GLB.";
      });
      loadViewer().catch(() => { status.textContent = "El visor 3D no está disponible en este navegador. Puedes descargar el GLB."; });
      history.replaceState(null, "", "#modelos?" + new URLSearchParams({ modelo: id }));
    }

    function tick() {
      cancelAnimationFrame(frame);
      const step = () => {
        if (!viewer?.isConnected) return;
        const time = viewer.currentTime;
        if (!scrubbing) scrub.value = time;
        $("#model-time").textContent = `${seconds(time)} / ${seconds(viewer.duration || 0)}`;
        let active = 0;
        current.fases.forEach(([start], index) => { if (time >= start) active = index; });
        [...$("#model-phases").children].forEach((button, index) => button.classList.toggle("active", index === active));
        frame = requestAnimationFrame(step);
      };
      step();
    }

    root.addEventListener("click", event => {
      const control = event.target.closest("[data-model], [data-part], [data-time], [data-model-camera], #model-play");
      if (!control) return;
      const { model, part, time, modelCamera } = control.dataset;
      if (model) select(model);
      if (part !== undefined) pickPart(Number(part));
      if (time !== undefined && viewer?.loaded) {
        viewer.currentTime = Number(time);
        if (viewer.paused) { viewer.play({ repetitions: Infinity }); setPlaying(true); }
      }
      if (modelCamera === "reset" && viewer?.loaded) { viewer.cameraTarget = "auto"; viewer.cameraOrbit = "35deg 68deg auto"; viewer.fieldOfView = "auto"; }
      if (modelCamera === "ar") viewer.activateAR();
      if (control.id === "model-play" && viewer?.loaded) {
        if (viewer.paused) { viewer.play({ repetitions: Infinity }); setPlaying(true); } else { viewer.pause(); setPlaying(false); }
      }
    }, { signal });
    scrub.addEventListener("input", () => { scrubbing = true; viewer.pause(); setPlaying(false); viewer.currentTime = Number(scrub.value); }, { signal });
    scrub.addEventListener("change", () => { scrubbing = false; }, { signal });
    speed.addEventListener("change", () => { if (viewer) viewer.timeScale = Number(speed.value); }, { signal });
    setPlaying(true);
    select(models.some(model => model.id === requested) ? requested : models[0].id);
  }

  return () => { disposed = true; controller.abort(); };
}
