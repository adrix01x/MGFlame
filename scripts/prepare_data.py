"""Rebuild the dashboard data from the unmodified PSI experimental tables."""

import csv
import hashlib
import json
from pathlib import Path
from urllib.parse import quote
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist" / "data"

# The collection and file versions, byte lengths and DOIs come from the PSI
# investigation metadata. Column indices refer to the original CSV files.
STUDIES = {
    "PSI-69": dict(name="FLEX", mission="EEI · CIR", group="Extinción", doi="10.60555/mbq8-0451", version=5, file="FLEX", size=24776, encoding="cp1252", sample=4, record=0,
                   columns=[(0, "Ensayo"), (4, "Combustible"), (6, "Fracción molar de O₂"), (13, "Duración (s)"), (14, "Fin del ensayo")],
                   note="Ensayos de gotas de metanol y heptano. «Extinction», «Disruption» y «Completion» son etiquetas del archivo. La categoría «Extinction» por sí sola no identifica combustión de baja temperatura."),
    "PSI-25": dict(name="BASS-II", mission="EEI · MSG", group="Propagación", doi="10.60555/4qc4-de67", version=4, file="BASS-II", size=16590, sample=5, record=1,
                   columns=[(1, "Ensayo"), (5, "Muestra"), (11, "O₂ inicial (% vol.)"), (12, "O₂ final (% vol.)"), (16, "CO final (ppm)"), (2, "Fecha (M/D/A)")],
                   note="Ensayos de sólidos con distintas geometrías. Se conservan las lecturas tal como figuran en PSI, incluidas las celdas vacías y los valores negativos del instrumento."),
    "PSI-26": dict(name="BASS", mission="EEI · MSG", group="Propagación", doi="10.60555/58h4-dy80", version=4, file="BASS", size=4726, sample=5, record=2,
                   columns=[(2, "Corrida"), (3, "Ensayo"), (5, "Muestra"), (4, "N.º de muestra"), (0, "Fecha (M/D/A)")],
                   note="Registro de corridas de sólidos. Se conservan los identificadores repetidos del archivo. La fila de limpieza de hollín se puede consultar en el original."),
    "PSI-68": dict(name="FLEX-2", mission="EEI · CIR", group="Extinción", doi="10.60555/byp8-h018", version=6, file="Flex2", size=1029, sample=0, record=None,
                   columns=[(0, "Combustible"), (1, "Diámetro inicial (mm)"), (2, "Atmósfera"), (3, "Fracciones de O₂"), (4, "Presiones (atm)")],
                   note="Matriz de condiciones por combustible. Sus filas enumeran rangos y mezclas de prueba, por lo que no se contabilizan como ensayos individuales ni se incorporan a la gráfica de FLEX."),
    "PSI-98": dict(name="Saffire-I", mission="Cygnus · vuelo libre", group="Propagación", doi="10.60555/0t15-1z43", version=4, file="SAFFIRE-1", size=469, sample=1, record=0,
                   columns=[(0, "Muestra"), (1, "Material"), (5, "Flujo (cm/s)"), (9, "Combustión (s)"), (10, "Dirección")],
                   note="Dos registros de muestras y dos filas de visualización previa del flujo. Los tiempos del archivo reflejan corridas con distinta historia de ensayo y no establecen un efecto causal de la dirección."),
    "PSI-99": dict(name="Saffire-II", mission="Cygnus · vuelo libre", group="Propagación", doi="10.60555/2chp-m469", version=5, file="SAFFIRE-2", size=1973, sample=1, record=0,
                   columns=[(0, "Muestra"), (1, "Material"), (5, "Flujo"), (9, "Combustión"), (10, "Dirección"), (11, "Longitud quemada en vuelo")],
                   note="Nueve registros de muestras. Las notas y dos filas de visualización previa quedan en el CSV. Los campos vacíos se muestran como no reportados y las aproximaciones se conservan."),
    "PSI-100": dict(name="Saffire-III", mission="Cygnus · vuelo libre", group="Propagación", doi="10.60555/040q-4h36", version=4, file="SAFFIRE-3", size=239, sample=1, record=0,
                    columns=[(0, "Muestra"), (1, "Material"), (2, "Grosor"), (3, "Longitud"), (5, "Flujo"), (6, "Dirección")],
                    note="Dos registros de SIBAL a escala grande. La tabla especifica dimensiones y dirección del flujo."),
    "PSI-101": dict(name="SAME-R", mission="EEI · MSG", group="Detección", doi="10.60555/2np7-jv14", version=4, file="SAME-R", size=5674, sample=0, record=1,
                    columns=[(1, "Ensayo"), (0, "Material"), (4, "Velocidad de entrada (cm/s)"), (8, "Mezcla (s)"), (9, "Envejecimiento neto (s)")],
                    note="Registro de producción y envejecimiento de aerosoles. Incluye dos filas con el identificador 57, que se distinguen por su posición en el CSV."),
    "PSI-102": dict(name="SAME", mission="EEI · MSG", group="Detección", doi="10.60555/gd4k-8h62", version=4, file="SAME", size=331, sample=1, record=0,
                    columns=[(0, "Muestra"), (1, "Material o referencia"), (2, "Flujo (cm/s)"), (3, "Pérdida de masa (mg/min)"), (4, "Envejecimiento (min)")],
                    note="Cuatro filas de condiciones para teflón y cuatro referencias que remiten a las primeras. Las referencias se muestran sin completar las celdas vacías."),
}


