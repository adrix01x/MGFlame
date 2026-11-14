// Procedural meshes. Dimensions and motion on screen are schematic.
function sphere(center, radii, color, sides = 18, rings = 12) {
  const point = (i, j) => {
    const lat = Math.PI * (i / rings - .5);
    const lon = 2 * Math.PI * j / sides;
    return [
      center[0] + radii[0] * Math.cos(lat) * Math.cos(lon),
      center[1] + radii[1] * Math.sin(lat),
      center[2] + radii[2] * Math.cos(lat) * Math.sin(lon),
    ];
  };
  return Array.from({ length: sides * rings }, (_, index) => {
    const i = Math.floor(index / sides);
    const j = index % sides;
    return { vertices: [point(i,j), point(i,j+1), point(i+1,j+1), point(i+1,j)], color };
  });
}

const face = (vertices, color, stroke) => ({ vertices, color, stroke });
const orbitDefault = { yaw: -.54, pitch: .43 };

export function createScene(canvas, redraw) {
  const context = canvas.getContext("2d");
  let { yaw, pitch } = orbitDefault;
  let pointer;
  const observer = new ResizeObserver(redraw);
  observer.observe(canvas);
  canvas.onpointerdown = event => {
    if (event.button !== 0) return;
    pointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove = event => {
    if (!pointer) return;
    yaw += (event.clientX - pointer.x) / 100;
    pitch = Math.max(-1.15, Math.min(1.15, pitch + (event.clientY - pointer.y) / 120));
    pointer = { x: event.clientX, y: event.clientY };
    redraw();
  };
  canvas.onlostpointercapture = () => { pointer = undefined; };
  return {
    dispose: () => observer.disconnect(),
    rotate(direction) {
      if (direction === "reset") ({ yaw, pitch } = orbitDefault);
      else yaw += direction === "left" ? -.35 : .35;
      redraw();
    },
    render({ key, size, flow, reverse, fraction, finish, fuel, oxygen, length, width: sampleWidth, aging }) {
      if (!context) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const scale = Math.min(width / 7.4, height / 4.4);
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const project = ([x,y,z]) => {
        const horizontal = x * cy + z * sy;
        const depth = z * cy - x * sy;
        const vertical = y * cp - depth * sp;
        const rotatedDepth = y * sp + depth * cp;
        const perspective = 9 / (9 - rotatedDepth);
        return [width / 2 + horizontal * scale * perspective, height / 2 - vertical * scale * perspective, rotatedDepth];
      };
      const floor = -1.24;
      const faces = [];
      if (key === "flex") {
        const radius = (.22 + Math.min(8, Math.max(0, size)) * .095) * (1 - .56 * fraction);
        faces.push(...sphere([0,0,0], [radius,radius,radius], /hept|oct|dec/i.test(fuel) ? "#d69251" : "#919fd7"));
        faces.push(face([[0,0,0],[0,-1.23,0]], null, "#61706d"));
        if (fraction > 0 && (!finish || fraction < 1)) {
          const glow = radius * (1.4 + Math.min(100, Math.max(0, oxygen)) / 60 + Math.sin(fraction * 21) * .09);
          const drift = Math.min(14, Math.max(0, flow)) * .018;
          faces.push(...sphere([drift,.06,0], [glow+drift,glow*1.14,glow], "#f09a5630", 14, 9));
        }
      } else if (key === "aerosol") {
        faces.push(face([[-2.55,-.75,-.8],[2.55,-.75,-.8],[2.55,-.75,.8],[-2.55,-.75,.8]], "#d5ded6", "#637464"));
        faces.push(...sphere([-2,-.48,0],[.34,.22,.36], /kapton|tefl/i.test(fuel) ? "#b67f52" : "#858bb3"));
        for (let i = 0; i < 20 && fraction > 0; i++) {
          const travel = (i / 20 + fraction * Math.min(2, Math.max(0, flow) / 8)) % 1;
          const radius = .04 + Math.min(.14, Math.max(0, aging) / 500) * travel;
          faces.push(...sphere([-1.8 + travel * 4, -.24 + .58 * travel + .16 * Math.sin(i * 4), Math.cos(i * 2) * .56], [radius,radius,radius], "#7888c78c", 6, 4));
        }
      } else {
        const half = Math.min(2.8, Math.max(.5, length / 26));
        const edge = Math.min(1.15, Math.max(.14, sampleWidth / 48));
        const front = -half + fraction * half * 2;
        if (/rod|sphere|cilind|esfera/i.test(fuel)) {
          faces.push(...sphere([0,-.15,0], [/sphere|esfera/i.test(fuel) ? edge * 1.5 : half,.33,edge], "#a0ada8"));
        } else {
          faces.push(face([[-half,-.15,-edge],[half,-.15,-edge],[half,-.15,edge],[-half,-.15,edge]], /pmma|acril/i.test(fuel) ? "#9faec2" : "#c6cfc4", "#626e63"));
          faces.push(face([[-half,-.142,-edge],[front,-.142,-edge],[front,-.142,edge],[-half,-.142,edge]], "#746457"));
        }
        if (fraction > 0 && (!finish || fraction < 1)) {
          for (let i = 0; i < 5; i++) {
            const h = .2 + Math.min(100, Math.max(0, oxygen)) / 155 + .10 * Math.sin(i * 1.9 + fraction * 30);
            faces.push(...sphere([front,.19,edge * (i / 2 - 1)],[.17,h,.14],"#f2974f72",8,6));
          }
        }
        const airflow = reverse ? -1 : 1;
        if (flow > 0) for (let i = 0; i < 14; i++) {
          const x = airflow * (((i * .79 + fraction * Math.min(flow, 80) / 2.7) % 6.6) - 3.3);
          const z = (i % 4) * .43 - .65;
          faces.push(face([[x,.9 - i%3*.19,z],[x+airflow*.19,.9 - i%3*.19,z]],null,"#5868b3"));
        }
      }
      for (let i = -4; i <= 4; i++) {
        faces.push(face([[i*.74,floor,-2.9],[i*.74,floor,2.9]], null, "#cbd1c7"));
        faces.push(face([[-3.15,floor,i*.65],[3.15,floor,i*.65]], null, "#cbd1c7"));
      }
      const projected = faces.map(({ vertices, ...style }) => {
        const points = vertices.map(project);
        return { ...style, points, depth: points.reduce((sum, p) => sum + p[2], 0) / points.length,
          floor: vertices[0][1] === floor, mesh: vertices.length === 4 && vertices[0][1] !== vertices[2][1] };
      }).sort((a,b) => Number(b.floor)-Number(a.floor) || a.depth-b.depth);
      for (const { points, color, stroke, mesh } of projected) {
        context.beginPath();
        context.moveTo(...points[0].slice(0,2));
        for (const [x,y] of points.slice(1)) context.lineTo(x,y);
        if (color) {
          context.closePath();
          context.fillStyle = color;
          context.fill();
          if (mesh && color.length === 7) {
            const [a,b,c] = points;
            const shade = (b[0]-a[0]) * (c[1]-a[1]) - (b[1]-a[1]) * (c[0]-a[0]);
            context.fillStyle = shade > 0 ? "#22324625" : "#ffffff25";
            context.fill();
          }
        }
        if (stroke) { context.strokeStyle = stroke; context.stroke(); }
      }
    },
  };
}
