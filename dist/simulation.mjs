import { icon } from "./icons.mjs";
import { createScene } from "./simulation-scene.mjs";
import { outcomeLabels } from "./analysis.mjs";

const format = new Intl.NumberFormat("es", { maximumFractionDigits: 2 });
const num = value => format.format(value);

// Columns in the original PSI tables. Duration is only shown when reported.
const setups = {
  "PSI-69": { scene: "flex", sample: 4, size: 10, duration: 13, oxygen: 6, outcome: 14 },
  "PSI-68": { scene: "flex", sample: 0, size: 1, oxygen: 3, flow: 6 },
  "PSI-25": { scene: "solid", sample: 5, oxygen: 11 },
  "PSI-26": { scene: "solid", sample: 5 },
  "PSI-98": { scene: "solid", sample: 1, flow: 5, direction: 10, duration: 9, length: 3, width: 4, oxygen: 6 },
  "PSI-99": { scene: "solid", sample: 1, flow: 5, direction: 10, duration: 9, length: 3, width: 4, oxygen: 6 },
  "PSI-100": { scene: "solid", sample: 1, flow: 5, direction: 6, length: 3, width: 4 },
  "PSI-101": { scene: "aerosol", sample: 0, flow: 4, duration: 6, aging: 9 },
  "PSI-102": { scene: "aerosol", sample: 1, flow: 2, aging: 4 },
};

function scalar(value, fallback) {
  const match = /^([+-]?(?:\d+(?:[.,]\d+)?|\.\d+))\s*(?:mm|cm|cm\/s|s|sec|%|min)?$/i.exec((value ?? "").trim());
  return match ? Number(match[1].replace(",", ".")) : fallback;
}

const scenes = {
  flex: {
    label: "Combustión de gotas",
    legend: [["sample", "Gota de combustible"], ["heat", "Envolvente de llama"]],
    phases: [
      ["Gota inicial", "Observa el tamaño inicial de la gota suspendida en el centro."],
      ["Llama visible", "El halo cálido representa la llama alrededor de la gota. Su tamaño en pantalla es esquemático."],
      ["Fin del ensayo", "La animación termina aquí. El resultado registrado aparece en la ficha del ensayo, cuando está disponible."],
    ],
  },
  solid: {
    label: "Combustión de sólidos",
    legend: [["sample", "Muestra"], ["heat", "Frente de llama"], ["flow", "Flujo de aire"]],
    phases: [
      ["Muestra inicial", "Identifica la muestra y la dirección del aire. La cámara se puede girar."],
      ["Avance del frente", "El frente naranja recorre la muestra. Las trazas azules indican cómo se representa el flujo de aire."],
      ["Fin del ensayo", "La animación llega al final de su recorrido esquemático. La superficie coloreada no representa daño medido."],
    ],
  },
  aerosol: {
    label: "Aerosoles y humo",
    legend: [["sample", "Material de origen"], ["flow", "Partículas de aerosol"]],
    phases: [
      ["Muestra inicial", "La muestra de origen está situada en uno de los extremos de la cámara."],
      ["Transporte", "Los puntos azules ilustran el transporte de partículas. El flujo cambia su desplazamiento visual."],
      ["Fin del ensayo", "Compara la dispersión ilustrada con las condiciones del registro. Los tamaños mostrados son esquemáticos."],
    ],
  },
};

const sceneFields = {
  sample: ["Material o combustible", "Cambia el color o la forma de la muestra."],
  size: ["Diámetro inicial", "Cambia el tamaño inicial de la gota."],
  duration: ["Duración", "Ajusta el reloj de la reproducción."],
  oxygen: ["Oxígeno inicial", "Cambia la extensión visual de la llama."],
  flow: ["Velocidad del aire", "Modifica el movimiento de las trazas, partículas o llama."],
  direction: ["Dirección del flujo", "Usa «opuesto» o «concurrente» para orientar las trazas."],
  length: ["Largo de la muestra", "Alarga o acorta el modelo de la muestra."],
  width: ["Ancho de la muestra", "Cambia el ancho del modelo de la muestra."],
  aging: ["Tiempo de envejecimiento", "Modifica el tamaño ilustrado de las partículas."],
};

