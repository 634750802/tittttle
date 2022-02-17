function giveMaskImg (text, textOptions, options, canvas, htmlCanvas) {
  const maskCanvas = createTextMask(text, textOptions)

  if (maskCanvas) {
    options.clearCanvas = false;

    /* Determine bgPixel by creating
       another canvas and fill the specified background color. */
    let bctx = document.createElement('canvas').getContext('2d');

    bctx.fillStyle = options.backgroundColor || '#fff';
    bctx.fillRect(0, 0, 1, 1);
    let bgPixel = bctx.getImageData(0, 0, 1, 1).data;

    let maskCanvasScaled =
      document.createElement('canvas');
    maskCanvasScaled.width = canvas.width;
    maskCanvasScaled.height = canvas.height;
    let ctx = maskCanvasScaled.getContext('2d');

    ctx.drawImage(maskCanvas,
      0, 0, maskCanvas.width, maskCanvas.height,
      0, 0, maskCanvasScaled.width, maskCanvasScaled.height);

    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let newImageData = ctx.createImageData(imageData);
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i + 3] > 128) {
        newImageData.data[i] = bgPixel[0];
        newImageData.data[i + 1] = bgPixel[1];
        newImageData.data[i + 2] = bgPixel[2];
        newImageData.data[i + 3] = bgPixel[3];
      } else {
        // This color must not be the same w/ the bgPixel.
        newImageData.data[i] = bgPixel[0];
        newImageData.data[i + 1] = bgPixel[1];
        newImageData.data[i + 2] = bgPixel[2];
        newImageData.data[i + 3] = bgPixel[3] ? (bgPixel[3] - 1) : 0;
      }
    }

    ctx.putImageData(newImageData, 0, 0);

    ctx = canvas.getContext('2d');
    ctx.drawImage(maskCanvasScaled, 0, 0);

    maskCanvasScaled = ctx = imageData = newImageData = bctx = bgPixel = undefined;
  }

  // Always manually clean up the html output
  if (!options.clearCanvas) {
    htmlCanvas.innerHTML = '';
    htmlCanvas.style.backgroundColor = options.backgroundColor || '#fff'
  }

  WordCloud([canvas, htmlCanvas], options);
}
// create a text mask
function createTextMask(text, {fontWeight, fontSize, fontFamily, width, height, lineHeight}) {
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