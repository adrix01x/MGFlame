import { evidence, topics, missions } from "./data/evidence.mjs";
import { modeling } from "./data/objectives.mjs";

export const outcomeLabels = {
  Extinction: "Extinción",
  Disruption: "Disrupción",
  Completion: "Finalización",
};

const synonymGroups = {
  aerosol: "humo humos aerosoles aerosol partículas partícula smoke",
  detectar: "detectar detecta detectaron detector detectores detectarían detección detectarse sensores sensor alarma alarmas aviso alerta",
  propagar: "propaga propagar propagó propagación spread crecimiento crecer crece",
  apagar: "apagó apagar apaga supresión acaba extingue extinguió extinguieron extinguir extinción extinciones extintor extintores apagado sofocación",
  flujo: "aire flujo flujos ventilación circulación corrientes corriente convección",
  ensayo: "experimento experimentos ensayos corrida corridas ensayo pruebas prueba tests registros",
  nave: "nave naves spacecraft vehículo vehículos",
  luna: "luna lunar lunares moon artemis",
  marte: "marte marciana marciano martian mars",
  órbita: "órbita orbital órbitas orbit",
  apollo: "apollo apolo",
  fallecer: "muertes muerte falleció murieron fallecidos fatalidades perecieron víctimas",
  gas: "gases gas gaseoso gaseosos",
  fría: "frío fría frías fríos invisible cool",
  bomberos: "bomberos bombero firefighter firefighters firefighting",
  escapar: "evacuación escape salida escapar evacuar rutas",
  oxígeno: "oxígeno oxygen o2 o₂",
  metanol: "metanol methanol",
  heptano: "heptano heptane",
  riesgo: "peligro peligros riesgo riesgos",
  seguridad: "protección seguridad safety",
};

const stop = new Set("a al algo ante bajo cabe cada como con cuando cuanto cuantos cuanta cuantas cual cuales de del desde donde dos el ella ello en entre era esa ese eso esta estaba este esto fue fueron gracias ha han hasta hay hacer la las le les lo los mas me mi muy no nos o para pero por poder porque puede pueden podria que quien se sea ser si sin sobre son su sus te tiene tienen toda todo todos tras tu un una unas uno unos usa uso y ya es e segun usar pasa ocurrio paso sucede sucedido favor mejor dime explica explicame resume resumen".split(" "));

