// Background script to open side panel on icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Optional: specific logic for tab changes if needed later
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // Can use this to update panel context if necessary
});
