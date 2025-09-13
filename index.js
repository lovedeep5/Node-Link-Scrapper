const express = require("express");
const puppeteer = require("puppeteer");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 3000;

// Check if link is internal
function isInternalLink(link, baseUrl) {
  try {
    const linkUrl = new URL(link, baseUrl);
    const baseUrlObj = new URL(baseUrl);
    return linkUrl.hostname === baseUrlObj.hostname;
  } catch {
    return false;
  }
}

// Normalize URLs (handles relative paths)
function normalizeUrl(url, baseUrl) {
  try {
    const normalized = new URL(url, baseUrl);
    normalized.hash = ""; // remove # fragments
    let urlString = normalized.toString();
    if (urlString.endsWith("/") && urlString !== normalized.origin + "/") {
      urlString = urlString.slice(0, -1); // remove trailing slash
    }
    return urlString;
  } catch {
    return null;
  }
}

app.get("/crawl-links", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      error: "URL parameter is required",
      usage: "GET /crawl-links?url=https://example.com",
    });
  }

  try {
    new URL(url); // validate URL
  } catch {
    return res
      .status(400)
      .json({ error: "Invalid URL format", providedUrl: url });
  }

  let browser;
  try {
    console.log(`Starting crawl: ${url}`);
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 720 });
    await page.setDefaultNavigationTimeout(90000);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });

    // wait for page to stabilize
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Extract all <a> tags
    const links = await page.evaluate((baseUrl) => {
      return Array.from(document.querySelectorAll("a[href]"))
        .filter((anchor) => {
          // Remove anchors that contain only <img>
          const onlyImg =
            anchor.children.length === 1 &&
            anchor.children[0].tagName.toLowerCase() === "img";
          return !onlyImg;
        })
        .map((anchor) => {
          let text = anchor.textContent.trim();

          // Clean excessive whitespace
          text = text.replace(/\s+/g, " ");

          // Apply max length (truncate long text)
          if (text.length > 100) {
            text = text.slice(0, 100) + "...";
          }

          return {
            href: anchor.getAttribute("href"),
            title: text,
          };
        });
    }, url);

    // Normalize + filter links
    const internalLinks = [];
    const seen = new Set();

    // Regex for common non-page file extensions
    const excludePattern =
      /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico|pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|mp3|mp4|avi|mov|wmv|flv|mkv)(\?.*)?$/i;

    for (const link of links) {
      const normalizedUrl = normalizeUrl(link.href, url);

      if (
        normalizedUrl &&
        isInternalLink(normalizedUrl, url) &&
        !excludePattern.test(normalizedUrl) &&
        !seen.has(normalizedUrl)
      ) {
        seen.add(normalizedUrl);
        internalLinks.push({
          url: normalizedUrl,
          title: link.title || "", // keep clean title
        });
      }
    }

    // Page info
    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      description:
        document.querySelector('meta[name="description"]')?.content || "",
      url: window.location.href,
    }));

    res.json({
      success: true,
      crawledUrl: url,
      pageInfo,
      totalInternalLinks: internalLinks.length,
      internalLinks,
      crawledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Crawl error:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to crawl page",
      details: error.message,
      crawledUrl: url,
    });
  } finally {
    if (browser) await browser.close();
  }
});

// Health
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

module.exports = app;
