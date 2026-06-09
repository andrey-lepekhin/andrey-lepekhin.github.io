import { Geometry, Mesh, Program, Renderer } from "https://esm.sh/ogl@1.0.11";

const DPR_CAP = 1.5;

// Half-extent of the play area in clip space; the toroidal world spans
// [-WORLD, WORLD] on both axes (a little past the visible [-1, 1]).
const WORLD = 1.06;

// Hold an empty stage long enough for the reader to skim the opening lines,
// then let the flock glide in from the top-left corner and fade up.
const START_DELAY_MS = 5000;
const REVEAL_MS = 11000;
// The flock enters fast and decelerates to its cruising glide over this window.
const ENTRANCE_MS = 10000;
const ENTRANCE_SPEED_MULT = 3;
const SIM_STEP = 1 / 30;
const MAX_SIM_STEPS = 3;
const FLOW_COLS = 33;
const FLOW_ROWS = 19;
const TRAIL_LENGTH = 8;
const STORAGE_KEY = "boids-animation";

// Hero preset, lifted from the js-animations prototype. Tuned for a calm,
// blog-friendly flocking field used as a full-page background.
const BASE_PRESET = {
  density: 1 / 900,
  minCount: 520,
  maxCount: 1400,
  sizeScale: 0.7,
  alphaScale: 0.42,
  neighborRadius: 0.16,
  separationRadius: 0.055,
  // Slow, gliding motion: a distant flock wheeling together, not darting.
  maxSpeed: 0.1,
  minSpeed: 0.02,
  maxForce: 0.09,
  separation: 1.4,
  alignment: 0.9,
  cohesion: 0.42,
  mouseRepel: 1.15,
  mouseRadius: 0.28,
  wakeRepel: 0.4,
  wakeFlow: 0.28,
  // Strength of the curl-noise current the flock rides (replaces banding).
  flow: 0.5,
  wander: 0.007,
  edgeForce: 0.16,
};

function prefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
}

function capDpr() {
  return Math.min(window.devicePixelRatio || 1, DPR_CAP);
}

function buildPreset() {
  const preset = { ...BASE_PRESET };
  const reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  if (reducedMotion) {
    preset.maxCount = Math.min(preset.maxCount, 360);
    preset.maxSpeed *= 0.45;
    preset.minSpeed *= 0.45;
    preset.maxForce *= 0.45;
    preset.wander = 0;
    preset.mouseRepel *= 0.35;
    preset.wakeRepel *= 0.35;
    preset.wakeFlow *= 0.35;
  }

  const mobileLike =
    window.innerWidth < 640 ||
    (window.matchMedia?.("(pointer: coarse)")?.matches ?? false);
  const mobileScale = mobileLike ? 0.68 : 1;
  const area = window.innerWidth * window.innerHeight;

  preset.count = Math.round(
    Math.min(
      preset.maxCount * mobileScale,
      Math.max(preset.minCount * mobileScale, area * preset.density * mobileScale),
    ),
  );
  return preset;
}

