export const modeling = {
  "PSI-69": ["Combustión de gotas", "Relacionar diámetro inicial, atmósfera y duración con el desenlace registrado. Conservar presión y composición al comparar corridas."],
  "PSI-68": ["Matriz de condiciones", "Identificar rangos de diámetro, composición, presión y velocidad. Las filas describen condiciones y no aportan resultados individuales."],
  "PSI-25": ["Sólidos y lecturas de gases", "Cruzar material y geometría con las lecturas de O₂, CO y CO₂. Los campos de pantalla del equipo no equivalen por sí solos a velocidad física."],
  "PSI-26": ["Registro de corridas de sólidos", "Identificar muestras y corridas para enlazarlas con publicaciones y archivos auxiliares de PSI."],
  "PSI-98": ["Combustión a escala de vehículo", "Comparar dimensiones, orientación del flujo y duración registrada. Las dos corridas siguieron historias experimentales distintas."],
  "PSI-99": ["Propagación de llama", "Comparar geometría, condiciones de ignición y longitudes quemadas. Conservar estimaciones y notas como texto al preparar el análisis."],
  "PSI-100": ["Geometría y ventilación", "Identificar dimensiones y configuraciones de flujo. La tabla no incluye una serie temporal de propagación."],
  "PSI-101": ["Transporte y envejecimiento de aerosoles", "Relacionar material, velocidad de entrada y tiempos de mezcla y envejecimiento. Consultar el informe para datos de tamaño de partículas."],
  "PSI-102": ["Condiciones de generación de humo", "Extraer flujo, pérdida de masa y tiempo de envejecimiento. Distinguir filas con valores propios de las referencias a otras condiciones."],
};

export const controlResearch = [
  { title: "Materiales y ventilación", topic: "prevention", evidence: "bass-flow", studies: ["PSI-25","PSI-98"],
    question: "¿Cómo cambia la propagación con la geometría, el flujo y la atmósfera del hábitat?",
    validation: "Ensayar materiales y configuraciones de ventilación representativas. Verificar el efecto de la gravedad parcial para bases y vehículos de superficie." },
  { title: "Sensores de humo y gases", topic: "detection", evidence: "saffire-gases", studies: ["PSI-101","PSI-102"],
    question: "¿Cuándo alertan los sensores ante aerosoles y gases de distintos materiales?",
    validation: "Comparar tiempos de aviso y falsas alarmas con el volumen, el flujo y las fuentes de partículas del vehículo." },
  { title: "Extinción y verificación", topic: "suppression", evidence: "cool-flames", studies: ["PSI-69","PSI-68"],
    question: "¿Cómo verificar que la combustión ha terminado cuando deja de verse la llama?",
    validation: "Evaluar detección posterior a la extinción, compatibilidad con la tripulación y recuperación de la atmósfera." },
  { title: "Protección de la tripulación", topic: "response", evidence: "case-mir", studies: [],
    question: "¿Puede la tripulación alcanzar el equipo y evacuar si el humo bloquea parte del vehículo?",
    validation: "Probar acceso al equipo respiratorio y a rutas alternativas con simulacros específicos del hábitat." },
];

export function modelingCsv(study, rows) {
  const escape = value => {
    const raw = String(value ?? "");
    const safe = /^[\s]*[=+@-]/.test(raw) && !/^-\d+(?:[.,]\d+)?$/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return "\ufeff" + [
    ["PSI", "DOI", "Versión PSI", "Fila original", "Tipo de registro", ...study.headers],
    ...rows.map(row => [study.id, study.doi, study.version, row.line, row.kind, ...row.values]),
  ].map(row => row.map(escape).join(",")).join("\r\n") + "\r\n";
}
