/**
 * Content Script for X Liked-back Helper
 */

// --- Message Handler ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action } = request;

  switch (action) {
    case ACTIONS.SCAN_LIKERS:
      const users = scanLikesPage();
      const selfInfo = getSelfInfo();
      saveUsersToStorage(users);
      sendResponse({ users, selfInfo });
      break;
    case ACTIONS.GET_SELF_INFO:
      sendResponse({ selfInfo: getSelfInfo() });
      break;
    case ACTIONS.LIKE_TOP_TWEET:
      sendResponse(likeTopTweet());
      break;
    case ACTIONS.NEXT_POST:
      sendResponse(navigatePost(1));
      break;
    case ACTIONS.PREV_POST:
      sendResponse(navigatePost(-1));
      break;
    case ACTIONS.UPDATE_FOCUS_STATE:
      isSidePanelActive = request.focused;
      updatePreviewHighlight();
      break;
  }
  return true;
});

// --- UI Indicators & Styles ---
const style = document.createElement('style');
style.textContent = `
  @keyframes x-like-helper-ripple {
    0% { transform: scale(0.5); opacity: 1; }
    100% { transform: scale(2.5); opacity: 0; }
  }
  .x-like-helper-highlight {
    position: fixed;
    border: 4px solid #1d9bf0;
    border-radius: 50%;
    pointer-events: none;
    z-index: 9999;
    animation: x-like-helper-ripple 0.8s ease-out;
  }
  .x-like-helper-target-indicator {
    position: fixed;
    border: 2px dashed #1d9bf0;
    background: rgba(29, 155, 240, 0.05);
    pointer-events: none;
    z-index: 9998;
    transition: all 0.1s ease-out;
    opacity: 0;
    border-radius: 4px;
  }
`;
document.head.appendChild(style);

const indicator = document.createElement('div');
indicator.className = 'x-like-helper-target-indicator';
document.body.appendChild(indicator);

// --- State & Observing ---
let isObserving = false;
let observer = null;
let scanTimeout = null;
let currentUrl = window.location.href;
let navIndexOffset = 0;
let lastScrollY = window.scrollY;
let isSidePanelActive = false;
let scrollTimeout = null;

function checkUrlAndObserve() {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    navIndexOffset = 0; 
  }
  
  const url = window.location.href;
  const isLikes = URL_PATTERNS.LIKES_PAGE.test(url);
  const isFollowingList = URL_PATTERNS.FOLLOWING_LIST.test(url);

  if (isLikes || isFollowingList) {
    if (!isObserving) startObserving(isLikes ? 'likes' : 'following');
  } else if (isObserving) {
    stopObserving();
  }
}