function recordedValue(values, config, name) {
  const value = values[config[name]]?.trim();
  if (!value) return "";
  if (name === "sample") return ({ Methanol: "Metanol", Heptane: "Heptano" })[value] ?? value;
  if (name === "direction") return ({ Concurrent: "Concurrente", Opposed: "Opuesto" })[value] ?? value;
  const number = scalar(value, NaN);
  if (name === "oxygen" && Number.isFinite(number)) return `${num(number <= 1 && !value.includes("%") && config.scene === "flex" ? number * 100 : number)} %`;
  if (name === "duration" && Number.isFinite(number)) return `${num(number)} s`;
  if (name === "flow" && Number.isFinite(number)) return `${num(number)} cm/s`;
  if (name === "size" && Number.isFinite(number)) return `${num(number)} mm`;
  return value;
}

export function mountSimulation(root, studies, initialStudy) {
  const catalog = new Map(studies.filter(study => setups[study.id]).map(study => [study.id, study]));
  root.innerHTML = `
    <header class="page-heading sim-page-head"><div><h1 class="sr-only">Simulación</h1><p>Explora un ensayo de NASA en 3D y compara qué cambia al editar sus parámetros.</p></div></header>
    <div class="simulation-layout">
      <section class="card sim-stage" aria-labelledby="sim-scene-title">
        <div class="sim-stage-head"><div><span class="overline" id="sim-accession"></span><h2 id="sim-scene-title"></h2></div><span class="station-chip">${icon("planet")} Escena esquemática</span></div>
        <div class="sim-viewport"><canvas aria-label="Vista 3D del ensayo. Arrastra para girar o usa los botones de la cámara."></canvas>
          <span class="sim-overlay" id="sim-phase"></span>
          <span class="sim-orbit-hint">Arrastra para girar</span>
          <ul class="sim-legend" id="sim-legend" aria-label="Leyenda de la escena"></ul>
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
        <section class="sim-guide" aria-labelledby="sim-guide-title">
          <h3 id="sim-guide-title">Qué estás viendo</h3>
          <div id="sim-steps" class="sim-steps" role="group" aria-label="Momentos de la reproducción"></div>
          <p id="sim-explanation"></p>
        </section>
      </section>
      <section class="card sim-controls" aria-labelledby="sim-controls-title">
        <h2 id="sim-controls-title">Configura el ensayo</h2>
        <label>Experimento<select id="sim-study"></select></label>
        <div class="segmented" role="group" aria-label="Modo de simulación">
          <button type="button" data-sim-mode="record" aria-pressed="true">Datos NASA</button>
          <button type="button" data-sim-mode="custom" aria-pressed="false">Personalizado</button>
        </div>
        <label>Registro de referencia<select id="sim-run"></select></label>
        <dl id="sim-summary" class="sim-summary"></dl>
        <section id="sim-edit-panel" hidden aria-labelledby="sim-edit-title">
          <div class="sim-field-heading"><h3 id="sim-edit-title">Parámetros de la escena</h3><button type="button" class="text-link" id="sim-restore">Restaurar valores</button></div>
          <div id="sim-scene-fields" class="sim-fields"></div>
        </section>
        <details id="sim-details"><summary id="sim-details-title">Ver campos del CSV</summary><div id="sim-fields" class="sim-fields"></div></details>
        <p class="sim-note" id="sim-note"></p>
        <a class="text-link" id="sim-source" target="_blank" rel="noopener">Ficha y DOI del experimento ${icon("arrow-up-right")}</a>
      </section>
    </div>`;

  const get = id => root.querySelector("#sim-" + id);
  const canvas = root.querySelector(".sim-viewport canvas");
  let study, config, mode = "record", run, values, fraction = 0, playing = false, frame, previous, speed = 1, lastStep;
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
      finish: true, fuel: sample, oxygen: oxygen <= 1 && config.scene === "flex" && !values[config.oxygen]?.includes("%") ? oxygen * 100 : oxygen,
      length: scalar(values[config.length], 65), width: scalar(values[config.width], 35),
      aging: scalar(values[config.aging], 20),
    });
    get("time").value = Math.round(fraction * 1000);
    get("clock").value = duration() > 0
      ? `${displaySeconds(fraction * duration())} / ${displaySeconds(duration())}`
      : `${Math.round(fraction * 100)} %`;
    get("time").setAttribute("aria-valuetext", get("clock").value);
    const step = fraction === 0 ? 0 : fraction === 1 ? 2 : 1;
    if (lastStep !== step) {
      const [label, explanation] = scenes[config.scene].phases[step];
      get("phase").textContent = label;
      get("explanation").textContent = explanation;
      get("steps").querySelectorAll("button").forEach((button, index) => button.setAttribute("aria-pressed", String(index === step)));
      lastStep = step;
    }
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
    const custom = mode === "custom";
    const visual = new Map(Object.entries(config).filter(([name]) => Object.hasOwn(sceneFields, name)).map(([name, index]) => [index, name]));
    const field = (header, index, sceneKey) => {
      const label = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = sceneKey ? sceneFields[sceneKey][0] : header;
      const input = document.createElement("input");
      input.value = values[index];
      input.placeholder = "Sin dato";
      input.readOnly = !custom;
      input.title = header;
      input.oninput = () => { values[index] = input.value; draw(); };
      label.append(title, input);
      if (sceneKey) {
        const hint = document.createElement("small");
        hint.textContent = sceneFields[sceneKey][1];
        label.append(hint);
      }
      return label;
    };
    get("edit-panel").hidden = !custom;
    get("summary").hidden = custom;
    get("details").open = false;
    get("details-title").textContent = custom ? "Editar otros campos del CSV" : "Ver todos los campos del CSV";
    get("scene-fields").replaceChildren(...(custom ? [...visual].map(([index, name]) => field(study.headers[index], index, name)) : []));
    get("fields").replaceChildren(...study.headers.flatMap((header, index) => custom && visual.has(index) ? [] : [field(header, index)]));
    const outcome = recordedValue(values, config, "outcome");
    const summary = [
      [config.scene === "flex" ? "Combustible" : "Material", recordedValue(values, config, "sample")],
      ["Duración registrada", recordedValue(values, config, "duration")],
      ["Resultado registrado", outcomeLabels[outcome] ?? outcome],
      ["Flujo registrado", recordedValue(values, config, "flow")],
      ["Dirección del flujo", recordedValue(values, config, "direction")],
      ["Oxígeno inicial", recordedValue(values, config, "oxygen")],
      ["Diámetro inicial", recordedValue(values, config, "size")],
    ].filter(([, value]) => value);
    get("summary").replaceChildren(...summary.map(([name, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = name;
      detail.textContent = value;
      row.append(term, detail);
      return row;
    }));
    const note = run.kind === "conditions"
      ? "Esta fila describe condiciones o referencias. El visor usa valores ilustrativos cuando el CSV presenta rangos o celdas vacías."
      : `Fila ${run.line} del CSV. La geometría y el avance son ilustrativos. Los ensayos largos se aceleran en pantalla.`;
    get("note").textContent = mode === "record" ? note
      : "Los cambios muestran efectos visuales ilustrativos. Los campos adicionales editan la ficha de referencia. El visor no predice resultados físicos.";
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
    const guide = scenes[config.scene];
    get("scene-title").textContent = `${study.name} · ${guide.label}`;
    get("legend").innerHTML = guide.legend.map(([color, label]) => `<li><i class="sim-swatch ${color}"></i>${label}</li>`).join("");
    get("steps").replaceChildren(...guide.phases.map(([label], index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.onclick = () => { stop(); fraction = index / 2; draw(); };
      return button;
    }));
    lastStep = undefined;
    get("source").href = "https://doi.org/" + study.doi;
    selectOptions(get("run"), study.rows.map(row => [row.line,
      `${row.kind === "conditions" ? "Condiciones" : "Registro"} ${row.label} · ${recordedValue(row.values, config, "sample") || "Fila " + row.line}`]));
    selectRun();
  }

  get("study").onchange = selectStudy;
  get("run").onchange = selectRun;
  get("restore").onclick = () => { values = [...run.values]; fields(); draw(); };
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
  if (catalog.has(initialStudy)) get("study").value = initialStudy;
  selectStudy();
  return () => { stop(); scene.dispose(); };
}
