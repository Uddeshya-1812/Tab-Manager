// --- CONFIGURATION CONSTANTS ---
const MAX_STORAGE_BYTES = 1024 * 1024; // Storage limit before UI warning (1 MB limit)
// -------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['dumpedGroups'], (result) => {
    if (!result.dumpedGroups) chrome.storage.local.set({ dumpedGroups: [] });
    // Clean up old activity tracking data if it exists from previous version
    chrome.storage.local.remove(['groupActivity']);
  });
});

// Centralized helper to save state and check storage limits continuously
async function saveState(dumpedGroups) {
  const size = new Blob([JSON.stringify(dumpedGroups)]).size;
  const isOverLimit = size > MAX_STORAGE_BYTES;

  await chrome.storage.local.set({
    dumpedGroups,
    storageWarning: isOverLimit
  });

  if (isOverLimit) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'groupTabs') {
    groupTabsByDomain().then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'closeDuplicates') {
    closeDuplicateTabs().then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'restoreGroup') {
    restoreGroup(request.dumpId).then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'deleteDump') {
    deleteDump(request.dumpId).then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'autoRemoveOldest') {
    autoRemoveOldest().then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'importDump') {
    importDump(request.data).then(res => sendResponse(res));
    return true;
  }
  if (request.action === 'hibernateGroup') {
    hibernateGroup(request.groupId).then(res => sendResponse(res));
    return true;
  }
});

async function groupTabsByDomain() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const domainGroups = {};

  tabs.forEach(tab => {
    if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) return;

    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace('www.', '');
      if (!domainGroups[domain]) domainGroups[domain] = [];
      domainGroups[domain].push(tab.id);
    } catch (e) {
      if (!domainGroups['system']) domainGroups['system'] = [];
      domainGroups['system'].push(tab.id);
    }
  });

  for (const [domain, tabIds] of Object.entries(domainGroups)) {
    if (tabIds.length > 1 && domain !== 'system') {
      try {
        const groupId = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(groupId, { title: domain, collapsed: true });
      } catch (e) {
        console.error('Error grouping tabs:', e);
      }
    }
  }
}

async function closeDuplicateTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const seenUrls = new Set();
  const duplicateIds = [];

  tabs.forEach(tab => {
    if (tab.url.startsWith('chrome://newtab') || tab.url.startsWith('edge://newtab')) return;
    if (seenUrls.has(tab.url)) {
      duplicateIds.push(tab.id);
    } else {
      seenUrls.add(tab.url);
    }
  });

  if (duplicateIds.length > 0) {
    await chrome.tabs.remove(duplicateIds);
  }
}

async function restoreGroup(dumpId) {
  const data = await chrome.storage.local.get(['dumpedGroups']);
  let dumpedGroups = data.dumpedGroups || [];

  const groupIndex = dumpedGroups.findIndex(g => g.id === dumpId);
  if (groupIndex === -1) return;

  const group = dumpedGroups[groupIndex];

  const tabIds = [];
  for (const tabInfo of group.tabs) {
    const createdTab = await chrome.tabs.create({ url: tabInfo.url, active: false });
    tabIds.push(createdTab.id);
  }

  if (tabIds.length > 0) {
    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, { title: group.domain, color: group.color, collapsed: false });
    dumpedGroups.splice(groupIndex, 1);
    await saveState(dumpedGroups);
  }
}

async function deleteDump(dumpId) {
  const data = await chrome.storage.local.get(['dumpedGroups']);
  let dumpedGroups = data.dumpedGroups || [];
  dumpedGroups = dumpedGroups.filter(g => g.id !== dumpId);
  await saveState(dumpedGroups);
}

async function autoRemoveOldest() {
  const data = await chrome.storage.local.get(['dumpedGroups']);
  let dumpedGroups = data.dumpedGroups || [];

  if (dumpedGroups.length > 0) {
    // Oldest first (lowest dumpedAt timestamp)
    dumpedGroups.sort((a, b) => a.dumpedAt - b.dumpedAt);
    dumpedGroups.shift(); // Remove the oldest
    await saveState(dumpedGroups);
  }
}

async function importDump(importedData) {
  if (!importedData || !Array.isArray(importedData.tabs)) {
    return { success: false, error: 'Invalid group data format.' };
  }

  const data = await chrome.storage.local.get(['dumpedGroups']);
  let dumpedGroups = data.dumpedGroups || [];

  const dump = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
    domain: importedData.domain || 'Imported',
    color: importedData.color || 'grey',
    tabCount: importedData.tabs.length,
    dumpedAt: Date.now(),
    tabs: importedData.tabs.map(t => ({
      url: t.url || 'chrome://newtab',
      title: t.title || 'Unknown Tab',
      favIconUrl: t.favIconUrl || null
    }))
  };

  dumpedGroups.push(dump);

  const size = new Blob([JSON.stringify(dumpedGroups)]).size;
  if (size > MAX_STORAGE_BYTES) {
    return { success: false, error: `Import failed: Storage limit (${MAX_STORAGE_BYTES / 1024} KB) would be exceeded.` };
  }

  await saveState(dumpedGroups);
  return { success: true };
}

async function hibernateGroup(groupId) {
  try {
    const numGroupId = Number(groupId);
    const tabs = await chrome.tabs.query({});
    const groupTabs = tabs.filter(t => t.groupId === numGroupId);
    if (groupTabs.length === 0) return { success: true };

    const group = await chrome.tabGroups.get(numGroupId);
    const data = await chrome.storage.local.get(['dumpedGroups']);

    let dumpedGroups = data.dumpedGroups || [];

    const dump = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      domain: group.title || 'Unnamed Group',
      color: group.color,
      tabCount: groupTabs.length,
      dumpedAt: Date.now(),
      tabs: groupTabs.map(t => ({
        url: t.url,
        title: t.title,
        favIconUrl: (t.favIconUrl && t.favIconUrl.startsWith('data:image')) ? null : t.favIconUrl
      }))
    };

    dumpedGroups.push(dump);

    await saveState(dumpedGroups);
    await chrome.tabs.remove(groupTabs.map(t => t.id));
    return { success: true };
  } catch (e) {
    console.error("Hibernate Error:", e);
    return { success: false, error: e.message };
  }
}
