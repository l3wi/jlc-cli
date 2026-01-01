/**
 * Browser app for EasyEDA Component Browser
 * Handles search, rendering, and user interactions
 *
 * Uses KiCad S-expression renderer for symbol/footprint previews
 */

import { renderSymbolSvg, renderFootprintSvg } from './kicad-renderer.js'

// Types
interface SearchResult {
  uuid: string
  title: string
  thumb: string
  description: string
  tags: string[]
  package: string
  packageUuid?: string
  manufacturer?: string
  owner: {
    uuid: string
    username: string
    nickname: string
    avatar?: string
  }
  docType: number
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

interface SearchResponse {
  results: SearchResult[]
  pagination: Pagination
}

/**
 * Component data returned by the API
 * Contains KiCad S-expression strings for rendering
 */
interface ComponentData {
  uuid: string
  title: string
  description: string
  symbolSexpr: string      // KiCad symbol S-expression
  footprintSexpr: string   // KiCad footprint S-expression
  model3d?: {
    name: string
    uuid: string
  }
}

// State
let currentPage = 1
let currentQuery = ''
let currentSource = 'user'
let isLoading = false
let debounceTimer: number | null = null

// DOM elements
const searchInput = document.getElementById('search-input') as HTMLInputElement
const sourceSelect = document.getElementById('source-select') as HTMLSelectElement
const searchBtn = document.getElementById('search-btn') as HTMLButtonElement
const resultsGrid = document.getElementById('results-grid') as HTMLDivElement
const paginationDiv = document.getElementById('pagination') as HTMLDivElement
const loadingDiv = document.getElementById('loading') as HTMLDivElement
const modal = document.getElementById('preview-modal') as HTMLDivElement
const modalContent = document.getElementById('modal-content') as HTMLDivElement
const modalClose = document.getElementById('modal-close') as HTMLButtonElement

// Initialize
function init() {
  // Get query from URL
  const params = new URLSearchParams(window.location.search)
  const q = params.get('q')
  if (q) {
    searchInput.value = q
    currentQuery = q
    performSearch()
  }

  // Event listeners
  searchInput.addEventListener('input', handleSearchInput)
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      performSearch()
    }
  })
  searchBtn.addEventListener('click', performSearch)
  sourceSelect.addEventListener('change', () => {
    currentSource = sourceSelect.value
    if (currentQuery) performSearch()
  })
  modalClose.addEventListener('click', closeModal)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal()
  })
}

// Debounced search input
function handleSearchInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    const query = searchInput.value.trim()
    if (query && query !== currentQuery) {
      currentQuery = query
      currentPage = 1
      performSearch()
    }
  }, 300)
}

// Perform search
async function performSearch() {
  const query = searchInput.value.trim()
  if (!query || isLoading) return

  currentQuery = query
  isLoading = true
  showLoading(true)

  try {
    const params = new URLSearchParams({
      q: query,
      source: currentSource,
      page: String(currentPage),
      limit: '20',
    })

    const response = await fetch(`/api/search?${params}`)
    if (!response.ok) throw new Error('Search failed')

    const data: SearchResponse = await response.json()
    renderResults(data.results)
    renderPagination(data.pagination)
  } catch (error) {
    console.error('Search error:', error)
    resultsGrid.innerHTML = `<div class="error">Search failed. Please try again.</div>`
  } finally {
    isLoading = false
    showLoading(false)
  }
}

// Render search results
function renderResults(results: SearchResult[]) {
  if (results.length === 0) {
    resultsGrid.innerHTML = `<div class="no-results">No components found. Try a different search term.</div>`
    return
  }

  resultsGrid.innerHTML = results.map(result => `
    <div class="card" data-uuid="${result.uuid}">
      <div class="card-images">
        <div class="image-container symbol-container" data-uuid="${result.uuid}">
          <div class="symbol-placeholder">Loading...</div>
          <div class="image-label">Symbol</div>
        </div>
        <div class="image-container footprint-container" data-uuid="${result.uuid}">
          <div class="footprint-placeholder">Loading...</div>
          <div class="image-label">Footprint</div>
        </div>
      </div>
      <div class="card-info">
        <div class="card-title" title="${escapeHtml(result.title)}">${escapeHtml(result.title)}</div>
        <div class="card-package">Package: ${escapeHtml(result.package || 'Unknown')}</div>
        <div class="card-owner">By: ${escapeHtml(result.owner.nickname || result.owner.username)}</div>
      </div>
      <div class="card-uuid">
        <input type="text" value="${result.uuid}" readonly />
        <button class="copy-btn" data-uuid="${result.uuid}" title="Copy UUID">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        </button>
      </div>
    </div>
  `).join('')

  // Add copy button handlers
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const uuid = (btn as HTMLElement).dataset.uuid
      if (uuid) copyToClipboard(uuid, btn as HTMLElement)
    })
  })

  // Add hover handlers for enlarging
  document.querySelectorAll('.image-container').forEach(container => {
    container.addEventListener('click', async () => {
      const uuid = (container as HTMLElement).dataset.uuid
      if (uuid) showPreviewModal(uuid)
    })
  })

  // Load symbol and footprint previews for each card
  results.forEach(result => loadComponentPreviews(result.uuid))
}

