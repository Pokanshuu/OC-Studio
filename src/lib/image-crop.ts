export interface PixelCrop {
  x: number
  y: number
  width: number
  height: number
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

export async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: PixelCrop,
  rotation: number = 0,
): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context not available')

  const maxSize = Math.max(image.width, image.height)
  const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2))

  canvas.width = safeArea
  canvas.height = safeArea

  ctx.translate(safeArea / 2, safeArea / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.translate(-safeArea / 2, -safeArea / 2)

  ctx.drawImage(
    image,
    safeArea / 2 - image.width * 0.5,
    safeArea / 2 - image.height * 0.5,
  )

  const data = ctx.getImageData(0, 0, safeArea, safeArea)

  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  ctx.putImageData(
    data,
    Math.round(0 - safeArea / 2 + image.width * 0.5 - pixelCrop.x),
    Math.round(0 - safeArea / 2 + image.height * 0.5 - pixelCrop.y),
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob failed'))
      },
      'image/jpeg',
      0.92,
    )
  })
}

export function getCroppedDataUrl(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
): string {
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(pixelCrop.width * scaleX)
  canvas.height = Math.round(pixelCrop.height * scaleY)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    pixelCrop.width * scaleX,
    pixelCrop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  return canvas.toDataURL('image/jpeg', 0.92)
}

export function createCroppedCanvas(
  image: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  rotation: number = 0,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  if (rotation !== 0) {
    const maxSize = Math.max(dw, dh)
    const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2))
    canvas.width = safeArea
    canvas.height = safeArea

    ctx.translate(safeArea / 2, safeArea / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.translate(-safeArea / 2, -safeArea / 2)

    ctx.drawImage(
      image,
      sx,
      sy,
      sw,
      sh,
      safeArea / 2 - dw / 2,
      safeArea / 2 - dh / 2,
      dw,
      dh,
    )
  } else {
    canvas.width = dw
    canvas.height = dh
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh)
  }

  return canvas
}
