// Content script for additional functionality if needed
console.log("SEO Analyzer content script loaded")

// Listen for messages from popup
window.chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSEOData") {
    const seoData = extractSEOData()
    sendResponse(seoData)
  }
})

function extractSEOData() {
  // This function is duplicated from popup.js for content script use
  const data = {
    title: document.title || "",
    metaDescription: "",
    metaKeywords: "",
    h1Tags: [],
    h2Tags: [],
    h3Tags: [],
    images: [],
    links: {
      internal: 0,
      external: 0,
      nofollow: 0,
    },
    url: window.location.href,
  }

  // Extract meta tags
  const metaDescription = document.querySelector('meta[name="description"]')
  if (metaDescription) {
    data.metaDescription = metaDescription.getAttribute("content") || ""
  }

  const metaKeywords = document.querySelector('meta[name="keywords"]')
  if (metaKeywords) {
    data.metaKeywords = metaKeywords.getAttribute("content") || ""
  }

  // Extract headings
  data.h1Tags = Array.from(document.querySelectorAll("h1")).map((h) => h.textContent.trim())
  data.h2Tags = Array.from(document.querySelectorAll("h2")).map((h) => h.textContent.trim())
  data.h3Tags = Array.from(document.querySelectorAll("h3")).map((h) => h.textContent.trim())

  // Extract images
  data.images = Array.from(document.querySelectorAll("img")).map((img) => ({
    src: img.src,
    alt: img.alt || "",
    hasAlt: !!img.alt,
  }))

  // Extract links
  const links = Array.from(document.querySelectorAll("a[href]"))
  const currentDomain = window.location.hostname

  links.forEach((link) => {
    const href = link.href
    const isExternal = !href.includes(currentDomain) && (href.startsWith("http") || href.startsWith("https"))
    const isNofollow = link.getAttribute("rel") && link.getAttribute("rel").includes("nofollow")

    if (isExternal) {
      data.links.external++
    } else {
      data.links.internal++
    }

    if (isNofollow) {
      data.links.nofollow++
    }
  })

  return data
}