export function runOglBoids(stage) {
  const toggle = document.querySelector(".boids-toggle");
  const mobileQuery = window.matchMedia("(max-width: 600px)");
  const postContent = document.querySelector('[role="main"] .post-content');
  const getStoredPreference = () => {
    try {
      return window.localStorage?.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  };
  const setStoredPreference = (value) => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore storage failures; the button still works for this page view.
    }
  };
  let hiddenByUser = getStoredPreference() === "hidden";
  const isAnimationHidden = () => hiddenByUser && !mobileQuery.matches;
  const syncToggle = () => {
    if (!toggle) return;
    toggle.textContent = hiddenByUser ? "Show animation" : "Hide animation";
    toggle.setAttribute("aria-pressed", hiddenByUser ? "true" : "false");
  };
  syncToggle();
  stage.classList.toggle("is-hidden", isAnimationHidden());

  const preset = buildPreset();
  const count = preset.count;

  const renderer = new Renderer({
    dpr: capDpr(),
    alpha: true,
    antialias: false,
    powerPreference: "high-performance",
  });
  const gl = renderer.gl;
  stage.appendChild(gl.canvas);

  const updateStageBounds = () => {
    if (!mobileQuery.matches || !postContent) {
      stage.style.removeProperty("--boids-mobile-height");
      return window.innerHeight;
    }
    const height = Math.max(
      140,
      Math.round(postContent.getBoundingClientRect().top + window.scrollY),
    );
    stage.style.setProperty("--boids-mobile-height", `${height}px`);
    return height;
  };
  const resize = () => renderer.setSize(window.innerWidth, updateStageBounds());
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("load", resize);
  mobileQuery.addEventListener?.("change", () => {
    stage.classList.toggle("is-hidden", isAnimationHidden());
    resize();
    if (isAnimationHidden()) {
      stop();
    } else {
      start();
    }
  });

  const positions = new Float32Array(count * 2);
  const prevPositions = new Float32Array(count * 2);
  const renderPositions = new Float32Array(count * 2);
  const velocities = new Float32Array(count * 2);
  const randoms = new Float32Array(count);

  const initializeEntrance = ({ originX, originY, angle }) => {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    for (let i = 0; i < count; i += 1) {
      // Long diagonal stream, so the flock arrives in waves instead of one
      // visible mass. `random` doubles as the per-particle reveal delay.
      const back = Math.random() * 3.2;
      const perp = (Math.random() - 0.5) * 0.55;
      positions[i * 2] = originX - dirX * back - dirY * perp;
      positions[i * 2 + 1] = originY - dirY * back + dirX * perp;
      const heading = angle + (Math.random() - 0.5) * 0.42;
      velocities[i * 2] = Math.cos(heading) * preset.maxSpeed * ENTRANCE_SPEED_MULT;
      velocities[i * 2 + 1] = Math.sin(heading) * preset.maxSpeed * ENTRANCE_SPEED_MULT;
      randoms[i] = Math.min(Math.pow(back / 3.2, 0.65) + Math.random() * 0.06, 1);
    }
    prevPositions.set(positions);
    renderPositions.set(positions);
  };

  const geometry = new Geometry(gl, {
    position: { size: 2, data: renderPositions, usage: gl.DYNAMIC_DRAW },
    velocity: { size: 2, data: velocities, usage: gl.DYNAMIC_DRAW },
    random: { size: 1, data: randoms },
  });

  const program = new Program(gl, {
    transparent: true,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uDpr: { value: capDpr() },
      uSizeScale: { value: preset.sizeScale },
      uAlphaScale: { value: preset.alphaScale },
      uMaxSpeed: { value: preset.maxSpeed },
      // 1.0 -> palette for dark backgrounds, 0.0 -> darker palette for light.
      uDark: { value: prefersDark() ? 1 : 0 },
      // 0 -> 1 fade-in as the flock enters, so it materialises rather than pops.
      uReveal: { value: 0 },
    },
    vertex: `
      attribute vec2 position;
      attribute vec2 velocity;
      attribute float random;
      uniform float uTime;
      uniform float uDpr;
      uniform float uSizeScale;
      uniform float uMaxSpeed;
      varying float vSpeed;
      varying float vRandom;
      varying vec2 vHeading;

      void main() {
        vec2 drift = vec2(
          sin(uTime * 0.18 + random * 6.2831),
          cos(uTime * 0.15 + random * 6.2831)
        ) * 0.006;
        gl_Position = vec4(position + drift, 0.0, 1.0);
        vSpeed = clamp(length(velocity) / uMaxSpeed, 0.0, 1.0);
        gl_PointSize = mix(7.0, 14.0, vSpeed) * uDpr * uSizeScale;
        vRandom = random;
        vHeading = normalize(velocity + 0.0001);
      }
    `,
    fragment: `
      precision highp float;
      uniform float uAlphaScale;
      uniform float uDark;
      uniform float uReveal;
      varying float vSpeed;
      varying float vRandom;
      varying vec2 vHeading;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        vec2 forward = normalize(vHeading + 0.0001);
        vec2 side = vec2(-forward.y, forward.x);
        vec2 local = vec2(dot(uv, side), dot(uv, forward));
        float body = smoothstep(0.24, 0.02, abs(local.x)) *
          smoothstep(-0.38, -0.18, local.y) *
          smoothstep(0.50, 0.18, local.y);
        float head = smoothstep(0.20, 0.02, length(local - vec2(0.0, 0.22)));
        float tail = smoothstep(0.16, 0.01, abs(local.x)) *
          smoothstep(-0.50, -0.22, -local.y);
        float halo = smoothstep(0.5, 0.05, length(uv)) * 0.16;
        float alpha = max(body * 0.78, head) + tail * 0.28 + halo;
        if (alpha < 0.03) discard;

        // Muted greys only (no hue). Compressed range so highlights read as
        // calm mid-grey rather than bright-white sparkle.
        vec3 calmDark = vec3(0.5);
        vec3 hotDark = vec3(0.68);
        vec3 calmLight = vec3(0.5);
        vec3 hotLight = vec3(0.34);
        vec3 calm = mix(calmLight, calmDark, uDark);
        vec3 hot = mix(hotLight, hotDark, uDark);
        vec3 color = mix(calm, hot, clamp(vSpeed * 1.2 + vRandom * 0.18, 0.0, 1.0));

        // Light mode needs a touch more opacity to read against #fcfcfc.
        float alphaScale = uAlphaScale * mix(1.05, 1.0, uDark);
        float particleReveal = smoothstep(vRandom * 0.9, vRandom * 0.9 + 0.34, uReveal);
        gl_FragColor = vec4(color, min(alpha * alphaScale, 1.0) * particleReveal);
      }
    `,
  });

  const boids = new Mesh(gl, { mode: gl.POINTS, geometry, program });

  // Reused across frames so the simulation allocates nothing per step:
  // a linked-list spatial grid (head map + next pointers) and a velocity
  // double-buffer.
  const scratch = {
    prevPositions,
    renderPositions,
    nextVelocities: new Float32Array(count * 2),
    cellHead: new Int32Array(1),
    cellNext: new Int32Array(count),
    grid: {
      aspect: 1,
      wrap: false,
      cellX: preset.neighborRadius,
      cellY: preset.neighborRadius,
      nCols: 1,
      nRows: 1,
      cells: 1,
      xmin: 0,
      ymin: 0,
      xspan: preset.neighborRadius,
      yspan: preset.neighborRadius,
    },
    flowX: new Float32Array(FLOW_COLS * FLOW_ROWS),
    flowY: new Float32Array(FLOW_COLS * FLOW_ROWS),
  };

  const mouse = { x: 4, y: 4, active: false };
  let pointerAvailable = false;
  const trail = new Float32Array(TRAIL_LENGTH * 3);
  for (let i = 0; i < TRAIL_LENGTH; i += 1) {
    trail[i * 3] = 4;
    trail[i * 3 + 1] = 4;
    trail[i * 3 + 2] = 1;
  }

  // The canvas is click-through (pointer-events: none), so track the pointer
  // on the window and map viewport coords into clip space directly.
  const setPointer = (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (1 - event.clientY / window.innerHeight) * 2 - 1;
    mouse.active = true;
    pointerAvailable = true;
    for (let i = TRAIL_LENGTH - 1; i > 0; i -= 1) {
      const to = i * 3;
      const from = to - 3;
      trail[to] = trail[from];
      trail[to + 1] = trail[from + 1];
      trail[to + 2] = trail[from + 2];
    }
    trail[0] = mouse.x;
    trail[1] = mouse.y;
    trail[2] = 0;
  };
  window.addEventListener("pointermove", setPointer, { passive: true });
  window.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) pointerAvailable = false;
  });
  window.addEventListener("blur", () => {
    mouse.active = false;
    pointerAvailable = false;
  });

  // Keep the palette in sync if the OS theme flips while the page is open.
  const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  darkQuery?.addEventListener?.("change", (event) => {
    program.uniforms.uDark.value = event.matches ? 1 : 0;
  });

  const cruiseMaxSpeed = preset.maxSpeed;

  // Describe the spatial grid for this frame. Distances are measured in an
  // aspect-corrected space (x scaled by the viewport aspect) so neighbourhoods
  // are circular in pixels, not stretched ellipses. Once wrapping is on, the
  // grid is a torus over the [-WORLD, WORLD] play area so the flock stays
  // cohesive across the screen edges instead of tearing apart.
  const updateGrid = (cell, wrap) => {
    const grid = scratch.grid;
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    grid.aspect = aspect;
    grid.wrap = wrap;

    if (wrap) {
      grid.xmin = -WORLD * aspect;
      grid.ymin = -WORLD;
      grid.xspan = 2 * WORLD * aspect;
      grid.yspan = 2 * WORLD;
      grid.nCols = Math.max(3, Math.floor(grid.xspan / cell));
      grid.nRows = Math.max(3, Math.floor(grid.yspan / cell));
    } else {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < count; i += 1) {
        const x = positions[i * 2] * aspect;
        const y = positions[i * 2 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      grid.xmin = minX - cell;
      grid.ymin = minY - cell;
      grid.xspan = Math.max(cell, maxX - minX + cell * 2);
      grid.yspan = Math.max(cell, maxY - minY + cell * 2);
      grid.nCols = Math.max(3, Math.ceil(grid.xspan / cell));
      grid.nRows = Math.max(3, Math.ceil(grid.yspan / cell));
    }

    grid.cellX = grid.xspan / grid.nCols;
    grid.cellY = grid.yspan / grid.nRows;
    grid.cells = grid.nCols * grid.nRows;
    if (scratch.cellHead.length < grid.cells) {
      scratch.cellHead = new Int32Array(grid.cells);
    }
    scratch.cellHead.fill(-1, 0, grid.cells);
  };

  let lastTime = performance.now();
  let accumulator = 0;
  let revealStart = null;
  let animationFrame = 0;
  let startAllowed = false;
  let entranceInitialized = false;
  const scheduleFrame = () => {
    animationFrame = requestAnimationFrame(render);
  };
  const render = (time) => {
    animationFrame = 0;
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    if (revealStart === null) revealStart = time;
    program.uniforms.uReveal.value = Math.min((time - revealStart) / REVEAL_MS, 1);

    // Ease the speed cap from the fast entry multiplier down to the cruise
    // speed; only start wrapping at the edges once everyone is on-screen.
    const entrance = Math.min((time - revealStart) / ENTRANCE_MS, 1);
    const ease = 1 - (1 - entrance) * (1 - entrance);
    preset.maxSpeed = cruiseMaxSpeed * (ENTRANCE_SPEED_MULT + (1 - ENTRANCE_SPEED_MULT) * ease);
    const allowWrap = entrance >= 1;

    accumulator += dt;
    let steps = 0;
    let stepped = false;
    while (accumulator >= SIM_STEP && steps < MAX_SIM_STEPS) {
      prevPositions.set(positions);
      for (let i = 2; i < trail.length; i += 3) {
        trail[i] = Math.min(trail[i] + SIM_STEP * 1.35, 1);
      }
      updateGrid(preset.neighborRadius, allowWrap);
      updateFlowGrid(scratch, time / 1000);
      stepBoids({
        count,
        positions,
        velocities,
        mouse,
        trail,
        params: preset,
        dt: SIM_STEP,
        time: time / 1000,
        allowWrap,
        grid: scratch.grid,
        scratch,
      });
      accumulator -= SIM_STEP;
      steps += 1;
      stepped = true;
    }

    // If the tab was busy for a long time, drop excess backlog instead of
    // trying to catch up with many expensive simulation steps in one frame.
    if (steps === MAX_SIM_STEPS && accumulator >= SIM_STEP) {
      accumulator = 0;
      prevPositions.set(positions);
    }

    interpolatePositions(count, prevPositions, positions, renderPositions, accumulator / SIM_STEP);
    geometry.attributes.position.needsUpdate = true;
    if (stepped) {
      geometry.attributes.velocity.needsUpdate = true;
    }

    program.uniforms.uTime.value = time / 1000;
    renderer.render({ scene: boids });

    if (!document.hidden) {
      scheduleFrame();
    }
  };
  const start = () => {
    if (!startAllowed || isAnimationHidden() || animationFrame || document.hidden) return;
    if (!entranceInitialized) {
      const originX = pointerAvailable ? mouse.x : -1.08;
      const originY = pointerAvailable ? mouse.y : 1.08;
      const centerDx = -originX;
      const centerDy = -originY;
      const angle =
        Math.sqrt(centerDx * centerDx + centerDy * centerDy) > 0.1
          ? Math.atan2(centerDy, centerDx)
          : -Math.PI * 0.25;
      initializeEntrance({ originX, originY, angle });
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.velocity.needsUpdate = true;
      geometry.attributes.random.needsUpdate = true;
      entranceInitialized = true;
    }
    lastTime = performance.now();
    accumulator = 0;
    scheduleFrame();
  };
  const stop = () => {
    if (!animationFrame) return;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });
  toggle?.addEventListener("click", () => {
    hiddenByUser = !hiddenByUser;
    setStoredPreference(hiddenByUser ? "hidden" : "visible");
    syncToggle();
    stage.classList.toggle("is-hidden", isAnimationHidden());
    if (isAnimationHidden()) {
      stop();
    } else {
      start();
    }
  });
  // Hold the empty stage, then start the loop; resetting lastTime avoids a
  // huge first-frame dt that would teleport the flock.
  setTimeout(() => {
    startAllowed = true;
    toggle?.classList.add("is-visible");
    start();
  }, START_DELAY_MS);

  return { particleCount: count };
}

