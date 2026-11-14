import { icon } from "./icons.mjs";
import { createScene } from "./simulation-scene.mjs";

const format = new Intl.NumberFormat("es", { maximumFractionDigits: 2 });
const num = value => format.format(value);

// Columns in the original PSI tables. Duration is only shown when reported.
const setups = {
  "PSI-69": { scene: "flex", sample: 4, size: 10, duration: 13, oxygen: 6, outcome: 14 },
  "PSI-68": { scene: "flex", sample: 0, size: 1, oxygen: 3, flow: 6 },
  "PSI-25": { scene: "solid", sample: 5, oxygen: 11 },
  "PSI-26": { scene: "solid", sample: 5 },
  "PSI-98": { scene: "solid", sample: 1, flow: 5, direction: 10, duration: 9, length: 4, width: 3, oxygen: 6 },
  "PSI-99": { scene: "solid", sample: 1, flow: 5, direction: 10, duration: 9, length: 3, width: 4, oxygen: 6 },
  "PSI-100": { scene: "solid", sample: 1, flow: 5, direction: 6, length: 3, width: 4 },
  "PSI-101": { scene: "aerosol", sample: 0, flow: 4, duration: 6, aging: 9 },
  "PSI-102": { scene: "aerosol", sample: 1, flow: 2, aging: 4 },
};

function scalar(value, fallback) {
  const match = /^([+-]?(?:\d+(?:[.,]\d+)?|\.\d+))\s*(?:mm|cm|cm\/s|s|sec|%|min)?$/i.exec((value ?? "").trim());
  return match ? Number(match[1].replace(",", ".")) : fallback;
}

