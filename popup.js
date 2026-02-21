document.addEventListener('DOMContentLoaded', () => {
  const userListContainer = document.getElementById('user-list');
  const statusElement = document.getElementById('current-status');
  const fetchBtn = document.getElementById('fetch-btn');
  const resetBtn = document.getElementById('reset-btn');
  const showDoneToggle = document.getElementById('show-done-toggle');
  const selfIcon = document.getElementById('self-icon');

  // Initialization
  loadList();
  loadSelfInfo();
  autoRefreshSelfInfo();

  /**
   * Attempt to fetch self-account info whenever popup opens
   */
  function autoRefreshSelfInfo() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('x.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_SELF_INFO' }, (response) => {
          if (response && response.selfInfo) {
            saveSelfInfo(response.selfInfo);
          }
        });
      }
    });
  }

  /**
   * Main fetch action
   */
  fetchBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab.url.includes('/status/') && activeTab.url.includes('/likes')) {
        statusElement.textContent = '解析中...';
        chrome.tabs.sendMessage(activeTab.id, { action: 'SCAN_LIKERS' }, (response) => {
          if (chrome.runtime.lastError) {
            showReloadPrompt('接続が切れました。ページを再読み込みしますか？');
            return;
          }
          if (response) {
            if (response.users) saveUsers(response.users);
            if (response.selfInfo) saveSelfInfo(response.selfInfo);
          }
        });
      } else {
        // Fallback: Refresh self-info even if not on likes page
        chrome.tabs.sendMessage(activeTab.id, { action: 'GET_SELF_INFO' }, (response) => {
          if (!chrome.runtime.lastError && response && response.selfInfo) {
            saveSelfInfo(response.selfInfo);
          }
        });
        statusElement.textContent = '「いいね」一覧ページを開いてください';
      }
    });
  });

  /**
   * UI Error recovery
   */
  function showReloadPrompt(message) {
    statusElement.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
        <span style="font-size: 0.8rem; color: var(--text-color); font-weight: 500;">${message}</span>
        <button id="reload-active-tab-btn" class="action-btn secondary" style="padding: 6px 16px; font-size: 0.75rem; border-radius: 6px;">ページを更新する</button>
      </div>
    `;
    const reloadBtn = document.getElementById('reload-active-tab-btn');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.reload(tabs[0].id, {}, () => {
              window.close();
            });
          }
        });
      });
    }
  }

  /**
   * Self-account Icon Click (Home Navigation)
   */
  selfIcon.addEventListener('click', () => {
    chrome.storage.local.get(['selfInfo'], (result) => {
      let handle = result.selfInfo?.handle;
      const targetUrl = handle ? `https://x.com/${handle.replace('@', '')}` : 'https://x.com/home';
      chrome.tabs.update({ url: targetUrl });
      window.close();
    });
  });

  function saveSelfInfo(info) {
    chrome.storage.local.set({ selfInfo: info }, () => {
      displaySelfInfo(info);
    });
  }

  function loadSelfInfo() {
    chrome.storage.local.get(['selfInfo'], (result) => {
      if (result.selfInfo) displaySelfInfo(result.selfInfo);
    });
  }

  function displaySelfInfo(info) {
    if (info && info.avatar) {
      Object.assign(selfIcon.style, {
        backgroundImage: `url('${info.avatar}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        border: '1px solid rgba(255,255,255,0.5)'
      });
      selfIcon.textContent = '';
    } else {
      selfIcon.style.backgroundImage = 'none';
      selfIcon.textContent = 'HOME';
    }
  }

  /**
   * Global Reset
   */
  resetBtn.addEventListener('click', () => {
    if (confirm('リストをリセットしますか？')) {
      chrome.storage.local.set({ userList: [] }, () => {
        renderUserList([]);
        statusElement.textContent = 'リセットしました';
      });
    }
  });

  showDoneToggle.addEventListener('change', () => {
    loadList();
  });

  /**
   * Save and merge users into the persistent list
   */
  function saveUsers(newUsers) {
    chrome.storage.local.get(['userList'], (result) => {
      const existingList = result.userList || [];
      const userMap = new Map(existingList.map(u => [u.handle, u]));
      
      let addedCount = 0;
      newUsers.forEach(u => {
        if (!userMap.has(u.handle)) {
          userMap.set(u.handle, { ...u, done: false });
          addedCount++;
        } else {
          const existing = userMap.get(u.handle);
          userMap.set(u.handle, { ...existing, followStatus: u.followStatus });
        }
      });
      
      const updatedList = Array.from(userMap.values());
      chrome.storage.local.set({ userList: updatedList }, () => {
        renderUserList(updatedList);
        statusElement.textContent = `新規${addedCount}件を追加（合計${updatedList.length}件）`;
      });
    });
  }

  function loadList() {
    chrome.storage.local.get(['userList'], (result) => {
      renderUserList(result.userList || []);
    });
  }

  /**
   * Render the scrollable user list with filtering and animations
   */
  function renderUserList(users) {
    const showDone = showDoneToggle.checked;
    const filteredVisible = users.filter(u => showDone || !u.done);

    if (filteredVisible.length === 0) {
      userListContainer.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px; color: var(--secondary-text); font-size: 0.8rem;">リストは空です</div>';
      return;
    }

    userListContainer.innerHTML = '';
    
    users.forEach((user, originalIndex) => {
      if (!showDone && user.done) return;

      const userItem = document.createElement('div');
      userItem.className = `user-item ${user.done ? 'is-done' : ''}`;
      
      const statusEmoji = {
        'mutual': '🤝',
        'follower': '💙',
        'following': '🔖',
        'none': ''
      }[user.followStatus || 'none'];

      userItem.innerHTML = `
        <div class="user-avatar" style="background-image: url('${user.avatar}'); background-size: cover; border: 1px solid rgba(0,0,0,0.1);"></div>
        <div class="user-info">
          <span class="user-name">${user.name} ${statusEmoji}</span>
          <span class="user-handle">${user.handle}</span>
        </div>
        <button class="action-btn" data-handle="${user.handle}" data-index="${originalIndex}">${user.done ? '済' : 'お返し'}</button>
      `;
      
      const btn = userItem.querySelector('.action-btn');
      if (!user.done) {
        btn.addEventListener('click', (e) => {
          const handle = e.target.getAttribute('data-handle');
          const idx = e.target.getAttribute('data-index');
          
          userItem.classList.add('removing');
          markAsDone(idx, false);
          
          setTimeout(() => {
            const targetUrl = `https://x.com/${handle.replace('@', '')}/media`;
            chrome.tabs.update({ url: targetUrl });
            window.close();
          }, 500);
        });
      }

      userListContainer.appendChild(userItem);
    });
  }

  function markAsDone(index, shouldRender = true) {
    chrome.storage.local.get(['userList'], (result) => {
      const list = result.userList || [];
      if (list[index]) {
        list[index].done = true;
        chrome.storage.local.set({ userList: list }, () => {
          if (shouldRender) renderUserList(list);
        });
      }
    });
  }
});