function startObserving(mode) {
  isObserving = true;
  observer = new MutationObserver(() => {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      if (mode === 'likes') {
        const users = scanLikesPage();
        if (users.length > 0) saveUsersToStorage(users);
      } else {
        // Capture ONLY "unrequited follows" (I follow them, they don't follow back)
        const users = scanFollowingPage();
        if (users.length > 0) saveAuditUsersToStorage(users);
      }
    }, UI_CONFIG.DEBOUNCE_SCAN_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserving() {
  isObserving = false;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// --- Data Extraction Helpers ---
function extractUserFromCell(cell) {
  try {
    const spans = Array.from(cell.querySelectorAll('span'));
    const handleSpan = spans.find(s => {
      const t = s.textContent.trim();
      return t.startsWith('@') && t.length > 1;
    });
    
    if (!handleSpan) return null;
    const handle = handleSpan.textContent.trim();
    
    const avatarImg = cell.querySelector('img[src*="profile_images"]');
    const avatar = avatarImg ? avatarImg.src : '';
    
    const fullText = cell.innerText || cell.textContent;
    const isFollower = fullText.includes('Follows you') || fullText.includes('フォローされています');
    const isFollowing = fullText.includes('Following') || fullText.includes('フォロー中');
    
    let followStatus = 'none';
    if (isFollower && isFollowing) followStatus = 'mutual';
    else if (isFollower) followStatus = 'follower';
    else if (isFollowing) followStatus = 'following';

    let name = '';
    for (let s of spans) {
      const t = s.textContent.trim();
      if (t && t !== handle && !/Follow|フォロー|認証済み|Verified/.test(t)) {
        name = t;
        break;
      }
    }
    
    return { name, handle, avatar, followStatus };
  } catch (e) {
    return null;
  }
}

// --- Page Scanners ---
function scanLikesPage() {
  const container = document.querySelector(SELECTORS.PRIMARY_COLUMN) || document;
  const cells = Array.from(container.querySelectorAll(SELECTORS.USER_CELL));
  const users = cells.map(extractUserFromCell).filter(Boolean).map(u => ({ ...u, done: false }));
  return Array.from(new Map(users.map(u => [u.handle, u])).values());
}

function scanFollowingPage() {
  const container = document.querySelector(SELECTORS.PRIMARY_COLUMN) || document;
  const cells = Array.from(container.querySelectorAll(SELECTORS.USER_CELL));
  // Filter for ONLY "Unrequited" (following: true, followedBy: false)
  return cells.map(extractUserFromCell)
             .filter(u => u && u.followStatus === 'following');
}

// --- Data Storage ---
function saveUsersToStorage(newUsers) {
  if (!newUsers?.length) return;
  chrome.storage.local.get([STORAGE_KEYS.USER_LIST], (result) => {
    const userMap = new Map((result[STORAGE_KEYS.USER_LIST] || []).map(u => [u.handle, u]));
    newUsers.forEach(u => {
      const existing = userMap.get(u.handle) || {};
      userMap.set(u.handle, { 
        ...existing, 
        ...u, 
        done: existing.done || false,
        followStatus: u.followStatus !== 'none' ? u.followStatus : (existing.followStatus || 'none')
      });
    });
    chrome.storage.local.set({ [STORAGE_KEYS.USER_LIST]: Array.from(userMap.values()) });
  });
}

function saveAuditUsersToStorage(newUsers) {
  if (!newUsers?.length) return;
  chrome.storage.local.get([STORAGE_KEYS.UNREQUITED_LIST], (result) => {
    const userMap = new Map((result[STORAGE_KEYS.UNREQUITED_LIST] || []).map(u => [u.handle, u]));
    newUsers.forEach(u => {
      const existing = userMap.get(u.handle) || {};
      userMap.set(u.handle, {
        ...existing,
        ...u,
        name: u.name || existing.name || '',
        avatar: u.avatar || existing.avatar || '',
        followStatus: u.followStatus || existing.followStatus || 'none'
      });
    });
    chrome.storage.local.set({ [STORAGE_KEYS.UNREQUITED_LIST]: Array.from(userMap.values()) });
  });
}

// --- Profile & Navigation ---
function getSelfInfo() {
  try {
    const switcher = document.querySelector(SELECTORS.ACCOUNT_SWITCHER);
    if (switcher) {
      const img = switcher.querySelector('img');
      const handleMatch = (switcher.getAttribute('aria-label') || '').match(/@(\w+)/);
      if (handleMatch) return { handle: handleMatch[0], avatar: img?.src || '' };
    }
    return null;
  } catch (e) { return null; }
}

function likeTopTweet() {
  try {
    const post = getBestPost();
    if (!post) return { success: false, message: 'ポストが見つかりません' };
    const btn = post.querySelector(SELECTORS.LIKE_BTN);
    if (btn) { highlightElement(btn); btn.click(); return { success: true, message: 'いいねしました' }; }
    return { success: true, message: 'すでにいいねされています' };
  } catch (e) { return { success: false, message: 'エラーが発生しました' }; }
}

function getBestPost() {
  const posts = Array.from(document.querySelectorAll(SELECTORS.TWEET));
  let best = null, minDist = Infinity;
  posts.forEach(p => {
    const d = Math.abs(p.getBoundingClientRect().top - UI_CONFIG.HEADER_HEIGHT);
    if (d < minDist) { minDist = d; best = p; }
  });
  return best;
}

function navigatePost(direction) {
  const posts = Array.from(document.querySelectorAll(SELECTORS.TWEET));
  if (!posts.length) return { success: false };
  navIndexOffset += direction;
  const best = getBestPost();
  if (best) {
    const scroll = best.getBoundingClientRect().top - UI_CONFIG.HEADER_HEIGHT;
    window.scrollBy({ top: scroll, behavior: 'smooth' });
    lastScrollY = window.scrollY + scroll;
    updatePreviewHighlight();
    return { success: true };
  }
  return { success: false };
}

function updatePreviewHighlight() {
  if (Math.abs(window.scrollY - lastScrollY) > 50) navIndexOffset = 0;
  lastScrollY = window.scrollY;
  const isEligible = /https:\/\/(x|twitter)\.com\/(home|search|\w+)/.test(window.location.href) && !URL_PATTERNS.POST_DETAIL.test(window.location.href);
  if (!isEligible || !isSidePanelActive) { indicator.style.opacity = '0'; return; }
  const best = getBestPost();
  if (best) {
    const r = best.getBoundingClientRect();
    Object.assign(indicator.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, opacity: '1' });
  } else indicator.style.opacity = '0';
}

function highlightElement(el) {
  const rect = el.getBoundingClientRect();
  const hl = document.createElement('div');
  const size = Math.max(rect.width, rect.height) * 1.5;
  hl.className = 'x-like-helper-highlight';
  Object.assign(hl.style, { width: `${size}px`, height: `${size}px`, left: `${rect.left + rect.width / 2 - size / 2}px`, top: `${rect.top + rect.height / 2 - size / 2}px` });
  document.body.appendChild(hl);
  setTimeout(() => hl.remove(), 800);
}

// --- Lifecycle ---
setInterval(checkUrlAndObserve, UI_CONFIG.URL_CHECK_INTERVAL_MS);
checkUrlAndObserve();
window.addEventListener('scroll', () => {
  if (!scrollTimeout) scrollTimeout = requestAnimationFrame(() => { updatePreviewHighlight(); scrollTimeout = null; });
}, { passive: true });
window.addEventListener('resize', updatePreviewHighlight);
setInterval(updatePreviewHighlight, 1000);
