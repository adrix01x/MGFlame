import { icon } from "./icons.mjs";
import { shipParts, shipSources, shipViews } from "./data/ship.mjs";

function cite(id) {
  const [label, url] = shipSources[id];
  return `<a class="text-link" href="${url}" target="_blank" rel="noopener">${label} ${icon("arrow-up-right")}</a>`;
}

function coordinate(values, meters = false) {
  return values.map(value => meters ? `${value}m` : value).join(" ");
}

function partCard(part) {
  return `
    <article class="ship-part">
      <header><span class="ship-part-index mono">${part.number}</span><div><span class="overline">${part.category}</span><h2>${part.name}</h2></div></header>
      <p class="ship-part-summary">${part.summary}</p>
      <div class="ship-reference"><strong>Referencia documentada</strong><p>${part.reference}</p></div>
      <dl class="ship-specs">${part.properties.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
      <section class="ship-part-check"><h3>${icon("file")} Integración propuesta</h3><p>${part.build}</p></section>
      <section class="ship-part-check"><h3>${icon("shield")} Qué validar</h3><p>${part.verify}</p></section>
      <details class="ship-citations" ${part.evidence ? "open" : ""}>
        <summary>Fuentes de esta ficha (${part.sources.length})</summary>
        <ul>${part.sources.map(id => `<li>${cite(id)}</li>`).join("")}</ul>
      </details>
      ${part.evidence ? `<button class="button button-outline button-small" data-evidence="${part.evidence}" type="button">${icon("book")} Ver evidencia de combustión</button>` : ""}
    </article>`;
}

