chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SCAN_LIKERS') {
    const users = scanLikesPage();
    const selfInfo = getSelfInfo();
    sendResponse({ users, selfInfo });
  } else if (request.action === 'GET_SELF_INFO') {
    sendResponse({ selfInfo: getSelfInfo() });
  }
  return true;
});

/**
 * Get current user's profile info from X sidebar
 */
function getSelfInfo() {
  try {
    const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    
    if (switcher) {
      const avatarImg = switcher.querySelector('img');
      const ariaLabel = switcher.getAttribute('aria-label') || '';
      const handleMatch = ariaLabel.match(/@\w+/) || switcher.innerText.match(/@\w+/);
      
      return {
        avatar: avatarImg ? avatarImg.src : '',
        handle: handleMatch ? handleMatch[0] : ''
      };
    }

    const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const img = profileLink.querySelector('img');
      return { avatar: img ? img.src : '', handle: '' };
    }
  } catch (e) {
    // Silent fail for background tasks
  }
  return null;
}

/**
 * Scan the current "Likes" page for user info and follow status
 */
function scanLikesPage() {
  const users = [];
  const handleSpans = Array.from(document.querySelectorAll('span')).filter(span => {
    const text = span.textContent.trim();
    return text.startsWith('@') && text.length > 1 && text.length < 30;
  });

  handleSpans.forEach(handleSpan => {
    try {
      const handle = handleSpan.textContent.trim();
      let searchArea = findUserCellContainer(handleSpan);
      
      const avatarImg = searchArea.querySelector('img[src*="profile_images"]');
      const avatar = avatarImg ? avatarImg.src : '';
      
      const fullText = searchArea.innerText || searchArea.textContent;
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

      const name = findUserName(searchArea);

      users.push({ name, handle, avatar, followStatus, done: false });
    } catch (e) {
      // Skip malformed cells
    }
  });

  // Deduplicate by handle
  return Array.from(new Map(users.map(u => [u.handle, u])).values());
}

function findUserCellContainer(element) {
  let container = element.parentElement;
  let depth = 0;
  let lastKnownGood = element.parentElement;
  
  while (container && depth < 10) {
    if (container.querySelector('img[src*="profile_images"]')) {
      lastKnownGood = container;
    }
    container = container.parentElement;
    depth++;
  }
  return lastKnownGood;
}

function findUserName(container) {
  const spans = container.querySelectorAll('span');
  for (let s of spans) {
    const txt = s.textContent.trim();
    if (txt && !txt.startsWith('@') && 
        !txt.includes('Follow') && !txt.includes('フォロー')) {
      return txt;
    }
  }
  return 'Unknown';
}
