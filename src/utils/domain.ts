/**
 * Extracts the domain from a URL, treating all subdomains equally
 * @param url - The URL to extract domain from
 * @returns The domain without subdomain (e.g., "example.com" from "www.example.com")
 */
export function extractDomain(url: string): string {
  try {
    let urlToProcess = url;

    // If the URL doesn't have a protocol, prepend https://
    if (!url.includes("://")) {
      urlToProcess = `https://${url}`;
    }

    const urlObj = new URL(urlToProcess);
    const hostname = urlObj.hostname;

    // Check if hostname is an IP address (IPv4)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(hostname)) {
      return hostname;
    }

    // Check if hostname is an IPv6 address
    if (hostname.includes(":") || hostname.startsWith("[")) {
      return hostname;
    }

    // Check if it's a valid domain-like string (contains at least one dot or is localhost)
    if (hostname === "localhost" || hostname.includes(".")) {
      // Split by dots and get last two parts for main domain
      const parts = hostname.split(".");
      if (parts.length >= 2) {
        return parts.slice(-2).join(".");
      }
      return hostname;
    }

    // If it doesn't look like a valid domain, return unknown
    return "unknown";
  } catch (error) {
    console.error("Error extracting domain from URL:", url, error);
    return "unknown";
  }
}

/**
 * Gets the current domain from the active tab
 * @returns Promise<string> - The domain of the current tab
 */
export async function getCurrentDomain(): Promise<string> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      return extractDomain(tabs[0].url);
    }
    return "unknown";
  } catch (error) {
    console.error("Error getting current domain:", error);
    return "unknown";
  }
}
