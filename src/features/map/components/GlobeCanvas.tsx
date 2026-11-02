'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { MapLayers } from '../profile'

interface GlobeCanvasProps {
  image: ImageData | null
  layers: MapLayers | null
}

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vColor;

void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  gl_Position = uProjection * uView * world;
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
out vec4 outColor;

void main() {
  vec3 n = normalize(vNormal);
  vec3 light = normalize(vec3(-0.45, 0.72, 0.55));
  float diffuse = max(dot(n, light), 0.0);
  float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
  vec3 color = vColor * (0.46 + 0.72 * diffuse);
  color += vec3(0.18, 0.36, 0.46) * rim * 0.25;
  outColor = vec4(color, 1.0);
}
`

type Mat4 = Float32Array

interface ProgramInfo {
  program: WebGLProgram
  buffers: {
    position: WebGLBuffer
    normal: WebGLBuffer
    color: WebGLBuffer
    index: WebGLBuffer
  }
  uniforms: {
    projection: WebGLUniformLocation | null
    view: WebGLUniformLocation | null
    model: WebGLUniformLocation | null
  }
  indexCount: number
}

function identity(): Mat4 {
  const out = new Float32Array(16)
  out[0] = 1
  out[5] = 1
  out[10] = 1
  out[15] = 1
  return out
}

function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2)
  const out = new Float32Array(16)
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) / (near - far)
  out[11] = -1
  out[14] = (2 * far * near) / (near - far)
  return out
}

function translation(x: number, y: number, z: number): Mat4 {
  const out = identity()
  out[12] = x
  out[13] = y
  out[14] = z
  return out
}

function rotationX(angle: number): Mat4 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const out = identity()
  out[5] = c
  out[6] = s
  out[9] = -s
  out[10] = c
  return out
}

function rotationY(angle: number): Mat4 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const out = identity()
  out[0] = c
  out[2] = -s
  out[8] = s
  out[10] = c
  return out
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3]
    }
  }
  return out
}

interface MeshData {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint32Array
  indexCount: number
}

const CUBE_FACES: Array<{ origin: [number, number, number]; right: [number, number, number]; up: [number, number, number] }> = [
  { origin: [-1, -1, 1], right: [2, 0, 0], up: [0, 2, 0] },
  { origin: [1, -1, -1], right: [-2, 0, 0], up: [0, 2, 0] },
  { origin: [1, -1, 1], right: [0, 0, -2], up: [0, 2, 0] },
  { origin: [-1, -1, -1], right: [0, 0, 2], up: [0, 2, 0] },
  { origin: [-1, 1, 1], right: [2, 0, 0], up: [0, 0, -2] },
  { origin: [-1, -1, -1], right: [2, 0, 0], up: [0, 0, 2] },
]

/**
 * Cube-sphere mesh + per-vertex色/位移。
 * 不是把 equirectangular 图贴到球上：每个顶点从地图采样颜色，
 * 陆地按高程沿法线位移，极区由 cube face 覆盖，避免 UV 球两极的挤压。
 */
/**
 * 六个 cube face，每个 face 切 tiles² 个瓦片；每个瓦片独立采样。
 * level 0/1/2 分别对应每面 1/2/4 个瓦片，等效 48/96/192 段。
 */
function buildMesh(image: ImageData, layers: MapLayers | null, level = 1): MeshData {
  const tiles = 2 ** level
  const segments = 24
  const tileVertices = (segments + 1) * (segments + 1)
  const totalVertices = tileVertices * CUBE_FACES.length * tiles * tiles
  const totalIndices = segments * segments * 6 * CUBE_FACES.length * tiles * tiles
  const positions = new Float32Array(totalVertices * 3)
  const normals = new Float32Array(totalVertices * 3)
  const colors = new Float32Array(totalVertices * 3)
  const indices = new Uint32Array(totalIndices)
  let vertexOffset = 0
  let indexOffset = 0
  const tileSize = 2 / tiles

  for (const face of CUBE_FACES) {
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        const baseVertex = vertexOffset
        for (let iy = 0; iy <= segments; iy++) {
          const v = -1 + tileSize * (ty + iy / segments)
          for (let ix = 0; ix <= segments; ix++) {
            const u = -1 + tileSize * (tx + ix / segments)
            const cx = face.origin[0] + face.right[0] * u + face.up[0] * v
            const cy = face.origin[1] + face.right[1] * u + face.up[1] * v
            const cz = face.origin[2] + face.right[2] * u + face.up[2] * v
            const length = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1
            const nx = cx / length
            const ny = cy / length
            const nz = cz / length
            const latitude = Math.asin(Math.max(-1, Math.min(1, ny)))
            const longitude = Math.atan2(nz, nx)
            const sampleX = Math.max(
              0,
              Math.min(image.width - 1, Math.floor((longitude / (Math.PI * 2) + 0.5) * image.width)),
            )
            const sampleY = Math.max(
              0,
              Math.min(image.height - 1, Math.floor((0.5 - latitude / Math.PI) * image.height)),
            )
            const pixel = (sampleY * image.width + sampleX) * 4
            let elevation = 0
            if (layers) {
              const lx = Math.max(0, Math.min(layers.width - 1, sampleX % layers.width))
              const ly = Math.max(0, Math.min(layers.mapHeight - 1, Math.floor((sampleY / image.height) * layers.mapHeight)))
              elevation = layers.height[ly * layers.width + lx] ?? 0
            }
            const displacement = elevation > 0 ? (elevation / 8000) * 0.025 : 0
            const radius = 1 + displacement
            const index = vertexOffset * 3
            positions[index] = nx * radius
            positions[index + 1] = ny * radius
            positions[index + 2] = nz * radius
            normals[index] = nx
            normals[index + 1] = ny
            normals[index + 2] = nz
            colors[index] = (image.data[pixel] ?? 0) / 255
            colors[index + 1] = (image.data[pixel + 1] ?? 0) / 255
            colors[index + 2] = (image.data[pixel + 2] ?? 0) / 255
            vertexOffset++
          }
        }

        for (let iy = 0; iy < segments; iy++) {
          for (let ix = 0; ix < segments; ix++) {
            const a = baseVertex + iy * (segments + 1) + ix
            const b = a + 1
            const c = a + segments + 1
            const d = c + 1
            indices[indexOffset++] = a
            indices[indexOffset++] = c
            indices[indexOffset++] = b
            indices[indexOffset++] = b
            indices[indexOffset++] = c
            indices[indexOffset++] = d
          }
        }
      }
    }
  }

  return { positions, normals, colors, indices, indexCount: indexOffset }
}

export function GlobeCanvas({ image, layers }: GlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<WebGL2RenderingContext | null>(null)
  const programRef = useRef<ProgramInfo | null>(null)
  const orbitRef = useRef({ yaw: 0.2, pitch: 0.18, zoom: 1 })
  const lodRef = useRef(2)
  const dragRef = useRef<null | { x: number; y: number; yaw: number; pitch: number }>(null)
  const [lod, setLod] = useState(2)
  const [error, setError] = useState<string | null>(null)

  const lodForZoom = (zoom: number): number => (zoom < 0.9 ? 0 : zoom < 1.5 ? 1 : 2)

  const draw = useCallback(() => {
    const gl = glRef.current
    const info = programRef.current
    if (!gl || !info || info.indexCount === 0) return
    const aspect = gl.canvas.width / Math.max(1, gl.canvas.height)
    const projection = perspective(Math.PI / 4, aspect, 0.1, 10)
    const view = translation(0, 0, -3.25 / orbitRef.current.zoom)
    const model = multiply(rotationX(orbitRef.current.pitch), rotationY(orbitRef.current.yaw))

    gl.clearColor(0.055, 0.06, 0.07, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.disable(gl.CULL_FACE)
    gl.useProgram(info.program)
    gl.uniformMatrix4fv(info.uniforms.projection, false, projection)
    gl.uniformMatrix4fv(info.uniforms.view, false, view)
    gl.uniformMatrix4fv(info.uniforms.model, false, model)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, info.buffers.index)
    gl.drawElements(gl.TRIANGLES, info.indexCount, gl.UNSIGNED_INT, 0)
  }, [])

  const uploadMesh = useCallback(() => {
    const gl = glRef.current
    const info = programRef.current
    if (!gl || !info || !image) {
      if (info) info.indexCount = 0
      draw()
      return
    }
    const mesh = buildMesh(image, layers, lodRef.current)
    gl.bindBuffer(gl.ARRAY_BUFFER, info.buffers.position)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, info.buffers.normal)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, info.buffers.color)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, info.buffers.index)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)
    info.indexCount = mesh.indexCount
    draw()
  }, [draw, image, layers])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false })
    if (!gl) {
      setError('当前 WebView 不支持 WebGL2，无法显示 3D 球体。')
      return
    }
    glRef.current = gl

    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('无法创建着色器')
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? '着色器编译失败')
      }
      return shader
    }

    try {
      const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER)
      const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
      const program = gl.createProgram()
      if (!program) throw new Error('无法创建着色器程序')
      gl.attachShader(program, vertex)
      gl.attachShader(program, fragment)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? '着色器链接失败')
      }
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)

      const buffers = {
        position: gl.createBuffer(),
        normal: gl.createBuffer(),
        color: gl.createBuffer(),
        index: gl.createBuffer(),
      }
      if (!buffers.position || !buffers.normal || !buffers.color || !buffers.index) {
        throw new Error('无法创建顶点缓冲')
      }
      programRef.current = {
        program,
        buffers,
        uniforms: {
          projection: gl.getUniformLocation(program, 'uProjection'),
          view: gl.getUniformLocation(program, 'uView'),
          model: gl.getUniformLocation(program, 'uModel'),
        },
        indexCount: 0,
      }
      const bindAttribute = (location: number, buffer: WebGLBuffer): void => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.enableVertexAttribArray(location)
        gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0)
      }
      bindAttribute(0, buffers.position)
      bindAttribute(1, buffers.normal)
      bindAttribute(2, buffers.color)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '3D 初始化失败')
      return
    }

    const resize = (): void => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      gl.viewport(0, 0, canvas.width, canvas.height)
      uploadMesh()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => {
      observer.disconnect()
      if (glRef.current === gl) glRef.current = null
    }
  }, [uploadMesh])

  useEffect(() => {
    uploadMesh()
  }, [uploadMesh])

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-4"
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            yaw: orbitRef.current.yaw,
            pitch: orbitRef.current.pitch,
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag) return
          orbitRef.current.yaw = drag.yaw + (event.clientX - drag.x) * 0.007
          orbitRef.current.pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + (event.clientY - drag.y) * 0.007))
          draw()
        }}
        onPointerUp={(event) => {
          dragRef.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        }}
        onWheel={(event) => {
          event.preventDefault()
          const next = Math.max(0.7, Math.min(3.2, orbitRef.current.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)))
          orbitRef.current.zoom = next
          const nextLod = lodForZoom(next)
          if (nextLod !== lodRef.current) {
            lodRef.current = nextLod
            setLod(nextLod)
            uploadMesh()
          } else {
            draw()
          }
        }}
        onDoubleClick={() => {
          orbitRef.current = { yaw: 0.2, pitch: 0.18, zoom: 1 }
          draw()
        }}
      />
      <button
        onClick={() => {
          orbitRef.current = { yaw: 0.2, pitch: 0.18, zoom: 1 }
          draw()
        }}
        className="absolute right-4 top-4 flex h-7 items-center gap-1 rounded border border-line bg-paper/85 px-2 text-[10px] text-ink-muted backdrop-blur hover:text-ink"
        title="重置球体视角"
      >
        <RotateCcw size={12} strokeWidth={2} />
        复位
      </button>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded border border-line bg-paper/80 px-2 py-1 text-[10px] text-ink-faint backdrop-blur">
        拖动旋转 · 滚轮缩放 · 六面瓦片 LOD {lod} · 真实高程位移
      </div>
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-paper/90 px-6 text-center text-xs text-error">
          {error}
        </div>
      ) : null}
    </div>
  )
}
