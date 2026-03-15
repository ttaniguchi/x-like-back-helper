/**
 * Side Panel Script for X Liked-back Helper
 */

document.addEventListener('DOMContentLoaded', async () => {
  // --- Element Cache ---
  const els = {
    userList: document.getElementById('user-list'),
    status: document.getElementById('current-status'),
    listCount: document.getElementById('list-count'),
    resetBtn: document.getElementById('reset-btn'),
    showDoneToggle: document.getElementById('show-done-toggle'),
    selfIcon: document.getElementById('self-icon-header'),
    themeToggle: document.getElementById('theme-toggle'),
    likeBtn: document.getElementById('like-top-btn'),
    prevBtn: document.getElementById('prev-post-btn'),
    nextBtn: document.getElementById('next-post-btn')
  };

  let isUpdatingLocally = false;
  
  // --- Theme Management ---
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    els.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  };

  const loadTheme = () => {
    chrome.storage.local.get(['theme'], (res) => {
      if (res.theme) {
        applyTheme(res.theme);
      } else {
        const wantsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(wantsDark ? 'dark' : 'light');
      }
    });
  };

  const toggleTheme = () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    chrome.storage.local.set({ theme: newTheme });
  };

  // --- Helpers ---
  const getActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  };

  const safeSendMessage = async (action, payload = null, callback = null) => {
    if (typeof payload === 'function') {
      callback = payload;
      payload = null;
    }
    const tab = await getActiveTab();
    if (!tab?.id || (!tab.url?.includes('x.com') && !tab.url?.includes('twitter.com'))) return;
    
    try {
      chrome.tabs.sendMessage(tab.id, { action, ...payload }, (res) => {
        if (chrome.runtime.lastError) {
          if ([ACTIONS.LIKE_TOP_TWEET, ACTIONS.NEXT_POST, ACTIONS.PREV_POST].includes(action)) {
            els.status.textContent = '⛔ ページを一度リロードしてください';
          }
          return;
        }
        if (callback && res) callback(res);
      });
    } catch (e) {}
  };

  // --- Focus Management ---
  const updateFocusUI = () => {
    const focused = document.hasFocus();
    document.body.classList.toggle('is-inactive', !focused);
    safeSendMessage(ACTIONS.UPDATE_FOCUS_STATE, { focused });
  };

  // --- UI Update Logic ---
  const checkPageStatus = async () => {
    try {
      const tab = await getActiveTab();
      if (!tab?.url) return;
      
      const url = tab.url;
      const path = new URL(url).pathname.split('/').filter(p => p);
      
      const isLikes = URL_PATTERNS.LIKES_PAGE.test(url);
      const isPost = URL_PATTERNS.POST_DETAIL.test(url) && !isLikes && !url.includes('/analytics');
      const isProfile = path.length >= 1 && 
                        !['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'bookmarks'].includes(path[0]) &&
                        !isPost && !isLikes;

      const isEligible = (isProfile || URL_PATTERNS.HOME.test(url) || URL_PATTERNS.SEARCH.test(url)) && 
                         !URL_PATTERNS.EXPLORE.test(url);

      // Update Messages
      if (isLikes) {
        let label = 'いいね';
        if (url.includes('/retweets')) label = 'リポスト';
        else if (url.includes('/quotes')) label = '引用';
        els.status.innerHTML = `画面をスクロールしてください<br><span style="font-size: 0.7rem; color: var(--secondary-text);">(${label}したユーザーを取得します)</span>`;
      } else if (isPost) {
        els.status.innerHTML = `
          <div style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px; color: var(--primary-color);" id="inline-goto-likes">
            <span style="font-weight: bold; text-decoration: underline;">いいね一覧へ移動</span>
            <span style="font-size: 1rem;">❤️</span>
          </div>`;
        document.getElementById('inline-goto-likes').onclick = () => {
          const match = url.match(/(https:\/\/(?:x|twitter)\.com\/\w+\/status\/\d+)/);
          if (match) chrome.tabs.update({ url: `${match[1]}/likes` });
        };
      } else {
        const isX = url.includes('x.com') || url.includes('twitter.com');
        if (isEligible) {
          els.status.innerHTML = 'プロフィール / タイムラインを表示中';
        } else if (isX) {
          els.status.innerHTML = 'ポスト一覧ページを開いてください';
        } else {
          els.status.innerHTML = `
            <div style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px; color: var(--primary-color);" id="inline-goto-x">
              <span style="font-weight: bold; text-decoration: underline;">X.comを開いてください</span>
            </div>`;
          document.getElementById('inline-goto-x').onclick = () => {
            chrome.tabs.create({ url: 'https://x.com/home' });
          };
        }
      }

      // Update Button States
      [els.likeBtn, els.prevBtn, els.nextBtn].forEach(btn => { if (btn) btn.disabled = !isEligible; });

    } catch (err) {}
  };

  const refreshSelfInfo = async () => {
    const tab = await getActiveTab();
    if (tab?.id && tab.url?.includes('x.com')) {
      chrome.tabs.sendMessage(tab.id, { action: ACTIONS.GET_SELF_INFO }, (res) => {
        if (res?.selfInfo) {
          chrome.storage.local.set({ [STORAGE_KEYS.SELF_INFO]: res.selfInfo }, () => renderSelfInfo(res.selfInfo));
        }
      });
    }
  };

  const renderSelfInfo = (info) => {
    if (info?.avatar && els.selfIcon) {
      Object.assign(els.selfIcon.style, {
        backgroundImage: `url('${info.avatar}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      });
      els.selfIcon.textContent = '';
    }
  };

  const renderUserList = (users) => {
    if (!els.userList) return;
    const showDone = els.showDoneToggle?.checked;
    const remaining = users.filter(u => !u.done).length;
    
    if (els.listCount) els.listCount.textContent = `${remaining} / ${users.length}`;
    
    els.userList.innerHTML = '';
    let isFirst = true;

    users.forEach((user, idx) => {
      if (!showDone && user.done) return;
      
      const item = document.createElement('div');
      item.className = `user-item ${user.done ? 'is-done' : ''}`;
      
      let label = 'HOME';
      if (user.done) label = '済';
      else if (isFirst) { label = 'HOME(N)'; isFirst = false; }

      item.innerHTML = `
        <div class="user-avatar" style="background-image: url('${user.avatar}')"></div>
        <div class="user-info">
          <span class="user-name">${user.name}</span>
          <span class="user-handle">${user.handle}</span>
        </div>
        <span class="action-label-flat">${label}</span>`;

      if (!user.done) {
        item.onclick = () => {
          markAsDone(idx);
          chrome.tabs.update({ url: `https://x.com/${user.handle.replace('@', '')}` });
        };
      }
      els.userList.appendChild(item);
    });

    if (!els.userList.innerHTML) {
      els.userList.innerHTML = 
        '<div style="text-align:center;padding:20px;font-size:0.8rem;color:var(--secondary-text);line-height:1.6;">' +
          '<div style="margin-bottom: 8px; font-weight: bold; color: var(--text-color);">自分のポストを選んで、<br>アクティビティをチェック！</div>' +
          '<div>「いいね」「リポスト」「引用」一覧から<br>リストを取得できます。</div>' +
        '</div>';
    }
  };

  const markAsDone = (idx) => {
    chrome.storage.local.get([STORAGE_KEYS.USER_LIST], (res) => {
      const list = res[STORAGE_KEYS.USER_LIST] || [];
      if (list[idx]) {
        list[idx].done = true;
        isUpdatingLocally = true;
        chrome.storage.local.set({ [STORAGE_KEYS.USER_LIST]: list }, () => {
          setTimeout(() => { isUpdatingLocally = false }, 100);
          renderUserList(list);
        });
      }
    });
  };

  const loadAll = () => {
    chrome.storage.local.get([STORAGE_KEYS.USER_LIST, STORAGE_KEYS.SELF_INFO], (res) => {
      renderUserList(res[STORAGE_KEYS.USER_LIST] || []);
      renderSelfInfo(res[STORAGE_KEYS.SELF_INFO]);
    });
  };

  // --- Event Listeners ---
  window.addEventListener('focus', updateFocusUI);
  window.addEventListener('blur', updateFocusUI);
  updateFocusUI();

  els.likeBtn?.addEventListener('click', () => {
    safeSendMessage(ACTIONS.LIKE_TOP_TWEET, (res) => {
      if (res.message) els.status.textContent = res.message.replace('ツイート', 'ポスト');
    });
  });

  els.prevBtn?.addEventListener('click', () => safeSendMessage(ACTIONS.PREV_POST));
  els.nextBtn?.addEventListener('click', () => safeSendMessage(ACTIONS.NEXT_POST));

  els.resetBtn?.addEventListener('click', () => {
    if (confirm('リセットしますか？')) {
      chrome.storage.local.set({ [STORAGE_KEYS.USER_LIST]: [] }, () => {
        renderUserList([]);
        els.status.textContent = 'リセットしました';
      });
    }
  });

  els.showDoneToggle?.addEventListener('change', loadAll);

  els.selfIcon?.addEventListener('click', () => {
    chrome.storage.local.get([STORAGE_KEYS.SELF_INFO], (res) => {
      const handle = res[STORAGE_KEYS.SELF_INFO]?.handle;
      chrome.tabs.update({ url: handle ? `https://x.com/${handle.replace('@', '')}` : 'https://x.com/home' });
    });
  });

  els.themeToggle?.addEventListener('click', toggleTheme);

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    
    if (key === 'n') {
      const gotoLikes = document.getElementById('inline-goto-likes');
      if (gotoLikes) gotoLikes.click();
      else els.userList?.querySelector('.user-item:not(.is-done)')?.click();
    }
    else if (key === 'r') els.resetBtn?.click();
    else if (key === 'd') els.showDoneToggle?.click();
    else if (/^[1-9]$/.test(key)) {
      const visible = els.userList?.querySelectorAll('.user-item:not(.is-done)');
      visible?.[parseInt(key) - 1]?.click();
    }
    else if (['l', 'j', 'k'].includes(key)) {
      const map = { l: els.likeBtn, j: els.nextBtn, k: els.prevBtn };
      const btn = map[key];
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    }
  });

  // Chrome Events
  chrome.storage.onChanged.addListener((changes, ns) => {
    if (ns === 'local' && changes[STORAGE_KEYS.USER_LIST] && !isUpdatingLocally) loadAll();
  });

  chrome.tabs.onUpdated.addListener((_, change) => {
    if (change.url || change.status === 'complete') { 
      checkPageStatus(); 
      refreshSelfInfo(); 
      updateFocusUI();
    }
  });

  chrome.tabs.onActivated.addListener(() => {
    checkPageStatus();
    updateFocusUI();
  });
  chrome.windows.onFocusChanged.addListener((winId) => {
    if (winId !== chrome.windows.WINDOW_ID_NONE) checkPageStatus();
  });

  // --- Initial Start ---
  loadTheme();
  loadAll();
  refreshSelfInfo();
  setTimeout(checkPageStatus, 200);
});
