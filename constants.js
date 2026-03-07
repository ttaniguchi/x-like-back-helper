/**
 * Shared constants for X Liked-back Helper
 */

const STORAGE_KEYS = {
  USER_LIST: 'userList',
  SELF_INFO: 'selfInfo'
};

const ACTIONS = {
  SCAN_LIKERS: 'SCAN_LIKERS',
  GET_SELF_INFO: 'GET_SELF_INFO',
  LIKE_TOP_TWEET: 'LIKE_TOP_TWEET',
  NEXT_POST: 'NEXT_POST',
  PREV_POST: 'PREV_POST',
  UPDATE_FOCUS_STATE: 'UPDATE_FOCUS_STATE'
};

const SELECTORS = {
  PRIMARY_COLUMN: '[data-testid="primaryColumn"]',
  MAIN_CONTENT: 'main[role="main"]',
  USER_CELL: '[data-testid="UserCell"]',
  TWEET: '[data-testid="tweet"]',
  LIKE_BTN: '[data-testid="like"]',
  UNLIKE_BTN: '[data-testid="unlike"]',
  PROFILE_LINK: 'a[data-testid="AppTabBar_Profile_Link"]',
  ACCOUNT_SWITCHER: '[data-testid="SideNav_AccountSwitcher_Button"]'
};

const URL_PATTERNS = {
  LIKES_PAGE: /\/status\/\d+\/(likes|retweets|quotes)/,
  POST_DETAIL: /\/status\/\d+/,
  HOME: /\/home/,
  SEARCH: /\/search/,
  EXPLORE: /\/explore/
};

const UI_CONFIG = {
  HEADER_HEIGHT: 60,
  DEBOUNCE_SCAN_MS: 500,
  URL_CHECK_INTERVAL_MS: 2000
};
