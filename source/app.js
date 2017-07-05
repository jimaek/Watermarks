(function () {
  'use strict'

  if (!window.MutationObserver || !window.Promise) return

  var watermark = window.watermark
  var SRCSET_PATTERN = new RegExp(',\\s')
  var options = INSTALL_OPTIONS
  var observer = null
  var container = null
  var updateTimeout = null
  var parseAttribute = 'data-watermark-parse-state'
  var attributeMap = {
    src: 'data-cf-watermark-src',
    srcset: 'data-cf-watermark-srcset'
  }

  var watermarkOptions = {
    init: function init (imageElement) {
      imageElement.crossOrigin = 'anonymous'
    }
  }

  function forEach (arrayLike, callback) {
    Array.prototype.slice.call(arrayLike).forEach(callback)
  }

  function watermarkImage (imageElement, force) {
    if (imageElement.width < options.advanced.minWidth) return
    if (imageElement.height < options.advanced.minHeight) return
    if (imageElement.getAttribute(parseAttribute) === 'parsing') return
    if (imageElement.getAttribute(parseAttribute) === 'parsed') return
    if (imageElement.getAttribute(parseAttribute) === 'pending' && !force) return

    imageElement.setAttribute(parseAttribute, 'parsing')

    var cachedAttribute = {
      src: imageElement.attributes[attributeMap.src],
      srcset: imageElement.attributes[attributeMap.srcset]
    }

    var textFunction = watermark.text[options.position]
    var watermarkArgs = [
      options.text,
      options.textSize + 'px sans-serif',
      options.textColor,
      options.opacity / 100,
      !options.position.indexOf('upper') ? options.textSize : null
    ]

    var promises = []

    function getSrcSetPromise (sourceSet) {
      var entries = sourceSet
        .split(SRCSET_PATTERN)
        .map(function (value) {
          var parsed = value.split(/\s/)

          return {url: parsed[0], size: parsed[1]}
        })

      var srcsetPromises = entries.map(function (entry) {
        return watermark([entry.url], watermarkOptions)
          .image(textFunction.apply(null, watermarkArgs))
          .then(function (watermarkedImage) {
            return [watermarkedImage.src, entry.size]
          })
      })

      return Promise.all(srcsetPromises)
        .then(function (results) {
          return Promise.resolve({
            attribute: 'srcset',
            value: results.map(function (result) { return result.join(' ') }).join(', ')
          })
        })
    }

    if (imageElement.srcset) {
      var sourceSet = cachedAttribute.srcset ? cachedAttribute.srcset.value : imageElement.srcset

      promises.push(getSrcSetPromise(sourceSet))
    } else {
      var source = cachedAttribute.src ? cachedAttribute.src.value : imageElement.src

      promises.push(watermark([source], watermarkOptions)
        .image(textFunction.apply(null, watermarkArgs))
        .then(function (watermarkedImage) {
          return {attribute: 'src', value: watermarkedImage.src}
        }))
    }

    var parseTimeout = setTimeout(function () {
      imageElement.setAttribute(parseAttribute, 'timeout')
    }, 5000)

    Promise.all(promises)
      .catch(function (error) {
        clearTimeout(parseTimeout)
        console.error('Watermark error', error)
        imageElement.setAttribute(parseAttribute, 'error')
      })
      .then(function (results) {
        clearTimeout(parseTimeout)
        if (imageElement.getAttribute(parseAttribute) === 'pending') {
          // User has changed the options by the time we've completed our compile.
          watermarkImage(imageElement, true)
          return
        }

        forEach(results, function (result) {
          if (!cachedAttribute[result.attribute]) {
            var originalValue = imageElement.getAttribute(result.attribute)
            imageElement.setAttribute(attributeMap[result.attribute], originalValue)
          }

          imageElement.setAttribute(result.attribute, result.value)
        })

        imageElement.setAttribute(parseAttribute, 'parsed')
      })
  }

  function parseDOM () {
    if (!container) return

    var images = container.querySelectorAll('img')

    forEach(images, function (image) { watermarkImage(image) })
  }

  function observeElements () {
    observer = new window.MutationObserver(parseDOM)

    observer.observe(container, {
      childList: true,
      subtree: true
    })
  }

  function bootstrap () {
    document.body.setAttribute('data-cf-watermark-mode', INSTALL_ID === 'preview' ? 'preview' : 'live')
    container = document.querySelector(options.advanced.location)

    if (!container) return

    parseDOM() // Elements already in the page.
    observeElements() // Elements inserted via JavaScript.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap)
  } else {
    bootstrap()
  }

  window.INSTALL_SCOPE = {
    setOptions: function (nextOptions) {
      clearTimeout(updateTimeout)
      options = nextOptions

      var updateSelector = 'img[' + attributeMap.src + '], img[' + attributeMap.srcset + ']'
      var imageElements = document.documentElement.querySelectorAll(updateSelector)
      forEach(imageElements, function (imageElement) {
        imageElement.setAttribute(parseAttribute, 'pending')
      })

      updateTimeout = setTimeout(function () {
        forEach(imageElements, function (imageElement) {
          window.requestAnimationFrame(watermarkImage.bind(null, imageElement, true))
        })
      }, 2000)
    }
  }
}())