export function mountSimulation(root, studies) {
  const catalog = new Map(studies.filter(study => setups[study.id]).map(study => [study.id, study]));
  root.innerHTML = `
    <header class="page-heading"><div><span class="overline">LABORATORIO INTERACTIVO</span><h1 class="sr-only">Simulación</h1><p>Reproduce un ensayo de NASA o cambia los parámetros en una escena 3D.</p></div></header>
    <div class="simulation-layout">
      <section class="card sim-stage" aria-labelledby="sim-scene-title">
        <div class="sim-stage-head"><div><span class="overline" id="sim-accession"></span><h2 id="sim-scene-title"></h2></div><span class="station-chip">${icon("planet")} Escena 3D</span></div>
        <div class="sim-viewport"><canvas aria-label="Vista 3D del ensayo. Arrastra para girar o usa los botones de la cámara."></canvas>
          <span class="sim-overlay" id="sim-phase"></span>
          <div class="sim-camera" aria-label="Cámara 3D">
            <button class="icon-button" type="button" data-sim-camera="left" aria-label="Girar a la izquierda">${icon("chevron-left")}</button>
            <button class="icon-button" type="button" data-sim-camera="right" aria-label="Girar a la derecha">${icon("chevron-right")}</button>
            <button class="icon-button" type="button" data-sim-camera="reset" aria-label="Restablecer cámara">${icon("globe")}</button>
          </div>
        </div>
        <div class="sim-transport">
          <button class="button button-dark" id="sim-play" type="button">Reproducir</button>
          <button class="button button-outline" id="sim-reset" type="button">Reiniciar</button>
          <input id="sim-time" type="range" min="0" max="1000" value="0" aria-label="Avance de reproducción">
          <output class="mono" id="sim-clock" for="sim-time"></output>
          <select id="sim-speed" aria-label="Velocidad de reproducción"><option value=".5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
        </div>
      </section>
      <section class="card sim-controls" aria-labelledby="sim-controls-title">
        <h2 id="sim-controls-title">Parámetros del ensayo</h2>
        <label>Experimento<select id="sim-study"></select></label>
        <div class="segmented" role="group" aria-label="Modo de simulación">
          <button type="button" data-sim-mode="record" aria-pressed="true">NASA PSI</button>
          <button type="button" data-sim-mode="custom" aria-pressed="false">Personalizado</button>
        </div>
        <label>Registro de referencia<select id="sim-run"></select></label>
        <div id="sim-fields" class="sim-fields"></div>
        <p class="sim-note" id="sim-note"></p>
        <a class="text-link" id="sim-source" target="_blank" rel="noopener">Ficha y DOI del experimento ${icon("arrow-up-right")}</a>
      </section>
    </div>`;

  const get = id => root.querySelector("#sim-" + id);
  const canvas = root.querySelector(".sim-viewport canvas");
  let study, config, mode = "record", run, values, fraction = 0, playing = false, frame, previous, speed = 1;
  const scene = createScene(canvas, () => draw());
  const selectOptions = (select, options) => select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
  const displaySeconds = seconds => `${num(seconds)} s`;
  const duration = () => scalar(values[config.duration], 0);
  const playbackLength = () => duration() > 0 ? Math.min(26, Math.max(4, duration())) : 9;

  function draw() {
    if (!run) return;
    const sample = values[config.sample] ?? "";
    const oxygen = scalar(values[config.oxygen], 21);
    scene.render({ key: config.scene, size: scalar(values[config.size], 2),
      flow: scalar(values[config.flow], config.scene === "flex" ? 0 : 8),
      reverse: /opuest|oppos/i.test(values[config.direction] ?? ""), fraction,
      finish: true, fuel: sample, oxygen: oxygen <= 1 ? oxygen * 100 : oxygen,
      length: scalar(values[config.length], 65), width: scalar(values[config.width], 35),
      aging: scalar(values[config.aging], 20),
    });
    get("time").value = Math.round(fraction * 1000);
    get("clock").value = duration() > 0
      ? `${displaySeconds(fraction * duration())} / ${displaySeconds(duration())}`
      : `${Math.round(fraction * 100)} %`;
    get("time").setAttribute("aria-valuetext", get("clock").value);
    get("phase").textContent = fraction === 0 ? "Inicio" : fraction === 1
      ? "Fin de la reproducción"
      : "Reproducción esquemática";
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(frame);
    previous = undefined;
    get("play").textContent = "Reproducir";
  }

  function tick(now) {
    if (!canvas.isConnected) return;
    const elapsed = previous === undefined ? 0 : (now - previous) / 1000;
    previous = now;
    fraction = Math.min(1, fraction + elapsed * speed / playbackLength());
    draw();
    if (fraction < 1 && playing) frame = requestAnimationFrame(tick);
    else stop();
  }

  function reset() {
    stop();
    fraction = 0;
    draw();
  }

  function fields() {
    const visual = new Set(Object.entries(config).filter(([name]) => !["scene", "outcome"].includes(name)).map(([, index]) => index));
    get("fields").replaceChildren(...study.headers.map((header, index) => {
      const label = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = header + (mode === "custom" && visual.has(index) ? " · escena" : "");
      const input = document.createElement("input");
      input.value = values[index];
      input.placeholder = "Sin dato";
      input.readOnly = mode === "record";
      input.oninput = () => { values[index] = input.value; draw(); };
      label.append(title, input);
      return label;
    }));
    const note = run.kind === "conditions"
      ? "Esta fila describe condiciones o referencias. El avance es ilustrativo."
      : `Fila ${run.line} del CSV. El avance y la geometría son esquemáticos.`;
    get("note").textContent = mode === "record" ? note
      : "Los campos marcados «escena» afectan la visualización o el reloj. Los demás son editables como contexto; el modelo no calcula resultados físicos.";
  }

  function selectRun() {
    run = study.rows.find(candidate => candidate.line === Number(get("run").value));
    values = [...run.values];
    fields();
    reset();
  }

  function selectStudy() {
    study = catalog.get(get("study").value);
    config = setups[study.id];
    get("accession").textContent = `${study.id} · ${study.mission}`;
    get("scene-title").textContent = study.name;
    get("source").href = "https://doi.org/" + study.doi;
    selectOptions(get("run"), study.rows.map(row => [row.line,
      `${row.kind === "conditions" ? "Condiciones" : "Registro"} ${row.label} · ${row.sample || "Fila " + row.line}`]));
    selectRun();
  }

  get("study").onchange = selectStudy;
  get("run").onchange = selectRun;
  get("speed").onchange = () => { speed = Number(get("speed").value); };
  get("reset").onclick = reset;
  get("time").oninput = () => { stop(); fraction = Number(get("time").value) / 1000; draw(); };
  get("play").onclick = () => {
    if (playing) { stop(); return; }
    if (fraction === 1) fraction = 0;
    playing = true;
    get("play").textContent = "Pausar";
    frame = requestAnimationFrame(tick);
  };
  root.querySelectorAll("[data-sim-mode]").forEach(button => {
    button.onclick = () => {
      mode = button.dataset.simMode;
      root.querySelectorAll("[data-sim-mode]").forEach(tab => tab.setAttribute("aria-pressed", String(tab === button)));
      selectRun();
    };
  });
  root.querySelectorAll("[data-sim-camera]").forEach(button => {
    button.onclick = () => scene.rotate(button.dataset.simCamera);
  });
  selectOptions(get("study"), [...catalog.values()].map(item => [item.id, `${item.name} · ${item.id}`]));
  selectStudy();
  return () => { stop(); scene.dispose(); };
}