def classify_row(dataset, row):
    if not any(row):
        return "context"
    if dataset == "PSI-68" or (dataset == "PSI-102" and not row[2]):
        return "conditions"
    if dataset == "PSI-26" and not row[2]:
        return "context"
    if dataset == "PSI-98" and row[0] not in {"S1", "S2"}:
        return "context"
    if dataset == "PSI-99" and not row[0].startswith("2-"):
        return "context"
    return "observation"


def read_study(dataset, config):
    filename = f"{dataset}_Experimental table_{config['file']}.csv"
    raw = (DATA / "original" / filename).read_bytes()
    if len(raw) != config["size"]:
        raise ValueError(f"File size differs from NASA PSI metadata for {filename}")
    reader = csv.reader(raw.decode(config.get("encoding", "utf-8-sig")).splitlines(keepends=True))
    headers = [value.strip() for value in next(reader)]
    records = []
    for raw_row in reader:
        row = [value.strip() for value in raw_row]
        if len(row) != len(headers):
            raise ValueError(f"Unexpected column count at {dataset}:{reader.line_num}")
        kind = classify_row(dataset, row)
        if kind == "context":
            continue
        record = config["record"]
        records.append({
            "line": reader.line_num,
            "kind": kind,
            "label": row[record] if record is not None else f"Fila {reader.line_num}",
            "sample": row[config["sample"]],
            "values": row,
        })
    return {
        "id": dataset,
        **{key: config[key] for key in ("name", "mission", "group", "doi", "version", "columns", "note")},
        "license": "CC0-1.0",
        "fileName": filename,
        "file": "data/original/" + quote(filename),
        "fileVersion": 1,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "sourceRows": reader.line_num - 1,
        "source": f"https://psi.nasa.gov/physci/repo/data/investigations/{dataset}",
        "headers": headers,
        "rows": records,
    }


def main():
    studies = [read_study(dataset, config) for dataset, config in STUDIES.items()]
    path = DATA / "experiments.json"
    path.write_text(json.dumps(studies, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    with ZipFile(DATA / "nasa-psi-csv.zip", "w", compression=ZIP_DEFLATED) as archive:
        for study in studies:
            filename = study["fileName"]
            archive.writestr(ZipInfo(filename), (DATA / "original" / filename).read_bytes(), compress_type=ZIP_DEFLATED)
    print(f"{len(studies)} PSI tables, {sum(study['sourceRows'] for study in studies)} original data rows")


if __name__ == "__main__":
    main()
