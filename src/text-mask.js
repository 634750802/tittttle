// create a text mask
export function createTextMask(text, {fontWeight, fontSize, fontFamily, width, height, lineHeight}) {
  const mask = document.createElement('canvas')
  mask.width = width
  mask.height = height

  const ctx = mask.getContext('2d')

  ctx.fillStyle = '#ffffffff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  wrapText(ctx, text, width / 2, height / 2, width, lineHeight)

  ctx.globalCompositeOperation = 'source-out'
  ctx.fillStyle = '#ffffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.restore()

  window.m = mask
  return mask
}

// must align center in both direction currently
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = []
  let words = text.split(' ');
  let line = '';

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(line)
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }

  if (line) {
    lines.push(line)
  }

  y -= (lines.length - 1) * lineHeight / 2
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i].trim(), x, y);
    y += lineHeight
  }

}