function interpolatePositions(count, prev, current, output, alpha) {
  for (let i = 0; i < count; i += 1) {
    const idx = i * 2;
    const px = prev[idx];
    const py = prev[idx + 1];
    const cx = current[idx];
    const cy = current[idx + 1];
    const dx = cx - px;
    const dy = cy - py;
    if (Math.abs(dx) > WORLD || Math.abs(dy) > WORLD) {
      output[idx] = cx;
      output[idx + 1] = cy;
    } else {
      output[idx] = px + dx * alpha;
      output[idx + 1] = py + dy * alpha;
    }
  }
}

function updateFlowGrid(scratch, time) {
  const { flowX, flowY } = scratch;
  const stepX = (2 * WORLD) / (FLOW_COLS - 1);
  const stepY = (2 * WORLD) / (FLOW_ROWS - 1);
  for (let y = 0; y < FLOW_ROWS; y += 1) {
    const py = -WORLD + y * stepY;
    const sinY2 = Math.sin(2.4 * py + 0.1 * time);
    const cosY2 = Math.cos(2.4 * py + 0.1 * time);
    const cosY = Math.cos(2.6 * py - 0.15 * time);
    const sinY = Math.sin(2.6 * py - 0.15 * time);
    for (let x = 0; x < FLOW_COLS; x += 1) {
      const px = -WORLD + x * stepX;
      const sinX = Math.sin(2.1 * px + 0.2 * time);
      const cosX = Math.cos(2.1 * px + 0.2 * time);
      const sinX2 = Math.sin(3.3 * px + 0.12 * time);
      const cosX2 = Math.cos(3.3 * px + 0.12 * time);
      const dPsiDx = 2.1 * cosX * cosY + 0.5 * sinY2 * (-3.3 * sinX2);
      const dPsiDy = sinX * (-2.6 * sinY) + 0.5 * (2.4 * cosY2) * cosX2;
      const idx = y * FLOW_COLS + x;
      flowX[idx] = dPsiDy;
      flowY[idx] = -dPsiDx;
    }
  }
}

