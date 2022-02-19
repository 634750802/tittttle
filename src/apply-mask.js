export function applyMask (canvas, maskCanvas) {
  /* Determine bgPixel by creating
         another canvas and fill the specified background color. */
  let bctx = document.createElement('canvas').getContext('2d');

  bctx.fillStyle = '#fff';
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