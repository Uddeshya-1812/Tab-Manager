// --- CONFIGURATION CONSTANTS ---
const INACTIVITY_LIMIT_MS = 6 * 60 * 60 * 1000; // Time before tab/group is dumped (6 hours)
const ALARM_PERIOD_MINUTES = 5; // How often the background check runs in minutes
const MAX_STORAGE_BYTES = 1024 * 1024; // Storage limit before UI warning (1 MB limit)
// -------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('checkInactiveGroups', { periodInMinutes: ALARM_PERIOD_MINUTES });
  chrome.storage.local.get(['dumpedGroups', 'groupActivity'], (result) => {
    if (!result.dumpedGroups) chrome.storage.local.set({ dumpedGroups: [] });
    if (!result.groupActivity) chrome.storage.local.set({ groupActivity: {} });
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkInactiveGroups') {
    checkAndDumpInactiveGroups();
  }
});

// Centralized helper to save state and check storage limits continuously
async function saveState(dumpedGroups, groupActivity) {
  const size = new Blob([JSON.stringify(dumpedGroups)]).size;
  const isOverLimit = size > MAX_STORAGE_BYTES;

  await chrome.storage.local.set({
    dumpedGroups,
    groupActivity,
    storageWarning: isOverLimit
  });

  if (isOverLimit) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Track Activity for both Tabs and Groups
async function updateActivity(id, isGroup) {
  const key = isGroup ? id : `tab_${id}`;
  const data = await chrome.storage.local.get('groupActivity');
  const activity = data.groupActivity || {};
  activity[key] = Date.now();
  await chrome.storage.local.set({ groupActivity: activity });
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      updateActivity(tab.groupId, true);
    } else {
      updateActivity(tab.id, false);
    }
  } catch (e) { }
});

chrome.tabGroups.onUpdated.addListener((group) => {
  updateActivity(group.id, true);
});

// Garbage Collection: Clean up storage when user manually closes tabs/groups to prevent memory leaks
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await chrome.storage.local.get('groupActivity');
  const activity = data.groupActivity || {};
  if (activity[`tab_${tabId}`]) {
    delete activity[`tab_${tabId}`];
    await chrome.storage.local.set({ groupActivity: activity });
  }
});

chrome.tabGroups.onRemoved.addListener(async (group) => {
  const data = await chrome.storage.local.get('groupActivity');
  const activity = data.groupActivity || {};
  if (activity[group.id]) {
    delete activity[group.id];
    await chrome.storage.local.set({ groupActivity: activity });
  }
});


