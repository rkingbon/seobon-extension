document.addEventListener("DOMContentLoaded", () => {
  initializeTabs()
  initializeTracking()
  analyzePage()

  document.getElementById("refreshBtn").addEventListener("click", () => {
    analyzePage()
  })

  // Add help button event listener
  document.getElementById("helpBtn").addEventListener("click", () => {
    // Switch to help tab
    const tabs = document.querySelectorAll(".tab")
    const tabContents = document.querySelectorAll(".tab-content")

    tabs.forEach((t) => t.classList.remove("active"))
    tabContents.forEach((content) => content.classList.remove("active"))

    const helpTab = document.querySelector('[data-tab="help"]')
    const helpContent = document.getElementById("help")

    if (helpTab && helpContent) {
      helpTab.classList.add("active")
      helpContent.classList.add("active")
      displayHelp()
    }
  })

  // Add website button event listener
  document.getElementById("websiteBtn").addEventListener("click", () => {
    window.chrome.tabs.create({ url: "https://rkingbon.com" })
  })

  // Auto-refresh every 30 seconds if tracking is enabled
  setInterval(() => {
    const trackingEnabled = localStorage.getItem("seobon_tracking_enabled") === "true"
    if (trackingEnabled) {
      analyzePage(true) // Silent analysis
    }
  }, 30000)
})

function initializeTabs() {
  const tabs = document.querySelectorAll(".tab")
  const tabContents = document.querySelectorAll(".tab-content")

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"))
      tabContents.forEach((content) => content.classList.remove("active"))

      tab.classList.add("active")
      const targetTab = tab.dataset.tab
      const targetContent = document.getElementById(targetTab)
      if (targetContent) {
        targetContent.classList.add("active")
      }
    })
  })
}

function initializeTracking() {
  // Initialize tracking settings
  if (!localStorage.getItem("seobon_tracking_enabled")) {
    localStorage.setItem("seobon_tracking_enabled", "true")
  }

  // Initialize historical data storage
  if (!localStorage.getItem("seobon_history")) {
    localStorage.setItem("seobon_history", JSON.stringify({}))
  }
}

async function analyzePage(silent = false) {
  const loading = document.getElementById("loading")
  const results = document.getElementById("results")

  if (!loading || !results) {
    console.error("Required DOM elements not found")
    return
  }

  if (!silent) {
    loading.style.display = "block"
    results.style.display = "none"
  }

  try {
    const [tab] = await window.chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab || !tab.id) {
      throw new Error("No active tab found")
    }

    const [result] = await window.chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractSEOData,
    })

    if (result && result.result) {
      const currentData = result.result

      // Track changes and store history
      await trackChanges(currentData)

      if (!silent) {
        displayResults(currentData)
      }
    } else {
      throw new Error("No data returned from content script")
    }
  } catch (error) {
    console.error("Error analyzing page:", error)
    if (!silent) {
      loading.innerHTML = `
        <div style="color: #dc2626; padding: 20px;">
          <div style="font-weight: bold; margin-bottom: 8px;">Error analyzing page</div>
          <div style="font-size: 12px;">${error.message}</div>
          <div style="font-size: 12px; margin-top: 8px;">
            Please try refreshing the page or check if the page is fully loaded.
          </div>
        </div>
      `
    }
  }
}

async function trackChanges(currentData) {
  try {
    const url = currentData.url
    const timestamp = Date.now()

    // Get existing history
    const historyData = JSON.parse(localStorage.getItem("seobon_history") || "{}")

    if (!historyData[url]) {
      historyData[url] = {
        snapshots: [],
        alerts: [],
        lastCheck: timestamp,
      }
    }

    const urlHistory = historyData[url]
    const lastSnapshot = urlHistory.snapshots[urlHistory.snapshots.length - 1]

    // Create current snapshot
    const currentSnapshot = {
      timestamp,
      title: currentData.title,
      metaDescription: currentData.metaDescription,
      h1Count: currentData.h1Tags?.length || 0,
      h2Count: currentData.h2Tags?.length || 0,
      imageCount: currentData.images?.length || 0,
      imagesWithoutAlt: currentData.images?.filter((img) => !img.hasAlt).length || 0,
      internalLinksCount: currentData.internalLinks?.length || 0,
      externalLinksCount: currentData.externalLinks?.length || 0,
      pageSize: currentData.pageSize,
      loadTime: currentData.loadTime,
      seoScore: calculateSEOScore(currentData),
      issues: currentData.issues || [],
      canonicalUrl: currentData.canonicalUrl,
      robotsMeta: currentData.robotsMeta,
    }

    // Detect changes and create alerts
    if (lastSnapshot) {
      const changes = detectChanges(lastSnapshot, currentSnapshot)
      if (changes.length > 0) {
        urlHistory.alerts.push({
          timestamp,
          changes,
          severity: calculateSeverity(changes),
        })

        // Show notification for critical changes
        const criticalChanges = changes.filter((c) => c.severity === "critical")
        if (criticalChanges.length > 0) {
          showNotification("Critical SEO Changes Detected!", criticalChanges)
        }
      }
    }

    // Add current snapshot
    urlHistory.snapshots.push(currentSnapshot)
    urlHistory.lastCheck = timestamp

    // Keep only last 50 snapshots per URL
    if (urlHistory.snapshots.length > 50) {
      urlHistory.snapshots = urlHistory.snapshots.slice(-50)
    }

    // Keep only last 100 alerts per URL
    if (urlHistory.alerts.length > 100) {
      urlHistory.alerts = urlHistory.alerts.slice(-100)
    }

    // Save updated history
    localStorage.setItem("seobon_history", JSON.stringify(historyData))
  } catch (error) {
    console.error("Error tracking changes:", error)
  }
}

function detectChanges(oldSnapshot, newSnapshot) {
  const changes = []

  // Title changes
  if (oldSnapshot.title !== newSnapshot.title) {
    changes.push({
      type: "title",
      severity: newSnapshot.title ? "medium" : "critical",
      message: newSnapshot.title ? "Page title changed" : "Page title removed",
      oldValue: oldSnapshot.title,
      newValue: newSnapshot.title,
    })
  }

  // Meta description changes
  if (oldSnapshot.metaDescription !== newSnapshot.metaDescription) {
    changes.push({
      type: "meta_description",
      severity: newSnapshot.metaDescription ? "medium" : "critical",
      message: newSnapshot.metaDescription ? "Meta description changed" : "Meta description removed",
      oldValue: oldSnapshot.metaDescription,
      newValue: newSnapshot.metaDescription,
    })
  }

  // H1 count changes
  if (oldSnapshot.h1Count !== newSnapshot.h1Count) {
    const severity = newSnapshot.h1Count === 0 ? "critical" : newSnapshot.h1Count > 1 ? "high" : "low"
    changes.push({
      type: "h1_count",
      severity,
      message: `H1 count changed from ${oldSnapshot.h1Count} to ${newSnapshot.h1Count}`,
      oldValue: oldSnapshot.h1Count,
      newValue: newSnapshot.h1Count,
    })
  }

  // Images without alt text
  if (oldSnapshot.imagesWithoutAlt !== newSnapshot.imagesWithoutAlt) {
    const severity = newSnapshot.imagesWithoutAlt > oldSnapshot.imagesWithoutAlt ? "medium" : "low"
    changes.push({
      type: "images_alt",
      severity,
      message: `Images without alt text: ${oldSnapshot.imagesWithoutAlt} → ${newSnapshot.imagesWithoutAlt}`,
      oldValue: oldSnapshot.imagesWithoutAlt,
      newValue: newSnapshot.imagesWithoutAlt,
    })
  }

  // SEO Score changes
  const scoreDiff = newSnapshot.seoScore - oldSnapshot.seoScore
  if (Math.abs(scoreDiff) >= 5) {
    changes.push({
      type: "seo_score",
      severity: scoreDiff < -10 ? "critical" : scoreDiff < 0 ? "high" : "low",
      message: `SEO score changed by ${scoreDiff > 0 ? "+" : ""}${scoreDiff} points`,
      oldValue: oldSnapshot.seoScore,
      newValue: newSnapshot.seoScore,
    })
  }

  // Canonical URL changes
  if (oldSnapshot.canonicalUrl !== newSnapshot.canonicalUrl) {
    changes.push({
      type: "canonical",
      severity: "high",
      message: "Canonical URL changed",
      oldValue: oldSnapshot.canonicalUrl,
      newValue: newSnapshot.canonicalUrl,
    })
  }

  // Robots meta changes
  if (oldSnapshot.robotsMeta !== newSnapshot.robotsMeta) {
    const severity = newSnapshot.robotsMeta.includes("noindex") ? "critical" : "medium"
    changes.push({
      type: "robots",
      severity,
      message: "Robots meta tag changed",
      oldValue: oldSnapshot.robotsMeta,
      newValue: newSnapshot.robotsMeta,
    })
  }

  // Page size significant changes (>20%)
  const sizeDiff = Math.abs(newSnapshot.pageSize - oldSnapshot.pageSize) / oldSnapshot.pageSize
  if (sizeDiff > 0.2) {
    changes.push({
      type: "page_size",
      severity: newSnapshot.pageSize > oldSnapshot.pageSize ? "medium" : "low",
      message: `Page size changed significantly: ${formatBytes(oldSnapshot.pageSize)} → ${formatBytes(newSnapshot.pageSize)}`,
      oldValue: oldSnapshot.pageSize,
      newValue: newSnapshot.pageSize,
    })
  }

  return changes
}

