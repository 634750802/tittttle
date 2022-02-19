/*!
 * wordcloud2.js
 * http://timdream.org/wordcloud2.js/
 *
 * Copyright 2011 - 2019 Tim Guan-tin Chien and contributors.
 * Released under the MIT license
 */

'use strict'

if (typeof window !== 'undefined') {
  // setImmediate
  if (!window.setImmediate) {
    window.setImmediate = (function setupSetImmediate() {
      return window.msSetImmediate ||
        window.webkitSetImmediate ||
        window.mozSetImmediate ||
        window.oSetImmediate ||
        (function setupSetZeroTimeout() {
          if (!window.postMessage || !window.addEventListener) {
            return null
          }

          let callbacks = [undefined]
          let message = 'zero-timeout-message'

          // Like setTimeout, but only takes a function argument.  There's
          // no time argument (always zero) and no arguments (you have to
          // use a closure).
          let setZeroTimeout = function setZeroTimeout(callback) {
            let id = callbacks.length
            callbacks.push(callback)
            window.postMessage(message + id.toString(36), '*')

            return id
          }

          window.addEventListener('message', function setZeroTimeoutMessage(evt) {
            // Skipping checking event source, retarded IE confused this window
            // object with another in the presence of iframe
            if (typeof evt.data !== 'string' ||
              evt.data.substr(0, message.length) !== message/* ||
            evt.source !== window */) {
              return
            }

            evt.stopImmediatePropagation()

            let id = parseInt(evt.data.substr(message.length), 36)
            if (!callbacks[id]) {
              return
            }

            callbacks[id]()
            callbacks[id] = undefined
          }, true)

          /* specify clearImmediate() here since we need the scope */
          window.clearImmediate = function clearZeroTimeout(id) {
            if (!callbacks[id]) {
              return
            }

            callbacks[id] = undefined
          }

          return setZeroTimeout
        })() ||
        // fallback
        function setImmediateFallback(fn) {
          window.setTimeout(fn, 0)
        }
    })()
  }

  if (!window.clearImmediate) {
    window.clearImmediate = (function setupClearImmediate() {
      return window.msClearImmediate ||
        window.webkitClearImmediate ||
        window.mozClearImmediate ||
        window.oClearImmediate ||
        // "clearZeroTimeout" is implement on the previous block ||
        // fallback
        function clearImmediateFallback(timer) {
          window.clearTimeout(timer)
        }
    })()
  }

  // Check if WordCloud can run on this browser
  Object.defineProperty(window, 'isSupported', {
    get() {
      return (function isSupported() {
        let canvas = document.createElement('canvas')
        if (!canvas || !canvas.getContext) {
          return false
        }

        let ctx = canvas.getContext('2d')
        if (!ctx) {
          return false
        }
        if (!ctx.getImageData) {
          return false
        }
        if (!ctx.fillText) {
          return false
        }

        if (!Array.prototype.some) {
          return false
        }
        if (!Array.prototype.push) {
          return false
        }

        return true
      }())
    }
  })
}

