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

    const minLogicalWidth = viewportWidth > 0 ? viewportWidth / zoom : 0
    const minLogicalHeight = viewportHeight > 0 ? viewportHeight / zoom : 0

    const width = Math.max(minLogicalWidth, bounds.maxX + VIEWPORT_PADDING)
    const height = Math.max(minLogicalHeight, bounds.maxY + VIEWPORT_PADDING)

    return {
      width: Math.ceil(width),
      height: Math.ceil(height)
    }
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

    this.svgLayer.style.width = `${width}px`
    this.svgLayer.style.height = `${height}px`
    this.svgLayer.setAttribute('width', width)
    this.svgLayer.setAttribute('height', height)
  }

  refresh() {
    const { width, height } = this.computeWorkspaceSize()
    this.applySceneSize(width, height)
    this.updateZoomLabel()
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
      this.centerOn(bounds.centerX, bounds.centerY)
      this.hasFittedInitialView = true
    })
  }

  centerOn(canvasX, canvasY) {
    const zoom = this.getZoom()
    const nextScrollLeft = (canvasX * zoom) - (this.container.clientWidth / 2)
    const nextScrollTop = (canvasY * zoom) - (this.container.clientHeight / 2)

    this.container.scrollLeft = Math.max(0, nextScrollLeft)
    this.container.scrollTop = Math.max(0, nextScrollTop)
  }

  zoomBy(delta) {
    const currentZoom = this.getZoom()
    const centerX = (this.container.scrollLeft + (this.container.clientWidth / 2)) / currentZoom
    const centerY = (this.container.scrollTop + (this.container.clientHeight / 2)) / currentZoom

    this.setZoom(currentZoom + delta)
    this.refresh()

    requestAnimationFrame(() => {
      this.centerOn(centerX, centerY)
    })
  }

  zoomIn() {
    this.zoomBy(ZOOM_STEP)
  }

  zoomOut() {
    this.zoomBy(-ZOOM_STEP)
  }

  zoomReset() {
    const currentZoom = this.getZoom()
    const centerX = (this.container.scrollLeft + (this.container.clientWidth / 2)) / currentZoom
    const centerY = (this.container.scrollTop + (this.container.clientHeight / 2)) / currentZoom

    this.setZoom(ZOOM_DEFAULT)
    this.refresh()

    requestAnimationFrame(() => {
      this.centerOn(centerX, centerY)
    })
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