function stepBoids({ count, positions, velocities, mouse, trail, params, dt, time, allowWrap, grid, scratch }) {
  const { aspect, wrap, cellX, cellY, nCols, nRows, xmin, ymin } = grid;
  const { nextVelocities, cellHead, cellNext, flowX: flowGridX, flowY: flowGridY } = scratch;
  const neighborR = params.neighborRadius;
  const neighborRSq = neighborR * neighborR;
  const sepR = params.separationRadius;
  const sepRSq = sepR * sepR;
  const maxSpeed = params.maxSpeed;
  const minSpeed = params.minSpeed;
  const maxForce = params.maxForce;
  const alignment = params.alignment;
  const cohesion = params.cohesion;
  const separation = params.separation;
  const mouseRepel = params.mouseRepel;
  const mouseRadius = params.mouseRadius;
  const mouseRadiusSq = mouseRadius * mouseRadius;
  const wakeRepel = params.wakeRepel;
  const wakeFlow = params.wakeFlow;
  const flow = params.flow;
  const wander = params.wander;
  const edgeForce = params.edgeForce;
  const period = 2 * WORLD;
  const flowScaleX = (FLOW_COLS - 1) / (2 * WORLD);
  const flowScaleY = (FLOW_ROWS - 1) / (2 * WORLD);

  // Build the linked-list grid in aspect-corrected space (x scaled by aspect).
  for (let i = 0; i < count; i += 1) {
    const X = positions[i * 2] * aspect;
    const Y = positions[i * 2 + 1];
    let cix = Math.floor((X - xmin) / cellX);
    let ciy = Math.floor((Y - ymin) / cellY);
    if (wrap) {
      cix = imod(cix, nCols);
      ciy = imod(ciy, nRows);
    } else {
      if (cix < 0) cix = 0;
      else if (cix >= nCols) cix = nCols - 1;
      if (ciy < 0) ciy = 0;
      else if (ciy >= nRows) ciy = nRows - 1;
    }
    const cell = cix * nRows + ciy;
    cellNext[i] = cellHead[cell];
    cellHead[cell] = i;
  }

  for (let i = 0; i < count; i += 1) {
    const px = positions[i * 2];
    const py = positions[i * 2 + 1];
    const vx = velocities[i * 2];
    const vy = velocities[i * 2 + 1];
    const Xi = px * aspect;
    let cix = Math.floor((Xi - xmin) / cellX);
    let ciy = Math.floor((py - ymin) / cellY);
    if (wrap) {
      cix = imod(cix, nCols);
      ciy = imod(ciy, nRows);
    } else {
      if (cix < 0) cix = 0;
      else if (cix >= nCols) cix = nCols - 1;
      if (ciy < 0) ciy = 0;
      else if (ciy >= nRows) ciy = nRows - 1;
    }

    let n = 0;
    let alignX = 0;
    let alignY = 0;
    let cohX = 0;
    let cohY = 0;
    let sepX = 0;
    let sepY = 0;

    for (let dgx = -1; dgx <= 1; dgx += 1) {
      for (let dgy = -1; dgy <= 1; dgy += 1) {
        let ngx = cix + dgx;
        let ngy = ciy + dgy;
        if (wrap) {
          ngx = imod(ngx, nCols);
          ngy = imod(ngy, nRows);
        } else if (ngx < 0 || ngx >= nCols || ngy < 0 || ngy >= nRows) {
          continue;
        }
        for (let k = cellHead[ngx * nRows + ngy]; k !== -1; k = cellNext[k]) {
          if (k === i) continue;
          let dx = positions[k * 2] - px;
          let dy = positions[k * 2 + 1] - py;
          if (wrap) {
            // Minimal-image: treat the nearest copy across the torus seam.
            if (dx > WORLD) dx -= period;
            else if (dx < -WORLD) dx += period;
            if (dy > WORLD) dy -= period;
            else if (dy < -WORLD) dy += period;
          }
          const sdx = dx * aspect;
          const distSq = sdx * sdx + dy * dy;
          if (distSq > neighborRSq || distSq < 1e-7) continue;

          n += 1;
          alignX += velocities[k * 2];
          alignY += velocities[k * 2 + 1];
          cohX += dx;
          cohY += dy;

          if (distSq < sepRSq) {
            // Proximity-weighted: closer neighbours push harder (linear falloff).
            const dist = Math.sqrt(distSq);
            const falloff = 1 - dist / sepR;
            const clip = Math.sqrt(dx * dx + dy * dy) || 1e-6;
            sepX += (-dx / clip) * falloff;
            sepY += (-dy / clip) * falloff;
          }
        }
      }
    }

    // Accumulate flocking + flow as steering forces, then clamp the total once
    // to maxForce (Reynolds-style) rather than clamping each behaviour.
    let fx = 0;
    let fy = 0;

    if (n > 0) {
      alignX /= n;
      alignY /= n;
      const al = Math.sqrt(alignX * alignX + alignY * alignY);
      if (al > 1e-6) {
        fx += (alignX / al * maxSpeed - vx) * alignment;
        fy += (alignY / al * maxSpeed - vy) * alignment;
      }

      cohX /= n;
      cohY /= n;
      const cl = Math.sqrt(cohX * cohX + cohY * cohY);
      if (cl > 1e-6) {
        fx += (cohX / cl * maxSpeed - vx) * cohesion;
        fy += (cohY / cl * maxSpeed - vy) * cohesion;
      }

      const sl = Math.sqrt(sepX * sepX + sepY * sepY);
      if (sl > 1e-6) {
        const intensity = Math.min(sl, 2.5);
        fx += (sepX / sl * maxSpeed - vx) * separation * intensity;
        fy += (sepY / sl * maxSpeed - vy) * separation * intensity;
      }
    }

    // Bilinear sample of the precomputed curl-noise current.
    let gx = (px + WORLD) * flowScaleX;
    let gy = (py + WORLD) * flowScaleY;
    if (gx < 0) gx = 0;
    else if (gx > FLOW_COLS - 1) gx = FLOW_COLS - 1;
    if (gy < 0) gy = 0;
    else if (gy > FLOW_ROWS - 1) gy = FLOW_ROWS - 1;
    const x0 = Math.min(Math.floor(gx), FLOW_COLS - 2);
    const y0 = Math.min(Math.floor(gy), FLOW_ROWS - 2);
    const tx = gx - x0;
    const ty = gy - y0;
    const f00 = y0 * FLOW_COLS + x0;
    const f10 = f00 + 1;
    const f01 = f00 + FLOW_COLS;
    const f11 = f01 + 1;
    const aX = flowGridX[f00] + (flowGridX[f10] - flowGridX[f00]) * tx;
    const bX = flowGridX[f01] + (flowGridX[f11] - flowGridX[f01]) * tx;
    const aY = flowGridY[f00] + (flowGridY[f10] - flowGridY[f00]) * tx;
    const bY = flowGridY[f01] + (flowGridY[f11] - flowGridY[f01]) * tx;
    const flowX = aX + (bX - aX) * ty;
    const flowY = aY + (bY - aY) * ty;
    const flMag = Math.sqrt(flowX * flowX + flowY * flowY);
    if (flMag > 1e-6) {
      fx += (flowX / flMag * maxSpeed - vx) * flow;
      fy += (flowY / flMag * maxSpeed - vy) * flow;
    }

    const fMag = Math.sqrt(fx * fx + fy * fy);
    if (fMag > maxForce) {
      fx = (fx / fMag) * maxForce;
      fy = (fy / fMag) * maxForce;
    }

    // External impulses (wander, pointer, wake, edges) act on top of the
    // clamped steering so they stay responsive.
    let ax = fx + Math.sin(time * 0.35 + i * 12.9898) * wander;
    let ay = fy + Math.cos(time * 0.32 + i * 78.233) * wander;

    if (mouse.active) {
      const dx = px - mouse.x;
      const dy = py - mouse.y;
      const sdx = dx * aspect;
      const distSq = sdx * sdx + dy * dy;
      if (distSq < mouseRadiusSq && distSq > 1e-7) {
        const dist = Math.sqrt(distSq);
        const strength = (1 - dist / mouseRadius) * mouseRepel;
        const clip = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        ax += (dx / clip) * strength;
        ay += (dy / clip) * strength;
      }
    }

    for (let tIdx = 0; tIdx < trail.length; tIdx += 3) {
      const age = trail[tIdx + 2];
      if (age >= 1) continue;
      const dx = px - trail[tIdx];
      const dy = py - trail[tIdx + 1];
      const sdx = dx * aspect;
      const distSq = sdx * sdx + dy * dy;
      const radius = mouseRadius * (1.2 + age * 1.8);
      if (distSq < radius * radius && distSq > 1e-7) {
        const dist = Math.sqrt(distSq);
        const clip = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const falloff = (1 - dist / radius) * (1 - age);
        ax += (dx / clip) * wakeRepel * falloff;
        ay += (dy / clip) * wakeRepel * falloff;
        ax += (-dy / clip) * wakeFlow * falloff;
        ay += (dx / clip) * wakeFlow * falloff;
      }
    }

    // Only nudge away from edges while the world is open (entrance); once it is
    // a torus the wrap handles continuity.
    if (!wrap) {
      ax += px > 0.96 ? -edgeForce : px < -0.96 ? edgeForce : 0;
      ay += py > 0.96 ? -edgeForce : py < -0.96 ? edgeForce : 0;
    }

    // Integrate and clamp speed (inlined to avoid per-boid allocations).
    let nx = vx + ax * dt;
    let ny = vy + ay * dt;
    let sp = Math.sqrt(nx * nx + ny * ny);
    if (sp < 1e-6) {
      nx = minSpeed;
      ny = 0;
      sp = minSpeed;
    } else {
      const target = Math.min(Math.max(sp, minSpeed), maxSpeed);
      nx = (nx / sp) * target;
      ny = (ny / sp) * target;
    }
    nextVelocities[i * 2] = nx;
    nextVelocities[i * 2 + 1] = ny;
  }

  for (let i = 0; i < count; i += 1) {
    velocities[i * 2] = nextVelocities[i * 2];
    velocities[i * 2 + 1] = nextVelocities[i * 2 + 1];
    positions[i * 2] += velocities[i * 2] * dt;
    positions[i * 2 + 1] += velocities[i * 2 + 1] * dt;

    // Skip wrapping during the entrance so off-screen boids can fly in instead
    // of being teleported across to the opposite edge.
    if (allowWrap) {
      if (positions[i * 2] > WORLD) positions[i * 2] = -WORLD;
      else if (positions[i * 2] < -WORLD) positions[i * 2] = WORLD;
      if (positions[i * 2 + 1] > WORLD) positions[i * 2 + 1] = -WORLD;
      else if (positions[i * 2 + 1] < -WORLD) positions[i * 2 + 1] = WORLD;
    }
  }
}

function imod(n, m) {
  return ((n % m) + m) % m;
}

const stage = document.querySelector("#boids-bg");
if (stage) {
  runOglBoids(stage).catch((error) => {
    // Background is decorative; never let a WebGL failure break the page.
    console.error("Boids background failed to start:", error);
    stage.remove();
  });
}
