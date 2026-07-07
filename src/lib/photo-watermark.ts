/**
 * Klientské watermarkování fotek před uploadem.
 *
 * Fotku vykreslí do `<canvas>` v původním rozlišení, přes ni přidá lehký
 * textový watermark dole uprostřed a vrátí nový `File`, který jde dál do
 * stávajícího resumable uploadu. Bez serverového processing mezikroku.
 */

export const PHOTO_WATERMARK_TEXT = "t.me/mmmredington_bot"

const WATERMARKABLE_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

export interface PhotoWatermarkLayout {
  readonly centerX: number
  readonly centerY: number
  readonly fontSizePx: number
  readonly paddingX: number
  readonly paddingY: number
  readonly radius: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

export function canApplyPhotoWatermark(mimeType: string): boolean {
  return WATERMARKABLE_PHOTO_TYPES.has(mimeType)
}

export function getPhotoWatermarkLayout(
  width: number,
  height: number,
): PhotoWatermarkLayout {
  const minDimension = Math.max(1, Math.min(width, height))
  const fontSizePx = clamp(Math.round(minDimension * 0.024), 14, 56)
  const paddingX = Math.round(fontSizePx * 0.9)
  const paddingY = Math.round(fontSizePx * 0.5)
  const boxHeight = fontSizePx + paddingY * 2
  const bottomMargin = Math.round(height * 0.04)
  return {
    centerX: width / 2,
    centerY: height - bottomMargin - boxHeight / 2,
    fontSizePx,
    paddingX,
    paddingY,
    radius: Math.round(fontSizePx * 0.6),
  }
}

export function buildPhotoWatermarkSvg(
  width: number,
  height: number,
  text = PHOTO_WATERMARK_TEXT,
): string {
  const layout = getPhotoWatermarkLayout(width, height)
  const estimatedTextWidth = Math.round(
    layout.fontSizePx * Math.max(1, text.length) * 0.62,
  )
  const boxWidth = estimatedTextWidth + layout.paddingX * 2
  const boxHeight = layout.fontSizePx + layout.paddingY * 2
  const rectX = Math.round(layout.centerX - boxWidth / 2)
  const rectY = Math.round(layout.centerY - boxHeight / 2)
  const textY = Math.round(layout.centerY + layout.fontSizePx * 0.02)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="${rectX}" y="${rectY}" width="${boxWidth}" height="${boxHeight}" rx="${layout.radius}" ry="${layout.radius}" fill="#000000" fill-opacity="0.32"/>`,
    `<text x="${Math.round(layout.centerX)}" y="${textY}" text-anchor="middle" dominant-baseline="middle" fill="#FFFFFF" fill-opacity="0.5" font-family="Inter, Arial, sans-serif" font-size="${layout.fontSizePx}" font-weight="500">${escapeXml(text)}</text>`,
    "</svg>",
  ].join("")
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."))
    image.src = src
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const quality = mimeType === "image/png" ? undefined : 0.92
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Watermarked fotku se nepodařilo vytvořit."))
          return
        }
        resolve(blob)
      },
      mimeType,
      quality,
    )
  })
}

export async function applyPhotoWatermark(
  file: File,
  text = PHOTO_WATERMARK_TEXT,
): Promise<File> {
  if (!canApplyPhotoWatermark(file.type)) return file

  const sourceUrl = URL.createObjectURL(file)
  let overlayUrl: string | null = null
  try {
    const sourceImage = await loadImage(sourceUrl)
    const width = sourceImage.naturalWidth || sourceImage.width
    const height = sourceImage.naturalHeight || sourceImage.height
    if (!width || !height) {
      throw new Error("Fotka nemá platné rozměry.")
    }

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      throw new Error("Canvas není dostupný.")
    }

    ctx.drawImage(sourceImage, 0, 0, width, height)

    const overlaySvg = buildPhotoWatermarkSvg(width, height, text)
    overlayUrl = URL.createObjectURL(
      new Blob([overlaySvg], { type: "image/svg+xml;charset=utf-8" }),
    )
    const overlayImage = await loadImage(overlayUrl)
    ctx.drawImage(overlayImage, 0, 0, width, height)

    const blob = await canvasToBlob(canvas, file.type)
    return new File([blob], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    })
  } finally {
    URL.revokeObjectURL(sourceUrl)
    if (overlayUrl) URL.revokeObjectURL(overlayUrl)
  }
}
