import { useEffect, useRef } from 'react'
import css from './SecurityAsciiBackground.module.css'

const VIDEO_URL = '/security-ascii-source.mp4'
const CHARACTERS = ' .:-+*=%@#'
const GLYPH_SIZE = 64

const VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 vUv;

void main() {
  vec2 position = vec2(
    gl_VertexID == 1 ? 3.0 : -1.0,
    gl_VertexID == 2 ? 3.0 : -1.0
  );
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uVideo;
uniform sampler2D uGlyphs;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uTime;
uniform float uElementSize;
uniform float uGlyphCount;
uniform float uHasMouse;

in vec2 vUv;
out vec4 outputColor;

float flowField(vec2 p, float t) {
  return sin(p.x + sin(p.y + t * 0.1))
    * sin(p.y * p.x * 0.1 + t * 0.2);
}

vec2 computeField(vec2 p, float t) {
  vec2 ep = vec2(0.05, 0.0);
  vec2 result = vec2(0.0);
  for (int i = 0; i < 10; i++) {
    float t0 = flowField(p, t);
    float t1 = flowField(p + ep.xy, t);
    float t2 = flowField(p + ep.yx, t);
    vec2 gradient = vec2(t1 - t0, t2 - t0) / ep.xx;
    vec2 tangent = vec2(-gradient.y, gradient.x);
    p += tangent * 0.5 + gradient * 0.005;
    p.x += sin(t * 0.25) * 0.1;
    p.y += cos(t * 0.25) * 0.1;
    result = gradient;
  }
  return result;
}

void main() {
  vec2 pixels = vUv * uResolution;
  vec2 snappedPixels = floor(pixels / uElementSize) * uElementSize;

  vec2 aspect = uResolution.x > uResolution.y
    ? vec2(uResolution.x / uResolution.y, 1.0)
    : vec2(uResolution.y / uResolution.x, 1.0);
  vec2 fieldUv = snappedPixels / uResolution * aspect;
  vec2 mouseUv = uMouse / uResolution * aspect;
  vec2 difference = fieldUv - mouseUv;
  float interaction = smoothstep(0.5, 0.0, length(difference));
  vec2 mouseDistortion = normalize(difference) * interaction * uHasMouse;

  vec2 fieldPoint = fieldUv * 25.0 + mouseDistortion;
  fieldPoint.x += sin(uTime * 3.0) * interaction * uHasMouse * 0.5;
  fieldPoint.y += cos(uTime * 3.0) * interaction * uHasMouse * 0.5;
  vec2 field = computeField(fieldPoint, uTime);
  vec2 displacement = mouseDistortion + field * 0.0;

  vec2 videoUv = snappedPixels / uResolution + displacement * 0.1;
  vec3 source = texture(uVideo, videoUv).rgb;
  float gray = dot(source, vec3(0.3, 0.59, 0.11));
  float glyphIndex = floor(gray * (uGlyphCount - 1.0));
  glyphIndex = clamp(glyphIndex, 0.0, uGlyphCount - 1.0);
  vec2 localUv = fract(pixels / uElementSize);
  vec2 glyphUv = vec2((glyphIndex + localUv.x) / uGlyphCount, localUv.y);
  float alpha = texture(uGlyphs, glyphUv).a;

  outputColor = vec4(source * alpha, alpha);
}
`

/** Compile one WebGL shader or throw its diagnostic. */
function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (shader === null) throw new Error('WebGL could not allocate a shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const reason = gl.getShaderInfoLog(shader) ?? 'unknown shader error'
    gl.deleteShader(shader)
    throw new Error(reason)
  }
  return shader
}

/** Link the full-screen ASCII program. */
function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const reason = gl.getProgramInfoLog(program) ?? 'unknown program error'
    gl.deleteProgram(program)
    throw new Error(reason)
  }
  return program
}

/** Create the horizontal monospace character atlas sampled by the fragment shader. */
function createGlyphAtlas(): HTMLCanvasElement {
  const atlas = document.createElement('canvas')
  atlas.width = GLYPH_SIZE * CHARACTERS.length
  atlas.height = GLYPH_SIZE
  const context = atlas.getContext('2d')
  if (context === null) throw new Error('2D canvas is unavailable')
  context.clearRect(0, 0, atlas.width, atlas.height)
  context.fillStyle = 'rgba(255, 255, 255, 1)'
  context.font = `bold ${GLYPH_SIZE}px monospace`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  Array.from(CHARACTERS).forEach((character, index) => {
    context.fillText(character, index * GLYPH_SIZE + GLYPH_SIZE / 2, GLYPH_SIZE / 2)
  })
  return atlas
}

/** Resolve a required uniform once at initialization. */
function uniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name)
  if (location === null) throw new Error(`WebGL uniform ${name} is unavailable`)
  return location
}

/**
 * Video-sampled ASCII flow field behind the blank-session composer. A plain
 * filtered video remains visible when WebGL2 or reduced motion is unavailable.
 * @returns the non-interactive full-canvas background layer.
 */
export function SecurityAsciiBackground() {
  const layerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const layer = layerRef.current
    const canvas = canvasRef.current
    const video = videoRef.current
    if (layer === null || canvas === null || video === null) return

    const reducedMotion = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      const pauseOnFrame = () => { video.currentTime = 0; video.pause() }
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) pauseOnFrame()
      else video.addEventListener('loadeddata', pauseOnFrame, { once: true })
      return () => { video.removeEventListener('loadeddata', pauseOnFrame) }
    }
    if (typeof WebGL2RenderingContext === 'undefined') {
      layer.dataset.renderer = 'fallback'
      return
    }

    let gl: WebGL2RenderingContext | null = null
    let program: WebGLProgram | null = null
    let frame = 0
    let pageVisible = !document.hidden
    let layerVisible = true
    let stopped = false
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 }

    try {
      gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        powerPreference: 'high-performance',
      })
      if (gl === null) return
      program = createProgram(gl)
      const activeGl = gl
      const activeProgram = program
      const vao = activeGl.createVertexArray()
      const videoTexture = activeGl.createTexture()
      const glyphTexture = activeGl.createTexture()

      activeGl.bindVertexArray(vao)
      activeGl.useProgram(activeProgram)
      activeGl.pixelStorei(activeGl.UNPACK_FLIP_Y_WEBGL, true)

      activeGl.activeTexture(activeGl.TEXTURE0)
      activeGl.bindTexture(activeGl.TEXTURE_2D, videoTexture)
      activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MIN_FILTER, activeGl.LINEAR)
      activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MAG_FILTER, activeGl.LINEAR)
      activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_WRAP_S, activeGl.CLAMP_TO_EDGE)
      activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_WRAP_T, activeGl.CLAMP_TO_EDGE)
      activeGl.texImage2D(
        activeGl.TEXTURE_2D, 0, activeGl.RGBA, 1, 1, 0,
        activeGl.RGBA, activeGl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]),
      )

      activeGl.activeTexture(activeGl.TEXTURE1)
      activeGl.bindTexture(activeGl.TEXTURE_2D, glyphTexture)
      activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MIN_FILTER, activeGl.LINEAR)
      activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_MAG_FILTER, activeGl.LINEAR)
      activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_WRAP_S, activeGl.CLAMP_TO_EDGE)
      activeGl.texParameteri(activeGl.TEXTURE_2D, activeGl.TEXTURE_WRAP_T, activeGl.CLAMP_TO_EDGE)
      activeGl.texImage2D(
        activeGl.TEXTURE_2D, 0, activeGl.RGBA, activeGl.RGBA,
        activeGl.UNSIGNED_BYTE, createGlyphAtlas(),
      )

      const uniforms = {
        resolution: uniform(activeGl, activeProgram, 'uResolution'),
        mouse: uniform(activeGl, activeProgram, 'uMouse'),
        time: uniform(activeGl, activeProgram, 'uTime'),
        hasMouse: uniform(activeGl, activeProgram, 'uHasMouse'),
      }
      activeGl.uniform1i(uniform(activeGl, activeProgram, 'uVideo'), 0)
      activeGl.uniform1i(uniform(activeGl, activeProgram, 'uGlyphs'), 1)
      activeGl.uniform1f(uniform(activeGl, activeProgram, 'uElementSize'), 10)
      activeGl.uniform1f(uniform(activeGl, activeProgram, 'uGlyphCount'), CHARACTERS.length)

      const resize = () => {
        const bounds = layer.getBoundingClientRect()
        const dpr = Math.min(devicePixelRatio, 1.5)
        const width = Math.max(1, Math.round(bounds.width * dpr))
        const height = Math.max(1, Math.round(bounds.height * dpr))
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
          activeGl.viewport(0, 0, width, height)
        }
      }
      const draw = (time: number) => {
        if (stopped || !pageVisible || !layerVisible) return
        resize()
        mouse.x += (mouse.targetX - mouse.x) * 0.1
        mouse.y += (mouse.targetY - mouse.y) * 0.1
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          activeGl.activeTexture(activeGl.TEXTURE0)
          activeGl.bindTexture(activeGl.TEXTURE_2D, videoTexture)
          activeGl.texImage2D(
            activeGl.TEXTURE_2D, 0, activeGl.RGBA, activeGl.RGBA,
            activeGl.UNSIGNED_BYTE, video,
          )
          layer.dataset.renderer = 'webgl'
        }
        activeGl.useProgram(activeProgram)
        const dpr = Math.min(devicePixelRatio, 1.5)
        activeGl.uniform2f(uniforms.resolution, canvas.width / dpr, canvas.height / dpr)
        activeGl.uniform2f(uniforms.mouse, mouse.x, mouse.y)
        activeGl.uniform1f(uniforms.hasMouse, 1)
        activeGl.uniform1f(uniforms.time, time / 1000)
        activeGl.drawArrays(activeGl.TRIANGLES, 0, 3)
        frame = requestAnimationFrame(draw)
      }
      const updatePlayback = () => {
        const running = pageVisible && layerVisible
        cancelAnimationFrame(frame)
        if (running) {
          void video.play().catch(() => {})
          frame = requestAnimationFrame(draw)
        } else {
          video.pause()
        }
      }
      const onPointerMove = (event: PointerEvent) => {
        const bounds = layer.getBoundingClientRect()
        mouse.targetX = event.clientX - bounds.left
        mouse.targetY = bounds.height - (event.clientY - bounds.top)
      }
      const onVisibilityChange = () => { pageVisible = !document.hidden; updatePlayback() }
      const observer = new IntersectionObserver(([entry]) => {
        layerVisible = entry?.isIntersecting ?? false
        updatePlayback()
      }, { rootMargin: '120px' })
      const resizeObserver = new ResizeObserver(resize)
      observer.observe(layer)
      resizeObserver.observe(layer)
      layer.parentElement?.addEventListener('pointermove', onPointerMove)
      document.addEventListener('visibilitychange', onVisibilityChange)
      updatePlayback()

      return () => {
        stopped = true
        cancelAnimationFrame(frame)
        observer.disconnect()
        resizeObserver.disconnect()
        layer.parentElement?.removeEventListener('pointermove', onPointerMove)
        document.removeEventListener('visibilitychange', onVisibilityChange)
        video.pause()
        activeGl.deleteTexture(videoTexture)
        activeGl.deleteTexture(glyphTexture)
        activeGl.deleteVertexArray(vao)
        activeGl.deleteProgram(activeProgram)
      }
    } catch {
      layer.dataset.renderer = 'fallback'
      if (program !== null) gl?.deleteProgram(program)
      return () => { cancelAnimationFrame(frame); video.pause() }
    }
  }, [])

  return (
    <div ref={layerRef} className={css.root} data-security-ascii-background="" aria-hidden="true">
      <video ref={videoRef} className={css.fallback} autoPlay muted loop playsInline preload="auto">
        <source src={VIDEO_URL} type="video/mp4" />
      </video>
      <canvas ref={canvasRef} className={css.canvas} />
      <div className={css.topGlow} />
    </div>
  )
}