function calculateSeverity(changes) {
  const severityLevels = { critical: 4, high: 3, medium: 2, low: 1 }
  const maxSeverity = Math.max(...changes.map((c) => severityLevels[c.severity] || 1))

  return Object.keys(severityLevels).find((key) => severityLevels[key] === maxSeverity) || "low"
}

function showNotification(title, changes) {
  // Create notification element
  const notification = document.createElement("div")
  notification.className = "seo-notification critical"
  notification.innerHTML = `
    <div class="notification-header">
      <span class="notification-icon">🚨</span>
      <span class="notification-title">${title}</span>
      <button class="notification-close">×</button>
    </div>
    <div class="notification-body">
      ${changes
        .slice(0, 3)
        .map((change) => `<div class="notification-change">${change.message}</div>`)
        .join("")}
    ${changes.length > 3 ? `<div class="notification-more">+${changes.length - 3} more changes</div>` : ""}
  </div>
`

  // Add event listener for close button
  const closeBtn = notification.querySelector(".notification-close")
  closeBtn.addEventListener("click", () => {
    notification.remove()
  })

  document.body.appendChild(notification)

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove()
    }
  }, 10000)
}

function extractSEOData() {
  // Helper function to format bytes (defined inside extractSEOData)
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  // Helper function to identify SEO issues (defined inside extractSEOData)
  function identifyAdvancedSEOIssues(data) {
    const issues = []

    try {
      // Check for empty title
      if (!data.title || data.title.trim() === "") {
        issues.push({
          type: "critical",
          category: "Technical Errors",
          message: "Title is empty",
          impact: "Critical - Page won't rank without a title",
        })
      }

      // Check title length
      if (data.title && (data.title.length < 30 || data.title.length > 60)) {
        issues.push({
          type: "warning",
          category: "Technical Errors",
          message:
            data.title.length < 30
              ? "Title too short (less than 30 characters)"
              : "Title too long (more than 60 characters)",
          impact: "May affect click-through rates in search results",
        })
      }

      // Check for missing meta description
      if (!data.metaDescription || data.metaDescription.trim() === "") {
        issues.push({
          type: "critical",
          category: "Technical Errors",
          message: "Meta description is missing",
          impact: "Search engines will generate their own description",
        })
      }

      // Check meta description length
      if (data.metaDescription && (data.metaDescription.length < 120 || data.metaDescription.length > 160)) {
        issues.push({
          type: "warning",
          category: "Technical Errors",
          message: data.metaDescription.length < 120 ? "Meta description too short" : "Meta description too long",
          impact: "May be truncated in search results",
        })
      }

      // Check H1 issues
      if (!data.h1Tags || data.h1Tags.length === 0) {
        issues.push({
          type: "critical",
          category: "Technical Errors",
          message: "Missing H1 tag",
          impact: "H1 helps search engines understand page topic",
        })
      } else if (data.h1Tags.length > 1) {
        issues.push({
          type: "warning",
          category: "Technical Errors",
          message: "Multiple H1 tags found",
          impact: "May confuse search engines about page hierarchy",
        })
      }

      // Check heading hierarchy
      const hasH2 = data.h2Tags && data.h2Tags.length > 0
      const hasH3 = data.h3Tags && data.h3Tags.length > 0
      const hasH4 = data.h4Tags && data.h4Tags.length > 0

      if (hasH3 && !hasH2) {
        issues.push({
          type: "warning",
          category: "Technical Errors",
          message: "Headings hierarchy is broken (H3 without H2)",
          impact: "Poor content structure affects accessibility and SEO",
        })
      }

      if (hasH4 && !hasH3) {
        issues.push({
          type: "warning",
          category: "Technical Errors",
          message: "Headings hierarchy is broken (H4 without H3)",
          impact: "Poor content structure affects accessibility and SEO",
        })
      }

      // Check for broken images
      if (data.images && data.images.length > 0) {
        const imagesWithoutAlt = data.images.filter((img) => !img.hasAlt)
        if (imagesWithoutAlt.length > 0) {
          issues.push({
            type: "warning",
            category: "Technical Errors",
            message: `${imagesWithoutAlt.length} images missing alt text`,
            impact: "Affects accessibility and image SEO",
          })
        }

        // Check for broken images (0x0 dimensions often indicate broken images)
        const brokenImages = data.images.filter((img) => img.width === 0 && img.height === 0)
        if (brokenImages.length > 0) {
          issues.push({
            type: "error",
            category: "Technical Errors",
            message: `Page has ${brokenImages.length} broken images`,
            impact: "Broken images hurt user experience and SEO",
          })
        }
      }

      // Check for too many links before H1
      const h1Position =
        data.h1Tags && data.h1Tags.length > 0
          ? Array.from(document.querySelectorAll("*")).findIndex((el) => el.tagName === "H1")
          : -1

      if (h1Position > 0) {
        const linksBeforeH1 = Array.from(document.querySelectorAll("*"))
          .slice(0, h1Position)
          .filter((el) => el.tagName === "A").length

        if (linksBeforeH1 > 100) {
          issues.push({
            type: "warning",
            category: "Technical Errors",
            message: `Page has more than 100 links before H1 tag (${linksBeforeH1} found)`,
            impact: "May dilute link equity and confuse crawlers",
          })
        }
      }

      // Check for empty href attributes
      const emptyHrefLinks =
        data.internalLinks.filter((link) => !link.href || link.href.trim() === "").length +
        data.externalLinks.filter((link) => !link.href || link.href.trim() === "").length

      if (emptyHrefLinks > 0) {
        issues.push({
          type: "error",
          category: "Technical Errors",
          message: `Has ${emptyHrefLinks} link(s) with empty href attribute`,
          impact: "Broken links hurt user experience and crawlability",
        })
      }

      // Check for missing canonical URL
      if (!data.canonicalUrl || data.canonicalUrl.trim() === "") {
        issues.push({
          type: "warning",
          category: "Technical Errors",
          message: "Missing canonical URL",
          impact: "May cause duplicate content issues",
        })
      }

      // Check for noindex directive
      if (data.robotsMeta && data.robotsMeta.includes("noindex")) {
        issues.push({
          type: "critical",
          category: "Technical Errors",
          message: "Page has noindex directive",
          impact: "Page will not appear in search results",
        })
      }

      // Check Open Graph tags
      const ogTitle = document.querySelector('meta[property="og:title"]')
      const ogDescription = document.querySelector('meta[property="og:description"]')
      const ogImage = document.querySelector('meta[property="og:image"]')

      if (!ogTitle || !ogDescription || !ogImage) {
        issues.push({
          type: "warning",
          category: "Technical Errors",
          message: "Open Graph tags incomplete",
          impact: "Poor social media sharing appearance",
        })
      }

      // Check for too many internal/external links
      const totalLinks = (data.internalLinks?.length || 0) + (data.externalLinks?.length || 0)
      if (totalLinks > 100) {
        issues.push({
          type: "warning",
          category: "Technical Errors",
          message: `Page has more than 100 total links (${totalLinks} found)`,
          impact: "May dilute link equity",
        })
      }

      // Check for 4xx/5xx pages (would need additional checking)
      if (data.externalLinks && data.externalLinks.length > 0) {
        issues.push({
          type: "info",
          category: "Technical Errors",
          message: `Page has external links to ${data.externalLinks.length} domains`,
          impact: "Monitor for broken external links",
        })
      }
    } catch (e) {
      console.warn("Error in identifyAdvancedSEOIssues:", e)
      issues.push({
        type: "error",
        category: "Analysis",
        message: "Error analyzing SEO issues",
        impact: "Unable to complete full analysis",
      })
    }

    return issues
  }

  // Helper function to get performance hints (defined inside extractSEOData)
  function getPerformanceHints(data) {
    const hints = []

    try {
      // Check load time
      if (data.loadTime > 0) {
        if (data.loadTime > 3000) {
          hints.push({
            type: "warning",
            message: `Page load time: ${(data.loadTime / 1000).toFixed(2)}s (slow)`,
            suggestion: "Optimize images, minify CSS/JS, use CDN",
          })
        } else {
          hints.push({
            type: "good",
            message: `Page load time: ${(data.loadTime / 1000).toFixed(2)}s`,
            suggestion: "Good loading performance",
          })
        }
      }

      // Check page size
      if (data.pageSize > 1000000) {
        hints.push({
          type: "warning",
          message: `Page size: ${formatBytes(data.pageSize)} (large)`,
          suggestion: "Compress images and minify code",
        })
      } else if (data.pageSize > 0) {
        hints.push({
          type: "good",
          message: `Page size: ${formatBytes(data.pageSize)}`,
          suggestion: "Good page size",
        })
      }

      // Check for lazy loading
      if (data.images && data.images.length > 0) {
        const lazyImages = data.images.filter((img) => img.loading === "lazy").length
        if (data.images.length > 3 && lazyImages === 0) {
          hints.push({
            type: "info",
            message: "Consider using lazy loading for images",
            suggestion: "Add loading='lazy' to img tags below the fold",
          })
        }
      }

      // Check image optimization
      if (data.images && data.images.length > 0) {
        const largeImages = data.images.filter((img) => img.width > 1920 || img.height > 1080).length
        if (largeImages > 0) {
          hints.push({
            type: "warning",
            message: `${largeImages} images may be too large`,
            suggestion: "Resize and compress large images",
          })
        }
      }
    } catch (e) {
      console.warn("Error in getPerformanceHints:", e)
    }

    return hints
  }

  // Main extraction logic
  try {
    if (document.readyState !== "complete") {
      return {
        error: "Page not fully loaded",
        message: "Please wait for the page to finish loading and try again.",
      }
    }

    const data = {
      url: window.location.href || "",
      title: document.title || "",
      metaDescription: "",
      metaKeywords: "",
      pageSize: 0,
      loadTime: 0,
      h1Tags: [],
      h2Tags: [],
      h3Tags: [],
      h4Tags: [],
      h5Tags: [],
      h6Tags: [],
      images: [],
      internalLinks: [],
      externalLinks: [],
      issues: [],
      schemas: [],
      metaTags: [],
      robotsMeta: "",
      canonicalUrl: "",
      performanceHints: [],
    }

    // Extract meta description
    try {
      const metaDescription = document.querySelector('meta[name="description"]')
      if (metaDescription) {
        data.metaDescription = metaDescription.getAttribute("content") || ""
      }
    } catch (e) {
      console.warn("Error extracting meta description:", e)
    }

    // Extract meta keywords
    try {
      const metaKeywords = document.querySelector('meta[name="keywords"]')
      if (metaKeywords) {
        data.metaKeywords = metaKeywords.getAttribute("content") || ""
      }
    } catch (e) {
      console.warn("Error extracting meta keywords:", e)
    }

    // Extract robots meta
    try {
      const robotsMeta = document.querySelector('meta[name="robots"]')
      if (robotsMeta) {
        data.robotsMeta = robotsMeta.getAttribute("content") || ""
      }
    } catch (e) {
      console.warn("Error extracting robots meta:", e)
    }

    // Extract canonical URL
    try {
      const canonical = document.querySelector('link[rel="canonical"]')
      if (canonical) {
        data.canonicalUrl = canonical.getAttribute("href") || ""
      }
    } catch (e) {
      console.warn("Error extracting canonical URL:", e)
    }

    // Extract headings
    try {
      for (let i = 1; i <= 6; i++) {
        try {
          const headings = document.querySelectorAll(`h${i}`)
          data[`h${i}Tags`] = Array.from(headings).map((h, index) => {
            try {
              return {
                text: h.textContent ? h.textContent.trim() : "",
                level: i,
                element: h.outerHTML || "",
                index: index + 1,
              }
            } catch (e) {
              return {
                text: "Error reading heading",
                level: i,
                element: "",
                index: index + 1,
              }
            }
          })
        } catch (e) {
          console.warn(`Error extracting H${i} tags:`, e)
          data[`h${i}Tags`] = []
        }
      }
    } catch (e) {
      console.warn("Error extracting headings:", e)
    }

    // Extract images
    try {
      const images = document.querySelectorAll("img")
      data.images = Array.from(images).map((img, index) => {
        try {
          // Calculate estimated file size based on image dimensions and format
          const estimateImageSize = (width, height, src) => {
            if (!width || !height) return 0

            // Basic estimation: assume 24-bit color depth
            let baseSize = width * height * 3

            // Apply compression estimates based on file extension
            const extension = src.split(".").pop()?.toLowerCase()
            switch (extension) {
              case "jpg":
              case "jpeg":
                baseSize *= 0.1 // JPEG compression ~90%
                break
              case "png":
                baseSize *= 0.3 // PNG compression ~70%
                break
              case "webp":
                baseSize *= 0.08 // WebP compression ~92%
                break
              case "gif":
                baseSize *= 0.2 // GIF compression ~80%
                break
              default:
                baseSize *= 0.2 // Default compression
            }

            return Math.round(baseSize)
          }

          const width = img.naturalWidth || img.width || 0
          const height = img.naturalHeight || img.height || 0
          const estimatedSize = estimateImageSize(width, height, img.src || "")

          return {
            src: img.src || "",
            alt: img.alt || "",
            title: img.title || "",
            width: width,
            height: height,
            hasAlt: !!(img.alt && img.alt.trim()),
            loading: img.loading || "eager",
            estimatedSize: estimatedSize,
            index: index + 1,
          }
        } catch (e) {
          return {
            src: "Error reading image",
            alt: "",
            title: "",
            width: 0,
            height: 0,
            hasAlt: false,
            loading: "eager",
            estimatedSize: 0,
            index: index + 1,
          }
        }
      })
    } catch (e) {
      console.warn("Error extracting images:", e)
      data.images = []
    }

    // Extract links
    // Extract links (without status checking)
    try {
      const currentDomain = window.location.hostname || ""
      const links = document.querySelectorAll("a[href]")

      Array.from(links).forEach((link, index) => {
        try {
          const href = link.href || ""
          const text = link.textContent ? link.textContent.trim() : ""
          const isExternal =
            href &&
            currentDomain &&
            !href.includes(currentDomain) &&
            (href.startsWith("http") || href.startsWith("https"))

          const linkData = {
            href,
            text,
            rel: link.getAttribute("rel") || "",
            target: link.getAttribute("target") || "",
            title: link.getAttribute("title") || "",
            index: index + 1,
            status: "Unchecked",
            statusText: "Status will be checked",
            isExternal,
          }

          if (isExternal) {
            data.externalLinks.push(linkData)
          } else {
            data.internalLinks.push(linkData)
          }
        } catch (e) {
          console.warn("Error processing link:", e)
        }
      })
    } catch (e) {
      console.warn("Error extracting links:", e)
      data.internalLinks = []
      data.externalLinks = []
    }

    // Extract schema markup
    try {
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]')
      data.schemas = Array.from(jsonLdScripts).map((script, index) => {
        try {
          const schemaData = JSON.parse(script.textContent || "{}")
          return {
            type: schemaData["@type"] || "Unknown",
            data: schemaData,
            index: index + 1,
          }
        } catch (e) {
          return {
            type: "Invalid JSON",
            data: script.textContent || "",
            index: index + 1,
          }
        }
      })
    } catch (e) {
      console.warn("Error extracting schema markup:", e)
      data.schemas = []
    }

    // Calculate page size
    try {
      if (document.documentElement && document.documentElement.outerHTML) {
        data.pageSize = new Blob([document.documentElement.outerHTML]).size
      }
    } catch (e) {
      console.warn("Error calculating page size:", e)
      data.pageSize = 0
    }

    // Get performance timing
    try {
      if (window.performance && window.performance.timing) {
        data.loadTime = window.performance.timing.loadEventEnd - window.performance.timing.navigationStart
      }
    } catch (e) {
      console.warn("Error getting performance timing:", e)
      data.loadTime = 0
    }

    // Identify advanced SEO issues
    try {
      data.issues = identifyAdvancedSEOIssues(data)
    } catch (e) {
      console.warn("Error identifying SEO:", e)
      data.issues = []
    }

    // Get performance hints
    try {
      data.performanceHints = getPerformanceHints(data)
    } catch (e) {
      console.warn("Error getting performance hints:", e)
      data.performanceHints = []
    }

    return data
  } catch (error) {
    console.error("Error in extractSEOData:", error)
    return {
      error: "Failed to extract SEO data",
      message: error.message || "Unknown error occurred",
      url: window.location.href || "",
      title: document.title || "",
      metaDescription: "",
      metaKeywords: "",
      pageSize: 0,
      loadTime: 0,
      h1Tags: [],
      h2Tags: [],
      h3Tags: [],
      h4Tags: [],
      h5Tags: [],
      h6Tags: [],
      images: [],
      internalLinks: [],
      externalLinks: [],
      issues: [],
      schemas: [],
      metaTags: [],
      robotsMeta: "",
      canonicalUrl: "",
      performanceHints: [],
    }
  }
}

