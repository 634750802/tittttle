import {createTextMask} from "./text-mask";
import {applyMask} from './apply-mask'
import WordCloud from "./wordcloud2";
import randomColor from 'randomcolor';
import throttle from 'lodash/throttle'
import './style.css'
import {observeResize} from "./observe-resize";

/**
 *
 * @param {Array<{ word: string, weight: number }>} list
 * @param {HTMLElement} container style container
 */
export function start(list, {container}) {
  const htmlCanvas = document.createElement('div')
  htmlCanvas.style.cssText = `position: absolute; left: 0;top: 0; width: 100%; height: 100%; font-size-adjust: none; user-select: none;`
  container.insertBefore(htmlCanvas, container.childNodes.item(0))

  const retry = () => {
    const canvas = document.createElement('canvas')

    htmlCanvas.innerHTML = ''
    htmlCanvas.classList.remove('animated', 'zoomOut')

    const {fontFamily, fontSize, fontWeight, width, height, lineHeight} = getComputedStyle(container)

    canvas.width = parseInt(width)
    canvas.height = parseInt(height)

    let seed = 0

    const maskCanvas = createTextMask(container.textContent.trim(), {
      fontSize: parseInt(fontSize),
      fontWeight: parseInt(fontWeight) || fontWeight,
      fontFamily,
      width: parseInt(width),
      height: parseInt(height),
      lineHeight: parseInt(lineHeight),
    })

    applyMask(canvas, maskCanvas)

    // Always manually clean up the html output
    htmlCanvas.innerHTML = '';


    const wc = new WordCloud([canvas, htmlCanvas], {
      fontSize: parseInt(fontSize),
      fontWeight: parseInt(fontWeight) || fontWeight,
      fontFamily,
      gridSize: 8,
      wait: 0,
      list: list,
      drawMask: false,
      maskGapWidth: 16,
      rotateRatio: 0,
      shuffle: false,
      clearCanvas: false,
      createElement: item => {
        const a = document.createElement('a')
        a.classList.add('wordcloud-element', 'zoomIn')
        a.href = 'https://github.com/' + item.key
        a.target = '_blank'
        return a
      },
      weightFactor: n => {
        return (4 + (parseInt(fontSize) - 4) * 0.618 * n)
      },
      color: (word, weight, fontSize, distance, theta) => {
        return randomColor({
          seed: seed++,
          luminosity: 'dark',
          format: 'rgba',
          alpha: 0.1 + Math.sqrt(weight) * 0.4
        });
      }
    });
    wc.start()

    return () => {
      wc.stop()
    }
  }
  let destroy = retry()
  const fadeWords = throttle(() => {
    destroy()
    htmlCanvas.classList.add('animated', 'zoomOut')
  }, 1000, {trailing: false, leading: true})
  const showWords = throttle(() => {
    setTimeout(() => {
      destroy = retry()
    }, 0)
  }, 1000, {trailing: true, leading: false})

  const onResize = () => {
    fadeWords()
    showWords()
  }

  const removeObserver = observeResize(container, onResize)

  return () => {
    removeObserver()
    destroy()
    htmlCanvas.classList.add('animated', 'zoomOut')
    htmlCanvas.ontransitionend = () => {
      container.removeChild(htmlCanvas)
    }
  }
}