async function checkAndDumpInactiveGroups() {
  const tabs = await chrome.tabs.query({});
  const groups = await chrome.tabGroups.query({});
  const data = await chrome.storage.local.get(['groupActivity', 'dumpedGroups']);

  const activity = data.groupActivity || {};
  let dumpedGroups = data.dumpedGroups || [];
  const now = Date.now();
  let changed = false;

  // 1. Process Tab Groups
  for (const group of groups) {
    const lastActive = activity[group.id];

    if (!lastActive) {
      activity[group.id] = now;
      changed = true;
      continue;
    }

    if (now - lastActive > INACTIVITY_LIMIT_MS) {
      const groupTabs = tabs.filter(t => t.groupId === group.id);
      if (groupTabs.length > 0) {
        const dump = {
          id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
          domain: group.title || 'Unnamed Group',
          color: group.color,
          tabCount: groupTabs.length,
          dumpedAt: now,
          tabs: groupTabs.map(t => ({
            url: t.url,
            title: t.title,
            favIconUrl: (t.favIconUrl && t.favIconUrl.startsWith('data:image')) ? null : t.favIconUrl
          }))
        };

        dumpedGroups.push(dump);
        delete activity[group.id];
        changed = true;

        // CRITICAL FIX: Always save to the hard drive FIRST. 
        // If Chrome crashes here, the tabs stay open. No data loss.
        await saveState(dumpedGroups, activity);
        await chrome.tabs.remove(groupTabs.map(t => t.id));
      }
    }
  }

  // 2. Process Loose / Ungrouped Tabs
  const looseTabs = tabs.filter(t => t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);
  const inactiveLooseTabs = [];

  for (const tab of looseTabs) {
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) continue;

    // Use our activity tracker, fallback to Chrome's native lastAccessed if newly loaded
    let lastActive = activity[`tab_${tab.id}`];
    if (!lastActive && tab.lastAccessed) lastActive = tab.lastAccessed;

    if (!lastActive) {
      activity[`tab_${tab.id}`] = now;
      changed = true;
      continue;
    }

    if (now - lastActive > INACTIVITY_LIMIT_MS) {
      inactiveLooseTabs.push(tab);
    }
  }

  if (inactiveLooseTabs.length > 0) {
    // Collect loose tabs by domain so we don't spam the UI with 50 individual single-tab dumps
    const looseByDomain = {};
    inactiveLooseTabs.forEach(tab => {
      try {
        const domain = new URL(tab.url).hostname.replace('www.', '');
        if (!looseByDomain[domain]) looseByDomain[domain] = [];
        looseByDomain[domain].push(tab);
      } catch (e) {
        if (!looseByDomain['system']) looseByDomain['system'] = [];
        looseByDomain['system'].push(tab);
      }
    });

    // Create dumps for these loose tabs
    for (const [domain, domainTabs] of Object.entries(looseByDomain)) {
      if (domain === 'system') continue;

      const dump = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
        domain: domain,
        color: 'grey', // default color
        tabCount: domainTabs.length,
        dumpedAt: now,
        tabs: domainTabs.map(t => ({
          url: t.url,
          title: t.title,
          favIconUrl: (t.favIconUrl && t.favIconUrl.startsWith('data:image')) ? null : t.favIconUrl
        }))
      };

      dumpedGroups.push(dump);
      domainTabs.forEach(t => delete activity[`tab_${t.id}`]);
      changed = true;

      // CRITICAL FIX: Save to hard drive BEFORE closing the tabs
      await saveState(dumpedGroups, activity);
      await chrome.tabs.remove(domainTabs.map(t => t.id));
    }
  }

  if (changed) {
    await saveState(dumpedGroups, activity);
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
  const data = await chrome.storage.local.get('groupActivity');
  const activity = data.groupActivity || {};

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
        activity[groupId] = Date.now();
      } catch (e) {
        console.error('Error grouping tabs:', e);
      }
    }
  }
  await chrome.storage.local.set({ groupActivity: activity });
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
  const data = await chrome.storage.local.get(['dumpedGroups', 'groupActivity']);
  let dumpedGroups = data.dumpedGroups || [];

  const groupIndex = dumpedGroups.findIndex(g => g.id === dumpId);
  if (groupIndex === -1) return;

  const group = dumpedGroups[groupIndex];

  const tabIds = [];
  for (const tabInfo of group.tabs) {
    const createdTab = await chrome.tabs.create({ url: tabInfo.url, active: false });
    tabIds.push(createdTab.id);
  }

  const activity = data.groupActivity || {};
  if (tabIds.length > 0) {
    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, { title: group.domain, color: group.color, collapsed: false });
    activity[groupId] = Date.now();
    dumpedGroups.splice(groupIndex, 1);
    await saveState(dumpedGroups, activity);
  }
}

async function deleteDump(dumpId) {
  const data = await chrome.storage.local.get(['dumpedGroups', 'groupActivity']);
  let dumpedGroups = data.dumpedGroups || [];
  dumpedGroups = dumpedGroups.filter(g => g.id !== dumpId);
  await saveState(dumpedGroups, data.groupActivity || {});
}

async function autoRemoveOldest() {
  const data = await chrome.storage.local.get(['dumpedGroups', 'groupActivity']);
  let dumpedGroups = data.dumpedGroups || [];

  if (dumpedGroups.length > 0) {
    // Oldest first (lowest dumpedAt timestamp)
    dumpedGroups.sort((a, b) => a.dumpedAt - b.dumpedAt);
    dumpedGroups.shift(); // Remove the oldest
    await saveState(dumpedGroups, data.groupActivity || {});
  }
}

async function importDump(importedData) {
  if (!importedData || !Array.isArray(importedData.tabs)) {
    return { success: false, error: 'Invalid group data format.' };
  }

  const data = await chrome.storage.local.get(['dumpedGroups', 'groupActivity']);
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

  await saveState(dumpedGroups, data.groupActivity || {});
  return { success: true };
}

async function hibernateGroup(groupId) {
  try {
    const numGroupId = Number(groupId);
    const tabs = await chrome.tabs.query({});
    const groupTabs = tabs.filter(t => t.groupId === numGroupId);
    if (groupTabs.length === 0) return { success: true };
    
    const group = await chrome.tabGroups.get(numGroupId);
    const data = await chrome.storage.local.get(['groupActivity', 'dumpedGroups']);
    
    const activity = data.groupActivity || {};
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
    delete activity[numGroupId];
    
    await saveState(dumpedGroups, activity);
    await chrome.tabs.remove(groupTabs.map(t => t.id));
    return { success: true };
  } catch (e) {
    console.error("Hibernate Error:", e);
    return { success: false, error: e.message };
  }
}