function displayResults(data) {
  const loading = document.getElementById("loading")
  const results = document.getElementById("results")

  if (!loading || !results) {
    console.error("Required DOM elements not found")
    return
  }

  if (data.error) {
    loading.innerHTML = `
      <div style="color: #dc2626; padding: 20px;">
        <div style="font-weight: bold; margin-bottom: 8px;">${data.error}</div>
        <div style="font-size: 12px;">${data.message}</div>
      </div>
    `
    return
  }

  loading.style.display = "none"
  results.style.display = "block"

  // Calculate and display SEO score
  const score = calculateSEOScore(data)
  const scoreElement = document.getElementById("seoScore")
  if (scoreElement) {
    scoreElement.textContent = score
  }

  // Display all tabs
  try {
    displayOverview(data)
    displayContent(data)
    displayLinks(data)
    displayImages(data)
    displayIssues(data)
    displaySchema(data)
    displayPageSpeed(data)
    displayTracking(data) // New tracking tab
    displayAI(data)
    displayHelp()
  } catch (error) {
    console.error("Error displaying results:", error)
  }
}

function displayTracking(data) {
  const container = document.getElementById("tracking")
  if (!container) return

  try {
    const url = data.url
    const historyData = JSON.parse(localStorage.getItem("seobon_history") || "{}")
    const urlHistory = historyData[url] || { snapshots: [], alerts: [] }

    const recentAlerts = urlHistory.alerts.slice(-10).reverse()
    const recentSnapshots = urlHistory.snapshots.slice(-5).reverse()

    container.innerHTML = `
      <div class="tracking-header">
        <div class="tracking-status">
          <span class="tracking-indicator ${localStorage.getItem("seobon_tracking_enabled") === "true" ? "active" : "inactive"}"></span>
          <span class="tracking-label">Real-time Monitoring ${localStorage.getItem("seobon_tracking_enabled") === "true" ? "Active" : "Inactive"}</span>
          <button class="tracking-toggle" id="trackingToggleBtn">
            ${localStorage.getItem("seobon_tracking_enabled") === "true" ? "Disable" : "Enable"}
          </button>
        </div>
      </div>
      
      <div class="tracking-section">
        <div class="section-title">Recent Alerts (${recentAlerts.length})</div>
        ${
          recentAlerts.length > 0
            ? `
          <div class="alerts-list">
            ${recentAlerts
              .map(
                (alert) => `
              <div class="alert-item ${alert.severity}">
                <div class="alert-header">
                  <span class="alert-severity">${alert.severity.toUpperCase()}</span>
                  <span class="alert-time">${new Date(alert.timestamp).toLocaleString()}</span>
                </div>
                <div class="alert-changes">
                  ${alert.changes
                    .slice(0, 2)
                    .map(
                      (change) => `
                    <div class="alert-change">${change.message}</div>
                  `,
                    )
                    .join("")}
                  ${alert.changes.length > 2 ? `<div class="alert-more">+${alert.changes.length - 2} more</div>` : ""}
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
        `
            : '<div class="empty-state">No alerts yet. Changes will be tracked automatically.</div>'
        }
      </div>
      
      <div class="tracking-section">
        <div class="section-title">SEO Score History</div>
        ${
          recentSnapshots.length > 1
            ? `
          <div class="score-chart">
            ${recentSnapshots
              .map(
                (snapshot, index) => `
              <div class="score-point">
                <div class="score-value">${snapshot.seoScore}</div>
                <div class="score-date">${new Date(snapshot.timestamp).toLocaleDateString()}</div>
              </div>
            `,
              )
              .join("")}
          </div>
        `
            : '<div class="empty-state">Not enough data for chart. Check back later.</div>'
        }
      </div>
      
      <div class="tracking-section">
        <div class="section-title">Change Summary</div>
        <div class="change-summary">
          <div class="summary-stat">
            <div class="stat-value">${urlHistory.snapshots.length}</div>
            <div class="stat-label">Total Checks</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${urlHistory.alerts.length}</div>
            <div class="stat-label">Total Alerts</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${urlHistory.alerts.filter((a) => a.severity === "critical").length}</div>
            <div class="stat-label">Critical Issues</div>
          </div>
        </div>
      </div>
    `

    // Then add after the innerHTML assignment:
    const toggleBtn = container.querySelector("#trackingToggleBtn")
    if (toggleBtn) {
      toggleBtn.addEventListener("click", toggleTracking)
    }
  } catch (error) {
    console.error("Error displaying tracking:", error)
    container.innerHTML = '<div class="empty-state">Error displaying tracking data</div>'
  }
}

function toggleTracking() {
  const currentState = localStorage.getItem("seobon_tracking_enabled") === "true"
  localStorage.setItem("seobon_tracking_enabled", (!currentState).toString())

  // Refresh the tracking display
  window.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      window.chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: () => location.reload(),
      })
    }
  })
}

function calculateSEOScore(data) {
  let score = 0

  try {
    // Title (20 points)
    if (data.title && data.title.trim()) {
      if (data.title.length >= 30 && data.title.length <= 60) {
        score += 20
      } else if (data.title.length > 0) {
        score += 10
      }
    }

    // Meta description (20 points)
    if (data.metaDescription && data.metaDescription.trim()) {
      if (data.metaDescription.length >= 120 && data.metaDescription.length <= 160) {
        score += 20
      } else if (data.metaDescription.length > 0) {
        score += 10
      }
    }

    // H1 tags (20 points)
    if (data.h1Tags && data.h1Tags.length === 1) {
      score += 20
    } else if (data.h1Tags && data.h1Tags.length > 1) {
      score += 5
    }

    // H2 tags (10 points)
    if (data.h2Tags && data.h2Tags.length > 0) {
      score += 10
    }

    // Images with alt text (15 points)
    if (data.images && data.images.length > 0) {
      const imagesWithAlt = data.images.filter((img) => img.hasAlt).length
      const altRatio = imagesWithAlt / data.images.length
      score += Math.round(altRatio * 15)
    }

    // Internal links (10 points)
    if (data.internalLinks && data.internalLinks.length > 0) {
      score += 10
    }

    // Schema markup (5 points)
    if (data.schemas && data.schemas.length > 0) {
      score += 5
    }
  } catch (e) {
    console.warn("Error calculating SEO score:", e)
  }

  return Math.min(score, 100)
}

function displayOverview(data) {
  const container = document.getElementById("overview")
  if (!container) return

  try {
    const indexationStatus = getIndexationStatus(data)

    container.innerHTML = `
      <div class="overview-grid">
        <div class="overview-item">
          <div class="overview-label">URL</div>
          <div class="overview-value">${data.url || "Unknown"}</div>
        </div>
        
        <div class="overview-item">
          <div class="overview-label">Page Size</div>
          <div class="overview-value">${formatBytes(data.pageSize || 0)}</div>
        </div>
        
        <div class="overview-item">
          <div class="overview-label">Title</div>
          <div class="overview-value">${data.title || "No title"}</div>
          <div class="overview-meta">${(data.title || "").length} characters</div>
        </div>
        
        <div class="overview-item">
          <div class="overview-label">Description</div>
          <div class="overview-value">${data.metaDescription || "No description"}</div>
          <div class="overview-meta">${(data.metaDescription || "").length} characters</div>
        </div>
        
        <div class="overview-item">
          <div class="overview-label">SEO Score</div>
          <div class="overview-value score-large">${calculateSEOScore(data)}/100</div>
        </div>
        
        <div class="overview-item">
          <div class="overview-label">Indexation</div>
          <div class="overview-value">
            <span class="status ${indexationStatus.type}">${indexationStatus.label}</span>
          </div>
          <div class="overview-meta">${indexationStatus.details}</div>
        </div>
      </div>
    `
  } catch (error) {
    console.error("Error displaying overview:", error)
    container.innerHTML = '<div class="empty-state">Error displaying overview data</div>'
  }
}

function displayContent(data) {
  const container = document.getElementById("content")
  if (!container) return

  try {
    let contentHTML = ""

    for (let i = 1; i <= 5; i++) {
      const headings = data[`h${i}Tags`] || []
      if (headings.length > 0) {
        contentHTML += `
          <div class="content-section">
            <div class="content-header">
              <span class="heading-level">H${i}</span>
              <span class="heading-count">${headings.length} found</span>
            </div>
            <div class="heading-list">
              ${headings
                .map(
                  (heading, index) => `
                <div class="heading-item">
                  <span class="heading-number">${index + 1}.</span>
                  <span class="heading-text">${heading.text || "Empty heading"}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        `
      }
    }

    if (!contentHTML) {
      contentHTML = '<div class="empty-state">No headings found on this page</div>'
    }

    container.innerHTML = contentHTML
  } catch (error) {
    console.error("Error displaying content:", error)
    container.innerHTML = '<div class="empty-state">Error displaying content data</div>'
  }
}

function displayLinks(data) {
  const container = document.getElementById("links")
  if (!container) return

  try {
    let internalLinks = [...(data.internalLinks || [])]
    let externalLinks = [...(data.externalLinks || [])]
    const currentSort = { internal: "none", external: "none" }
    const currentFilter = { internal: "all", external: "all" }

    // Function to get status badge HTML with spinner support
    function getStatusBadge(status, statusText, isLoading = false) {
      if (isLoading) {
        return `<span class="link-status status-loading" title="Checking status...">
          <span class="spinner">⟳</span>
        </span>`
      }

      let badgeClass = "status-unknown"
      let badgeText = status
      let emoji = ""

      if (typeof status === "number") {
        if (status >= 200 && status < 300) {
          badgeClass = "status-success"
          emoji = "✅"
        } else if (status >= 300 && status < 400) {
          badgeClass = "status-redirect"
          emoji = "🔄"
        } else if (status >= 400 && status < 500) {
          badgeClass = "status-client-error"
          emoji = status === 404 ? "❌" : status === 403 ? "🚫" : "❌"
        } else if (status >= 500) {
          badgeClass = "status-server-error"
          emoji = "⚠️"
        }
      } else {
        // Handle string statuses
        switch (status) {
          case "CORS":
            badgeClass = "status-cors"
            badgeText = "CORS"
            emoji = "🔒"
            break
          case "Error":
            badgeClass = "status-error"
            badgeText = "ERR"
            emoji = "❌"
            break
          case "N/A":
            badgeClass = "status-na"
            badgeText = "N/A"
            emoji = "ℹ️"
            break
          case "Unchecked":
            badgeClass = "status-unchecked"
            badgeText = "?"
            emoji = "❓"
            break
          default:
            badgeClass = "status-unknown"
            badgeText = status.toString().substring(0, 3)
            emoji = "❓"
        }
      }

      return `<span class="link-status ${badgeClass}" title="${getStatusDescription(status, statusText)}">
        <span class="status-emoji">${emoji}</span>
        <span class="status-text">${badgeText}</span>
      </span>`
    }

    // Function to get status description
    function getStatusDescription(status, statusText) {
      const descriptions = {
        200: "✅ Link works perfectly",
        301: "🔄 Permanent redirect",
        302: "🔄 Temporary redirect",
        404: "❌ Page not found",
        403: "🚫 Access forbidden",
        500: "⚠️ Server error",
        CORS: "🔒 Cross-origin blocked",
        Error: "❌ Network or connection error",
        "N/A": "ℹ️ Not an HTTP link",
        Unchecked: "❓ Status not checked",
      }

      return descriptions[status] || `${statusText || status}`
    }

    // Function to sort links by status
    function sortLinksByStatus(links, order = "asc") {
      return links.sort((a, b) => {
        const getStatusPriority = (status) => {
          if (typeof status === "number") {
            if (status >= 200 && status < 300) return 1 // Success
            if (status >= 300 && status < 400) return 2 // Redirect
            if (status >= 400 && status < 500) return 3 // Client error
            if (status >= 500) return 4 // Server error
            return 5 // Unknown number
          }

          switch (status) {
            case "N/A":
              return 0
            case "CORS":
              return 2
            case "Unchecked":
              return 6
            case "Error":
              return 4
            default:
              return 5
          }
        }

        const priorityA = getStatusPriority(a.status)
        const priorityB = getStatusPriority(b.status)

        if (order === "desc") {
          return priorityB - priorityA
        }
        return priorityA - priorityB
      })
    }

    // Function to filter links by status
    function filterLinksByStatus(links, filter) {
      if (filter === "all") return links

      return links.filter((link) => {
        const status = link.status

        switch (filter) {
          case "success":
            return typeof status === "number" && status >= 200 && status < 300
          case "redirect":
            return typeof status === "number" && status >= 300 && status < 400
          case "client-error":
            return typeof status === "number" && status >= 400 && status < 500
          case "server-error":
            return typeof status === "number" && status >= 500
          case "cors":
            return status === "CORS"
          case "error":
            return status === "Error"
          case "unchecked":
            return status === "Unchecked"
          case "na":
            return status === "N/A"
          default:
            return true
        }
      })
    }

    // Function to check link status asynchronously
    async function checkLinkStatus(url) {
      try {
        // Skip checking for certain protocols
        if (
          url.startsWith("mailto:") ||
          url.startsWith("tel:") ||
          url.startsWith("javascript:") ||
          url.startsWith("#")
        ) {
          return { status: "N/A", statusText: "Not HTTP" }
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

        const response = await fetch(url, {
          method: "HEAD",
          mode: "no-cors",
          cache: "no-cache",
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        return {
          status: response.status || "Unknown",
          statusText: response.statusText || "Unknown",
        }
      } catch (error) {
        if (error.name === "AbortError") {
          return {
            status: "Error",
            statusText: "Request timeout",
          }
        }

        // For CORS issues or network errors
        if (error.message.includes("CORS") || error.message.includes("cors")) {
          return {
            status: "CORS",
            statusText: "CORS Blocked",
          }
        }

        return {
          status: "Error",
          statusText: error.message || "Network Error",
        }
      }
    }

    // Function to render links list
    function renderLinksList(links, containerId, linkType) {
      const linkContainer = document.getElementById(containerId)
      if (!linkContainer) return

      // Apply current filter
      const filteredLinks = filterLinksByStatus(links, currentFilter[linkType])

      const sortIcon = currentSort[linkType] === "asc" ? "↑" : currentSort[linkType] === "desc" ? "↓" : "↕"

      linkContainer.innerHTML = `
        <div class="links-controls">
          <div class="links-sort-header">
            <span class="links-count">${filteredLinks.length} of ${links.length} ${linkType} links</span>
            <button class="sort-btn" data-type="${linkType}">
              Sort by Status ${sortIcon}
            </button>
          </div>
          
          <div class="links-filter">
            <label for="${linkType}-filter" class="filter-label">Filter by status:</label>
            <select id="${linkType}-filter" class="filter-select" data-type="${linkType}">
              <option value="all">All Statuses</option>
              <option value="success">✅ Success (2xx)</option>
              <option value="redirect">🔄 Redirects (3xx)</option>
              <option value="client-error">❌ Client Errors (4xx)</option>
              <option value="server-error">⚠️ Server Errors (5xx)</option>
              <option value="cors">🔒 CORS Blocked</option>
              <option value="error">❌ Network Errors</option>
              <option value="unchecked">❓ Unchecked</option>
              <option value="na">ℹ️ Not HTTP</option>
            </select>
          </div>
        </div>
        
        <div class="links-list-content">
          ${
            filteredLinks.length > 0
              ? filteredLinks
                  .map(
                    (link) => `
              <div class="link-item" data-link-id="${link.index}">
                <div class="link-header">
                  <div class="link-text">${link.text || "No anchor text"}</div>
                  <div class="link-status-container">
                    ${getStatusBadge(link.status, link.statusText, link.status === "Checking")}
                  </div>
                </div>
                <div class="link-url">${link.href || ""}</div>
                <div class="link-meta">
                  ${link.rel ? `<span class="link-rel">rel="${link.rel}"</span>` : ""}
                  ${link.target ? `<span class="link-target">target="${link.target}"</span>` : ""}
                </div>
              </div>
            `,
                  )
                  .join("")
              : `<div class="empty-state">No ${linkType} links found${currentFilter[linkType] !== "all" ? " for selected filter" : ""}</div>`
          }
        </div>
      `

      // Add sort button event listener
      const sortBtn = linkContainer.querySelector(".sort-btn")
      if (sortBtn) {
        sortBtn.addEventListener("click", () => {
          const type = sortBtn.dataset.type

          // Cycle through sort states: none -> asc -> desc -> none
          if (currentSort[type] === "none") {
            currentSort[type] = "asc"
            if (type === "internal") {
              internalLinks = sortLinksByStatus(internalLinks, "asc")
            } else {
              externalLinks = sortLinksByStatus(externalLinks, "asc")
            }
          } else if (currentSort[type] === "asc") {
            currentSort[type] = "desc"
            if (type === "internal") {
              internalLinks = sortLinksByStatus(internalLinks, "desc")
            } else {
              externalLinks = sortLinksByStatus(externalLinks, "desc")
            }
          } else {
            currentSort[type] = "none"
            // Reset to original order
            if (type === "internal") {
              internalLinks = [...(data.internalLinks || [])]
            } else {
              externalLinks = [...(data.externalLinks || [])]
            }
          }

          // Re-render the specific list
          renderLinksList(type === "internal" ? internalLinks : externalLinks, containerId, type)
        })
      }

      // Add filter select event listener
      const filterSelect = linkContainer.querySelector(".filter-select")
      if (filterSelect) {
        filterSelect.value = currentFilter[linkType]
        filterSelect.addEventListener("change", (e) => {
          const type = e.target.dataset.type
          currentFilter[type] = e.target.value

          // Re-render the specific list
          renderLinksList(type === "internal" ? internalLinks : externalLinks, containerId, type)
        })
      }
    }

    // Function to update link status in the UI
    function updateLinkStatus(linkIndex, status, statusText, linkType) {
      const linkElement = document.querySelector(`[data-link-id="${linkIndex}"] .link-status-container`)
      if (linkElement) {
        linkElement.innerHTML = getStatusBadge(status, statusText, false)
      }

      // Update the data
      const linkArray = linkType === "internal" ? internalLinks : externalLinks
      const link = linkArray.find((l) => l.index === linkIndex)
      if (link) {
        link.status = status
        link.statusText = statusText
      }
    }

    // Function to start checking all links asynchronously
    async function startLinkStatusChecking() {
      const allLinks = [
        ...internalLinks.map((link) => ({ ...link, type: "internal" })),
        ...externalLinks.map((link) => ({ ...link, type: "external" })),
      ]

      // Set all links to checking status initially
      allLinks.forEach((link) => {
        link.status = "Checking"
        link.statusText = "Checking status..."
      })

      // Check links in batches to avoid overwhelming the browser
      const batchSize = 5
      for (let i = 0; i < allLinks.length; i += batchSize) {
        const batch = allLinks.slice(i, i + batchSize)

        // Process batch concurrently
        const promises = batch.map(async (link) => {
          try {
            const result = await checkLinkStatus(link.href)
            updateLinkStatus(link.index, result.status, result.statusText, link.type)
          } catch (error) {
            updateLinkStatus(link.index, "Error", error.message, link.type)
          }
        })

        await Promise.all(promises)

        // Small delay between batches to prevent rate limiting
        if (i + batchSize < allLinks.length) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }
    }

    container.innerHTML = `
      <div class="links-tabs">
        <div class="links-tab active" data-links-tab="internal">
          Internal Links (${internalLinks.length})
        </div>
        <div class="links-tab" data-links-tab="external">
          External Links (${externalLinks.length})
        </div>
      </div>
      
      <div class="links-content">
        <div id="internal-links" class="links-list active">
          <!-- Internal links will be rendered here -->
        </div>
        
        <div id="external-links" class="links-list">
          <!-- External links will be rendered here -->
        </div>
      </div>
    `

    // Render both lists initially with loading states
    renderLinksList(internalLinks, "internal-links", "internal")
    renderLinksList(externalLinks, "external-links", "external")

    // Start checking link statuses asynchronously
    startLinkStatusChecking()

    // Add event listeners for link tabs
    const linkTabs = container.querySelectorAll(".links-tab")
    const linkLists = container.querySelectorAll(".links-list")

    linkTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        linkTabs.forEach((t) => t.classList.remove("active"))
        linkLists.forEach((list) => list.classList.remove("active"))

        tab.classList.add("active")
        const targetList = tab.dataset.linksTab
        const targetElement = document.getElementById(`${targetList}-links`)
        if (targetElement) {
          targetElement.classList.add("active")
        }
      })
    })
  } catch (error) {
    console.error("Error displaying links:", error)
    container.innerHTML = '<div class="empty-state">Error displaying links data</div>'
  }
}

