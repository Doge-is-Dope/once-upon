'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * WebGL2 lighting overlay for the desk-lamp scene. A fullscreen fragment
 * shader renders a brightness map (0.5 grey = neutral under the CSS
 * `overlay` blend): the lamp pool with organic 1/f light noise, per-pixel
 * relighting of the paper grain, moving shadows cast by the binder-hole
 * rims, and a breathing vignette. The DOM keeps the real text; this layer
 * only shapes the light falling on it.
 *
 * If WebGL is unavailable the frame root gets `data-lamp='css'` and the
 * static CSS lamp layers take over.
 */

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_agitation;
uniform vec4 u_paper;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1, 0)), u.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 uv = frag / u_res;
  float t = u_time;
  float scale = max(u_res.y, 1.0);

  // Lamp intensity: layered slow noise, never repeating, never jumping.
  float slow = fbm(vec2(t * 0.09, 3.7));
  float mid = vnoise(vec2(t * (0.55 + u_agitation * 0.9), 17.2));
  float flick = 0.975 + (slow - 0.5) * 0.05
    + (mid - 0.5) * (0.015 + u_agitation * 0.045);

  // Lamp position: drifts on incommensurate periods above the paper.
  float swayAmp = 1.0 + u_agitation * 0.9;
  vec2 sway = vec2(
    (fbm(vec2(t * 0.045, 8.3)) - 0.5) * 2.0,
    (fbm(vec2(t * 0.035, 21.7)) - 0.5) * 2.0
  ) * swayAmp;
  vec2 lamp = vec2(
    u_paper.x + u_paper.z * 0.5 + sway.x * scale * 0.06,
    u_paper.y - scale * 0.28 + sway.y * scale * 0.03
  );

  // Pool of light on the table.
  float d = distance(frag, lamp);
  float pool = smoothstep(scale * 1.5, scale * 0.25, d);
  float lum = 0.5 + pool * 0.1;

  // Paper-grain relighting: a micro-relief height field lit from the lamp.
  vec2 pd = frag - u_paper.xy;
  float inPaper = step(0.0, pd.x) * step(pd.x, u_paper.z)
    * step(0.0, pd.y) * step(pd.y, u_paper.w);
  if (inPaper > 0.5) {
    vec2 g = frag * 0.55;
    float h = vnoise(g);
    vec2 grad = vec2(vnoise(g + vec2(1.7, 0.0)) - h, vnoise(g + vec2(0.0, 1.7)) - h);
    vec2 lightDir = normalize(lamp - frag);
    lum += dot(grad, lightDir) * 0.055;
  }

  // Vignette that breathes with the light.
  float vig = smoothstep(0.5, 1.2, distance(uv, vec2(0.5, 0.32)));
  lum -= vig * (0.1 + (1.0 - flick) * 1.6);

  lum = 0.5 + (lum - 0.5 + (flick - 1.0) * 0.9);
  outColor = vec4(vec3(clamp(lum, 0.25, 0.75)), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function useLampLight(): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const root = canvas?.closest<HTMLElement>('.frame-book');
    if (!canvas || !root) return;

    const fallback = () => root.setAttribute('data-lamp', 'css');

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    });
    if (!gl) {
      fallback();
      return;
    }

    const vert = compile(gl, gl.VERTEX_SHADER, VERT);
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!vert || !frag || !program) {
      fallback();
      return;
    }
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      fallback();
      return;
    }
    gl.useProgram(program);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'u_res');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uAgitation = gl.getUniformLocation(program, 'u_agitation');
    const uPaper = gl.getUniformLocation(program, 'u_paper');

    root.setAttribute('data-lamp', 'shader');

    let frame = 0;
    let agitation = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // Layout reads (canvas size, manuscript rect) happen only on real
    // geometry changes; the render loop itself never forces layout.
    let paperRect: DOMRect | null = null;
    let rectDirty = 0;
    const paper = document.querySelector('.manuscript');
    const resize = () => {
      const nextWidth = Math.round(canvas.clientWidth * dpr);
      const nextHeight = Math.round(canvas.clientHeight * dpr);
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    };
    let width = 0;
    let height = 0;
    resize();

    const measurePaper = () => {
      rectDirty = 0;
      paperRect = paper?.getBoundingClientRect() ?? null;
    };
    const onViewportChange = () => {
      if (!rectDirty) rectDirty = requestAnimationFrame(measurePaper);
    };
    measurePaper();
    window.addEventListener('scroll', onViewportChange, { passive: true });
    window.addEventListener('resize', onViewportChange);

    const sizeObserver = new ResizeObserver(() => {
      resize();
      measurePaper();
      // Redraw in the same frame: resizing the buffer clears it, and
      // until the throttled loop's next tick the compositor would show
      // the cleared (or stale, stretched) frame through the overlay
      // blend — a warm flash on every drag-resize tick. ResizeObserver
      // callbacks run before paint, so drawing here removes the gap.
      lastRender = performance.now();
      render(lastRender);
    });
    sizeObserver.observe(canvas);
    // The manuscript's own height clamp changes with the viewport without
    // the fixed canvas ever resizing; watch the paper too.
    if (paper) sizeObserver.observe(paper);

    let heroRiding = false;
    const render = (now: number) => {
      agitation +=
        ((root.hasAttribute('data-agent-running') ? 1 : 0) - agitation) * 0.02;

      // The hero-collapse FLIP moves the manuscript with a transform, so
      // no scroll/resize/observer event fires; ride it frame by frame and
      // settle with one final measure when it ends.
      const riding = root.hasAttribute('data-hero-collapsing');
      if (riding || heroRiding) measurePaper();
      heroRiding = riding;

      if (paperRect) {
        gl.uniform4f(
          uPaper,
          paperRect.x * dpr,
          paperRect.y * dpr,
          paperRect.width * dpr,
          paperRect.height * dpr,
        );
      } else {
        gl.uniform4f(uPaper, 0, 0, 0, 0);
      }
      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, now / 1000);
      gl.uniform1f(uAgitation, agitation);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    let running = false;
    let lastRender = 0;
    const loop = (now: number) => {
      // Ambient light reads fine at ~30fps; halve the shader cost.
      if (now - lastRender >= 33) {
        lastRender = now;
        render(now);
      }
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!reducedMotion) start();
    };

    if (reducedMotion) {
      render(0);
    } else {
      start();
      document.addEventListener('visibilitychange', onVisibility);
    }

    const onLost = (event: Event) => {
      event.preventDefault();
      stop();
      fallback();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      stop();
      cancelAnimationFrame(rectDirty);
      sizeObserver.disconnect();
      window.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('resize', onViewportChange);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      root.removeAttribute('data-lamp');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return ref;
}
