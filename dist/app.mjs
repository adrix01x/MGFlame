import { icon, initIcons } from "./icons.mjs";
import { sources, evidence, incidents, transfers, topics, missions } from "./data/evidence.mjs";
import { answerQuestion, catalogStats, countFlex, missionScore, normalize, outcomeLabels, rankEvidence } from "./analysis.mjs";

const pages = { resumen: "Resumen", experimentos: "Experimentos", incidentes: "Incidentes", fuentes: "Fuentes y datos" };
const fuelLabels = { all: "Todos", Methanol: "Metanol", Heptane: "Heptano" };
const outcomeColors = { Extinction: "orange", Disruption: "teal", Completion: "purple" };
const number = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const state = { page: "", mission: "orbit", topic: "all", fuel: "all", study: "PSI-69", query: "", outcome: "", kind: "all", sort: "original", tablePage: 0, sourceFilter: "all" };
const perPage = 12;
const main = document.querySelector("main");
const detailDialog = document.querySelector("#record-dialog");
const assistantDialog = document.querySelector("#assistant-dialog");
const messageLog = document.querySelector("#assistant-messages");
const questionInput = document.querySelector("#assistant-question");
let studies = [];

function escape(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function external(url, label, className = "text-link") {
  return `<a class="${className}" href="${escape(url)}" target="_blank" rel="noopener">${escape(label)} ${icon("arrow-up-right")}</a>`;
}

function download(url, label) {
  return `<a class="button button-outline button-small" href="${escape(url)}" download>${icon("download")}${escape(label)}</a>`;
}

function topicTag(key) {
  const topic = topics[key];
  return `<span class="topic-tag ${topic.color}">${topic.label}</span>`;
}

function stat(iconName, color, value, label, caption, page) {
  const tag = page ? "a" : "div";
  return `<${tag} class="stat-card card"${page ? ` href="#${page}"` : ""}><div class="stat-top"><span class="metric-icon ${color}">${icon(iconName)}</span>${page ? icon("arrow-up-right", "stat-arrow") : ""}</div><strong>${value}</strong><span class="stat-label">${label}</span><small>${caption}</small></${tag}>`;
}

function missionButtons() {
  const symbols = { orbit: "globe", moon: "moon", mars: "planet" };
  return `<div class="segmented missions" role="group" aria-label="Escenario de misión">${Object.entries(missions).map(([key, item]) =>
    `<button type="button" data-mission="${key}" aria-pressed="${state.mission === key}">${icon(symbols[key])}${item.label}</button>`).join("")}</div>`;
}

let viewerModule;

function drawOverview() {
  const stats = catalogStats(studies);
  main.innerHTML = `
    <h1 class="sr-only">Seguridad contra incendios espaciales</h1>
    <div class="control-room">
    <div class="control-left">
      <section class="station-panel" aria-labelledby="station-title">
        <div class="station-head"><div><span class="overline">LABORATORIO ORBITAL</span><h2 id="station-title">Estación Espacial<br>Internacional</h2></div><span class="station-chip">${icon("planet")} Modelo 3D</span></div>
        <div class="station-viewport">
          <div class="orbital-grid" aria-hidden="true"></div>
          <model-viewer id="iss-viewer" src="assets/iss.glb" loading="eager" camera-controls disable-pan disable-tap alt="Modelo 3D de la Estación Espacial Internacional" camera-orbit="34deg 63deg auto" field-of-view="30deg" min-field-of-view="16deg" max-field-of-view="44deg" exposure="1.15" interaction-prompt="none" touch-action="pan-y"><div class="station-poster" slot="poster"></div></model-viewer>
          <div class="station-controls" role="group" aria-label="Controles del modelo"><button class="icon-button" type="button" data-camera="left" aria-label="Girar a la izquierda" disabled>${icon("chevron-left")}</button><button class="icon-button" type="button" data-camera="right" aria-label="Girar a la derecha" disabled>${icon("chevron-right")}</button><button class="icon-button" type="button" data-camera="reset" aria-label="Restablecer vista" title="Restablecer vista" disabled>${icon("globe")}</button></div>
        </div>
        <div class="station-foot"><span id="station-hint" role="status">Cargando modelo 3D…</span>${external("https://science.nasa.gov/3d-resources/international-space-station-iss-a/", "NASA Ames")}</div>
      </section>
      <section class="card coverage" aria-labelledby="coverage-title">
        <div class="coverage-heading"><h2 id="coverage-title">Cobertura de la evidencia</h2><span class="mono">NASA PSI</span></div>
        <div class="stats">${stat("database", "orange", studies.length, "Tablas PSI", "CSV originales", "fuentes")}
        ${stat("flask", "teal", stats.observations, "Observaciones", "EEI y Cygnus", "experimentos")}
        ${stat("clock", "purple", incidents.length, "Incidentes", "Apollo y Mir", "incidentes")}
        ${stat("bulb", "blue", evidence.length, "Hallazgos", "Cinco temas", null)}</div>
      </section>
    </div>
    <div class="control-right">
      <section class="card flex-card" aria-labelledby="flex-title">
        <div class="card-heading"><div><h2 id="flex-title">Cómo terminan los ensayos</h2><p class="section-description">Combustión de gotas en microgravedad.</p></div><span class="station-chip">${icon("chart")} PSI-69 · FLEX</span></div>
        <div id="flex-interaction"></div>
        <div class="card-foot"><a class="text-link" href="#experimentos" data-study-link="PSI-69">Ver tabla FLEX ${icon("arrow-right")}</a><span class="mono muted">EEI · CIR</span></div>
      </section>
      <div class="control-bottom"><section class="card insights-card" aria-labelledby="insights-title">
        <div class="card-heading"><h2 id="insights-title">Hallazgos prioritarios</h2></div>
        <div id="mission-results"></div>
      </section>
      <section class="card mission-log" aria-labelledby="log-title">
        <div class="card-heading"><h2 id="log-title">Registro histórico</h2></div>
        ${incidents.map(item => `<button class="log-row" type="button" data-incident="${item.id}"><span class="metric-icon">${icon(item.icon)}</span><span><strong>${item.title}</strong><small>${item.event}</small></span>${icon("chevron-right", "log-arrow")}</button>`).join("")}
        <div class="card-foot"><a href="#incidentes" class="text-link">Ver incidentes ${icon("arrow-right")}</a></div>
      </section>
      </div></div>
    </div>`;
  drawFlex();
  drawRanking();
  const viewer = document.querySelector("#iss-viewer");
  const fallback = () => {
    if (!viewer.isConnected) return;
    viewer.parentElement.classList.add("poster-only");
    document.querySelector("#station-hint").textContent = "Vista de la estación · modelo de NASA";
  };
  viewer.addEventListener("error", fallback);
  viewer.addEventListener("load", () => {
    for (const button of viewer.parentElement.querySelectorAll("[data-camera]")) button.disabled = false;
    document.querySelector("#station-hint").textContent = "Arrastra para girar · Desplaza para acercar";
  }, { once: true });
  (viewerModule ??= import("./assets/model-viewer.min.js").then(({ ModelViewerElement }) => {
    ModelViewerElement.dracoDecoderLocation = new URL("./assets/draco/", import.meta.url).href;
  })).catch(fallback);
}

function drawFlex() {
  const study = studies.find(item => item.id === "PSI-69");
  const { total, counts } = countFlex(study, state.fuel);
  const filters = Object.entries(fuelLabels).map(([key, label]) =>
    `<button type="button" data-fuel="${key}" aria-pressed="${state.fuel === key}">${label}</button>`).join("");
  const rows = Object.entries(counts).map(([key, count]) => {
    const percent = 100 * count / total;
    return `<button class="chart-row" type="button" data-outcome="${key}" aria-label="Abrir ${count} registros de ${outcomeLabels[key].toLowerCase()}">
      <span class="bar-track"><span class="chart-bar ${outcomeColors[key]}" style="--bar-height:${percent}%"><span class="chart-value">${number.format(percent)}<small> %</small></span></span></span>
      <span class="chart-label">${outcomeLabels[key]}</span>
    </button>`;
  }).join("");
  document.querySelector("#flex-interaction").innerHTML = `
    <div class="chart-controls"><div class="segmented" role="group" aria-label="Combustible">${filters}</div><span class="sample-count mono" role="status">n = ${total}</span></div>
    <div class="vertical-chart"><div class="vertical-axis" aria-hidden="true"><span>100 %</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div class="bar-chart" aria-label="Porcentaje de registros por tipo de fin del ensayo">${rows}</div></div>`;
}

function drawRanking() {
  const group = missions[state.mission];
  const ordered = rankEvidence(state.mission).filter(item => state.topic === "all" || item.topic === state.topic);
  const rows = ordered.map((item, index) => `
    <button class="insight-row" type="button" data-evidence="${item.id}">
      <span class="rank-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="insight-info"><strong>${escape(item.title)}</strong><small>${topics[item.topic].label} <span>·</span> ${item.studies[0] ?? item.kind}</small></span>
      ${icon("chevron-right", "insight-arrow")}
    </button>`).join("");
  document.querySelector("#mission-results").innerHTML = `
    <div class="mission-controls">${missionButtons()}<button class="icon-button help-button" type="button" data-action="method" aria-label="Método de priorización" title="Método de priorización">${icon("info")}</button></div>
    <p class="mission-scope" role="status">${group.scope}</p>
    <div class="insight-list">${rows}</div>
    <div class="card-foot"><label class="inline-select">${icon("filter")}<span class="sr-only">Tema del hallazgo</span><select id="topic-filter"><option value="all">Todos los temas</option>${Object.entries(topics).map(([key, value]) => `<option value="${key}" ${key === state.topic ? "selected" : ""}>${value.label}</option>`).join("")}</select>${icon("chevron-down")}</label><span class="mono muted" aria-live="polite">${ordered.length} hallazgos</span></div>`;
}

function pageHead(eyebrow, title, description, actions = "") {
  return `<header class="page-heading"><div><span class="overline">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>${actions}</header>`;
}

function studySelection() {
  return studies.map(study => `<option value="${study.id}" ${study.id === state.study ? "selected" : ""}>${study.name} · ${study.id}</option>`).join("");
}

function drawExperiments() {
  main.innerHTML = pageHead("ARCHIVO EXPERIMENTAL", "Experimentos", "Examina los registros de combustión, aerosoles y propagación publicados por NASA PSI.", `<a class="button button-outline" href="#fuentes">${icon("database")} Ver los CSV</a>`) + `
    <section class="card dataset-controls" aria-label="Filtros de experimentos">
      <label><span>Investigación</span><span class="input-wrap">${icon("flask")}<select id="study-select">${studySelection()}</select>${icon("chevron-down", "input-tail")}</span></label>
      <label><span>Buscar en el registro</span><span class="input-wrap">${icon("search")}<input id="table-query" type="search" value="${escape(state.query)}" placeholder="Ensayo, material, condición…"></span></label>
      <label><span>Tipo de fila</span><span class="input-wrap">${icon("filter")}<select id="kind-select"><option value="all">Todas las filas</option><option value="observation">Observaciones</option><option value="conditions">Condiciones o referencias</option></select>${icon("chevron-down", "input-tail")}</span></label>
    </section>
    <section class="card table-card" id="dataset-panel" aria-labelledby="dataset-title"></section>`;
  document.querySelector("#kind-select").value = state.kind;
  drawTable();
}

function selectedRows(study) {
  const query = normalize(state.query.trim());
  const rows = study.rows.filter(row => {
    if (state.kind !== "all" && state.kind !== row.kind) return false;
    if (state.outcome && row.values[14] !== state.outcome) return false;
    if (study.id === "PSI-69" && state.fuel !== "all" && row.values[4] !== state.fuel) return false;
    return normalize(row.values.join(" ")).includes(query);
  });
  if (state.sort === "sample") rows.sort((a, b) => a.sample.localeCompare(b.sample, "es") || a.line - b.line);
  if (state.sort === "reverse") rows.reverse();
  return rows;
}

function drawTable() {
  const study = studies.find(item => item.id === state.study);
  const rows = selectedRows(study);
  const pagesTotal = Math.max(1, Math.ceil(rows.length / perPage));
  const activePage = Math.min(state.tablePage, pagesTotal - 1);
  state.tablePage = activePage;
  const start = activePage * perPage;
  const cells = rows.slice(start, start + perPage).map(row => `<tr>${study.columns.map(([column], i) => {
    let value = row.values[column];
    if (study.id === "PSI-69" && column === 14 && value) return `<td><span class="topic-tag ${outcomeColors[value] ?? "blue"}">${outcomeLabels[value] ?? escape(value)}</span></td>`;
    if (study.id === "PSI-69" && column === 4) value = fuelLabels[value] ?? value;
    return `<td class="${i === 0 ? "record-number" : ""}">${value ? escape(value) : '<span class="muted" aria-label="No reportado">—</span>'}</td>`;
  }).join("")}<td><button class="icon-button" type="button" data-record="${row.line}" aria-label="Ver detalle de fila ${row.line}">${icon("arrow-up-right")}</button></td></tr>`).join("");
  const filters = study.id === "PSI-69" ? `
    <label class="inline-select"><span>Combustible</span><select id="table-fuel">${Object.entries(fuelLabels).map(([key, value]) => `<option value="${key}" ${key === state.fuel ? "selected" : ""}>${value}</option>`).join("")}</select>${icon("chevron-down")}</label>
    <label class="inline-select"><span>Fin del ensayo</span><select id="table-outcome"><option value="">Todos</option>${Object.entries(outcomeLabels).map(([key, value]) => `<option value="${key}" ${key === state.outcome ? "selected" : ""}>${value}</option>`).join("")}</select>${icon("chevron-down")}</label>` : "";
  document.querySelector("#dataset-panel").innerHTML = `
    <div class="dataset-heading"><div><span class="overline">${study.id} · ${study.group}</span><h2 id="dataset-title">${study.name}</h2><p>${study.mission} <span>·</span> ${external("https://doi.org/" + study.doi, "DOI " + study.doi)}</p></div>${download(study.file, "Descargar CSV")}</div>
    <div class="dataset-note">${icon("info")}<p>${study.note}</p></div>
    <div class="table-toolbar"><span class="record-count" role="status">${rows.length} de ${study.rows.length} filas</span><div>${filters}
      <label class="inline-select">${icon("sort")}<span class="sr-only">Orden</span><select id="table-sort"><option value="original" ${state.sort === "original" ? "selected" : ""}>Orden original</option><option value="reverse" ${state.sort === "reverse" ? "selected" : ""}>Últimas filas primero</option><option value="sample" ${state.sort === "sample" ? "selected" : ""}>Muestra, A–Z</option></select>${icon("chevron-down")}</label></div></div>
    ${rows.length ? `<div class="table-scroll" tabindex="0" aria-label="Tabla de ${study.name}, desplazable"><table><thead><tr>${study.columns.map(([, label]) => `<th scope="col">${label}</th>`).join("")}<th scope="col"><span class="sr-only">Detalle</span></th></tr></thead><tbody>${cells}</tbody></table></div>` : '<div class="empty"><h3>Sin resultados</h3><p>Cambia los filtros o prueba con otro término.</p><button type="button" data-action="reset-table" class="button button-outline">Borrar filtros</button></div>'}
    <div class="table-bottom"><span class="mono muted">Versión PSI ${study.version} <span>·</span> ${study.license}</span><div class="pagination"><button class="icon-button" type="button" data-table-nav="-1" aria-label="Página anterior" ${activePage === 0 ? "disabled" : ""}>${icon("chevron-left")}</button><span>Página ${activePage + 1} de ${pagesTotal}</span><button class="icon-button" type="button" data-table-nav="1" aria-label="Página siguiente" ${activePage + 1 >= pagesTotal ? "disabled" : ""}>${icon("chevron-right")}</button></div></div>`;
}

function drawIncidents() {
  main.innerHTML = pageHead("LECCIONES DE MISIONES", "Incidentes", "Tres casos que cambiaron el diseño, el entrenamiento y la respuesta de la tripulación.") + `
    <div class="timeline">
      ${incidents.map(item => `<article class="incident-card card">
        <div class="case-top"><span class="metric-icon orange">${icon(item.icon)}</span><time class="overline">${item.date}</time></div>
        <h2>${item.title}</h2>
        <span class="case-event">${item.event}</span><p class="case-environment">${item.environment}</p>
        <p>${escape(item.finding)}</p>
        <div class="incident-lesson"><span class="overline">APLICACIÓN A FUTURAS MISIONES</span><p>${escape(item.implication)}</p></div>
        <div class="case-bottom"><strong>${item.result}</strong><button type="button" class="text-link" data-incident="${item.id}">Ver caso ${icon("arrow-right")}</button></div>
      </article>`).join("")}
    </div>
    <div class="section-heading"><div><span class="overline">NASA SPINOFF</span><h2>Tecnología transferida a la Tierra</h2></div><a class="text-link" href="#fuentes">Ver fuentes ${icon("arrow-right")}</a></div>
    <section class="transfer-grid" aria-label="Transferencias tecnológicas">${transfers.map(item => `<article class="card transfer"><span class="metric-icon teal">${icon(item.icon)}</span><h3>${item.label}</h3><strong>${item.statistic}</strong><p>${item.context}</p>${external(sources.find(source => source.id === item.id).url, "NASA Spinoff")}</article>`).join("")}</section>`;
}

function sourceCard(item) {
  return `<article class="source-row"><span class="metric-icon ${item.type === "Video" ? "orange" : "blue"}">${icon(item.type === "Video" ? "play" : "book")}</span><div><span class="overline">${escape(item.type)} · ${escape(item.publisher)}</span><h3>${escape(item.title)}</h3><p>${escape(item.note)}</p></div><div class="source-actions">${item.download ? download(item.download, item.downloadLabel ?? "PDF") : ""}${item.archive ? external(item.archive, item.type === "Video" ? "Archivo NASA" : "Informe") : ""}${external(item.url, item.type === "Video" ? "Ver video" : "Abrir fuente")}</div></article>`;
}

function drawSources() {
  main.innerHTML = pageHead("TRAZABILIDAD", "Fuentes y datos", "Descarga las tablas originales y consulta qué aporta cada fuente al atlas.", `<button type="button" class="button button-outline" data-action="method">${icon("info")} Metodología</button>`) + `
    <section class="card sources-card"><div class="dataset-heading"><div><span class="overline">PHYSICAL SCIENCES INFORMATICS</span><h2>Tablas experimentales</h2><p>Datos abiertos con licencia CC0-1.0</p></div><div class="source-actions dataset-actions">${external(sources[0].url, "Portal NASA PSI")}${download("data/nasa-psi-csv.zip", "Descargar los CSV")}</div></div>
      <div class="source-datasets">${studies.map(study => `<article class="dataset-source"><div><span class="overline">${study.id} · V${study.version}</span><h3>${study.name}</h3><p>${study.sourceRows} filas originales · ${study.group}</p></div><div class="source-actions">${external("https://doi.org/" + study.doi, study.doi)}${download(study.file, "CSV")}</div></article>`).join("")}</div></section>
    <section class="card sources-card"><div class="dataset-heading"><div><span class="overline">BIBLIOGRAFÍA</span><h2>Documentación de NASA</h2></div><label class="inline-select">${icon("filter")}<span class="sr-only">Tipo de fuente</span><select id="source-filter"><option value="all">Todas las fuentes</option>${[...new Set(sources.map(item => item.type))].map(type => `<option value="${escape(type)}" ${type === state.sourceFilter ? "selected" : ""}>${escape(type)}</option>`).join("")}</select>${icon("chevron-down")}</label></div><div class="source-list" id="sources-list"></div></section>`;
  drawSourceList();
}

function drawSourceList() {
  document.querySelector("#sources-list").innerHTML = sources
    .filter(item => state.sourceFilter === "all" || state.sourceFilter === item.type)
    .map(sourceCard).join("");
}

function citationList(ids) {
  return ids.map(id => {
    const study = studies.find(item => item.id === id);
    if (study) return `<li>${external("https://doi.org/" + study.doi, study.name + " · " + study.id)}<span class="citation-detail">DOI ${study.doi}</span></li>`;
    const source = sources.find(item => item.id === id);
    return source ? `<li>${external(source.url, source.title)}</li>` : "";
  }).join("");
}

function openDetail(type, title, content) {
  document.querySelector("#record-type").textContent = type;
  document.querySelector("#record-title").textContent = title;
  document.querySelector("#record-content").innerHTML = content;
  if (!detailDialog.open) detailDialog.showModal();
  document.querySelector("#record-content").scrollTop = 0;
}

function openEvidence(id) {
  const item = evidence.find(entry => entry.id === id);
  const selected = missions[state.mission];
  openDetail(item.kind, item.title, `
    <div class="detail-meta">${topicTag(item.topic)}<span>${selected.label} · ${missionScore(item, state.mission)}/11 puntos de prioridad</span></div>
    <section><h3>Qué observaron</h3><p>${escape(item.finding)}</p></section>
    <section><h3>Implicación para el diseño</h3><p>${escape(item.implication)}</p></section>
    <section class="limit-box"><h3>Alcance de la evidencia</h3><p>${escape(item.limit)}</p></section>
    <section><h3>Referencias</h3><ul class="citations">${citationList([...item.studies, ...item.refs])}</ul></section>
    ${item.studies.length ? `<div class="detail-actions">${item.studies.map(study => `<a class="button button-outline button-small" href="#experimentos" data-study-link="${study}">Abrir ${study} ${icon("arrow-right")}</a>`).join("")}</div>` : ""}`);
}

function openIncident(id) {
  const item = incidents.find(entry => entry.id === id);
  const source = sources.find(entry => entry.id === id);
  openDetail(item.date + " · " + item.environment, item.title, `
    <section><h3>${item.event}</h3><p>${escape(item.finding)}</p></section>
    <section><h3>Respuesta y cambios</h3><p>${escape(item.response)}</p></section>
    <section class="limit-box"><h3>Qué revisar en un diseño futuro</h3><p>${escape(item.implication)}</p></section>
    <div class="detail-actions">${external(source.url, "Caso histórico de NASA")}${source.archive ? external(source.archive, "Informe de la junta") : ""}</div>`);
}

function openRecord(line) {
  const study = studies.find(item => item.id === state.study);
  const row = study.rows.find(item => item.line === Number(line));
  const isCondition = row.kind === "conditions";
  const fields = study.headers.map((column, index) => `<div><dt>${escape(column)}</dt><dd>${row.values[index] ? escape(row.values[index]) : "Sin dato"}</dd></div>`).join("");
  openDetail(study.id + (isCondition ? " · CONDICIONES" : " · REGISTRO"), study.name + " · " + row.label, `
    <p>Fila ${row.line} de la tabla original. Se conservan las unidades y las etiquetas de NASA PSI.</p>
    <dl class="field-list">${fields}</dl><div class="detail-actions">${download(study.file, "CSV original")}${external("https://doi.org/" + study.doi, "Citar dataset")}</div>`);
}

function openMethod() {
  openDetail("METODOLOGÍA", "Cómo interpreta el atlas", `
    <section><h3>Datos originales</h3><p>El atlas descarga las tablas experimentales de NASA PSI. Muestra las observaciones y las filas de condiciones o referencias, con DOI, versión y posición en el CSV. Mantiene las notas, la limpieza y las visualizaciones previas en los archivos originales.</p></section>
    <section><h3>Clasificación y prioridad</h3><p>Los hallazgos se clasifican por tema. La prioridad es dos veces la pertinencia editorial para la misión (0–4) más el grado de evidencia directa (1–3). El máximo teórico es 11. La puntuación ordena la lectura y no estima la probabilidad ni la gravedad de un incendio.</p></section>
    <section><h3>Asistente de IA</h3><p>Un clasificador bayesiano local identifica el tema de la pregunta. El asistente pondera términos, sinónimos e identificadores, recupera hasta dos hallazgos citados y calcula recuentos desde las tablas cuando corresponde. La síntesis es extractiva y las implicaciones están documentadas en el corpus.</p></section>
    <section class="limit-box"><h3>Transferencia entre entornos</h3><p>La evidencia experimental integrada proviene de la EEI y de vuelos Cygnus. Los escenarios Luna y Marte ayudan a plantear qué validar en esos hábitats.</p></section>`);
}

function openAssistant() {
  if (!studies.length) return;
  document.querySelector("#assistant-context").innerHTML = `<span>ESCENARIO</span><strong>${missions[state.mission].label}</strong>`;
  if (!messageLog.childElementCount) {
    const suggestions = [
      "¿Qué pasó con el humo y los gases en Saffire-VI?",
      "¿Cuántas extinciones registró FLEX?",
      "¿Qué ocurrió durante el incendio en Mir?",
    ];
    messageLog.innerHTML = `<div class="message bot-message"><p>Pregunta por un estudio, una condición de ensayo o un incidente. Puedes abrir las referencias desde cada respuesta.</p><div class="suggestions">${suggestions.map(value => `<button type="button" data-suggest="${escape(value)}">${escape(value)} ${icon("arrow-up-right")}</button>`).join("")}</div></div>`;
  }
  if (!assistantDialog.open) assistantDialog.showModal();
  questionInput.focus();
}

function sendQuestion(asked) {
  const question = asked.trim();
  if (!question) return;
  const result = answerQuestion(question, state.mission, studies);
  messageLog.insertAdjacentHTML("beforeend", `<div class="message user-message"><p>${escape(question)}</p></div>`);
  const content = result.entries ? result.entries.map((item, index) => `
    <section class="answer-section"><strong>${escape(item.title)}</strong><p>${escape(item.finding)}</p>
    ${index === 0 ? `<p><b>Implicación.</b> ${escape(item.implication)}</p><p class="answer-limit"><b>Alcance.</b> ${escape(item.limit)}</p>` : ""}</section>`).join("")
    : `<p>${escape(result.summary)}</p>${result.limit ? `<p class="answer-limit"><b>Alcance.</b> ${escape(result.limit)}</p>` : ""}`;
  messageLog.insertAdjacentHTML("beforeend", `<div class="message bot-message"><span class="overline">${escape(result.category)}</span>${content}${result.ids.length ? `<details class="answer-citations"><summary>Fuentes consultadas (${result.ids.length})</summary><ul class="citations">${citationList(result.ids)}</ul></details>` : ""}</div>`);
  questionInput.value = "";
  messageLog.lastElementChild.scrollIntoView({ block: "start", behavior: "instant" });
  questionInput.focus({ preventScroll: true });
}

function resetTable(study = state.study) {
  Object.assign(state, { study, query: "", outcome: "", fuel: "all", kind: "all", sort: "original", tablePage: 0 });
}

function closeMenu() {
  document.body.classList.remove("menu-open");
  document.querySelector("#menu-button").setAttribute("aria-expanded", "false");
}

function route({ move = true } = {}) {
  const key = location.hash.slice(1) || "resumen";
  if (!Object.hasOwn(pages, key) || !studies.length) return;
  const changed = state.page !== key;
  state.page = key;
  document.body.classList.toggle("overview-page", key === "resumen");
  document.querySelector("#page-label").textContent = pages[key];
  document.querySelectorAll("[data-page]").forEach(link => {
    if (link.dataset.page === key) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  closeMenu();
  ({ resumen: drawOverview, experimentos: drawExperiments, incidentes: drawIncidents, fuentes: drawSources })[key]();
  if (move && changed) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
}

function focusCurrent(selector) {
  document.querySelector(selector)?.focus({ preventScroll: true });
}

document.addEventListener("click", event => {
  const origin = event.target.closest("button, a");
  if (!origin) return;
  if (origin.id === "menu-button") {
    const open = document.body.classList.toggle("menu-open");
    origin.setAttribute("aria-expanded", String(open));
  }
  const data = origin.dataset;
  if (data.action === "assistant") openAssistant();
  if (data.action === "method") openMethod();
  if (data.action === "reset-table") {
    resetTable();
    drawExperiments();
    focusCurrent("#table-query");
  }
  if (data.page) closeMenu();
  if (data.studyLink) {
    resetTable(data.studyLink);
    if (detailDialog.open) detailDialog.close();
    if (state.page === "experimentos") drawExperiments();
  }
  if (data.fuel) {
    state.fuel = data.fuel;
    drawFlex();
    focusCurrent(`[data-fuel="${data.fuel}"]`);
  }
  if (data.outcome) {
    const fuel = state.fuel;
    resetTable("PSI-69");
    state.fuel = fuel;
    state.outcome = data.outcome;
    location.hash = "experimentos";
  }
  if (data.mission) {
    state.mission = data.mission;
    drawRanking();
    focusCurrent(`[data-mission="${data.mission}"]`);
  }
  if (data.evidence) openEvidence(data.evidence);
  if (data.camera) {
    const viewer = document.querySelector("#iss-viewer");
    if (data.camera === "reset") {
      viewer.cameraOrbit = "34deg 63deg auto";
      viewer.fieldOfView = "30deg";
    } else {
      const { theta, phi, radius } = viewer.getCameraOrbit();
      viewer.cameraOrbit = `${theta + (data.camera === "left" ? -.45 : .45)}rad ${phi}rad ${radius}m`;
    }
  }
  if (data.incident) openIncident(data.incident);
  if (data.record) openRecord(data.record);
  if (data.tableNav) {
    state.tablePage += Number(data.tableNav);
    drawTable();
    const sameDirection = document.querySelector(`[data-table-nav="${data.tableNav}"]:not([disabled])`);
    (sameDirection ?? document.querySelector("[data-table-nav]:not([disabled])"))?.focus({ preventScroll: true });
  }
  if (data.suggest) sendQuestion(data.suggest);
});

document.addEventListener("input", event => {
  if (event.target.id === "table-query") {
    state.query = event.target.value;
    state.tablePage = 0;
    drawTable();
  }
});

document.addEventListener("change", event => {
  const { id, value } = event.target;
  if (id === "topic-filter") {
    state.topic = value;
    drawRanking();
    focusCurrent("#topic-filter");
  }
  if (id === "source-filter") {
    state.sourceFilter = value;
    drawSourceList();
  }
  if (id === "study-select") {
    resetTable(value);
    drawExperiments();
    focusCurrent("#study-select");
  }
  const tableFilter = { "kind-select": "kind", "table-sort": "sort", "table-fuel": "fuel", "table-outcome": "outcome" }[id];
  if (tableFilter) {
    state[tableFilter] = value;
    state.tablePage = 0;
    drawTable();
    focusCurrent("#" + id);
  }
});

document.querySelector("#assistant-form").addEventListener("submit", event => {
  event.preventDefault();
  sendQuestion(questionInput.value);
});

for (const dialog of [detailDialog, assistantDialog]) {
  dialog.addEventListener("click", event => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }
  });
}

initIcons();
window.addEventListener("hashchange", () => route());
try {
  const response = await fetch("./data/experiments.json");
  if (!response.ok) throw new Error("Experimental data unavailable");
  studies = await response.json();
  if (!Object.hasOwn(pages, location.hash.slice(1)) && location.hash !== "#main-content") history.replaceState(null, "", "#resumen");
  if (location.hash === "#main-content") history.replaceState(null, "", "#resumen");
  route({ move: false });
} catch (error) {
  console.error(error);
  main.innerHTML = '<div class="empty card"><h1>No pudimos cargar las tablas</h1><p>Abre el sitio desde un servidor local o recarga la página.</p><a class="button button-outline" href="index.html">Volver a intentar</a></div>';
}
