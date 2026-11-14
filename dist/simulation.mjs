import { icon } from "./icons.mjs";
import { outcomeLabels } from "./analysis.mjs";
import { createScene } from "./simulation-scene.mjs";

const format = new Intl.NumberFormat("es", { maximumFractionDigits: 2 });
const fuels = { Methanol: "Metanol", Heptane: "Heptano" };
const directions = { Concurrent: "Concurrente", Opposed: "Opuesto" };
const num = value => format.format(value);

function experiments(studies) {
  const flex = studies.find(study => study.id === "PSI-69");
  const saffire = studies.find(study => study.id === "PSI-98");
  return {
    flex: {
      study: flex, axis: "Combustible", variable: "Diámetro inicial", unit: "mm", min: .5, max: 6, step: .01,
      runs: flex.rows.filter(({values}) => Number(values[13]) > 0 && Number(values[10]) > 0 && fuels[values[4]])
        .map(({values, line, label}) => ({
          line, label, group: values[4], groupLabel: fuels[values[4]], duration: Number(values[13]),
          size: Number(values[10]), oxygen: values[6], pressure: values[5], outcome: outcomeLabels[values[14]] ?? values[14],
        })),
    },
    saffire: {
      study: saffire, axis: "Dirección del flujo", variable: "Velocidad del aire", unit: "cm/s", min: 0, max: 40, step: 1,
      runs: saffire.rows.filter(({kind}) => kind === "observation").map(({values, line, label}) => ({
        line, label, group: values[10], groupLabel: directions[values[10]], duration: Number(values[9]),
        size: Number(values[5]), oxygen: values[6], width: values[3], length: values[4],
      })),
    },
  };
}

const runLabel = (key, run) => key === "flex"
  ? `Ensayo ${run.label} · ${num(run.size)} mm · ${num(Number(run.oxygen) * 100)} % O₂ · ${run.outcome}`
  : `Muestra ${run.label} · ${run.groupLabel} · ${num(run.duration)} s`;

export function mountSimulation(root, studies) {
  const catalog = experiments(studies);
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
        <label>Experimento<select id="sim-study"><option value="flex">FLEX · Gotas de combustible</option><option value="saffire">Saffire-I · Propagación en tela</option></select></label>
        <div class="segmented" role="group" aria-label="Modo de simulación">
          <button type="button" data-sim-mode="record" aria-pressed="true">NASA PSI</button>
          <button type="button" data-sim-mode="custom" aria-pressed="false">Personalizado</button>
        </div>
        <label><span id="sim-axis"></span><select id="sim-group"></select></label>
        <label id="sim-record-field">Corrida registrada<select id="sim-run"></select></label>
        <label id="sim-variable-field" hidden><span id="sim-variable"></span><input id="sim-size" type="range"></label>
        <dl class="sim-metrics" id="sim-metrics"></dl>
        <p class="sim-note" id="sim-note"></p>
        <a class="text-link" id="sim-source" target="_blank" rel="noopener">Ficha y DOI del experimento ${icon("arrow-up-right")}</a>
      </section>
    </div>`;

  const get = id => root.querySelector("#sim-" + id);
  const canvas = root.querySelector(".sim-viewport canvas");
  let key = "flex", mode = "record", run, size, group, fraction = 0, playing = false, frame, previous, speed = 1;
  const scene = createScene(canvas, () => draw());
  const selectOptions = (select, options) => select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
  const displaySeconds = seconds => `${num(seconds)} s`;
  const playbackLength = () => mode === "record" ? Math.min(26, Math.max(4, run.duration)) : 9;

  function draw() {
    if (!run) return;
    scene.render({ key, size, reverse: group === "Opposed", fraction, finish: mode === "record", fuel: group });
    get("time").value = Math.round(fraction * 1000);
    get("clock").value = mode === "record"
      ? `${displaySeconds(fraction * run.duration)} / ${displaySeconds(run.duration)}`
      : `${Math.round(fraction * 100)} %`;
    get("time").setAttribute("aria-valuetext", get("clock").value);
    get("phase").textContent = fraction === 0 ? "Inicio" : fraction === 1
      ? (mode === "record" ? run.outcome ?? "Fin del registro" : "Fin de la animación")
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

  function metrics() {
    const config = catalog[key];
    get("variable").textContent = `${config.variable} · ${num(size)} ${config.unit}`;
    const entries = [[config.variable, `${num(size)} ${config.unit}`]];
    if (mode === "record") {
      entries.push(["Duración registrada", displaySeconds(run.duration)], ["Fila del CSV", run.line]);
      if (key === "flex") entries.push(["Oxígeno inicial", `${num(Number(run.oxygen) * 100)} %`], ["Presión inicial", `${num(Number(run.pressure))} mmHg`]);
      else entries.push(["Dimensiones de la muestra", `${run.width} × ${run.length} cm`]);
    }
    get("metrics").replaceChildren(...entries.map(([label, value]) => {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = value;
      wrapper.append(term, detail);
      return wrapper;
    }));
    get("note").textContent = mode === "record"
      ? "La duración y las condiciones vienen del CSV. La geometría, el avance y la llama son ilustrativos. Los ensayos largos se aceleran en pantalla."
      : "El control cambia el tamaño de la gota o las partículas del flujo. La animación personalizada es didáctica y carece de un modelo físico validado.";
  }

  function selectRun() {
    run = catalog[key].runs.find(candidate => candidate.line === Number(get("run").value));
    size = run.size;
    get("size").value = size;
    metrics();
    reset();
  }

  function selectGroup() {
    group = get("group").value;
    selectOptions(get("run"), catalog[key].runs.filter(run => run.group === group).map(run => [run.line, runLabel(key, run)]));
    if (mode === "record") selectRun();
    else reset();
  }

  function selectStudy() {
    key = get("study").value;
    const config = catalog[key];
    const { study } = config;
    get("accession").textContent = `${study.id} · ${study.mission}`;
    get("scene-title").textContent = study.name;
    get("axis").textContent = config.axis;
    get("source").href = "https://doi.org/" + study.doi;
    Object.assign(get("size"), { min: config.min, max: config.max, step: config.step });
    selectOptions(get("group"), [...new Map(config.runs.map(item => [item.group, item.groupLabel]))]);
    const custom = mode === "custom";
    mode = "record";
    selectGroup();
    if (custom) { mode = "custom"; metrics(); draw(); }
  }

  get("study").onchange = selectStudy;
  get("group").onchange = selectGroup;
  get("run").onchange = selectRun;
  get("size").oninput = () => { size = Number(get("size").value); metrics(); draw(); };
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
      get("record-field").hidden = mode !== "record";
      get("variable-field").hidden = mode !== "custom";
      if (mode === "record") selectRun();
      else { metrics(); reset(); }
    };
  });
  root.querySelectorAll("[data-sim-camera]").forEach(button => {
    button.onclick = () => scene.rotate(button.dataset.simCamera);
  });
  selectStudy();
  return () => { stop(); scene.dispose(); };
}
