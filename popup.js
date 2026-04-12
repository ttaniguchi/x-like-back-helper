/**
 * Side Panel Script for X Liked-back Helper
 */

document.addEventListener('DOMContentLoaded', async () => {
  // --- Element Cache ---
  const els = {
    likesView: document.getElementById('likes-view'),
    userList: document.getElementById('user-list'),
    status: document.getElementById('current-status'),
    listCount: document.getElementById('list-count'),
    resetBtn: document.getElementById('reset-btn'),
    showDoneToggle: document.getElementById('show-done-toggle'),
    auditView: document.getElementById('audit-view'),
    auditList: document.getElementById('audit-list'),
    auditStatus: document.getElementById('audit-status'),
    auditCount: document.getElementById('audit-count'),
    resetAuditBtn: document.getElementById('reset-audit-btn'),
    selfIcon: document.getElementById('self-icon-header'),
    themeToggle: document.getElementById('theme-toggle'),
    likeBtn: document.getElementById('like-top-btn'),
    prevBtn: document.getElementById('prev-post-btn'),
    nextBtn: document.getElementById('next-post-btn')
  };

  let isUpdatingLocally = false;
  let currentTab = 'likes'; // This will be managed automatically now
  
  // --- Theme ---
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    els.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  };
  chrome.storage.local.get(['theme'], (res) => {
    const theme = res.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
  });
  els.themeToggle.onclick = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    chrome.storage.local.set({ theme: next });
  };

  // --- Persistence & Messaging ---
  const safeSendMessage = async (action, payload = {}, callback = null) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.match(/x\.com|twitter\.com/)) return;
    chrome.tabs.sendMessage(tab.id, { action, ...payload }, (res) => {
      if (chrome.runtime.lastError) {
        if (['LIKE_TOP_TWEET', 'NEXT_POST', 'PREV_POST'].includes(action)) els.status.textContent = '⛔ 要リロード';
        return;
      }
      if (callback) callback(res);
    });
  };

  const setView = (tab) => {
    if (currentTab === tab) return;
    currentTab = tab;
    els.likesView.style.display = tab === 'likes' ? 'flex' : 'none';
    els.auditView.style.display = tab === 'audit' ? 'flex' : 'none';
    loadAll();
  };

  // --- UI Update Logic ---
  const checkPageStatus = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const url = tab.url;
    
    // Automatic View Switching
    const isFollowing = URL_PATTERNS.FOLLOWING_LIST.test(url);
    const isLikes = URL_PATTERNS.LIKES_PAGE.test(url);
    const isPost = URL_PATTERNS.POST_DETAIL.test(url) && !isLikes && !url.includes('/analytics');

    if (isFollowing) setView('audit');
    else setView('likes');

    // Likes Status
    if (isLikes) {
      els.status.innerHTML = `スクロールして取得中 <span style="font-size:0.7rem;opacity:0.6;">(${url.split('/').pop()})</span>`;
    } else if (isPost) {
      els.status.innerHTML = `<span class="link-btn" id="go-likes">いいね一覧へ ❤️</span>`;
      document.getElementById('go-likes').onclick = () => chrome.tabs.update({ url: `${url.match(/.*\/status\/\d+/)[0]}/likes` });
    } else els.status.textContent = ''; // Clear status

    // Audit Status
    if (isFollowing) els.auditStatus.textContent = 'スキャン中...';
    else els.auditStatus.textContent = '';

    const eligible = isLikes || isPost || /home|search/.test(url);
    [els.likeBtn, els.prevBtn, els.nextBtn].forEach(b => b.disabled = !eligible);
  };

  // --- Rendering ---
  const createUserItem = (user, isAudit = false, idx = null) => {
    const item = document.createElement('div');
    item.className = `user-item ${user.done ? 'is-done' : ''}`;
    
    if (isAudit) {
      item.innerHTML = `
        <div class="audit-header">
          <div class="user-avatar" style="background-image:url('${user.avatar}')"></div>
          <div class="user-info">
            <div class="user-name-row"><span class="user-name">${user.name}</span><span class="audit-badge">ワンウェイ</span></div>
            <span class="user-handle">${user.handle}</span>
          </div>
        </div>`;
    } else {
      let label = ['mutual', 'follower', 'following'].includes(user.followStatus) ? {mutual:'🤝', follower:'💙', following:'🔖'}[user.followStatus] : '👤';
      if (user.done) label = '済';
      else if (idx === 0) label += '(N)';
      item.innerHTML = `
        <div class="user-avatar" style="background-image:url('${user.avatar}')"></div>
        <div class="user-info">
          <div class="user-name-row"><span class="user-name">${user.name}</span></div>
          <span class="user-handle">${user.handle}</span>
        </div>
        <span class="action-label-flat">${label}</span>`;
    }

    item.onclick = () => {
      if (!isAudit && !user.done) markAsDone(idx);
      chrome.tabs.update({ url: `https://x.com/${user.handle.replace('@', '')}` });
    };
    return item;
  };

  const loadAll = () => {
    chrome.storage.local.get([STORAGE_KEYS.USER_LIST, STORAGE_KEYS.UNREQUITED_LIST, STORAGE_KEYS.SELF_INFO], (res) => {
      if (currentTab === 'likes') {
        const users = res[STORAGE_KEYS.USER_LIST] || [];
        const showDone = els.showDoneToggle?.checked;
        const visible = users.filter(u => showDone || !u.done);
        if (els.listCount) els.listCount.textContent = `${users.filter(u => !u.done).length} / ${users.length}`;
        els.userList.innerHTML = '';
        visible.forEach((u, i) => els.userList.appendChild(createUserItem(u, false, users.indexOf(u))));
        if (!visible.length) els.userList.innerHTML = '<div class="empty-state">リストが空です</div>';
      } else {
        const users = res[STORAGE_KEYS.UNREQUITED_LIST] || [];
        if (els.auditCount) els.auditCount.textContent = users.length;
        els.auditList.innerHTML = '';
        users.forEach(u => els.auditList.appendChild(createUserItem(u, true)));
        if (!users.length) els.auditList.innerHTML = '<div class="empty-state">ワンウェイはいません</div>';
      }
      if (res[STORAGE_KEYS.SELF_INFO]?.avatar && els.selfIcon) {
        Object.assign(els.selfIcon.style, { backgroundImage: `url('${res[STORAGE_KEYS.SELF_INFO].avatar}')`, backgroundSize: 'cover' });
        els.selfIcon.textContent = '';
      }
    });
  };

  const markAsDone = (idx) => {
    chrome.storage.local.get([STORAGE_KEYS.USER_LIST], (res) => {
      const list = res[STORAGE_KEYS.USER_LIST] || [];
      if (list[idx]) {
        list[idx].done = true;
        isUpdatingLocally = true;
        chrome.storage.local.set({ [STORAGE_KEYS.USER_LIST]: list }, () => { isUpdatingLocally = false; loadAll(); });
      }
    });
  };

  // --- Handlers ---
  els.likeBtn.onclick = () => safeSendMessage(ACTIONS.LIKE_TOP_TWEET, {}, r => { if (r.message) els.status.textContent = r.message; });
  els.prevBtn.onclick = () => safeSendMessage(ACTIONS.PREV_POST);
  els.nextBtn.onclick = () => safeSendMessage(ACTIONS.NEXT_POST);
  els.resetBtn.onclick = () => confirm('リセット？') && chrome.storage.local.set({ [STORAGE_KEYS.USER_LIST]: [] }, loadAll);
  els.resetAuditBtn.onclick = () => confirm('ワンウェイリセット？') && chrome.storage.local.set({ [STORAGE_KEYS.UNREQUITED_LIST]: [] }, loadAll);
  if (els.showDoneToggle) els.showDoneToggle.onchange = loadAll;

  const updateFocusUI = () => {
    const focused = document.hasFocus();
    document.body.classList.toggle('is-inactive', !focused);
    safeSendMessage(ACTIONS.UPDATE_FOCUS_STATE, { focused });
  };

  document.onkeydown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (currentTab !== 'likes') return;

    const k = e.key.toLowerCase();
    if (k === 'n') {
      const btn = document.getElementById('go-likes') || els.userList.querySelector('.user-item:not(.is-done)');
      btn?.click();
    } else if (['l', 'j', 'k'].includes(k)) {
      const btnMap = { l: els.likeBtn, j: els.nextBtn, k: els.prevBtn };
      const btn = btnMap[k];
      if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
    }
  };

  // --- Setup ---
  chrome.storage.onChanged.addListener((c, ns) => ns === 'local' && !isUpdatingLocally && loadAll());
  chrome.tabs.onUpdated.addListener((_, c) => (c.url || c.status === 'complete') && checkPageStatus());
  chrome.tabs.onActivated.addListener(checkPageStatus);
  window.onfocus = window.onblur = updateFocusUI;

  loadAll();
  setView('likes');
  setTimeout(checkPageStatus, 200);
});