export function mountShip(root, loadViewer) {
  root.innerHTML = `
    <section class="ship-intro">
      <div><span class="overline">ARQUITECTURA DE SEGURIDAD</span><h1>Cápsula de exploración</h1>
        <p>Inspecciona una nave de cuatro plazas basada en la arquitectura de Orion. Selecciona una vista y pulsa los puntos del modelo para consultar materiales, condiciones y sistemas.</p></div>
      <a class="button button-outline" href="#controles">${icon("shield")} Controles de seguridad</a>
    </section>
    <div class="ship-layout">
      <section class="card ship-stage" aria-labelledby="ship-view-title">
        <div class="ship-stage-toolbar"><div><span class="overline">MODELO INTERACTIVO</span><h2 id="ship-view-title"></h2></div>
          <div class="ship-tabs" role="group" aria-label="Vistas de la nave">
            ${Object.entries(shipViews).map(([id, view]) => `<button type="button" data-ship-view="${id}" aria-pressed="false">${icon(view.icon)}${view.name}</button>`).join("")}
          </div>
        </div>
        <div class="ship-viewport" id="ship-viewport"></div>
        <div class="ship-model-footer">
          <span id="ship-view-caption"></span>
          <a class="text-link" id="ship-download" download>${icon("download")} Descargar modelo GLB</a>
        </div>
        <div id="ship-components" class="ship-components" role="group" aria-label="Componentes de la vista"></div>
      </section>
      <section class="card ship-inspector" id="ship-inspector" aria-label="Ficha del componente"></section>
    </div>
    <section class="ship-metrics" id="ship-metrics" aria-label="Valores de referencia de esta vista"></section>
    <section class="card ship-scope">
      <span class="metric-icon blue">${icon("info")}</span>
      <div><h2>Base de diseño y límites del modelo</h2>
        <p>La geometría exterior sigue proporciones publicadas de Orion y su módulo europeo. El corte interior, las ubicaciones de equipos y las dimensiones locales son interpretativos. Las cifras llevan su fuente o se identifican como objetivos de diseño.</p>
        <p>La seguridad y la fabricación de un vehículo nuevo deben demostrarse con análisis y ensayos de presión, fuego, materiales, carga y control térmico, según el perfil de misión.</p>
        <div class="ship-scope-links">${cite("dimensions")}${cite("material")}${cite("fireProtection")}</div>
      </div>
    </section>`;

  const viewport = root.querySelector("#ship-viewport");
  const inspector = root.querySelector("#ship-inspector");
  const components = root.querySelector("#ship-components");
  const viewButtons = [...root.querySelectorAll("[data-ship-view]")];
  let viewer, activePart, activeView;

  function pickPart(part, focusCamera = false) {
    activePart = part;
    inspector.innerHTML = partCard(part);
    for (const control of [...components.querySelectorAll("[data-ship-part]"), ...viewport.querySelectorAll("[data-ship-part]")]) {
      control.setAttribute("aria-pressed", String(control.dataset.shipPart === part.id));
    }
    if (focusCamera && viewer?.loaded && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const radius = viewer.getCameraOrbit().radius;
      viewer.cameraOrbit = `${part.orbit} ${radius}m`;
    }
  }

  function setView(id) {
    if (id === activeView) return;
    activeView = id;
    const view = shipViews[id];
    const parts = shipParts.filter(part => part.view === id);
    const defaultPart = id === "cabin" ? "hull" : id === "entry" ? "shield" : "tiles";
    for (const button of viewButtons) button.setAttribute("aria-pressed", String(button.dataset.shipView === id));
    root.querySelector("#ship-view-title").textContent = view.name;
    root.querySelector("#ship-view-caption").textContent = view.caption;
    root.querySelector("#ship-download").href = `assets/${view.asset}.glb`;
    viewport.innerHTML = `
      <model-viewer class="ship-viewer" src="assets/${view.asset}.glb" alt="${view.alt}"
        camera-controls disable-pan disable-tap loading="eager" interaction-prompt="none" touch-action="pan-y"
        exposure="1.26" environment-image="neutral" camera-target="${view.target}" camera-orbit="${view.orbit}"
        field-of-view="${view.fov}" min-field-of-view="18deg" max-field-of-view="54deg"
        min-camera-orbit="auto auto ${id === "flight" ? 17 : 5}m" max-camera-orbit="auto auto ${id === "flight" ? 47 : 20}m">
        ${parts.map(part => `
          <button slot="hotspot-${part.id}" class="ship-hotspot" data-ship-part="${part.id}" style="--pin-offset:${{ windows: -35, hatch: -6, tiles: 29, avionics: 15, seats: -9 }[part.id] ?? 0}px"
            data-position="${coordinate(part.position,true)}" data-normal="${coordinate(part.normal)}" data-visibility-attribute="visible"
            aria-label="Punto ${part.number}. ${part.name}" aria-pressed="false" type="button">
            <span class="ship-pin">${part.number}</span><span class="ship-bubble">${part.name}</span>
          </button>`).join("")}
      </model-viewer>
      <span class="ship-model-status" role="status">Cargando modelo 3D…</span>
      <div class="ship-camera" role="group" aria-label="Cámara 3D">
        <button class="icon-button" type="button" data-ship-camera="left" aria-label="Girar a la izquierda" disabled>${icon("chevron-left")}</button>
        <button class="icon-button" type="button" data-ship-camera="right" aria-label="Girar a la derecha" disabled>${icon("chevron-right")}</button>
        <button class="icon-button" type="button" data-ship-camera="reset" aria-label="Restablecer cámara" disabled>${icon("globe")}</button>
      </div>`;
    const currentViewer = viewport.querySelector("model-viewer");
    const status = viewport.querySelector(".ship-model-status");
    viewer = currentViewer;
    const onError = () => {
      if (!status.isConnected) return;
      status.textContent = "El modelo 3D no está disponible en este navegador. Puedes consultar las fichas y descargar el GLB.";
      viewport.classList.remove("ship-loaded");
    };
    const onLoad = () => {
      if (!status.isConnected) return;
      status.textContent = "Arrastra para girar · Desplaza para acercar";
      viewport.classList.add("ship-loaded");
      for (const button of viewport.querySelectorAll("[data-ship-camera]")) button.disabled = false;
    };
    viewport.classList.remove("ship-loaded");
    currentViewer.addEventListener("load", onLoad, { once: true });
    currentViewer.addEventListener("error", onError);
    loadViewer().then(() => { if (currentViewer.loaded) onLoad(); }, onError);
    components.innerHTML = parts.map(part => `<button class="ship-component" type="button" data-ship-part="${part.id}" aria-pressed="false"><span class="mono">${part.number}</span>${part.name}${icon("chevron-right")}</button>`).join("");
    root.querySelector("#ship-metrics").innerHTML = view.metrics.map(([value, label, context, id]) => `
      <a class="card ship-metric" href="${shipSources[id][1]}" target="_blank" rel="noopener" aria-label="${label}. ${context}">
        <span>${label}</span><strong>${value}</strong><small>${context} ${icon("arrow-up-right")}</small>
      </a>`).join("");
    pickPart(parts.find(part => part.id === defaultPart));
  }

  const controller = new AbortController();
  root.addEventListener("click", event => {
    const control = event.target.closest("[data-ship-view], [data-ship-part], [data-ship-camera]");
    if (!control) return;
    const { shipView, shipPart, shipCamera } = control.dataset;
    if (shipView) setView(shipView);
    if (shipPart) {
      const fromList = Boolean(control.closest(".ship-components"));
      if (shipPart !== activePart.id || fromList) pickPart(shipParts.find(part => part.id === shipPart), fromList);
      if (matchMedia("(max-width: 850px)").matches) inspector.scrollIntoView({ block: "start", behavior: "instant" });
    }
    if (shipCamera && viewer?.loaded) {
      const view = shipViews[activeView];
      if (shipCamera === "reset") {
        viewer.cameraOrbit = view.orbit;
        viewer.cameraTarget = view.target;
        viewer.fieldOfView = view.fov;
      } else {
        const { theta, phi, radius } = viewer.getCameraOrbit();
        viewer.cameraOrbit = `${theta + (shipCamera === "left" ? -.43 : .43)}rad ${phi}rad ${radius}m`;
      }
    }
  }, { signal: controller.signal });
  setView("flight");
  return () => controller.abort();
}
