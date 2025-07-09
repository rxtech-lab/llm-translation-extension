/**
 * Extracts the domain from a URL, treating all subdomains equally
 * @param url - The URL to extract domain from
 * @returns The domain without subdomain (e.g., "example.com" from "www.example.com")
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // Split by dots and get last two parts for main domain
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    
    return hostname;
  } catch (error) {
    console.error('Error extracting domain from URL:', url, error);
    return 'unknown';
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
    return 'unknown';
  } catch (error) {
    console.error('Error getting current domain:', error);
    return 'unknown';
  }
}