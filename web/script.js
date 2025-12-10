// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href')
    // Skip if href was changed dynamically (e.g., download button) or is empty
    if (!href.startsWith('#') || href === '#') return

    e.preventDefault()
    const target = document.querySelector(href)
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    }
  })
})

// Add scroll effect to nav
const nav = document.querySelector('.nav')
let lastScroll = 0

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset

  if (currentScroll > 100) {
    nav.style.background = 'rgba(9, 9, 11, 0.95)'
  } else {
    nav.style.background = 'rgba(9, 9, 11, 0.8)'
  }

  lastScroll = currentScroll
})

// Intersection Observer for fade-in animations
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1'
      entry.target.style.transform = 'translateY(0)'
    }
  })
}, observerOptions)

// Observe feature cards and steps
document.querySelectorAll('.feature-card, .step').forEach((el) => {
  el.style.opacity = '0'
  el.style.transform = 'translateY(20px)'
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease'
  observer.observe(el)
})

// Add stagger delay to feature cards
document.querySelectorAll('.feature-card').forEach((card, index) => {
  card.style.transitionDelay = `${index * 0.1}s`
})

// Fetch latest release from GitHub API (with caching to avoid rate limits)
async function fetchLatestRelease() {
  const downloadBtn = document.getElementById('download-btn')
  const heroDownloadBtn = document.querySelector('.hero-cta .btn-primary')

  if (!downloadBtn) return

  const repo = downloadBtn.dataset.repo || 'sderosiaux/meeting-copilot'
  const cacheKey = 'meeting-copilot-release'
  const cacheExpiry = 60 * 60 * 1000 // 1 hour in milliseconds

  // Check cache first
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const { data, timestamp } = JSON.parse(cached)
      if (Date.now() - timestamp < cacheExpiry) {
        applyReleaseData(data, downloadBtn, heroDownloadBtn, repo)
        return
      }
    }
  } catch (e) {
    // Cache read failed, continue to fetch
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`)

    if (!response.ok) {
      // No releases yet - link to releases page
      downloadBtn.href = `https://github.com/${repo}/releases`
      if (heroDownloadBtn) {
        heroDownloadBtn.href = `https://github.com/${repo}/releases`
      }
      return
    }

    const release = await response.json()

    // Cache the response
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data: release, timestamp: Date.now() }))
    } catch (e) {
      // Cache write failed, continue anyway
    }

    applyReleaseData(release, downloadBtn, heroDownloadBtn, repo)
  } catch (error) {
    console.log('Could not fetch latest release:', error)
    downloadBtn.href = `https://github.com/${repo}/releases`
  }
}

function applyReleaseData(release, downloadBtn, heroDownloadBtn, repo) {
  // Find macOS DMG (prefer arm64/universal, fallback to x64)
  const assets = release.assets || []
  const dmgAsset =
    assets.find((a) => a.name.endsWith('.dmg') && a.name.includes('arm64')) ||
    assets.find((a) => a.name.endsWith('.dmg')) ||
    assets.find((a) => a.name.endsWith('.zip') && a.name.includes('mac'))

  if (dmgAsset) {
    downloadBtn.href = dmgAsset.browser_download_url
    if (heroDownloadBtn) {
      heroDownloadBtn.href = dmgAsset.browser_download_url
    }
  } else {
    downloadBtn.href = release.html_url
    if (heroDownloadBtn) {
      heroDownloadBtn.href = release.html_url
    }
  }

  // Update version display if element exists
  const versionEl = document.getElementById('release-version')
  if (versionEl && release.tag_name) {
    versionEl.textContent = release.tag_name
  }
}

// Detect user's architecture for download
function detectArchitecture() {
  const downloadText = document.getElementById('download-text')
  if (!downloadText) return

  // Check if Apple Silicon
  const isAppleSilicon =
    navigator.userAgent.includes('Mac') &&
    (navigator.userAgent.includes('ARM') ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 0))

  if (isAppleSilicon) {
    downloadText.textContent = 'Download for Mac (Apple Silicon)'
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  fetchLatestRelease()
  detectArchitecture()

  // Copy xattr command button
  const copyBtn = document.getElementById('copy-xattr-btn')
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText('xattr -cr "/Applications/Meeting Copilot.app"')
      copyBtn.textContent = 'Copied!'
      setTimeout(() => {
        copyBtn.textContent = 'Copy'
      }, 2000)
    })
  }
})