export function normalize(text) {
  return String(text).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

const synonyms = new Map(Object.entries(synonymGroups).flatMap(([key, words]) =>
  words.split(" ").map(word => [normalize(word), normalize(key)])));

function tokenize(text) {
  return (normalize(text).match(/[a-z0-9]+/g) ?? [])
    .filter(word => !stop.has(word) && (word.length > 1 || /\d/.test(word)))
    .map(word => synonyms.get(word) ?? word);
}

const training = {
  detection: [
    "cómo se detecta el humo en la estación", "sensores de humo y gases para una nave",
    "qué variables influyen en el tamaño del aerosol", "SAME partículas materiales y detectores",
    "alarma temprana humo monóxido", "detección de partículas polvo falsas alarmas",
    "cuánto tarda en avisar un detector", "respuesta del detector óptico por aerosoles",
  ],
  spread: [
    "cómo se propaga la llama en microgravedad", "BASS y efecto de la ventilación sobre los sólidos",
    "propagación en flujo concurrente y opuesto", "Saffire túnel grande tamaño de muestras",
    "por qué una llama crece con flujo forzado", "combustión en el CIR convección y gravedad",
    "qué cambia con la escala del conducto", "cómo arde una muestra de PMMA",
  ],
  suppression: [
    "qué son las llamas frías de FLEX", "qué pasa al extinguir la llama visible",
    "gotas de metanol y heptano en microgravedad", "FLEX estudia extinción de combustibles líquidos",
    "cuáles fueron los tipos de fin de ensayo de FLEX", "combustión de baja temperatura cuando se apaga",
    "cómo verificar que terminó el fuego", "heptano y metanol diferencia en extinción",
  ],
  prevention: [
    "seguridad de materiales en gravedad lunar", "qué riesgos tiene un hábitat marciano",
    "qué aprendimos de Apollo 1 escotilla y cableado", "sistema de oxígeno falló en Apollo 13",
    "materiales y atmósfera en pruebas de la Luna", "evitar ignición y fallas eléctricas",
    "qué es FM2 y FLARE para gravedad parcial", "diseño redundante del soporte vital",
  ],
  response: [
    "qué ocurrió durante el incendio de Mir", "cómo cambió la evacuación de la tripulación",
    "equipo de protección respiratoria y máscaras", "extintores en el incidente de Kvant",
    "dónde quedó bloqueada la Soyuz", "tecnología de ropa para bomberos y proyecto FIRES",
    "protección de la tripulación y aire respirable", "entrenamiento después del incendio",
  ],
};

const lexicon = new Set();
const model = Object.entries(training).map(([topic, examples]) => {
  const words = new Map();
  const tokens = examples.flatMap(tokenize);
  for (const token of tokens) {
    lexicon.add(token);
    words.set(token, (words.get(token) ?? 0) + 1);
  }
  return { topic, words, total: tokens.length };
});

export function classify(question) {
  const tokens = [...new Set(tokenize(question).filter(word => lexicon.has(word)))];
  if (tokens.length === 0) return undefined;
  const scores = model.map(({ topic, words, total }) => ({
    topic,
    score: tokens.reduce((score, word) =>
      score + Math.log(((words.get(word) ?? 0) + 1) / (total + lexicon.size)), 0),
  })).sort((a, b) => b.score - a.score);
  return scores[0].score - scores[1].score > 0.22 ? scores[0].topic : undefined;
}

const index = evidence.map(item => ({
  item,
  keywords: new Set(tokenize(item.title + " " + item.tags)),
  text: new Set(tokenize(item.finding + " " + item.implication + " " + item.limit)),
}));

function termWeight(word) {
  const matches = index.filter(({ keywords, text }) => keywords.has(word) || text.has(word)).length;
  return 1 + Math.log((index.length + 1) / (matches + 1));
}

export function retrieve(question, mission) {
  const lower = normalize(question);
  const tokens = [...new Set(tokenize(lower))];
  const topic = classify(question);
  const explicitStudies = [...lower.matchAll(/\bpsi[ -]?(\d+)\b/g)].map(match => "PSI-" + match[1]);
  const entities = [
    [/\bapol(?:l)?o[ -]?1\b/, "case-apollo1"], [/\bapol(?:l)?o[ -]?13\b/, "case-apollo13"],
    [/\bmir\b/, "case-mir"], [/\bsaffire[ -]?(vi|6)\b/, "saffire-gases"],
    [/\bsaffire[ -]?(i{1,3}|[1-3])\b/, "saffire-scale"],
    [/\bbass(?:[ -]?(ii?|2))?\b/, "bass-flow"], [/\bflex(?:[ -]?(ii|2))?\b/, "cool-flames"],
    [/\bsame(?:[ -]?r)?\b/, "same-aerosols"], [/\bsciencecasts\b/, "sciencecast"],
  ].filter(([pattern]) => pattern.test(lower)).map(([, id]) => id);
  const matched = index.map(({ item, keywords, text }) => {
    const hits = tokens.filter(word => keywords.has(word) || text.has(word));
    const studyMatch = explicitStudies.some(id => item.studies.includes(id));
    const entityMatch = entities.includes(item.id);
    const lexical = hits.reduce((score, word) => score + termWeight(word) * (keywords.has(word) ? 2 : 1), 0);
    const strong = studyMatch || entityMatch || (entities.length === 0 && explicitStudies.length === 0 &&
      (hits.length >= 2 || (hits.length === 1 && keywords.has(hits[0]) && termWeight(hits[0]) > 1.3 && !/^\d+$/.test(hits[0]))));
    return {
      item,
      strong,
      score: lexical + (studyMatch || entityMatch ? 18 : 0) + (item.topic === topic ? 1.3 : 0) + missionScore(item, mission) / 20,
    };
  }).filter(result => result.strong);
  matched.sort((a, b) => b.score - a.score);
  return matched.slice(0, 2).map(result => result.item);
}

export function missionScore(item, mission) {
  const transfer = {
    spacecraft: { "saffire-gases": 4, "saffire-scale": 4, "case-apollo13": 3, "case-mir": 2, "bass-flow": 2, "same-aerosols": 3 },
    rover: { "saffire-gases": 4, "saffire-scale": 2, "partial-gravity": 4, "case-mir": 3, "case-apollo1": 3, "same-aerosols": 3 },
  };
  return 2 * (item.weights[mission] ?? transfer[mission]?.[item.id] ?? 0) + item.directness;
}

export function rankEvidence(mission) {
  return [...evidence].sort((a, b) => missionScore(b, mission) - missionScore(a, mission));
}

export function countFlex(study, fuel = "all") {
  const counts = { Extinction: 0, Disruption: 0, Completion: 0 };
  const rows = study.rows.filter(row => fuel === "all" || row.values[4] === fuel);
  for (const { values } of rows) {
    if (Object.hasOwn(counts, values[14])) counts[values[14]] += 1;
  }
  return { total: rows.length, counts, rows };
}

export function catalogStats(studies) {
  return studies.reduce((stats, study) => ({
    original: stats.original + study.sourceRows,
    observations: stats.observations + study.rows.filter(row => row.kind === "observation").length,
    conditions: stats.conditions + study.rows.filter(row => row.kind === "conditions").length,
  }), { original: 0, observations: 0, conditions: 0 });
}

export function answerQuestion(question, mission, studies) {
  const text = normalize(question);
  const byId = new Map(studies.map(study => [study.id, study]));
  if (/\b(motor(?:es)?|propelentes?|propulsion|cohetes?)\b/.test(text)) {
    return { category: "Alcance del atlas", summary: "IGNIS analiza seguridad contra incendios en entornos habitables. La combustión de motores y propelentes de cohetes queda fuera del catálogo.", ids: [] };
  }
  if (/\b(prioriz\w*|relevan\w*)\b|investigaciones.*entorno/.test(text) && !/modelar|modelado|predictiv|exportar/.test(text)) {
    const target = /rover|vehiculo presurizado/.test(text) ? "rover"
      : /marte|marcian/.test(text) ? "mars" : /luna|lunar/.test(text) ? "moon"
      : /nave tripulada|transito/.test(text) ? "spacecraft" : /estacion orbital|\beei\b/.test(text) ? "orbit" : mission;
    const entries = rankEvidence(target).slice(0, 2);
    return { category: missions[target].label, entries,
      ids: [...new Set(entries.flatMap(item => [...item.studies, ...item.refs]))] };
  }
  if (/modelar|modelado|predictiv|exportar/.test(text)) {
    const explicit = text.match(/\bpsi[- ]?(\d+)\b/);
    const aliases = { "flex-2": "PSI-68", "bass-ii": "PSI-25", bass: "PSI-26", "saffire-iii": "PSI-100", "saffire-ii": "PSI-99", saffire: "PSI-98", "same-r": "PSI-101", same: "PSI-102", flex: "PSI-69" };
    const id = explicit ? "PSI-" + explicit[1] : Object.entries(aliases)
      .find(([name]) => new RegExp("\\b" + name.replace("-", "[- ]?") + "\\b").test(text))?.[1];
    const picked = byId.get(id);
    if (picked) return { category: "Datos para modelado", summary: picked.name + ". " + modeling[id][1],
      limit: "En Experimentos puedes filtrar y exportar las variables con su DOI y fila de origen.", ids: [id] };
  }
  const count = /\b(cuant[oa]s?|numero|conteo|cantidad|total|porcentaje|proporcion|tasa|frecuencia|cuenta)\b/.test(text);
  const flex2 = /\b(flex[- ]?(2|ii)|psi[- ]?68)\b/.test(text);
  const flex = !flex2 && /\b(flex|heptan[eo]|m[ea]thanol|metanol|psi[- ]?69)\b/.test(text);
  const methanol = /\b(m[ea]thanol|metanol)\b/.test(text);
  const heptane = /\bheptan[eo]\b/.test(text);
  const percent = (count, total) => (100 * count / total).toLocaleString("es-ES", { maximumFractionDigits: 1 });
  if (flex && ((methanol && heptane) || /\b(compara\w*|diferencia\w*|por combustible)\b/.test(text))) {
    const results = ["Methanol", "Heptane"].map(fuel => countFlex(byId.get("PSI-69"), fuel));
    const [m, h] = results;
    return {
      category: topics.suppression.label,
      summary: `En FLEX, ${m.counts.Extinction} de ${m.total} registros de metanol (${percent(m.counts.Extinction, m.total)} %) y ${h.counts.Extinction} de ${h.total} de heptano (${percent(h.counts.Extinction, h.total)} %) figuran como extinción.`,
      limit: "Las series incluyen condiciones distintas de atmósfera y tamaño de gota. La diferencia describe la tabla y no aísla el efecto del combustible.",
      ids: ["PSI-69"],
    };
  }
  if (count && flex) {
    const fuel = methanol === heptane ? "all" : methanol ? "Methanol" : "Heptane";
    const { total, counts } = countFlex(byId.get("PSI-69"), fuel);
    const name = { all: "toda la tabla", Methanol: "el metanol", Heptane: "el heptano" }[fuel];
    return {
      category: topics.suppression.label,
      summary: `En FLEX, para ${name}, hay ${total} registros. NASA etiquetó ${counts.Extinction} como extinción (${percent(counts.Extinction, total)} %), ${counts.Disruption} como disrupción y ${counts.Completion} como finalización.`,
      limit: "El porcentaje describe las corridas seleccionadas. Sus condiciones experimentales varían.",
      ids: ["PSI-69"],
    };
  }
  const datasetMatches = [
    ["PSI-68", flex2], ["PSI-25", /\b(bass[- ]?(2|ii)|psi[- ]?25)\b/.test(text)],
    ["PSI-26", /\b(psi[- ]?26|bass[- ]?i)\b/.test(text) || /\bbass\b(?![- ]?(ii|2)\b)/.test(text)],
    ["PSI-100", /\b(saffire[- ]?(3|iii)|psi[- ]?100)\b/.test(text)],
    ["PSI-99", /\b(saffire[- ]?(2|ii)|psi[- ]?99)\b/.test(text)],
    ["PSI-98", /\b(saffire[- ]?(1|i)|psi[- ]?98)\b/.test(text)],
    ["PSI-101", /\b(same[- ]?r|psi[- ]?101)\b/.test(text)],
    ["PSI-102", /\b(same(?![- ]?r\b)|psi[- ]?102)\b/.test(text)],
  ].filter(([, named]) => named).map(([id]) => byId.get(id));
  if (datasetMatches.some(study => study.id === "PSI-98") && /\b(tardo|tarda|tardaron|duro|duraron|tiempo|duracion|segundos|420|70)\b/.test(text)) {
    const study = byId.get("PSI-98");
    const [concurrent, opposed] = study.rows.map(({ values }) => values[9]);
    return {
      category: topics.spread.label,
      summary: `En Saffire-I, PSI registra ${concurrent} s de combustión con flujo concurrente y ${opposed} s con flujo opuesto.`,
      limit: "El ensayo opuesto aprovechó material restante de la primera corrida. Los tiempos no permiten estimar un efecto causal de la dirección del flujo.",
      ids: [study.id, "saffire-report"],
    };
  }
  if (count && datasetMatches.length > 0) {
    return {
      category: "Datos de NASA PSI",
      summary: datasetMatches.map(study => {
        const observation = study.rows.filter(row => row.kind === "observation").length;
        const conditions = study.rows.length - observation;
        const main = observation ? `${observation} registros de observación` : "una matriz de condiciones";
        const extra = conditions ? `, con ${conditions} filas de condiciones o referencias` : "";
        return `${study.name} contiene ${main}${extra}.`;
      }).join(" "),
      limit: "Una fila del archivo corresponde a una entrada de registro. Algunos identificadores se repiten.",
      ids: datasetMatches.map(study => study.id),
    };
  }
  if (count && /\b(datos|tablas|datasets|registros|filas|ensayos|experimentos)\b/.test(text) && !/\b(saffire|apollo|mir|co|humo|casos)\b/.test(text)) {
    const stats = catalogStats(studies);
    return {
      category: "Datos de NASA PSI",
      summary: `El catálogo integra ${studies.length} tablas PSI con ${stats.original} filas originales. El explorador muestra ${stats.observations} registros de observación y ${stats.conditions} filas de condiciones o referencias.`,
      limit: `Las otras ${stats.original - stats.observations - stats.conditions} filas son notas, limpieza o visualizaciones previas y se conservan en los CSV.`,
      ids: ["psi"],
    };
  }
  const found = retrieve(question, mission);
  if (!found.length) return {
    category: "Cobertura del atlas",
    summary: "El corpus local no contiene evidencia suficiente para responder a esa pregunta. Prueba con un estudio, un caso histórico o una variable como humo, extinción o ventilación.",
    ids: [],
  };
  return {
    category: topics[found[0].topic].label,
    entries: found,
    ids: [...new Set(found.flatMap(item => [...item.studies, ...item.refs]))],
  };
}
