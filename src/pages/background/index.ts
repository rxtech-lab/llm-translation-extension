console.log("Translation extension background script loaded");

// Store translation state per tab
const tabStates = new Map<number, { isTranslating: boolean; progress: any }>();

// Handle installation and updates
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed:", details.reason);

  if (details.reason === "install") {
    // Open options page on first install
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/pages/options/index.html"),
    });
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);

  switch (message.action) {
    case "getSettings":
      handleGetSettings(sendResponse);
      return true; // Keep message channel open for async response

    case "saveTerms":
      handleSaveTerms(message.terms, sendResponse);
      return true;

    case "getTerms":
      handleGetTerms(sendResponse);
      return true;

    case "getTranslationState":
      handleGetTranslationState(message.tabId, sendResponse);
      return true;

    case "updateTranslationState":
      handleUpdateTranslationState(message.tabId, message.state, sendResponse);
      return true;

    case "translationError":
      console.error("Translation error:", message.error);
      return true;

    default:
      sendResponse({ success: false, error: "Unknown action" });
  }
});

async function handleGetSettings(sendResponse: (response: any) => void) {
  try {
    const result = await chrome.storage.local.get(["translationSettings"]);
    sendResponse({
      success: true,
      settings: result.translationSettings || {},
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get settings",
    });
  }
}

async function handleSaveTerms(
  terms: any,
  sendResponse: (response: any) => void
) {
  try {
    // Support both old format (array) and new format (object with domains)
    if (Array.isArray(terms)) {
      // Convert old format to new format with "unknown" domain
      const termsByDomain = { unknown: terms };
      await chrome.storage.local.set({
        translationTermsByDomain: termsByDomain,
      });
    } else {
      // New format: object with domains
      await chrome.storage.local.set({ translationTermsByDomain: terms });
    }

    // Notify all content scripts about updated terms
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs
          .sendMessage(tab.id, {
            action: "termsUpdated",
            terms,
          })
          .catch(() => {
            // Ignore errors for tabs without content script
          });
      }
    });

    sendResponse({ success: true });
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Failed to save terms",
    });
  }
}

async function handleGetTerms(sendResponse: (response: any) => void) {
  try {
    // Try new format first
    const result = await chrome.storage.local.get([
      "translationTermsByDomain",
      "translationTerms",
    ]);

    if (result.translationTermsByDomain) {
      sendResponse({
        success: true,
        terms: result.translationTermsByDomain,
      });
    } else if (result.translationTerms) {
      // Migrate old format to new format
      const termsByDomain = { unknown: result.translationTerms };
      await chrome.storage.local.set({
        translationTermsByDomain: termsByDomain,
      });
      sendResponse({
        success: true,
        terms: termsByDomain,
      });
    } else {
      sendResponse({
        success: true,
        terms: {},
      });
    }
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get terms",
    });
  }
}

async function handleGetTranslationState(
  tabId: number,
  sendResponse: (response: any) => void
) {
  try {
    const state = tabStates.get(tabId) || {
      isTranslating: false,
      progress: null,
    };
    sendResponse({
      success: true,
      state,
    });
  } catch (error) {
    sendResponse({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get translation state",
    });
  }
}

async function handleUpdateTranslationState(
  tabId: number,
  state: any,
  sendResponse: (response: any) => void
) {
  try {
    tabStates.set(tabId, state);
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update translation state",
    });
  }
}