// Load and render both symbol and footprint previews for a card
async function loadComponentPreviews(uuid: string) {
  const symbolContainer = document.querySelector(`.symbol-container[data-uuid="${uuid}"]`)
  const footprintContainer = document.querySelector(`.footprint-container[data-uuid="${uuid}"]`)
  if (!symbolContainer && !footprintContainer) return

  try {
    const response = await fetch(`/api/component/${uuid}`)
    if (!response.ok) {
      if (symbolContainer) {
        symbolContainer.innerHTML = '<div class="no-preview">Error</div><div class="image-label">Symbol</div>'
      }
      if (footprintContainer) {
        footprintContainer.innerHTML = '<div class="no-preview">Error</div><div class="image-label">Footprint</div>'
      }
      return
    }

    const data: ComponentData = await response.json()

    // Render symbol from KiCad S-expression
    if (symbolContainer) {
      if (data.symbolSexpr) {
        const svg = renderSymbolSvg(data.symbolSexpr)
        symbolContainer.innerHTML = svg + '<div class="image-label">Symbol</div>'
      } else {
        symbolContainer.innerHTML = '<div class="no-preview">No preview</div><div class="image-label">Symbol</div>'
      }
    }

    // Render footprint from KiCad S-expression
    if (footprintContainer) {
      if (data.footprintSexpr) {
        const svg = renderFootprintSvg(data.footprintSexpr)
        footprintContainer.innerHTML = svg + '<div class="image-label">Footprint</div>'
      } else {
        footprintContainer.innerHTML = '<div class="no-preview">No preview</div><div class="image-label">Footprint</div>'
      }
    }
  } catch {
    if (symbolContainer) {
      symbolContainer.innerHTML = '<div class="no-preview">Error</div><div class="image-label">Symbol</div>'
    }
    if (footprintContainer) {
      footprintContainer.innerHTML = '<div class="no-preview">Error</div><div class="image-label">Footprint</div>'
    }
  }
}

// Show preview modal
async function showPreviewModal(uuid: string) {
  modal.classList.remove('hidden')

  modalContent.innerHTML = '<div class="modal-loading">Loading...</div>'

  try {
    const response = await fetch(`/api/component/${uuid}`)
    if (!response.ok) throw new Error('Failed to fetch component')

    const data: ComponentData = await response.json()

    // Generate SVG previews from KiCad S-expressions
    const symbolSvg = data.symbolSexpr ? renderSymbolSvg(data.symbolSexpr) : ''
    const footprintSvg = data.footprintSexpr ? renderFootprintSvg(data.footprintSexpr) : ''

    modalContent.innerHTML = `
      <div class="modal-header">
        <h2>${escapeHtml(data.title)}</h2>
        <div class="modal-uuid">
          <code>${data.uuid}</code>
          <button class="copy-btn modal-copy" data-uuid="${data.uuid}">Copy UUID</button>
        </div>
      </div>
      <div class="modal-previews">
        <div class="modal-preview">
          <h3>Symbol (KiCad)</h3>
          <div class="preview-svg">${symbolSvg || '<div class="no-preview">No symbol preview</div>'}</div>
        </div>
        <div class="modal-preview">
          <h3>Footprint (KiCad)</h3>
          <div class="preview-svg">${footprintSvg || '<div class="no-preview">No footprint preview</div>'}</div>
        </div>
      </div>
      <div class="modal-info">
        <p><strong>Description:</strong> ${escapeHtml(data.description || 'N/A')}</p>
        ${data.model3d ? '<p><strong>3D Model:</strong> Available</p>' : ''}
      </div>
    `

    // Add copy handler for modal
    const modalCopyBtn = modalContent.querySelector('.modal-copy')
    if (modalCopyBtn) {
      modalCopyBtn.addEventListener('click', () => {
        copyToClipboard(data.uuid, modalCopyBtn as HTMLElement)
      })
    }
  } catch (error) {
    console.error('Modal error:', error)
    modalContent.innerHTML = '<div class="modal-error">Failed to load component details</div>'
  }
}

// Close modal
function closeModal() {
  modal.classList.add('hidden')
}

// Render pagination
function renderPagination(pagination: Pagination) {
  if (pagination.totalPages <= 1) {
    paginationDiv.innerHTML = ''
    return
  }

  paginationDiv.innerHTML = `
    <button class="page-btn" ${pagination.hasPrev ? '' : 'disabled'} data-page="${pagination.page - 1}">
      ← Prev
    </button>
    <span class="page-info">Page ${pagination.page} of ${pagination.totalPages}</span>
    <button class="page-btn" ${pagination.hasNext ? '' : 'disabled'} data-page="${pagination.page + 1}">
      Next →
    </button>
  `

  paginationDiv.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt((btn as HTMLElement).dataset.page || '1', 10)
      if (page > 0) {
        currentPage = page
        performSearch()
        window.scrollTo(0, 0)
      }
    })
  })
}

// Copy to clipboard
async function copyToClipboard(text: string, btn: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text)
    btn.classList.add('copied')
    setTimeout(() => btn.classList.remove('copied'), 1500)
  } catch {
    // Fallback for older browsers
    const input = document.createElement('input')
    input.value = text
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    btn.classList.add('copied')
    setTimeout(() => btn.classList.remove('copied'), 1500)
  }
}

// Show/hide loading
function showLoading(show: boolean) {
  loadingDiv.classList.toggle('hidden', !show)
}

// Escape HTML
function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
