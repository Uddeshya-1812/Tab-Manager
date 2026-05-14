document.addEventListener('DOMContentLoaded', async () => {
  // Navigation
  const tabActiveBtn = document.getElementById('tab-active');
  const tabDumpedBtn = document.getElementById('tab-dumped');
  const viewActive = document.getElementById('view-active');
  const viewDumped = document.getElementById('view-dumped');

  tabActiveBtn.addEventListener('click', () => {
    tabActiveBtn.classList.add('active');
    tabDumpedBtn.classList.remove('active');
    viewActive.classList.add('active');
    viewDumped.classList.remove('active');
    renderTabs();
  });

  tabDumpedBtn.addEventListener('click', () => {
    tabDumpedBtn.classList.add('active');
    tabActiveBtn.classList.remove('active');
    viewDumped.classList.add('active');
    viewActive.classList.remove('active');
    renderDumpedGroups();
  });

  // Active View Elements
  const tabCountEl = document.getElementById('tab-count');
  const tabListEl = document.getElementById('tab-list');
  const groupTabsBtn = document.getElementById('group-tabs');
  const closeDuplicatesBtn = document.getElementById('close-duplicates');

  // Dumped View Elements
  const dumpedListEl = document.getElementById('dumped-list');
  const btnImportJson = document.getElementById('btn-import-json');
  const fileImport = document.getElementById('file-import');

  btnImportJson.addEventListener('click', () => {
    fileImport.click();
  });

  fileImport.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        chrome.runtime.sendMessage({ action: 'importDump', data: json }, (response) => {
          if (response && response.success) {
            renderDumpedGroups();
          } else {
            alert(response.error || 'Failed to import JSON.');
          }
        });
      } catch (err) {
        alert('Invalid JSON file.');
      }
      fileImport.value = ''; // reset
    };
    reader.readAsText(file);
  });

  // Modal Elements
  const storageModal = document.getElementById('storage-modal');
  const btnManualRemove = document.getElementById('btn-manual-remove');
  const btnAutoRemove = document.getElementById('btn-auto-remove');

  async function checkStorageWarning() {
    const data = await chrome.storage.local.get('storageWarning');
    if (data.storageWarning) {
      storageModal.style.display = 'flex';
    } else {
      storageModal.style.display = 'none';
    }
  }

  // Check on load
  checkStorageWarning();
  
  // Listen to changes in storage to update UI automatically
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.storageWarning) {
      if (changes.storageWarning.newValue) {
        storageModal.style.display = 'flex';
      } else {
        storageModal.style.display = 'none';
      }
    }
  });

  btnManualRemove.addEventListener('click', () => {
    storageModal.style.display = 'none';
    tabDumpedBtn.click(); // switch to dumped view
  });

  btnAutoRemove.addEventListener('click', () => {
    btnAutoRemove.disabled = true;
    chrome.runtime.sendMessage({ action: 'autoRemoveOldest' }, () => {
      btnAutoRemove.disabled = false;
      if (viewDumped.classList.contains('active')) {
        renderDumpedGroups();
      }
    });
  });

  const defaultIcon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5NGEzYjgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCI+PC9jaXJjbGU+PGxpbmUgeDE9IjEyIiB5MT0iOCIgeDI9IjEyIiB5Mj0iMTIiPjwvbGluZT48bGluZSB4MT0iMTIiIHkxPSIxNiIgeDI9IjEyLjAxIiB5Mj0iMTYiPjwvbGluZT48L3N2Zz4=';

  async function renderTabs() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    
    tabCountEl.textContent = tabs.length;
    tabListEl.innerHTML = '';
    
    // Render Active Tab Groups
    groups.forEach(group => {
      const groupTabs = tabs.filter(t => t.groupId === group.id);
      
      const li = document.createElement('li');
      li.className = 'list-item';
      li.style.borderLeft = `3px solid ${group.color}`; // highlight color
      li.style.backgroundColor = 'rgba(255,255,255,0.05)';

      const content = document.createElement('div');
      content.className = 'item-content';
      
      const title = document.createElement('span');
      title.className = 'item-title';
      title.textContent = `Group: ${group.title || 'Unnamed'} (${groupTabs.length} tabs)`;
      content.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'item-actions';

      const dumpBtn = document.createElement('button');
      dumpBtn.className = 'icon-btn';
      // Download/Save icon
      dumpBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>'; 
      dumpBtn.title = "Hibernate Group Manually";
      dumpBtn.onclick = (e) => {
        e.stopPropagation();
        dumpBtn.disabled = true; // prevent double click
        chrome.runtime.sendMessage({ action: 'hibernateGroup', groupId: group.id }, (res) => {
          if (chrome.runtime.lastError || (res && !res.success)) {
            alert("Error hibernating: " + (chrome.runtime.lastError?.message || res?.error));
            dumpBtn.disabled = false;
          } else {
            // Automatically switch to the "Saved Groups" view so the user explicitly sees the result!
            document.getElementById('tab-dumped').click();
          }
        });
      };

      actions.appendChild(dumpBtn);
      li.appendChild(content);
      li.appendChild(actions);
      tabListEl.appendChild(li);
    });

    // Render Loose Tabs
    const looseTabs = tabs.filter(t => t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);
    looseTabs.forEach(tab => {
      const li = document.createElement('li');
      li.className = 'list-item';
      li.style.cursor = 'pointer';
      
      const favicon = document.createElement('img');
      favicon.className = 'item-icon';
      favicon.src = tab.favIconUrl || defaultIcon;
      favicon.onerror = () => { favicon.src = defaultIcon; };

      const content = document.createElement('div');
      content.className = 'item-content';
      
      const title = document.createElement('span');
      title.className = 'item-title';
      title.textContent = tab.title;
      title.title = tab.title;

      content.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'item-actions';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'icon-btn delete';
      closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      closeBtn.title = "Close Tab";
      
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        chrome.tabs.remove(tab.id, () => {
          setTimeout(renderTabs, 50);
        });
      };

      actions.appendChild(closeBtn);

      li.onclick = () => chrome.tabs.update(tab.id, { active: true });

      li.appendChild(favicon);
      li.appendChild(content);
      li.appendChild(actions);
      tabListEl.appendChild(li);
    });
  }

  async function renderDumpedGroups() {
    const data = await chrome.storage.local.get('dumpedGroups');
    const dumpedGroups = data.dumpedGroups || [];
    
    dumpedListEl.innerHTML = '';

    if (dumpedGroups.length === 0) {
      dumpedListEl.innerHTML = '<div class="empty-state">No saved groups found. Groups inactive will appear here.</div>';
      return;
    }

    // Sort by dumpedAt descending
    dumpedGroups.sort((a, b) => b.dumpedAt - a.dumpedAt);

    dumpedGroups.forEach(group => {
      const li = document.createElement('li');
      li.className = 'list-item';

      const content = document.createElement('div');
      content.className = 'item-content';
      
      const title = document.createElement('span');
      title.className = 'item-title';
      title.textContent = group.domain + ' (' + group.tabCount + ' tabs)';
      
      const subtitle = document.createElement('span');
      subtitle.className = 'item-subtitle';
      subtitle.textContent = 'Saved: ' + new Date(group.dumpedAt).toLocaleString();

      content.appendChild(title);
      content.appendChild(subtitle);

      const actions = document.createElement('div');
      actions.className = 'item-actions';

      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'icon-btn restore';
      restoreBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 8 15 11"></polyline><line x1="12" y1="8" x2="12" y2="22"></line><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path></svg>';
      restoreBtn.title = "Restore Group";
      restoreBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: 'restoreGroup', dumpId: group.id }, () => {
          renderDumpedGroups();
        });
      };

      const exportBtn = document.createElement('button');
      exportBtn.className = 'icon-btn';
      exportBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
      exportBtn.title = "Export to JSON File";
      exportBtn.onclick = () => {
        const blob = new Blob([JSON.stringify(group, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tab-group-${group.domain}.json`;
        a.click();
        URL.revokeObjectURL(url);
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn delete';
      deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      deleteBtn.title = "Delete Saved Group";
      deleteBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: 'deleteDump', dumpId: group.id }, () => {
          renderDumpedGroups();
        });
      };

      actions.appendChild(restoreBtn);
      actions.appendChild(exportBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(content);
      li.appendChild(actions);
      dumpedListEl.appendChild(li);
    });
  }

  // Initial load
  renderTabs();

  // Listeners to auto-refresh view if active
  const refreshIfActive = () => {
    if (viewActive.classList.contains('active')) renderTabs();
  };
  chrome.tabs.onUpdated.addListener(refreshIfActive);
  chrome.tabs.onRemoved.addListener(refreshIfActive);

  groupTabsBtn.addEventListener('click', () => {
    groupTabsBtn.disabled = true;
    chrome.runtime.sendMessage({ action: 'groupTabs' }, () => {
      groupTabsBtn.disabled = false;
      refreshIfActive();
    });
  });

  closeDuplicatesBtn.addEventListener('click', () => {
    closeDuplicatesBtn.disabled = true;
    chrome.runtime.sendMessage({ action: 'closeDuplicates' }, () => {
      closeDuplicatesBtn.disabled = false;
      refreshIfActive();
    });
  });
});
