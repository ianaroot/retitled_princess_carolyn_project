import {
  EVENTS,
  FIT_PADDING,
  NODE_DIMENSIONS,
  VIEWPORT_PADDING,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP
} from '../constants.js'

class CanvasViewport {
  constructor(container, workspace, scene, nodesLayer, svgLayer, store) {
    this.container = container
    this.workspace = workspace
    this.scene = scene
    this.nodesLayer = nodesLayer
    this.svgLayer = svgLayer
    this.store = store

    this.logicalWidth = 0
    this.logicalHeight = 0
    this.worldMinX = 0
    this.worldMinY = 0
    this.worldMaxX = 0
    this.worldMaxY = 0
    this.activeInteractions = 0
    this.interactionBounds = null
    this.subscribers = []
    this.rafId = null
    this.hasFittedInitialView = false
    this.zoomInButton = document.getElementById('zoom-in')
    this.zoomOutButton = document.getElementById('zoom-out')
    this.zoomResetButton = document.getElementById('zoom-reset')

    this.boundHandleResize = this.handleResize.bind(this)
    this.boundZoomIn = this.zoomIn.bind(this)
    this.boundZoomOut = this.zoomOut.bind(this)
    this.boundZoomReset = this.zoomReset.bind(this)
    this.unsubscribe = this.store.subscribe(this.handleStoreChange.bind(this))

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleRefresh())
      this.resizeObserver.observe(this.container)
    } else {
      window.addEventListener('resize', this.boundHandleResize)
    }

    this.attachControls()
    this.setZoom(ZOOM_DEFAULT)
    this.refresh()
  }

  attachControls() {
    this.zoomInButton?.addEventListener('click', this.boundZoomIn)
    this.zoomOutButton?.addEventListener('click', this.boundZoomOut)
    this.zoomResetButton?.addEventListener('click', this.boundZoomReset)
  }

  handleResize() {
    this.scheduleRefresh()
  }

  subscribe(callback) {
    this.subscribers.push(callback)

    return () => {
      const index = this.subscribers.indexOf(callback)
      if (index >= 0) {
        this.subscribers.splice(index, 1)
      }
    }
  }

  handleStoreChange(event) {
    if (
      event === EVENTS.NODE_ADD ||
      event === EVENTS.NODE_UPDATE ||
      event === EVENTS.NODE_REMOVE ||
      event === EVENTS.GRAPH_REPLACE ||
      event === EVENTS.GRAPH_RESTORE
    ) {
      this.scheduleRefresh()
    }
  }

  scheduleRefresh() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
    }

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.refresh()
    })
  }

  getZoom() {
    return this.store.viewState.zoom || ZOOM_DEFAULT
  }

  setZoom(nextZoom) {
    const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoom))
    this.store.setZoom(zoom)
    this.updateZoomLabel()
  }

  updateZoomLabel() {
    const zoomLabel = document.getElementById('zoom-level')
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(this.getZoom() * 100)}%`
    }
  }

  getGraphBounds() {
    const nodes = this.store.getNodes()

    if (nodes.length === 0) {
      return {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        width: 0,
        height: 0,
        centerX: 0,
        centerY: 0
      }
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    nodes.forEach(node => {
      const dims = NODE_DIMENSIONS[node.type] || NODE_DIMENSIONS.default
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + dims.width)
      maxY = Math.max(maxY, node.position.y + dims.height)
    })

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    }
  }

  computeWorkspaceSize() {
    const bounds = this.getGraphBounds()
    const zoom = this.getZoom()
    const viewportWidth = this.container.clientWidth || 0
    const viewportHeight = this.container.clientHeight || 0
    let prependDeltaX = 0
    let prependDeltaY = 0

    let worldMinX = 0
    let worldMinY = 0
    let contentWidth = viewportWidth > 0 ? viewportWidth / zoom : 0
    let contentHeight = viewportHeight > 0 ? viewportHeight / zoom : 0

    if (bounds.width > 0 || bounds.height > 0) {
      const normalizedWorldMinX = bounds.minX - VIEWPORT_PADDING
      const normalizedWorldMinY = bounds.minY - VIEWPORT_PADDING
      let worldMaxX = bounds.maxX + VIEWPORT_PADDING
      let worldMaxY = bounds.maxY + VIEWPORT_PADDING

      if (this.interactionBounds) {
        const previousMinX = this.interactionBounds.minX
        const previousMinY = this.interactionBounds.minY

        this.interactionBounds.minX = Math.min(this.interactionBounds.minX, normalizedWorldMinX)
        this.interactionBounds.minY = Math.min(this.interactionBounds.minY, normalizedWorldMinY)
        this.interactionBounds.maxX = Math.max(this.interactionBounds.maxX, worldMaxX)
        this.interactionBounds.maxY = Math.max(this.interactionBounds.maxY, worldMaxY)

        prependDeltaX = Math.max(0, previousMinX - this.interactionBounds.minX)
        prependDeltaY = Math.max(0, previousMinY - this.interactionBounds.minY)

        worldMinX = this.interactionBounds.minX
        worldMinY = this.interactionBounds.minY
        worldMaxX = this.interactionBounds.maxX
        worldMaxY = this.interactionBounds.maxY
      } else {
        worldMinX = normalizedWorldMinX
        worldMinY = normalizedWorldMinY
      }

      this.worldMaxX = worldMaxX
      this.worldMaxY = worldMaxY
      contentWidth = Math.max(contentWidth, this.worldMaxX - worldMinX)
      contentHeight = Math.max(contentHeight, this.worldMaxY - worldMinY)
    } else {
      this.worldMaxX = contentWidth
      this.worldMaxY = contentHeight
    }

    this.worldMinX = worldMinX
    this.worldMinY = worldMinY

    return {
      prependDeltaX,
      prependDeltaY,
      width: Math.ceil(contentWidth),
      height: Math.ceil(contentHeight)
    }
  }

  beginInteraction() {
    this.activeInteractions += 1

    if (this.activeInteractions > 1) {
      return
    }

    this.interactionBounds = {
      minX: this.worldMinX,
      minY: this.worldMinY,
      maxX: this.worldMaxX,
      maxY: this.worldMaxY
    }
  }

  endInteraction() {
    if (this.activeInteractions === 0) {
      return
    }

    this.activeInteractions -= 1

    if (this.activeInteractions > 0) {
      return
    }

    this.interactionBounds = null
    this.scheduleRefresh()
  }

  applySceneSize(width, height) {
    const zoom = this.getZoom()

    this.logicalWidth = width
    this.logicalHeight = height

    this.workspace.style.width = `${Math.ceil(width * zoom)}px`
    this.workspace.style.height = `${Math.ceil(height * zoom)}px`

    this.scene.style.width = `${width}px`
    this.scene.style.height = `${height}px`
    this.scene.style.transform = `scale(${zoom})`

    this.nodesLayer.style.width = `${width}px`
    this.nodesLayer.style.height = `${height}px`
    this.nodesLayer.style.transform = `translate(${-this.worldMinX}px, ${-this.worldMinY}px)`

    this.svgLayer.style.width = `${width}px`
    this.svgLayer.style.height = `${height}px`
    this.svgLayer.setAttribute('width', width)
    this.svgLayer.setAttribute('height', height)
    this.svgLayer.setAttribute('viewBox', `${this.worldMinX} ${this.worldMinY} ${width} ${height}`)
  }

  refresh() {
    const { width, height, prependDeltaX, prependDeltaY } = this.computeWorkspaceSize()
    this.applySceneSize(width, height)
    if (prependDeltaX > 0 || prependDeltaY > 0) {
      const zoom = this.getZoom()
      this.container.scrollLeft += prependDeltaX * zoom
      this.container.scrollTop += prependDeltaY * zoom
    }
    this.updateZoomLabel()
    this.subscribers.forEach(callback => callback())
  }

  fitToGraph() {
    const bounds = this.getGraphBounds()
    const viewportWidth = this.container.clientWidth || 0
    const viewportHeight = this.container.clientHeight || 0

    if (viewportWidth === 0 || viewportHeight === 0) {
      return
    }

    if (bounds.width === 0 && bounds.height === 0) {
      this.setZoom(ZOOM_DEFAULT)
      this.refresh()
      this.container.scrollLeft = 0
      this.container.scrollTop = 0
      this.hasFittedInitialView = true
      return
    }

    const fitWidth = bounds.width + (FIT_PADDING * 2)
    const fitHeight = bounds.height + (FIT_PADDING * 2)
    const zoomX = viewportWidth / fitWidth
    const zoomY = viewportHeight / fitHeight
    const targetZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(zoomX, zoomY)))

    this.setZoom(targetZoom)
    this.refresh()

    requestAnimationFrame(() => {
      this.centerOnGraphPoint(bounds.centerX, bounds.centerY)
      this.hasFittedInitialView = true
    })
  }

  graphToScenePoint(x, y) {
    return {
      x: x - this.worldMinX,
      y: y - this.worldMinY
    }
  }

  sceneToGraphPoint(x, y) {
    return {
      x: x + this.worldMinX,
      y: y + this.worldMinY
    }
  }

  centerOnGraphPoint(graphX, graphY) {
    const zoom = this.getZoom()
    const scenePoint = this.graphToScenePoint(graphX, graphY)
    const nextScrollLeft = (scenePoint.x * zoom) - (this.container.clientWidth / 2)
    const nextScrollTop = (scenePoint.y * zoom) - (this.container.clientHeight / 2)

    this.container.scrollLeft = Math.max(0, nextScrollLeft)
    this.container.scrollTop = Math.max(0, nextScrollTop)
  }

  getVisibleCanvasCenter() {
    const zoom = this.getZoom()
    const scenePoint = {
      x: (this.container.scrollLeft + (this.container.clientWidth / 2)) / zoom,
      y: (this.container.scrollTop + (this.container.clientHeight / 2)) / zoom
    }

    return this.sceneToGraphPoint(scenePoint.x, scenePoint.y)
  }

  screenToGraphPoint(clientX, clientY) {
    const workspaceRect = this.workspace.getBoundingClientRect()
    const zoom = this.getZoom()
    const sceneX = (clientX - workspaceRect.left) / zoom
    const sceneY = (clientY - workspaceRect.top) / zoom

    return this.sceneToGraphPoint(sceneX, sceneY)
  }

  getElementCenterGraphPoint(element) {
    const rect = element.getBoundingClientRect()

    return this.screenToGraphPoint(
      rect.left + (rect.width / 2),
      rect.top + (rect.height / 2)
    )
  }

  zoomBy(delta) {
    const currentZoom = this.getZoom()
    const center = this.getVisibleCanvasCenter()

    this.setZoom(currentZoom + delta)
    this.refresh()

    requestAnimationFrame(() => {
      this.centerOnGraphPoint(center.x, center.y)
    })
  }

  zoomIn() {
    this.zoomBy(ZOOM_STEP)
  }

  zoomOut() {
    this.zoomBy(-ZOOM_STEP)
  }

  zoomReset() {
    this.fitToGraph()
  }

  destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
    }

    this.zoomInButton?.removeEventListener('click', this.boundZoomIn)
    this.zoomOutButton?.removeEventListener('click', this.boundZoomOut)
    this.zoomResetButton?.removeEventListener('click', this.boundZoomReset)

    this.unsubscribe()

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    } else {
      window.removeEventListener('resize', this.boundHandleResize)
    }
  }
}

export default CanvasViewport