function displayImages(data) {
  const container = document.getElementById("images")
  if (!container) return

  try {
    const images = data.images || []

    if (images.length === 0) {
      container.innerHTML = '<div class="empty-state">No images found on this page</div>'
      return
    }

    // Calculate total estimated size
    const totalEstimatedSize = images.reduce((sum, img) => sum + (img.estimatedSize || 0), 0)

    container.innerHTML = `
      <div class="images-summary">
        <div class="summary-item">
          <span class="summary-label">Total Images:</span>
          <span class="summary-value">${images.length}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">With Alt Text:</span>
          <span class="summary-value">${images.filter((img) => img.hasAlt).length}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Missing Alt:</span>
          <span class="summary-value">${images.filter((img) => !img.hasAlt).length}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Est. Total Size:</span>
          <span class="summary-value">${formatBytes(totalEstimatedSize)}</span>
        </div>
      </div>
      
      <div class="images-grid">
        ${images
          .map(
            (img) => `
          <div class="image-item">
            <div class="image-thumbnail">
              <img src="${img.src || ""}" alt="${img.alt || ""}" data-fallback="true">
            </div>
            <div class="image-details">
              <div class="image-alt ${img.hasAlt ? "has-alt" : "no-alt"}">
                ${img.hasAlt ? `Alt: "${img.alt}"` : "Missing alt text"}
              </div>
              <div class="image-dimensions">${img.width || 0} × ${img.height || 0}px</div>
              <div class="image-size">Est. size: ${formatBytes(img.estimatedSize || 0)}</div>
              <div class="image-src">${(img.src || "").split("/").pop() || "Unknown"}</div>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `

    // Add error handling for images after innerHTML assignment
    const imageElements = container.querySelectorAll('img[data-fallback="true"]')
    imageElements.forEach((img) => {
      img.addEventListener("error", function () {
        this.style.display = "none"
      })
    })
  } catch (error) {
    console.error("Error displaying images:", error)
    container.innerHTML = '<div class="empty-state">Error displaying images data</div>'
  }
}

function displayIssues(data) {
  const container = document.getElementById("issues")
  if (!container) return

  try {
    const issues = data.issues || []

    if (issues.length === 0) {
      container.innerHTML = '<div class="empty-state success">🎉 No SEO issues found!</div>'
      return
    }

    // Group issues by category
    const groupedIssues = issues.reduce((groups, issue) => {
      const category = issue.category || "Other"
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(issue)
      return groups
    }, {})

    let issuesHTML = ""

    Object.entries(groupedIssues).forEach(([category, categoryIssues]) => {
      issuesHTML += `
        <div class="issues-category">
          <div class="issues-category-title">${category}</div>
          <div class="issues-list">
            ${categoryIssues
              .map(
                (issue) => `
              <div class="issue-item ${issue.type || "info"}">
                <div class="issue-icon">
                  ${issue.type === "critical" ? "🚨" : issue.type === "error" ? "❌" : issue.type === "warning" ? "⚠️" : "ℹ️"}
                </div>
                <div class="issue-content">
                  <div class="issue-message">${issue.message || "Unknown issue"}</div>
                  ${issue.impact ? `<div class="issue-impact">${issue.impact}</div>` : ""}
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `
    })

    container.innerHTML = issuesHTML
  } catch (error) {
    console.error("Error displaying issues:", error)
    container.innerHTML = '<div class="empty-state">Error displaying issues data</div>'
  }
}

