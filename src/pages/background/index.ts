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
      return true;

    case "saveTerms":
      handleSaveTerms(message.terms, message.domain, sendResponse);
      return true;

    case "getTerms":
      handleGetTerms(message.domain, sendResponse);
      return true;

    case "getDomains":
      handleGetDomains(sendResponse);
      return true;

    case "getTranslationState":
      handleGetTranslationState(message.tabId, sendResponse);
      return true;

    case "updateTranslationState":
      handleUpdateTranslationState(message.tabId, message.state, sendResponse);
      return true;

    case "translationError":
      console.error("Translation error:", message.error);
      break;

    default:
      sendResponse({ success: false, error: "Unknown action" });
  }
  return false;
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
  domain: string | undefined,
  sendResponse: (response: any) => void,
) {
  try {
    const result = await chrome.storage.local.get(["translationTermsByDomain"]);
    const termsByDomain = result.translationTermsByDomain || {};

    if (domain) {
      termsByDomain[domain] = terms;
    } else if (Array.isArray(terms)) {
      termsByDomain["unknown"] = terms;
    } else {
      Object.assign(termsByDomain, terms);
    }

    await chrome.storage.local.set({
      translationTermsByDomain: termsByDomain,
    });

    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs
          .sendMessage(tab.id, {
            action: "termsUpdated",
            domain: domain,
            terms: termsByDomain,
          })
          .catch(() => {});
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

async function handleGetTerms(
  domain: string | undefined,
  sendResponse: (response: any) => void,
) {
  try {
    const result = await chrome.storage.local.get([
      "translationTermsByDomain",
      "translationTerms",
    ]);

    let termsByDomain = result.translationTermsByDomain;

    if (!termsByDomain && result.translationTerms) {
      termsByDomain = { unknown: result.translationTerms };
      await chrome.storage.local.set({
        translationTermsByDomain: termsByDomain,
      });
    }

    termsByDomain = termsByDomain || {};

    if (domain) {
      sendResponse({
        success: true,
        terms: termsByDomain[domain] || [],
      });
    } else {
      sendResponse({
        success: true,
        terms: termsByDomain,
      });
    }
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get terms",
    });
  }
}

async function handleGetDomains(sendResponse: (response: any) => void) {
  try {
    const result = await chrome.storage.local.get(["translationTermsByDomain"]);
    const domains = result.translationTermsByDomain
      ? Object.keys(result.translationTermsByDomain)
      : [];
    sendResponse({ success: true, domains });
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get domains",
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
