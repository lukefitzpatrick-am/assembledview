export type Point2 = [number, number]

export type Homography = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
]

/** Direct linear transform homography from 4 point pairs (8 DOF). */
export function computeHomography(src: Point2[], dst: Point2[]): Homography {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error("computeHomography requires exactly 4 point pairs")
  }

  const a: number[][] = []
  const b: number[] = []

  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i]
    const [u, v] = dst[i]
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }

  const h = solveLinearSystem(a, b)
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ]
}

export function applyHomography(H: Homography, x: number, y: number): Point2 {
  const w = H[2][0] * x + H[2][1] * y + H[2][2]
  const u = (H[0][0] * x + H[0][1] * y + H[0][2]) / w
  const v = (H[1][0] * x + H[1][1] * y + H[1][2]) / w
  return [u, v]
}

function bilinearQuad(
  quad: Point2[],
  u: number,
  v: number,
): Point2 {
  const [tl, tr, br, bl] = quad
  const x =
    (1 - u) * (1 - v) * tl[0] +
    u * (1 - v) * tr[0] +
    u * v * br[0] +
    (1 - u) * v * bl[0]
  const y =
    (1 - u) * (1 - v) * tl[1] +
    u * (1 - v) * tr[1] +
    u * v * br[1] +
    (1 - u) * v * bl[1]
  return [x, y]
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length
  const m = matrix.map((row, i) => [...row, rhs[i]])

  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < 1e-12) {
      throw new Error("Singular matrix in homography solve")
    }
    if (pivot !== col) {
      const tmp = m[col]
      m[col] = m[pivot]
      m[pivot] = tmp
    }

    const div = m[col][col]
    for (let j = col; j <= n; j += 1) m[col][j] /= div

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue
      const factor = m[row][col]
      for (let j = col; j <= n; j += 1) m[row][j] -= factor * m[col][j]
    }
  }

  return m.map((row) => row[n])
}

export type SceneQuad = {
  tl: Point2
  tr: Point2
  br: Point2
  bl: Point2
}

export function quadToPoints(quad: SceneQuad, width: number, height: number): Point2[] {
  return [
    [quad.tl[0] * width, quad.tl[1] * height],
    [quad.tr[0] * width, quad.tr[1] * height],
    [quad.br[0] * width, quad.br[1] * height],
    [quad.bl[0] * width, quad.bl[1] * height],
  ]
}

export type DrawPerspectiveOptions = {
  subdivisions?: number
  vignette?: boolean
}

/**
 * Draw `source` perspective-warped into `destQuad` (pixel coords) with contain letterboxing.
 */
export function drawImagePerspective(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  destQuad: Point2[],
  options: DrawPerspectiveOptions = {},
): void {
  const subdivisions = options.subdivisions ?? 16
  const srcAspect = sourceWidth / sourceHeight

  const xs = destQuad.map((p) => p[0])
  const ys = destQuad.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const boxW = maxX - minX
  const boxH = maxY - minY
  const boxAspect = boxW / boxH

  let drawW = boxW
  let drawH = boxH
  if (srcAspect > boxAspect) {
    drawH = boxW / srcAspect
  } else {
    drawW = boxH * srcAspect
  }

  const off = document.createElement("canvas")
  off.width = Math.max(1, Math.round(drawW))
  off.height = Math.max(1, Math.round(drawH))
  const offCtx = off.getContext("2d")
  if (!offCtx) return
  offCtx.fillStyle = "#000"
  offCtx.fillRect(0, 0, off.width, off.height)
  const offsetX = (off.width - drawW) / 2
  const offsetY = (off.height - drawH) / 2
  offCtx.drawImage(source, 0, 0, sourceWidth, sourceHeight, offsetX, offsetY, drawW, drawH)

  const srcUnit: Point2[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]

  const H = computeHomography(srcUnit, destQuad)

  for (let i = 0; i < subdivisions; i += 1) {
    for (let j = 0; j < subdivisions; j += 1) {
      const u0 = i / subdivisions
      const u1 = (i + 1) / subdivisions
      const v0 = j / subdivisions
      const v1 = (j + 1) / subdivisions

      const p00 = applyHomography(H, u0, v0)
      const p10 = applyHomography(H, u1, v0)
      const p11 = applyHomography(H, u1, v1)
      const p01 = applyHomography(H, u0, v1)

      const sx0 = u0 * off.width
      const sy0 = v0 * off.height
      const sw = (u1 - u0) * off.width
      const sh = (v1 - v0) * off.height

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(p00[0], p00[1])
      ctx.lineTo(p10[0], p10[1])
      ctx.lineTo(p11[0], p11[1])
      ctx.lineTo(p01[0], p01[1])
      ctx.closePath()
      ctx.clip()

      const denom = (p10[0] - p00[0]) * (p01[1] - p00[1]) - (p01[0] - p00[0]) * (p10[1] - p00[1])
      if (Math.abs(denom) < 1e-6) {
        ctx.restore()
        continue
      }

      const a = (p10[0] - p00[0]) / sw
      const b = (p01[0] - p00[0]) / sh
      const c = (p10[1] - p00[1]) / sw
      const d = (p01[1] - p00[1]) / sh
      const e = p00[0] - a * sx0 - b * sy0
      const f = p00[1] - c * sx0 - d * sy0
      ctx.setTransform(a, c, b, d, e, f)
      ctx.drawImage(off, sx0, sy0, sw, sh, sx0, sy0, sw, sh)
      ctx.restore()
    }
  }

  if (options.vignette) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(destQuad[0][0], destQuad[0][1])
    for (let k = 1; k < destQuad.length; k += 1) {
      ctx.lineTo(destQuad[k][0], destQuad[k][1])
    }
    ctx.closePath()
    ctx.clip()
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const radius = Math.max(boxW, boxH) * 0.55
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius)
    grad.addColorStop(0, "rgba(0,0,0,0)")
    grad.addColorStop(1, "rgba(0,0,0,0.12)")
    ctx.fillStyle = grad
    ctx.fillRect(minX, minY, boxW, boxH)
    ctx.restore()
  }
}

export { bilinearQuad }
