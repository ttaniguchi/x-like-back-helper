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
    background: rgba(29, 155, 240, 0.05); /* わずかに背景もつける */
    pointer-events: none;
    z-index: 9998;
    transition: all 0.1s ease-out;
    opacity: 0;
    border-radius: 4px; /* ちょっと角を丸く */
  }
  .x-like-helper-bg-highlight {
    display: none; /* 個別のBG用要素は不要になったので非表示 */
  }
`;
document.head.appendChild(style);

const indicator = document.createElement('div');
indicator.className = 'x-like-helper-target-indicator';
document.body.appendChild(indicator);

const bgHighlight = document.createElement('div');
bgHighlight.className = 'x-like-helper-bg-highlight';
document.body.appendChild(bgHighlight);

// --- State & Observing ---
let isObserving = false;
let observer = null;
let scanTimeout = null;
let currentUrl = window.location.href;
let navIndexOffset = 0;
let lastScrollY = window.scrollY;
let isSidePanelActive = false;

function checkUrlAndObserve() {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    navIndexOffset = 0; 
  }
  
  if (URL_PATTERNS.LIKES_PAGE.test(window.location.href)) {
    if (!isObserving) startObserving();
  } else if (isObserving) {
    stopObserving();
  }
}

function startObserving() {
  isObserving = true;
  observer = new MutationObserver(() => {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      const users = scanLikesPage();
      if (users.length > 0) saveUsersToStorage(users);
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

// --- Data Layer ---
function saveUsersToStorage(newUsers) {
  if (!newUsers?.length) return;
  chrome.storage.local.get([STORAGE_KEYS.USER_LIST], (result) => {
    const existingList = result[STORAGE_KEYS.USER_LIST] || [];
    const userMap = new Map(existingList.map(u => [u.handle, u]));
    
    newUsers.forEach(u => {
      if (!userMap.has(u.handle)) {
        userMap.set(u.handle, { ...u, done: false });
      } else {
        const existing = userMap.get(u.handle);
        userMap.set(u.handle, { 
          ...existing, 
          followStatus: u.followStatus !== 'none' ? u.followStatus : existing.followStatus,
          name: u.name || existing.name || '',
          avatar: u.avatar || existing.avatar || ''
        });
      }
    });
    
    chrome.storage.local.set({ [STORAGE_KEYS.USER_LIST]: Array.from(userMap.values()) });
  });
}

// --- Profile Scanner ---
function getSelfInfo() {
  try {
    const profileLink = document.querySelector(SELECTORS.PROFILE_LINK);
    let handle = '', avatar = '';

    if (profileLink) {
      const h = (profileLink.getAttribute('href') || '').replace('/', '');
      if (h && h !== 'profile') handle = `@${h}`;
      const img = profileLink.querySelector('img');
      if (img?.src) avatar = img.src;
    }

    const switcher = document.querySelector(SELECTORS.ACCOUNT_SWITCHER);
    if (switcher) {
      const img = switcher.querySelector('img');
      if (img?.src) avatar = img.src;
      if (!handle) {
        const handleMatch = (switcher.getAttribute('aria-label') || '').match(/@(\w+)/);
        if (handleMatch) handle = handleMatch[0];
      }
    }

    return handle ? { handle, avatar } : null;
  } catch (e) {
    return null;
  }
}

function scanLikesPage() {
  const users = [];
  const mainContent = document.querySelector(SELECTORS.PRIMARY_COLUMN) || 
                      document.querySelector(SELECTORS.MAIN_CONTENT) || 
                      document;

  const userCells = Array.from(mainContent.querySelectorAll(SELECTORS.USER_CELL));
  
  if (userCells.length > 0) {
    userCells.forEach(cell => {
      try {
        const spans = Array.from(cell.querySelectorAll('span'));
        const handleSpan = spans.find(s => {
          const t = s.textContent.trim();
          return t.startsWith('@') && t.length > 1;
        });
        
        if (!handleSpan) return;
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
        
        users.push({ name: name === handle ? '' : name, handle, avatar, followStatus, done: false });
      } catch (e) {}
    });
  } else {
    // Fallback scanner
    const handleSpans = Array.from(mainContent.querySelectorAll('span')).filter(span => {
      const text = span.textContent.trim();
      return text.startsWith('@') && text.length > 1 && text.length < 30;
    });

    handleSpans.forEach(handleSpan => {
      try {
        const handle = handleSpan.textContent.trim();
        let avatar = '', parent = handleSpan.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const img = parent.querySelector('img[src*="profile_images"]');
          if (img) { avatar = img.src; break; }
          parent = parent.parentElement;
        }
        users.push({ name: '', handle, avatar, followStatus: 'none', done: false });
      } catch (e) {}
    });
  }

  return Array.from(new Map(users.map(u => [u.handle, u])).values());
}

// --- Navigation & Actions ---
function likeTopTweet() {
  try {
    const bestPost = getBestPost();
    if (!bestPost) return { success: false, message: 'ポストが見つかりません' };

    const likeButton = bestPost.querySelector(SELECTORS.LIKE_BTN);
    const unlikedButton = bestPost.querySelector(SELECTORS.UNLIKE_BTN);
    const targetButton = likeButton || unlikedButton;

    if (targetButton) {
      highlightElement(targetButton);
      if (likeButton) {
        likeButton.click();
        return { success: true, message: 'いいねしました' };
      }
      return { success: true, message: 'すでにいいねされています' };
    }
    return { success: false, message: 'いいねボタンが見つかりません' };
  } catch (e) {
    return { success: false, message: 'エラーが発生しました' };
  }
}

function getBestPost() {
  const posts = Array.from(document.querySelectorAll(SELECTORS.TWEET));
  if (!posts.length) return null;

  let baseIndex = 0;
  let minDistance = Infinity;
  
  posts.forEach((post, index) => {
    const rect = post.getBoundingClientRect();
    const distance = Math.abs(rect.top - UI_CONFIG.HEADER_HEIGHT);
    if (distance < minDistance) {
      minDistance = distance;
      baseIndex = index;
    }
  });

  navIndexOffset = Math.max(-baseIndex, Math.min((posts.length - 1) - baseIndex, navIndexOffset));
  return posts[baseIndex + navIndexOffset];
}

function navigatePost(direction) {
  const posts = Array.from(document.querySelectorAll(SELECTORS.TWEET));
  if (!posts.length) return { success: false };

  navIndexOffset += direction;
  const bestPost = getBestPost();
  if (bestPost) {
    const scrollAmount = bestPost.getBoundingClientRect().top - UI_CONFIG.HEADER_HEIGHT;
    if (Math.abs(scrollAmount) > 1) {
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
      lastScrollY = window.scrollY + scrollAmount; 
    }
    updatePreviewHighlight();
    return { success: true };
  }
  return { success: false };
}

function updatePreviewHighlight() {
  const currentScrollY = window.scrollY;
  if (Math.abs(currentScrollY - lastScrollY) > 50) navIndexOffset = 0;
  lastScrollY = currentScrollY;

  const url = window.location.href;
  const isPostDetail = URL_PATTERNS.POST_DETAIL.test(url) && !URL_PATTERNS.LIKES_PAGE.test(url);
  const isEligible = /https:\/\/(x|twitter)\.com\/(home|search|\w+)/.test(url) && !isPostDetail;
  
  if (!isEligible || !isSidePanelActive) {
    indicator.style.opacity = '0';
    bgHighlight.style.opacity = '0';
    return;
  }

  const bestPost = getBestPost();
  if (bestPost) {
    const rect = bestPost.getBoundingClientRect();
    
    // Position the dotted border indicator to wrap the entire post
    Object.assign(indicator.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      opacity: '1'
    });

    // bgHighlight is hidden via CSS, so we don't need to update it here
    bgHighlight.style.opacity = '0';
    return;
  }
  indicator.style.opacity = '0';
  bgHighlight.style.opacity = '0';
}

function highlightElement(el) {
  const rect = el.getBoundingClientRect();
  const hl = document.createElement('div');
  hl.className = 'x-like-helper-highlight';
  const size = Math.max(rect.width, rect.height) * 1.5;
  Object.assign(hl.style, {
    width: `${size}px`,
    height: `${size}px`,
    left: `${rect.left + rect.width / 2 - size / 2}px`,
    top: `${rect.top + rect.height / 2 - size / 2}px`
  });
  document.body.appendChild(hl);
  setTimeout(() => hl.remove(), 800);
}

// --- Lifecycle ---
setInterval(checkUrlAndObserve, UI_CONFIG.URL_CHECK_INTERVAL_MS);
checkUrlAndObserve();

window.addEventListener('scroll', () => {
  if (scrollTimeout) return;
  scrollTimeout = requestAnimationFrame(() => {
    updatePreviewHighlight();
    scrollTimeout = null;
  });
}, { passive: true });
let scrollTimeout = null;

window.addEventListener('resize', updatePreviewHighlight);
setInterval(updatePreviewHighlight, 1000);
