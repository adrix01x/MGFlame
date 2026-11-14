# IGNIS

Panel en español sobre combustión en microgravedad para el reto [Flame in Freefall](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/). El código y los datos se sirven desde `dist`. El panel funciona en el navegador con Python para la vista previa local y sin un servicio de IA externo.

## Abrir el panel

Desde esta carpeta:

```sh
python -m http.server 4181 --bind 127.0.0.1 --directory dist
```

Abre [http://127.0.0.1:4181/](http://127.0.0.1:4181/). En Windows también puedes usar `py` en lugar de `python`.

## Datos y procedencia

En `dist/data/original` se conservan los nueve CSV de NASA PSI, cinco PDF oficiales de NASA y los subtítulos del video de NASA ScienceCasts. Los CSV de PSI se descargaron el 14 de noviembre de 2026 usando las versiones públicas de las colecciones descritas en el panel.

| Investigación | DOI | Filas del CSV | Observaciones | Otras filas |
| --- | --- | ---: | ---: | --- |
| FLEX | [10.60555/mbq8-0451](https://doi.org/10.60555/mbq8-0451) | 274 | 274 | |
| FLEX-2 | [10.60555/byp8-h018](https://doi.org/10.60555/byp8-h018) | 8 | 0 | 8 condiciones |
| BASS | [10.60555/58h4-dy80](https://doi.org/10.60555/58h4-dy80) | 122 | 121 | 1 limpieza |
| BASS-II | [10.60555/4qc4-de67](https://doi.org/10.60555/4qc4-de67) | 129 | 129 | |
| Saffire-I | [10.60555/0t15-1z43](https://doi.org/10.60555/0t15-1z43) | 4 | 2 | 2 visualizaciones previas |
| Saffire-II | [10.60555/2chp-m469](https://doi.org/10.60555/2chp-m469) | 15 | 9 | 2 visualizaciones previas y 4 notas |
| Saffire-III | [10.60555/040q-4h36](https://doi.org/10.60555/040q-4h36) | 2 | 2 | |
| SAME | [10.60555/gd4k-8h62](https://doi.org/10.60555/gd4k-8h62) | 8 | 4 | 4 referencias |
| SAME-R | [10.60555/2np7-jv14](https://doi.org/10.60555/2np7-jv14) | 109 | 109 | |
| **Total** | | **671** | **650** | **21** |

El explorador muestra las observaciones y 12 condiciones o referencias. El identificador de fila apunta a la posición original y permite distinguir entradas con identificadores repetidos. Los CSV conservan valores ausentes, unidades originales y notas. El catálogo de fuentes también documenta los artículos históricos, el programa de NASA Glenn y NASA Spinoff.

Para regenerar los datos de la interfaz y el ZIP de CSV:

```sh
python scripts/prepare_data.py
```

El script compara tamaños con los metadatos publicados de PSI y registra un SHA-256 por CSV. La carpeta contiene una selección de tablas experimentales. Los archivos completos de cada campaña, incluidas imágenes, vídeo y series de telemetría, están en sus fichas de NASA PSI.

## Análisis y priorización

El resumen prioriza evidencia para estaciones orbitales, naves tripuladas, bases lunares y marcianas, y rovers presurizados. **Experimentos** permite exportar la selección con todas las columnas del CSV, DOI, versión, tipo de registro y fila de origen. **Controles de seguridad** vincula las investigaciones con materiales, detección, supresión y respuesta, y documenta ejemplos de transferencia a Tierra.

El alcance es la seguridad de los entornos habitables. La propulsión y los propelentes quedan fuera del catálogo. Las escenas 3D ilustran los ensayos y los archivos PSI proporcionan datos para investigaciones de modelado y validación.

- **Gráfica FLEX.** Calcula la distribución de las etiquetas de fin de ensayo para el combustible seleccionado. La extinción registrada representa una categoría del archivo y requiere otras mediciones para identificar una llama fría.
- **Priorización.** Ordena hallazgos con dos veces la pertinencia editorial para la misión (0–4) más el grado de evidencia directa (1–3). La puntuación guía la exploración de fuentes. Las aplicaciones a la Luna y a Marte son preguntas de validación para gravedad parcial.
- **IA local.** Usa un clasificador multinomial de Naive Bayes entrenado con ejemplos en español para clasificar preguntas. Normaliza términos y sinónimos, da peso a coincidencias poco frecuentes y recupera hasta dos hallazgos de un corpus de síntesis documentadas. Usa cálculos directos en consultas de conteo o comparación. Las preguntas quedan en el navegador y la síntesis se limita al corpus incluido.

Proyecto independiente. El visor utiliza el [modelo de la Estación Espacial Internacional de NASA Ames](https://science.nasa.gov/3d-resources/international-space-station-iss-a/).