export default function WordCloud(elements, options) {
  // polyfill
  let timer = {};

  if (!window.isSupported) {
    return
  }

  let timerId = Math.floor(Math.random() * Date.now())

  if (!Array.isArray(elements)) {
    elements = [elements]
  }

  elements.forEach(function (el, i) {
    if (typeof el === 'string') {
      elements[i] = document.getElementById(el)
      if (!elements[i]) {
        throw new Error('The element id specified is not found.')
      }
    } else if (!el.tagName && !el.appendChild) {
      throw new Error('You must pass valid HTML elements, or ID of the element.')
    }
  })

  /* Default values to be overwritten by options object */
  let settings = {
    list: [],
    fontFamily: '"Trebuchet MS", "Heiti TC", "微軟正黑體", ' +
      '"Arial Unicode MS", "Droid Fallback Sans", sans-serif',
    fontWeight: 'normal',
    color: 'random-dark',
    minSize: 0, // 0 to disable
    weightFactor: 1,
    clearCanvas: true,
    backgroundColor: '#fff', // opaque white = rgba(255, 255, 255, 1)

    gridSize: 8,
    drawOutOfBound: false,
    shrinkToFit: false,
    origin: null,

    drawMask: false,
    maskColor: 'rgba(255,0,0,0.3)',
    maskGapWidth: 0.3,

    wait: 0,
    abortThreshold: 0, // disabled
    abort: function noop() {
    },

    shape: 'circle',
    ellipticity: 0.65,

    createElement: options.createElement ?? ((item) => document.createElement('a'))
  }

  if (options) {
    for (let key in options) {
      if (key in settings) {
        settings[key] = options[key]
      }
    }
  }

  /* Convert weightFactor into a function */
  if (typeof settings.weightFactor !== 'function') {
    let factor = settings.weightFactor
    settings.weightFactor = function weightFactor(pt) {
      return pt * factor // in px
    }
  }

  /* Convert shape into a function */
  if (typeof settings.shape !== 'function') {
    switch (settings.shape) {
      case 'circle':
      /* falls through */
      default:
          // 'circle' is the default and a shortcut in the code loop.
          settings.shape = 'circle'
          break

        case 'square':
          // http://www.wolframalpha.com/input/?i=plot+r+%3D+min(1%2Fabs(cos(t
          // )),1%2Fabs(sin(t)))),+t+%3D+0+..+2*PI
          settings.shape = function shapeSquare(theta) {
            return Math.min(
              1 / Math.abs(Math.cos(theta)),
              1 / Math.abs(Math.sin(theta))
            )
          }
          break
    }
  }

  /* Make sure gridSize is a whole number and is not smaller than 4px */
  settings.gridSize = Math.max(Math.floor(settings.gridSize), 4)

  /* shorthand */
  let g = settings.gridSize
  let maskRectWidth = g - settings.maskGapWidth

  /* information/object available to all functions, set when start() */
  let grid, // 2d array containing filling information
    ngx, ngy, // width and height of the grid
    center, // position of the center of the cloud
    maxRadius

  /* timestamp for measuring each putWord() action */
  let escapeTime

  /* function for getting the color of the text */
  let getTextColor
  if (typeof settings.color === 'function') {
    getTextColor = settings.color
  }

  /* function for getting the font-weight of the text */
  let getTextFontWeight
  if (typeof settings.fontWeight === 'function') {
    getTextFontWeight = settings.fontWeight
  }

  /* Get points on the grid for a given radius away from the center */
  let pointsAtRadius = []
  let getPointsAtRadius = function getPointsAtRadius(radius) {
    if (pointsAtRadius[radius]) {
      return pointsAtRadius[radius]
    }

    // Look for these number of points on each radius
    let T = radius * 8

    // Getting all the points at this radius
    let t = T
    let points = []

    if (radius === 0) {
      points.push([center[0], center[1], 0])
    }

    while (t--) {
      // distort the radius to put the cloud in shape
      let rx = 1
      if (settings.shape !== 'circle') {
        rx = settings.shape(t / T * 2 * Math.PI) // 0 to 1
      }

      // Push [x, y, t] t is used solely for getTextColor()
      points.push([
        center[0] + radius * rx * Math.cos(-t / T * 2 * Math.PI),
        center[1] + radius * rx * Math.sin(-t / T * 2 * Math.PI) *
        settings.ellipticity,
        t / T * 2 * Math.PI])
    }

    pointsAtRadius[radius] = points
    return points
  }

  /* Return true if we had spent too much time */
  let exceedTime = function exceedTime() {
    return ((settings.abortThreshold > 0) &&
      ((new Date()).getTime() - escapeTime > settings.abortThreshold))
  }

  // djagger: do not create canvas every time, clear reused on instead.
  const reusedFcanvas = document.createElement('canvas')
  const reusedFctx = reusedFcanvas.getContext('2d', {willReadFrequently: true})

  function getCanvasAndCtx(debug) {
    if (debug) {
      const fcanvas = document.createElement('canvas')
      const fctx = fcanvas.getContext('2d', {willReadFrequently: true})
      fcanvas.style.marginLeft = '8px'
      return {fcanvas, fctx}
    } else {
      reusedFctx.setTransform(1, 0, 0, 1, 0, 0);
      reusedFctx.clearRect(0, 0, reusedFcanvas.width, reusedFcanvas.height)
      return {fcanvas: reusedFcanvas, fctx: reusedFctx}
    }
  }

  let getTextInfo = function getTextInfo(word, weight) {
    // calculate the acutal font size
    // fontSize === 0 means weightFactor function wants the text skipped,
    // and size < minSize means we cannot draw the text.
    let debug = false
    let fontSize = settings.weightFactor(weight)
    if (fontSize <= settings.minSize) {
      return false
    }

    // Get fontWeight that will be used to set fctx.font
    let fontWeight
    if (getTextFontWeight) {
      fontWeight = getTextFontWeight(word, weight, fontSize)
    } else {
      fontWeight = settings.fontWeight
    }

    const {fcanvas, fctx} = getCanvasAndCtx(debug)

    fctx.font = `${fontWeight} ${fontSize.toString(10)}px ${settings.fontFamily}`

    // Estimate the dimension of the text with measureText().
    let fw = fctx.measureText(word).width
    let fh = Math.max(fontSize,
      fctx.measureText('m').width,
      fctx.measureText('\uFF37').width
    )

    // Create a boundary box that is larger than our estimates,
    // so text don't get cut of (it still might)
    let boxWidth = fw + fh * 2
    let boxHeight = fh * 3
    let fgw = Math.ceil(boxWidth / g)
    let fgh = Math.ceil(boxHeight / g)

    // Calculate the proper offsets to make the text centered at
    // the preferred position.

    // This is simply half of the width.
    const fillTextOffsetX = -fw / 2

    // djagger: remove this feature
    // Instead of moving the box to the exact middle of the preferred
    // position, for Y-offset we move 0.4 instead, so Latin alphabets look
    // vertical centered.
    const fillTextOffsetY = -fh / 2

    // Calculate the actual dimension of the canvas, considering the rotation.
    let cgw = fgw
    let cgh = fgh
    let width = cgw * g
    let height = cgh * g

    fcanvas.width = width
    fcanvas.height = height

    if (debug) {
      // Attach fcanvas to the DOM
      document.body.appendChild(fcanvas)
      // Save it's state so that we could restore and draw the grid correctly.
      fctx.save()
    }

    // Scale the canvas with |mu| (removed).
    fctx.scale(1, 1)
    fctx.translate(width / 2, height / 2)

    // Once the width/height is set, ctx info will be reset.
    // Set it again here.
    fctx.font = `${fontWeight} ${(fontSize).toString(10)}px ${settings.fontFamily}`

    // Fill the text into the fcanvas.
    // XXX: We cannot because textBaseline = 'top' here because
    // Firefox and Chrome uses different default line-height for canvas.
    // Please read https://bugzil.la/737852#c6.
    // Here, we use textBaseline = 'middle' and draw the text at exactly
    // 0.5 * fontSize lower.
    fctx.fillStyle = '#000'
    fctx.textBaseline = 'middle'
    fctx.fillText(word,
      fillTextOffsetX,
      (fillTextOffsetY + fontSize * 0.4) /* djagger: make the latin char align center vertically*/
    )

    // Get the pixels of the text
    let imageData = fctx.getImageData(0, 0, width, height).data

    if (exceedTime()) {
      return false
    }

    if (debug) {
      // Draw the box of the original estimation
      fctx.strokeStyle = 'rgba(255,0,0, 1)'
      fctx.strokeRect(
        fillTextOffsetX,
        fillTextOffsetY, fw, fh
      )
      fctx.restore()
    }

    // TODO: could be optimize in wasm
    //       input: imageData (uint32 array), fctx
    //       output: occupied array (2x int array), bounds
    // Read the pixels and save the information to the occupied array
    // djagger: turns into two array for x and y
    let occupied = [[], []]
    let gx = cgw
    let gy, x, y
    let bounds = [cgh / 2, cgw / 2, cgh / 2, cgw / 2]
    while (gx--) {
      gy = cgh
      while (gy--) {
        y = g
        /* eslint no-labels: ["error", { "allowLoop": true }] */
        singleGridLoop: while (y--) {
          const ggx = gx * g
          const ggy = gy * g
          x = g

          // reduce computing times
          let pos = ((ggy + y) * width + (ggx + x)) * 4 + 3
          while (x--) {
            if (imageData[pos]) {
              occupied[0].push(gx)
              occupied[1].push(gy)

              bounds[3] = Math.min(bounds[3], gx)
              bounds[1] = Math.max(bounds[1], gx)
              bounds[0] = Math.min(bounds[0], gy)
              bounds[2] = Math.max(bounds[2], gy)

              if (debug) {
                fctx.fillStyle = 'rgba(255, 0, 0, 0.5)'
                fctx.fillRect(ggx, ggy, g - 0.5, g - 0.5)
              }
              break singleGridLoop
            }
            pos -= 4
          }
        }
        if (debug) {
          fctx.fillStyle = 'rgba(0, 0, 255, 0.5)'
          fctx.fillRect(gx * g, gy * g, g - 0.5, g - 0.5)
        }
      }
    }
    // till here

    if (debug) {
      fctx.fillStyle = 'rgba(0, 255, 0, 0.5)'
      fctx.fillRect(
        bounds[3] * g,
        bounds[0] * g,
        (bounds[1] - bounds[3] + 1) * g,
        (bounds[2] - bounds[0] + 1) * g
      )
    }

    // Return information needed to create the text on the real canvas
    return {
      occupied: occupied,
      bounds: bounds,
      gw: cgw,
      gh: cgh,
      fillTextOffsetX: fillTextOffsetX,
      fillTextOffsetY: fillTextOffsetY,
      fillTextWidth: fw,
      fillTextHeight: fh,
      fontSize: fontSize
    }
  }

  /* Determine if there is room available in the given dimension */
  let canFitText = function canFitText(gx, gy, gw, gh, occupied) {
    // Go through the occupied points,
    // return false if the space is not available.
    let i = occupied[0].length
    while (i--) {
      let px = gx + occupied[0][i]
      let py = gy + occupied[1][i]

      if (px >= ngx || py >= ngy || px < 0 || py < 0) {
        if (!settings.drawOutOfBound) {
          return false
        }
        continue
      }

      if (!grid[px][py]) {
        return false
      }
    }
    return true
  }

  /* Actually draw the text on the grid */
  let drawText = function drawText(gx, gy, info, word, weight, distance, theta, attributes, item) {
    let fontSize = info.fontSize
    let color
    if (getTextColor) {
      color = getTextColor(word, weight, fontSize, distance, theta)
    } else {
      color = settings.color
    }

    // get fontWeight that will be used to set ctx.font and font style rule
    let fontWeight
    if (getTextFontWeight) {
      fontWeight = getTextFontWeight(word, weight, fontSize)
    } else {
      fontWeight = settings.fontWeight
    }

    const el = elements[1]

    // drawText on DIV element
    const span = settings.createElement(item)

    const transformRules = {}

    let size = (fontSize)
    if (size < 12) {
      transformRules.scale = size / 12
    }
    let transformRule = transformRules.scale ? ` scale(${transformRules.scale})` : ''
    let styleRules = {
      font: `${fontWeight} ${Math.max(12, size)}px ${settings.fontFamily}`,
      left: ((gx + info.gw / 2) * g + info.fillTextOffsetX) + 'px',
      top: ((gy + info.gh / 2) * g + info.fillTextOffsetY) + 'px',
      width: info.fillTextWidth + 'px',
      height: info.fillTextHeight + 'px',
      'line-height': Math.max(fontSize, 12) + 'px',
      transform: transformRule,
      '-webkit-transform': transformRule,
      '-ms-transform': transformRule,
    }
    if (color) {
      styleRules.color = color
    }
    span.textContent = word
    // https://stackoverflow.com/questions/4207505/is-there-a-way-to-apply-multiple-css-styles-in-a-batch-to-avoid-multiple-reflows
    const css = Object.entries(styleRules).map(([name, value]) => `${name}: ${value};`).join(' ')
    span.style.cssText += ' ' + css
    el.appendChild(span)
  }

  /* Help function to updateGrid */
  let fillGridAt = function fillGridAt(x, y, drawMask, item) {
    if (x >= ngx || y >= ngy || x < 0 || y < 0) {
      return
    }

    grid[x][y] = false

    if (drawMask) {
      let ctx = elements[0].getContext('2d')
      ctx.fillRect(x * g, y * g, maskRectWidth, maskRectWidth)
    }

  }

  /* Update the filling information of the given space with occupied points.
     Draw the mask on the canvas if necessary. */
  let updateGrid = function updateGrid(gx, gy, gw, gh, info, item) {
    let occupied = info.occupied
    let drawMask = settings.drawMask
    let ctx
    if (drawMask) {
      ctx = elements[0].getContext('2d')
      ctx.save()
      ctx.fillStyle = settings.maskColor
    }

    let i = occupied[0].length
    while (i--) {
      let px = gx + occupied[0][i]
      let py = gy + occupied[1][i]

      if (px >= ngx || py >= ngy || px < 0 || py < 0) {
        continue
      }

      fillGridAt(px, py, drawMask, item)
    }

    if (drawMask) {
      ctx.restore()
    }
  }

  /* putWord() processes each item on the list,
     calculate it's size and determine it's position, and actually
     put it on the canvas. */
  let putWord = function putWord(item) {
    let word, weight, attributes
    if (Array.isArray(item)) {
      word = item[0]
      weight = item[1]
    } else {
      word = item.word
      weight = item.weight
      attributes = item.attributes
    }

    // get info needed to put the text onto the canvas
    let info = getTextInfo(word, weight)

    // not getting the info means we shouldn't be drawing this one.
    if (!info) {
      return false
    }

    if (exceedTime()) {
      return false
    }

    // If drawOutOfBound is set to false,
    // skip the loop if we have already know the bounding box of
    // word is larger than the canvas.
    if (!settings.drawOutOfBound && !settings.shrinkToFit) {
      let bounds = info.bounds;
      if ((bounds[1] - bounds[3] + 1) > ngx ||
        (bounds[2] - bounds[0] + 1) > ngy) {
        return false
      }
    }

    // Determine the position to put the text by
    // start looking for the nearest points
    let r = maxRadius + 1

    let tryToPutWordAtPoint = function (gxy) {
      let gx = Math.floor(gxy[0] - info.gw / 2)
      let gy = Math.floor(gxy[1] - info.gh / 2)
      let gw = info.gw
      let gh = info.gh

      // If we cannot fit the text at this position, return false
      // and go to the next position.
      if (!canFitText(gx, gy, gw, gh, info.occupied)) {
        return false
      }

      // Actually put the text on the canvas
      drawText(gx, gy, info, word, weight, (maxRadius - r), gxy[2], attributes, item)

      // Mark the spaces on the grid as filled
      updateGrid(gx, gy, gw, gh, info, item)

      // Return true so some() will stop and also return true.
      return true
    }

      while (r--) {
        let points = getPointsAtRadius(maxRadius - r)

        // Try to fit the words by looking at each point.
        // array.some() will stop and return true
        // when putWordAtPoint() returns true.
        // If all the points returns false, array.some() returns false.
        let drawn = points.some(tryToPutWordAtPoint)

        if (drawn) {
          // leave putWord() and return true
          return true
        }
      }
    if (settings.shrinkToFit) {
      if (Array.isArray(item)) {
        item[1] = item[1] * 3 / 4
      } else {
        item.weight = item.weight * 3 / 4
      }
      return putWord(item)
    }
    // we tried all distances but text won't fit, return false
    return false
  }

  /* Send DOM event to all elements. Will stop sending event and return
     if the previous one is canceled (for cancelable events). */
  let sendEvent = function sendEvent(type, cancelable, details) {
    if (cancelable) {
      return !elements.some(function (el) {
        let event = new CustomEvent(type, {
          detail: details || {}
        })
        return !el.dispatchEvent(event)
      }, this)
    } else {
      elements.forEach(function (el) {
        let event = new CustomEvent(type, {
          detail: details || {}
        })
        el.dispatchEvent(event)
      }, this)
    }
  }

  /* Start drawing on a canvas */
  this.start = function start() {
    // For dimensions, clearCanvas etc.,
    // we only care about the first element.
    let canvas = elements[0]

    if (canvas.getContext) {
      ngx = Math.ceil(canvas.width / g)
      ngy = Math.ceil(canvas.height / g)
    } else {
      let rect = canvas.getBoundingClientRect()
      ngx = Math.ceil(rect.width / g)
      ngy = Math.ceil(rect.height / g)
    }

    // Sending a wordcloudstart event which cause the previous loop to stop.
    // Do nothing if the event is canceled.
    if (!sendEvent('wordcloudstart', true)) {
      return
    }

    // Determine the center of the word cloud
    center = (settings.origin)
      ? [settings.origin[0] / g, settings.origin[1] / g]
      : [ngx / 2, ngy / 2]

    // Maxium radius to look for space
    maxRadius = Math.floor(Math.sqrt(ngx * ngx + ngy * ngy))

    /* Clear the canvas only if the clearCanvas is set,
       if not, update the grid to the current canvas state */
    grid = []

    let gx, gy, i
    if (!canvas.getContext || settings.clearCanvas) {
      elements.forEach(function (el) {
        if (el.getContext) {
          let ctx = el.getContext('2d')
          ctx.fillStyle = settings.backgroundColor
          ctx.clearRect(0, 0, ngx * (g + 1), ngy * (g + 1))
          ctx.fillRect(0, 0, ngx * (g + 1), ngy * (g + 1))
        } else {
          el.textContent = ''
          el.style.position = 'relative'
        }
      })

      /* fill the grid with empty state */
      gx = ngx
      while (gx--) {
        grid[gx] = []
        gy = ngy
        while (gy--) {
          grid[gx][gy] = true
        }
      }
    } else {
      /* Determine bgPixel by creating
         another canvas and fill the specified background color. */
      let bctx = document.createElement('canvas').getContext('2d')

      bctx.fillStyle = settings.backgroundColor
      bctx.fillRect(0, 0, 1, 1)
      let bgPixel = bctx.getImageData(0, 0, 1, 1).data

      /* Read back the pixels of the canvas we got to tell which part of the
         canvas is empty.
         (no clearCanvas only works with a canvas, not divs) */
      let imageData =
        canvas.getContext('2d').getImageData(0, 0, ngx * g, ngy * g).data

      gx = ngx
      let x, y
      while (gx--) {
        grid[gx] = []
        gy = ngy
        while (gy--) {
          y = g
          /* eslint no-labels: ["error", { "allowLoop": true }] */
          singleGridLoop: while (y--) {
            x = g
            while (x--) {
              i = 4
              while (i--) {
                if (imageData[((gy * g + y) * ngx * g +
                  (gx * g + x)) * 4 + i] !== bgPixel[i]) {
                  grid[gx][gy] = false
                  break singleGridLoop
                }
              }
            }
          }
          if (grid[gx][gy] !== false) {
            grid[gx][gy] = true
          }
        }
      }

      imageData = bctx = bgPixel = undefined
    }

    i = 0
    let loopingFunction, stoppingFunction
    if (settings.wait !== 0) {
      loopingFunction = window.setTimeout
      stoppingFunction = window.clearTimeout
    } else {
      loopingFunction = window.setImmediate
      stoppingFunction = window.clearImmediate
    }

    let addEventListener = function addEventListener(type, listener) {
      elements.forEach(function (el) {
        el.addEventListener(type, listener)
      }, this)
    }

    let removeEventListener = function removeEventListener(type, listener) {
      elements.forEach(function (el) {
        el.removeEventListener(type, listener)
      }, this)
    }

    let anotherWordCloudStart = function anotherWordCloudStart() {
      removeEventListener('wordcloudstart', anotherWordCloudStart)
      stoppingFunction(timer[timerId])
    }

    addEventListener('wordcloudstart', anotherWordCloudStart)
    timer[timerId] = loopingFunction(function loop() {
      if (i >= settings.list.length) {
        stoppingFunction(timer[timerId])
        sendEvent('wordcloudstop', false)
        removeEventListener('wordcloudstart', anotherWordCloudStart)
        delete timer[timerId];
        return
      }
      escapeTime = (new Date()).getTime()
      let drawn = putWord(settings.list[i])
      let canceled = !sendEvent('wordclouddrawn', true, {
        item: settings.list[i],
        drawn: drawn
      })
      if (exceedTime() || canceled) {
        stoppingFunction(timer[timerId])
        settings.abort()
        sendEvent('wordcloudabort', false)
        sendEvent('wordcloudstop', false)
        removeEventListener('wordcloudstart', anotherWordCloudStart)
        delete timer[timerId]
        return
      }
      i++
      timer[timerId] = loopingFunction(loop, settings.wait)
    }, settings.wait)
  }

  this.stop = function stop() {
    if (timer) {
      for (let timerId in timer) {
        window.clearImmediate(timer[timerId])
      }
    }
  }
}
