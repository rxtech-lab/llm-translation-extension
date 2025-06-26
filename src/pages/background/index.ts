console.log('Translation extension background script loaded');

// Handle installation and updates
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // Open options page on first install
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/options/index.html') });
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  switch (message.action) {
    case 'getSettings':
      handleGetSettings(sendResponse);
      return true; // Keep message channel open for async response
      
    case 'saveTerms':
      handleSaveTerms(message.terms, sendResponse);
      return true;
      
    case 'getTerms':
      handleGetTerms(sendResponse);
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

async function handleGetSettings(sendResponse: (response: any) => void) {
  try {
    const result = await chrome.storage.local.get(['translationSettings']);
    sendResponse({ 
      success: true, 
      settings: result.translationSettings || {} 
    });
  } catch (error) {
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get settings' 
    });
  }
}

async function handleSaveTerms(terms: any[], sendResponse: (response: any) => void) {
  try {
    await chrome.storage.local.set({ translationTerms: terms });
    
    // Notify all content scripts about updated terms
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'termsUpdated',
          terms
        }).catch(() => {
          // Ignore errors for tabs without content script
        });
      }
    });
    
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to save terms' 
    });
  }
}

async function handleGetTerms(sendResponse: (response: any) => void) {
  try {
    const result = await chrome.storage.local.get(['translationTerms']);
    sendResponse({ 
      success: true, 
      terms: result.translationTerms || [] 
    });
  } catch (error) {
    sendResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get terms' 
    });
  }
}
