chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SCAN_LIKERS') {
    const users = scanLikesPage();
    const selfInfo = getSelfInfo();
    saveUsersToStorage(users);
    sendResponse({ users, selfInfo });
  } else if (request.action === 'GET_SELF_INFO') {
    sendResponse({ selfInfo: getSelfInfo() });
  }
  return true;
});

let isObserving = false;
let observer = null;
let scanTimeout = null;

function checkUrlAndObserve() {
  const targetRegex = /\/status\/\d+\/(likes|retweets|quotes)/;
  if (targetRegex.test(window.location.href)) {
    if (!isObserving) {
      startObserving();
    }
  } else {
    if (isObserving) {
      stopObserving();
    }
  }
}

function startObserving() {
  isObserving = true;
  observer = new MutationObserver(() => {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      const users = scanLikesPage();
      if (users.length > 0) {
        saveUsersToStorage(users);
      }
    }, 500); // debounce 500ms
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

function saveUsersToStorage(newUsers) {
  if (!newUsers || newUsers.length === 0) return;
  chrome.storage.local.get(['userList'], (result) => {
    const existingList = result.userList || [];
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
    
    const updatedList = Array.from(userMap.values());
    chrome.storage.local.set({ userList: updatedList });
  });
}

// Check URL periodically to detect SPA navigation
setInterval(checkUrlAndObserve, 2000);
// Check immediately
checkUrlAndObserve();


/**
 * Get current user's profile info from X sidebar
 */
function getSelfInfo() {
  try {
    let handle = '';
    let avatar = '';

    // Priority 1: Side navigation profile link for handle
    const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href') || '';
      const h = href.replace('/', '');
      if (h && h !== 'profile') {
        handle = `@${h}`;
      }
      const img = profileLink.querySelector('img');
      if (img && img.src) avatar = img.src;
    }

    // Priority 2: Account switcher button for avatar (more reliable for the image)
    const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (switcher) {
      const img = switcher.querySelector('img');
      if (img && img.src) avatar = img.src;
      
      if (!handle) {
        const ariaLabel = switcher.getAttribute('aria-label') || '';
        const handleMatch = ariaLabel.match(/@(\w+)/);
        if (handleMatch) handle = handleMatch[0];
      }
    }

    if (handle) {
      return { handle, avatar };
    }
  } catch (e) {
  }
  return null;
}

/**
 * Scan the current "Likes" page for user info and follow status
 */
function scanLikesPage() {
  const users = [];
  
  // Target only the primary column to avoid sidebar "Who to follow" users
  const mainContent = document.querySelector('[data-testid="primaryColumn"]') || 
                      document.querySelector('main[role="main"]') || 
                      document;

  const userCells = Array.from(mainContent.querySelectorAll('[data-testid="UserCell"]'));
  
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
        if (isFollower && isFollowing) {
          followStatus = 'mutual';
        } else if (isFollower) {
          followStatus = 'follower';
        } else if (isFollowing) {
          followStatus = 'following';
        }

        let name = '';
        for (let s of spans) {
          const t = s.textContent.trim();
          if (t && t !== handle && !t.includes('Follow') && !t.includes('フォロー') && !t.includes('認証済み') && !t.includes('Verified')) {
            name = t;
            break;
          }
        }
        
        if (name === handle) name = '';

        users.push({ name: name, handle, avatar, followStatus, done: false });
      } catch (e) {
      }
    });
  } else {
    // Fallback if structured cells aren't found
    const handleSpans = Array.from(mainContent.querySelectorAll('span')).filter(span => {
      const text = span.textContent.trim();
      return text.startsWith('@') && text.length > 1 && text.length < 30;
    });

    handleSpans.forEach(handleSpan => {
      try {
        const handle = handleSpan.textContent.trim();
        
        // Try to find a nearby avatar image
        let avatar = '';
        let parent = handleSpan.parentElement;
        for (let i = 0; i < 5; i++) {
          if (!parent) break;
          const img = parent.querySelector('img[src*="profile_images"]');
          if (img) {
            avatar = img.src;
            break;
          }
          parent = parent.parentElement;
        }

        users.push({ name: '', handle, avatar, followStatus: 'none', done: false });
      } catch (e) {}
    });
  }

  // Deduplicate by handle
  return Array.from(new Map(users.map(u => [u.handle, u])).values());
}