function displaySchema(data) {
  const container = document.getElementById("schema")
  if (!container) return

  try {
    const schemas = data.schemas || []

    if (schemas.length === 0) {
      container.innerHTML = '<div class="empty-state">No structured data (Schema.org) found on this page</div>'
      return
    }

    container.innerHTML = `
      <div class="schema-summary">
        <div class="summary-item">
          <span class="summary-label">Schema Types Found:</span>
          <span class="summary-value">${schemas.length}</span>
        </div>
      </div>
      
      <div class="schema-list">
        ${schemas
          .map(
            (schema, index) => `
          <div class="schema-item">
            <div class="schema-header">
              <span class="schema-type">${schema.type || "Unknown"}</span>
              <span class="schema-index">#${index + 1}</span>
            </div>
            <div class="schema-preview">
              <pre>${JSON.stringify(schema.data || {}, null, 2).substring(0, 200)}${JSON.stringify(schema.data || {}, null, 2).length > 200 ? "..." : ""}</pre>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `
  } catch (error) {
    console.error("Error displaying schema:", error)
    container.innerHTML = '<div class="empty-state">Error displaying schema data</div>'
  }
}

function displayPageSpeed(data) {
  const container = document.getElementById("pagespeed")
  if (!container) return

  try {
    const hints = data.performanceHints || []

    container.innerHTML = `
      <div class="pagespeed-metrics">
        <div class="metric-item">
          <div class="metric-label">Page Size</div>
          <div class="metric-value">${formatBytes(data.pageSize || 0)}</div>
          <div class="metric-status ${(data.pageSize || 0) > 1000000 ? "warning" : "good"}">
            ${(data.pageSize || 0) > 1000000 ? "Large" : "Good"}
          </div>
        </div>
        
        <div class="metric-item">
          <div class="metric-label">Load Time</div>
          <div class="metric-value">${((data.loadTime || 0) / 1000).toFixed(2)}s</div>
          <div class="metric-status ${(data.loadTime || 0) > 3000 ? "warning" : "good"}">
            ${(data.loadTime || 0) > 3000 ? "Slow" : "Good"}
          </div>
        </div>
        
        <div class="metric-item">
          <div class="metric-label">Images</div>
          <div class="metric-value">${(data.images || []).length}</div>
          <div class="metric-status ${(data.images || []).length > 20 ? "warning" : "good"}">
            ${(data.images || []).length > 20 ? "Many" : "Good"}
          </div>
        </div>
      </div>
      
      <div class="performance-hints">
        <div class="hints-title">Performance Suggestions</div>
        ${
          hints.length > 0
            ? hints
                .map(
                  (hint) => `
            <div class="hint-item ${hint.type || "info"}">
              <span class="hint-icon">
                ${hint.type === "warning" ? "⚠️" : hint.type === "good" ? "✅" : "ℹ️"}
              </span>
              <div class="hint-content">
                <div class="hint-message">${hint.message || "No message"}</div>
                ${hint.suggestion ? `<div class="hint-suggestion">${hint.suggestion}</div>` : ""}
              </div>
            </div>
          `,
                )
                .join("")
            : '<div class="empty-state">No performance suggestions available</div>'
        }
      </div>
    `
  } catch (error) {
    console.error("Error displaying page speed:", error)
    container.innerHTML = '<div class="empty-state">Error displaying page speed data</div>'
  }
}

function getIndexationStatus(data) {
  try {
    if (data.robotsMeta && data.robotsMeta.includes("noindex")) {
      return { type: "error", label: "Not Indexed", details: "Page has noindex directive" }
    }

    if (!data.canonicalUrl || data.canonicalUrl.trim() === "") {
      return { type: "warning", label: "No Canonical", details: "Missing canonical URL" }
    }

    return { type: "good", label: "Indexable", details: "Page can be indexed" }
  } catch (e) {
    return { type: "warning", label: "Unknown", details: "Could not determine indexation status" }
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function displayAI(data) {
  const container = document.getElementById("ai")
  if (!container) return

  try {
    const apiKey = localStorage.getItem("groq_api_key") || ""
    const hasApiKey = apiKey.length > 0

    container.innerHTML = `
      <div class="ai-header">
        <div class="ai-powered">
          <span class="ai-powered-icon">🤖</span>
          <span>Powered by Groq AI</span>
        </div>
        
        <div class="api-key-section">
          <label class="api-key-label">Groq API Key</label>
          <input 
            type="password" 
            class="api-key-input" 
            id="groqApiKey"
            placeholder="Enter your Groq API key..."
            value="${apiKey}"
          >
          <div class="api-key-status ${hasApiKey ? "connected" : ""}" id="apiKeyStatus">
            ${hasApiKey ? "✓ API key configured" : "Enter your Groq API key to get AI suggestions"}
          </div>
        </div>
        
        <button 
          class="ai-analyze-btn" 
          id="aiAnalyzeBtn"
          ${!hasApiKey ? "disabled" : ""}
        >
          ${hasApiKey ? "🔍 Analyze with AI" : "Configure API Key First"}
        </button>
      </div>
      
      <div id="aiResults"></div>
    `

    // Add event listeners
    const apiKeyInput = document.getElementById("groqApiKey")
    const analyzeBtn = document.getElementById("aiAnalyzeBtn")
    const apiKeyStatus = document.getElementById("apiKeyStatus")

    apiKeyInput.addEventListener("input", (e) => {
      const key = e.target.value.trim()
      localStorage.setItem("groq_api_key", key)

      if (key.length > 0) {
        apiKeyStatus.textContent = "✓ API key configured"
        apiKeyStatus.className = "api-key-status connected"
        analyzeBtn.disabled = false
        analyzeBtn.textContent = "🔍 Analyze with AI"
      } else {
        apiKeyStatus.textContent = "Enter your Groq API key to get AI suggestions"
        apiKeyStatus.className = "api-key-status"
        analyzeBtn.disabled = true
        analyzeBtn.textContent = "Configure API Key First"
      }
    })

    analyzeBtn.addEventListener("click", () => {
      if (!analyzeBtn.disabled) {
        analyzeWithAI(data)
      }
    })
  } catch (error) {
    console.error("Error displaying AI tab:", error)
    container.innerHTML = '<div class="empty-state">Error displaying AI interface</div>'
  }
}

async function analyzeWithAI(data) {
  const resultsContainer = document.getElementById("aiResults")
  const analyzeBtn = document.getElementById("aiAnalyzeBtn")
  const apiKey = localStorage.getItem("groq_api_key")

  if (!apiKey) {
    resultsContainer.innerHTML = '<div class="empty-state">Please configure your Groq API key first</div>'
    return
  }

  // Show loading state
  analyzeBtn.disabled = true
  analyzeBtn.textContent = "🤖 Analyzing..."
  resultsContainer.innerHTML = `
    <div class="ai-loading">
      <div>🤖 AI is analyzing your page...</div>
      <div style="font-size: 12px; margin-top: 8px;">This may take a few seconds</div>
    </div>
  `

  try {
    // Prepare page content for AI analysis
    const pageContent = {
      url: data.url,
      title: data.title || "",
      metaDescription: data.metaDescription || "",
      metaKeywords: data.metaKeywords || "",
      h1Tags: data.h1Tags?.map((h) => h.text).join(", ") || "",
      h2Tags: data.h2Tags?.map((h) => h.text).join(", ") || "",
      h3Tags: data.h3Tags?.map((h) => h.text).join(", ") || "",
      imageCount: data.images?.length || 0,
      internalLinksCount: data.internalLinks?.length || 0,
      externalLinksCount: data.externalLinks?.length || 0,
      pageSize: data.pageSize || 0,
      loadTime: data.loadTime || 0,
    }

    const prompt = `You are an expert SEO consultant. Analyze this webpage and provide specific, actionable SEO suggestions.

Page Data:
- URL: ${pageContent.url}
- Current Title: "${pageContent.title}"
- Current Meta Description: "${pageContent.metaDescription}"
- Current Meta Keywords: "${pageContent.metaKeywords}"
- H1 Tags: ${pageContent.h1Tags}
- H2 Tags: ${pageContent.h2Tags}
- H3 Tags: ${pageContent.h3Tags}
- Images: ${pageContent.imageCount}
- Internal Links: ${pageContent.internalLinksCount}
- External Links: ${pageContent.externalLinksCount}
- Page Size: ${formatBytes(pageContent.pageSize)}
- Load Time: ${(pageContent.loadTime / 1000).toFixed(2)}s

Please provide suggestions in this exact JSON format:
{
  "title": {
    "suggestion": "Your improved title suggestion here",
    "reason": "Why this title is better"
  },
  "metaDescription": {
    "suggestion": "Your improved meta description here",
    "reason": "Why this description is better"
  },
  "metaKeywords": {
    "suggestion": "keyword1, keyword2, keyword3",
    "reason": "Why these keywords are relevant"
  },
  "h1": {
    "suggestion": "Your improved H1 suggestion here",
    "reason": "Why this H1 is better"
  },
  "overallScore": 85,
  "improvements": [
    "First improvement suggestion",
    "Second improvement suggestion",
    "Third improvement suggestion"
  ]
}

Focus on:
1. Title should be 50-60 characters, compelling and include main keywords
2. Meta description should be a concise, informative, and compelling summary of a webpage, designed to entice users to click on the search result. It should be between 150 and 160 characters. A good meta description will answer user intent, include relevant keywords, and use action words to encourage clicks. 
3. Meta keywords should be 5-10 relevant keywords (comma-separated)
4. H1 should be clear, descriptive and include primary keyword
5. Consider the page content and structure for relevance

Respond only with valid JSON, no additional text.`

    // Make API call to Groq with improved error handling
    console.log("Making API call to Groq...")

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    })

    console.log("Response status:", response.status)

    if (!response.ok) {
      const errorData = await response.text()
      console.error("API Error Response:", errorData)

      // Try to parse error for better user feedback
      let errorMessage = `API Error: ${response.status}`
      try {
        const errorJson = JSON.parse(errorData)
        if (errorJson.error && errorJson.error.message) {
          errorMessage = errorJson.error.message
        }
      } catch (e) {
        errorMessage = errorData || errorMessage
      }

      throw new Error(errorMessage)
    }

    const result = await response.json()
    console.log("API Response:", result)

    const aiResponse = result.choices[0]?.message?.content

    if (!aiResponse) {
      throw new Error("No response from AI")
    }

    console.log("AI Response content:", aiResponse)

    // Parse AI response
    let suggestions
    try {
      suggestions = JSON.parse(aiResponse)
    } catch (e) {
      console.warn("JSON parsing failed, trying to extract JSON:", e)
      // If JSON parsing fails, try to extract JSON from the response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          suggestions = JSON.parse(jsonMatch[0])
        } catch (e2) {
          throw new Error("Invalid AI response format - could not parse JSON")
        }
      } else {
        throw new Error("Invalid AI response format - no JSON found")
      }
    }

    displayAISuggestions(suggestions, data)
  } catch (error) {
    console.error("AI Analysis Error:", error)

    let errorMessage = error.message
    let helpText = "Please check your API key and try again"

    // Provide specific help based on error type
    if (error.message.includes("401")) {
      errorMessage = "Invalid API key"
      helpText = "Please check that your Groq API key is correct"
    } else if (error.message.includes("429")) {
      errorMessage = "Rate limit exceeded"
      helpText = "Please wait a moment and try again"
    } else if (error.message.includes("400")) {
      errorMessage = "Bad request"
      helpText = "There may be an issue with the request format. Please try again."
    }

    resultsContainer.innerHTML = `
      <div class="empty-state" style="color: #dc2626;">
        <div style="font-weight: bold; margin-bottom: 8px;">AI Analysis Failed</div>
        <div style="font-size: 12px; margin-bottom: 8px;">${errorMessage}</div>
        <div style="font-size: 11px; margin-bottom: 12px;">${helpText}</div>
        <button 
          style="background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;"
          onclick="analyzeWithAI(${JSON.stringify(data).replace(/"/g, "&quot;")})"
        >
          Try Again
        </button>
      </div>
    `
  } finally {
    analyzeBtn.disabled = false
    analyzeBtn.textContent = "🔍 Analyze with AI"
  }
}

function displayAISuggestions(suggestions, currentData) {
  const resultsContainer = document.getElementById("aiResults")

  try {
    const suggestionItems = [
      {
        title: "Page Title",
        current: currentData.title || "No title",
        suggested: suggestions.title?.suggestion || "No suggestion",
        reason: suggestions.title?.reason || "",
        type: "title",
      },
      {
        title: "Meta Description",
        current: currentData.metaDescription || "No meta description",
        suggested: suggestions.metaDescription?.suggestion || "No suggestion",
        reason: suggestions.metaDescription?.reason || "",
        type: "description",
      },
      {
        title: "Meta Keywords",
        current: currentData.metaKeywords || "No meta keywords",
        suggested: suggestions.metaKeywords?.suggestion || "No suggestion",
        reason: suggestions.metaKeywords?.reason || "",
        type: "keywords",
      },
      {
        title: "H1 Tag",
        current: currentData.h1Tags?.[0]?.text || "No H1 tag",
        suggested: suggestions.h1?.suggestion || "No suggestion",
        reason: suggestions.h1?.reason || "",
        type: "h1",
      },
    ]

    resultsContainer.innerHTML = `
      <div class="ai-suggestions">
        ${suggestionItems
          .map(
            (item) => `
          <div class="suggestion-item">
            <div class="suggestion-header">
              <span class="suggestion-title">${item.title}</span>
              <button class="suggestion-copy" data-text="${item.suggested}" data-type="${item.title}">
                Copy
              </button>
            </div>
            
            <div class="suggestion-current">
              <div class="suggestion-current-label">Current:</div>
              <div class="suggestion-current-value">${item.current}</div>
            </div>
            
            <div class="suggestion-ai">
              <div class="suggestion-ai-label">AI Suggestion:</div>
              <div class="suggestion-ai-value">${item.suggested}</div>
            </div>
            
            ${
              item.reason
                ? `
              <div class="suggestion-improvement">
                💡 ${item.reason}
              </div>
            `
                : ""
            }
          </div>
        `,
          )
          .join("")}
        
        ${
          suggestions.improvements
            ? `
          <div class="suggestion-item">
            <div class="suggestion-header">
              <span class="suggestion-title">Additional Improvements</span>
            </div>
            <div class="suggestion-ai">
              <div class="suggestion-ai-label">AI Recommendations:</div>
              <div class="suggestion-ai-value">
                ${suggestions.improvements
                  .map(
                    (imp, index) => `
                  <div style="margin-bottom: 8px;">
                    <strong>${index + 1}.</strong> ${imp}
                  </div>
                `,
                  )
                  .join("")}
              </div>
            </div>
          </div>
        `
            : ""
        }
        
        ${
          suggestions.overallScore
            ? `
          <div class="suggestion-item">
            <div class="suggestion-header">
              <span class="suggestion-title">AI SEO Score</span>
            </div>
            <div class="suggestion-ai">
              <div class="suggestion-ai-value" style="text-align: center; font-size: 24px; font-weight: bold; color: #4f46e5;">
                ${suggestions.overallScore}/100
              </div>
            </div>
          </div>
        `
            : ""
        }
      </div>
    `

    // Then add after the innerHTML assignment:
    const copyButtons = resultsContainer.querySelectorAll(".suggestion-copy")
    copyButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const text = e.target.getAttribute("data-text")
        const type = e.target.getAttribute("data-type")
        copySuggestion(text, type)
      })
    })
  } catch (error) {
    console.error("Error displaying AI suggestions:", error)
    resultsContainer.innerHTML = '<div class="empty-state">Error displaying AI suggestions</div>'
  }
}

function copySuggestion(text, type) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      // Show copy notification
      const notification = document.createElement("div")
      notification.className = "copy-notification"
      notification.textContent = `${type} copied to clipboard!`
      document.body.appendChild(notification)

      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove()
        }
      }, 2000)
    })
    .catch((err) => {
      console.error("Failed to copy text: ", err)
    })
}

// Add displayHelp function after the other display functions
function displayHelp() {
  const container = document.getElementById("help")
  if (!container) return

  try {
    container.innerHTML = `
      <div class="help-header">
        <div class="help-title">SEOBON Help Center</div>
        <div class="help-subtitle">Your complete guide to SEO analysis and optimization</div>
      </div>

      <div class="help-section">
        <div class="help-section-title">
          <span class="help-section-icon">🚀</span>
          Getting Started
        </div>
        <div class="help-content">
          <p>SEOBON is a powerful SEO analyzer that helps you optimize your website for search engines. Here's how to get started:</p>
          <ul class="help-list">
            <li>
              <span class="help-step-number">1</span>
              <div>
                <strong>Navigate to any webpage</strong><br>
                Open the website you want to analyze in your browser
              </div>
            </li>
            <li>
              <span class="help-step-number">2</span>
              <div>
                <strong>Click the SEOBON extension icon</strong><br>
                The extension will automatically start analyzing the page
              </div>
            </li>
            <li>
              <span class="help-step-number">3</span>
              <div>
                <strong>Review your SEO score</strong><br>
                Get an instant score out of 100 based on key SEO factors
              </div>
            </li>
            <li>
              <span class="help-step-number">4</span>
              <div>
                <strong>Explore different tabs</strong><br>
                Each tab provides detailed insights into different SEO aspects
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div class="help-section">
        <div class="help-section-title">
          <span class="help-section-icon">📊</span>
          Features Overview
        </div>
        <div class="help-content">
          <div class="help-feature">
            <div class="help-feature-title">📈 Overview Tab</div>
            <div class="help-feature-desc">Get a quick summary of your page's SEO status, including URL, page size, title, description, and indexation status.</div>
          </div>
          
          <div class="help-feature">
            <div class="help-feature-title">📝 Content Tab</div>
            <div class="help-feature-desc">Analyze your heading structure (H1-H6) to ensure proper content hierarchy and SEO optimization.</div>
          </div>
          
          <div class="help-feature">
            <div class="help-feature-title">🔗 Links Tab</div>
            <div class="help-feature-desc">Review internal and external links on your page, including their anchor text and attributes.</div>
          </div>
          
          <div class="help-feature">
            <div class="help-feature-title">🖼️ Images Tab</div>
            <div class="help-feature-desc">Check image optimization, alt text usage, and identify images that need SEO improvements.</div>
          </div>
          
          <div class="help-feature">
            <div class="help-feature-title">⚠️ Issues Tab</div>
            <div class="help-feature-desc">Discover SEO problems and get actionable recommendations to fix them.</div>
          </div>
          
          <div class="help-feature">
            <div class="help-feature-title">🏷️ Schema Tab</div>
            <div class="help-feature-desc">View structured data (Schema.org) markup found on your page for rich snippets.</div>
          </div>
          
          <div class="help-feature">
            <div class="help-feature-title">⚡ Speed Tab</div>
            <div class="help-feature-desc">Analyze page performance metrics and get suggestions for speed optimization.</div>
          </div>
          
          <div class="help-feature">
            <div class="help-feature-title">📱 Track Tab</div>
            <div class="help-feature-desc">Monitor SEO changes over time with real-time tracking and historical data.</div>
          </div>
          
          <div class="help-feature">
            <div class="help-feature-title">🤖 AI Tab</div>
            <div class="help-feature-desc">Get AI-powered SEO suggestions for titles, meta descriptions, and content optimization.</div>
          </div>
        </div>
      </div>

      <div class="help-section">
        <div class="help-section-title">
          <span class="help-section-icon">🤖</span>
          AI-Powered Analysis
        </div>
        <div class="help-content">
          <p>SEOBON includes advanced AI features powered by Groq AI to provide intelligent SEO recommendations:</p>
          
          <div class="help-tip">
            <div class="help-tip-title">
              <span>💡</span>
              Setting up AI Analysis
            </div>
            <div class="help-tip-content">
              1. Go to the AI tab<br>
              2. Enter your Groq API key (get one free at console.groq.com)<br>
              3. Click "Analyze with AI" to get personalized suggestions
            </div>
          </div>
          
          <p><strong>AI Features:</strong></p>
          <ul class="help-list">
            <li>
              <span class="help-step-number">📝</span>
              <div>
                <strong>Smart Title Optimization</strong><br>
                Get AI-generated title suggestions optimized for SEO and click-through rates
              </div>
            </li>
            <li>
              <span class="help-step-number">📄</span>
              <div>
                <strong>Meta Description Enhancement</strong><br>
                Receive compelling meta descriptions that improve search visibility
              </div>
            </li>
            <li>
              <span class="help-step-number">🏷️</span>
              <div>
                <strong>Keyword Recommendations</strong><br>
                Get relevant keyword suggestions based on your content
              </div>
            </li>
            <li>
              <span class="help-step-number">📊</span>
              <div>
                <strong>Content Analysis</strong><br>
                Receive detailed recommendations for improving your content structure
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div class="help-section">
        <div class="help-section-title">
          <span class="help-section-icon">📈</span>
          Understanding Your SEO Score
        </div>
        <div class="help-content">
          <p>Your SEO score is calculated based on these key factors:</p>
          <ul class="help-list">
            <li>
              <span class="help-step-number">20</span>
              <div>
                <strong>Page Title (20 points)</strong><br>
                Optimal length: 30-60 characters with relevant keywords
              </div>
            </li>
            <li>
              <span class="help-step-number">20</span>
              <div>
                <strong>Meta Description (20 points)</strong><br>
                Optimal length: 120-160 characters with compelling copy
              </div>
            </li>
            <li>
              <span class="help-step-number">20</span>
              <div>
                <strong>H1 Tags (20 points)</strong><br>
                Exactly one H1 tag per page for best results
              </div>
            </li>
            <li>
              <span class="help-step-number">15</span>
              <div>
                <strong>Image Alt Text (15 points)</strong><br>
                All images should have descriptive alt text
              </div>
            </li>
            <li>
              <span class="help-step-number">10</span>
              <div>
                <strong>H2 Tags (10 points)</strong><br>
                Proper heading hierarchy improves content structure
              </div>
            </li>
            <li>
              <span class="help-step-number">10</span>
              <div>
                <strong>Internal Links (10 points)</strong><br>
                Internal linking helps with site navigation and SEO
              </div>
            </li>
            <li>
              <span class="help-step-number">5</span>
              <div>
                <strong>Schema Markup (5 points)</strong><br>
                Structured data helps search engines understand your content
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div class="help-section">
        <div class="help-section-title">
          <span class="help-section-icon">🔧</span>
          Troubleshooting
        </div>
        <div class="help-content">
          <div class="help-tip">
            <div class="help-tip-title">
              <span>⚠️</span>
              Common Issues
            </div>
            <div class="help-tip-content">
              <strong>Extension not loading:</strong> Make sure the page is fully loaded before opening SEOBON<br><br>
              <strong>AI not working:</strong> Check your Groq API key and internet connection<br><br>
              <strong>Missing data:</strong> Some websites may block content analysis due to security policies<br><br>
              <strong>Tracking not working:</strong> Enable tracking in the Track tab and refresh the page
            </div>
          </div>
        </div>
      </div>

      <div class="help-section">
        <div class="help-section-title">
          <span class="help-section-icon">📚</span>
          SEO Best Practices
        </div>
        <div class="help-content">
          <ul class="help-list">
            <li>
              <span class="help-step-number">✅</span>
              <div>
                <strong>Write unique, descriptive titles</strong><br>
                Each page should have a unique title that describes its content
              </div>
            </li>
            <li>
              <span class="help-step-number">✅</span>
              <div>
                <strong>Use proper heading hierarchy</strong><br>
                Structure your content with H1, H2, H3 tags in logical order
              </div>
            </li>
            <li>
              <span class="help-step-number">✅</span>
              <div>
                <strong>Optimize images</strong><br>
                Use descriptive alt text and compress images for faster loading
              </div>
            </li>
            <li>
              <span class="help-step-number">✅</span>
              <div>
                <strong>Create quality content</strong><br>
                Focus on providing value to your users with comprehensive content
              </div>
            </li>
            <li>
              <span class="help-step-number">✅</span>
              <div>
                <strong>Build internal links</strong><br>
                Link to related pages on your website to improve navigation
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div class="help-contact">
        <div class="help-contact-title">Need More Help?</div>
        <div class="help-contact-content">
          Visit our website for more resources, tutorials, and SEO tips.<br>
          Created by King Bon - Web Developer & Digital Graphic Artist
        </div>
        <a href="https://rkingbon.com" class="help-contact-btn" target="_blank">
          Visit rkingbon.com
        </a>
      </div>
    `
  } catch (error) {
    console.error("Error displaying help:", error)
    container.innerHTML = '<div class="empty-state">Error displaying help content</div>'
  }
}
