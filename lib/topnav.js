// AquaHub — Top Nav
// Shared module so we don't have to duplicate ~60 lines of nav markup
// across 10 pages. Each page calls mountTopNav('dashboard'|'tanks'|...).

import { supabase, getCurrentUser } from '/lib/supabase.js';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllRead,
  subscribeToNotifications,
  renderNotificationRow,
  renderEmptyNotifications,
} from '/lib/notifications.js';

// Nav items for the logged-in app. The `key` matches what pages pass in
// to indicate the current section.
const APP_NAV_ITEMS = [
  { key: 'dashboard', href: '/app.html',    icon: '🏠', label: 'Dashboard' },
  { key: 'tanks',     href: '/tanks.html',  icon: '🐠', label: 'My Tanks' },
  { key: 'species',   href: '/species.html', icon: '🌿', label: 'Species' },
  { key: 'bioload',   href: '/bioload.html', icon: '📊', label: 'Bioload' },
  { key: 'trends',    href: '/trends.html', icon: '📈', label: 'Trends & Logs' },
  { key: 'stores',    href: '/stores.html', icon: '🏪', label: 'Stores' },
  { key: 'forum',     href: '/forum.html',  icon: '💬', label: 'Forum' },
];

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Pick a deterministic color class based on a string (email or name)
function avatarColorClass(seed) {
  if (!seed) return 'avatar-c0';
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return `avatar-c${Math.abs(h) % 8}`;
}

function avatarInitial(name, email) {
  const source = (name || email || '?').trim();
  return source.charAt(0).toUpperCase();
}

/**
 * Mount the top nav. Replaces any element with id="topNavRoot" in the page,
 * or prepends to <body> if none exists.
 *
 * @param {string} currentKey  one of APP_NAV_ITEMS keys, or '' for none
 * @param {object} [opts]
 *   - publicMode: if true and user is logged out, show Sign In / Sign Up
 *                 buttons in the top-right instead of avatar.
 *                 Use on forum.html, species.html etc that are publicly-readable.
 */
export async function mountTopNav(currentKey, opts = {}) {
  const { publicMode = false } = opts;

  // Resolve mount target
  let root = document.getElementById('topNavRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'topNavRoot';
    document.body.prepend(root);
  }

  const user = await getCurrentUser();
  let displayName = null;
  let avatarUrl = null;
  let isAdmin = false;
  if (user) {
    // Check admin claim from JWT app_metadata
    try {
      const { data: { session } } = await supabase.auth.getSession();
      isAdmin = session?.user?.app_metadata?.is_admin === true;
    } catch (_) {
      // Non-fatal — fall through with isAdmin = false
    }

    // Try to read forum display name + avatar
    try {
      const { data } = await supabase
        .from('forum_user_profiles')
        .select('display_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.display_name) displayName = data.display_name;
      if (data?.avatar_url) avatarUrl = data.avatar_url;
    } catch (_) {
      // Non-fatal — fall through with no display name
    }

    // Guard: every authenticated user needs a display name. If they don't
    // have one, send them to /welcome.html to pick one. Skip the redirect
    // when already on welcome.html, login.html, or marketing pages.
    if (!displayName && !publicMode) {
      const path = window.location.pathname;
      const exempt = ['/welcome.html', '/login.html', '/', '/index.html'];
      if (!exempt.includes(path)) {
        window.location.href = '/welcome.html';
        return; // bail out — page is unloading
      }
    }
  }

  const accountHtml = user
    ? `${renderBell()}${renderAccountAvatar(user, displayName, avatarUrl, isAdmin)}`
    : (publicMode ? renderAccountLoggedOut() : '');

  const navItems = APP_NAV_ITEMS.map((item) => `
    <a href="${item.href}" class="app-topnav-link${item.key === currentKey ? ' active' : ''}">
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-label">${escapeHtml(item.label)}</span>
    </a>
  `).join('');

  const mobileItems = APP_NAV_ITEMS.map((item) => `
    <a href="${item.href}" class="${item.key === currentKey ? 'active' : ''}">
      <span class="nav-icon">${item.icon}</span>
      <span>${escapeHtml(item.label)}</span>
    </a>
  `).join('');

  // For mobile menu: only show if user is logged in (the nav items go to app pages
  // that require auth anyway). Public pages with publicMode still get the menu
  // but it adds Sign In/Sign Up at the top.
  const mobileAuthHtml = user
    ? `
      <div class="app-mobile-menu-divider"></div>
      <button type="button" class="app-mobile-menu-signout" data-action="signout">Sign Out</button>
    `
    : (publicMode ? `
      <div class="app-mobile-menu-divider"></div>
      <a href="/login.html" class="btn-secondary btn-inline">Sign In</a>
      <a href="/login.html?mode=signup" class="btn-primary btn-inline">Sign Up Free</a>
    ` : '');

  root.innerHTML = `
    <header class="app-topnav">
      <div class="app-topnav-inner">
        <button type="button" class="app-topnav-mobile-toggle" aria-label="Open menu" data-action="open-mobile-menu">☰</button>

        <a href="${user ? '/app.html' : '/'}" class="app-topnav-brand">
          <span class="app-topnav-brand-icon">🐠</span>
          <span class="app-topnav-brand-text">AquaHub</span>
        </a>

        <nav class="app-topnav-row">
          ${navItems}
        </nav>

        <div class="app-topnav-account">
          ${accountHtml}
        </div>
      </div>
    </header>

    <div class="app-mobile-menu" id="appMobileMenu">
      <div class="app-mobile-menu-head">
        <a href="${user ? '/app.html' : '/'}" class="app-topnav-brand" style="padding: 0;">
          <span class="app-topnav-brand-icon">🐠</span>
          <span class="app-topnav-brand-text">AquaHub</span>
        </a>
        <button type="button" class="app-mobile-menu-close" aria-label="Close menu" data-action="close-mobile-menu">×</button>
      </div>
      <nav class="app-mobile-menu-nav">
        ${mobileItems}
        ${mobileAuthHtml}
      </nav>
    </div>
  `;

  wireUpInteractions(root, user);
}

function renderBell() {
  return `
    <div class="app-bell-wrap">
      <button type="button"
              class="app-bell-btn"
              id="appBellBtn"
              aria-label="Notifications"
              aria-haspopup="true"
              aria-expanded="false"
              data-action="toggle-bell">
        <svg class="app-bell-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5v3.586L4.293 13.793A1 1 0 0 0 5 15.5h14a1 1 0 0 0 .707-1.707L18.5 12.586V9A6.5 6.5 0 0 0 12 2.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M10 18.5a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <span class="app-bell-dot" id="appBellDot" aria-hidden="true" style="display: none"></span>
      </button>
      <div class="app-bell-menu" id="appBellMenu" role="menu">
        <div class="app-bell-menu-head">
          <h3>Notifications</h3>
          <button type="button" class="app-bell-mark-all" id="appBellMarkAll" style="display: none">Mark all read</button>
        </div>
        <ul class="app-bell-menu-list" id="appBellList">
          <li class="notif-empty notif-empty-loading">
            <p class="notif-empty-text">Loading…</p>
          </li>
        </ul>
        <div class="app-bell-menu-foot">
          <a href="/notifications.html" class="app-bell-see-all">See all notifications →</a>
        </div>
      </div>
    </div>
  `;
}

function renderAccountAvatar(user, displayName, avatarUrl, isAdmin) {
  const seed = displayName || user.email || user.id;
  const colorClass = avatarColorClass(seed);
  const initial = avatarInitial(displayName, user.email);
  const buttonContent = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName || '')}" class="app-avatar-btn-img" />`
    : initial;
  const buttonClass = avatarUrl ? 'app-avatar-btn has-image' : `app-avatar-btn ${colorClass}`;
  return `
    <button type="button"
            class="${buttonClass}"
            aria-label="Account menu"
            aria-haspopup="true"
            aria-expanded="false"
            data-action="toggle-avatar">${buttonContent}</button>
    <div class="app-avatar-menu" id="appAvatarMenu" role="menu">
      <div class="app-avatar-menu-head">
        ${displayName ? `<div class="app-avatar-menu-name">${escapeHtml(displayName)}</div>` : ''}
        <div class="app-avatar-menu-email">${escapeHtml(user.email || '')}</div>
      </div>
      ${isAdmin ? `
        <a href="/admin-species.html" class="app-avatar-menu-item app-avatar-menu-admin" role="menuitem">
          <span>🛡️ Admin: Species queue</span>
        </a>
        <div class="app-avatar-menu-divider"></div>
      ` : ''}
      <a href="/settings.html" class="app-avatar-menu-item" role="menuitem">
        <span>Settings</span>
      </a>
      <div class="app-avatar-menu-divider"></div>
      <button class="app-avatar-menu-item" type="button" role="menuitem" data-action="signout">
        <span>Sign Out</span>
      </button>
    </div>
  `;
}

function renderAccountLoggedOut() {
  return `
    <div class="app-topnav-account-loggedout">
      <a href="/login.html" class="btn-secondary btn-inline">Sign In</a>
      <a href="/login.html?mode=signup" class="btn-primary btn-inline">Sign Up Free</a>
    </div>
  `;
}

function wireUpInteractions(root, user) {
  // Bell dropdown (logged-in only)
  if (user) {
    wireBellInteractions(root, user);
  }

  // Avatar dropdown
  const avatarBtn = root.querySelector('[data-action="toggle-avatar"]');
  const avatarMenu = root.querySelector('#appAvatarMenu');

  if (avatarBtn && avatarMenu) {
    avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = avatarMenu.classList.toggle('open');
      avatarBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      // Close bell menu if open
      if (isOpen) {
        const bellMenu = root.querySelector('#appBellMenu');
        const bellBtn = root.querySelector('#appBellBtn');
        if (bellMenu) bellMenu.classList.remove('open');
        if (bellBtn) bellBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('click', (e) => {
      if (!avatarMenu.contains(e.target) && e.target !== avatarBtn) {
        avatarMenu.classList.remove('open');
        avatarBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && avatarMenu.classList.contains('open')) {
        avatarMenu.classList.remove('open');
        avatarBtn.setAttribute('aria-expanded', 'false');
        avatarBtn.focus();
      }
    });
  }

  // Sign-out (works from either the dropdown or the mobile menu)
  root.querySelectorAll('[data-action="signout"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = '/login.html';
    });
  });

  // Mobile menu
  const mobileMenu = root.querySelector('#appMobileMenu');
  const mobileToggle = root.querySelector('[data-action="open-mobile-menu"]');
  const mobileClose = root.querySelector('[data-action="close-mobile-menu"]');
  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => mobileMenu.classList.add('open'));
  }
  if (mobileClose && mobileMenu) {
    mobileClose.addEventListener('click', () => mobileMenu.classList.remove('open'));
  }
  // Close on link tap
  if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => mobileMenu.classList.remove('open'));
    });
  }
}

// ============================================================
// Bell interactions
// ============================================================
function wireBellInteractions(root, user) {
  const bellBtn = root.querySelector('#appBellBtn');
  const bellMenu = root.querySelector('#appBellMenu');
  const bellDot = root.querySelector('#appBellDot');
  const bellList = root.querySelector('#appBellList');
  const bellMarkAll = root.querySelector('#appBellMarkAll');
  if (!bellBtn || !bellMenu) return;

  // Initial unread count check — sets the red dot
  fetchUnreadCount().then((count) => {
    if (count > 0) bellDot.style.display = '';
  }).catch(() => {});

  // Realtime subscription — bump dot when a new notification arrives
  subscribeToNotifications(user.id, (newRow) => {
    // Show the dot
    bellDot.style.display = '';
    // If menu is open, re-fetch + re-render
    if (bellMenu.classList.contains('open')) {
      loadDropdown();
    }
  });

  async function loadDropdown() {
    bellList.innerHTML = `<li class="notif-empty notif-empty-loading"><p class="notif-empty-text">Loading…</p></li>`;
    try {
      const { notifications, unreadCount } = await fetchNotifications({ limit: 10 });
      if (notifications.length === 0) {
        bellList.innerHTML = renderEmptyNotifications();
        bellMarkAll.style.display = 'none';
      } else {
        bellList.innerHTML = notifications.map(renderNotificationRow).join('');
        bellMarkAll.style.display = unreadCount > 0 ? '' : 'none';
      }
      // Update the dot based on unread count
      bellDot.style.display = unreadCount > 0 ? '' : 'none';

      // Wire each row to mark-read on click
      bellList.querySelectorAll('[data-mark-read-on-click]').forEach((a) => {
        a.addEventListener('click', () => {
          const id = a.closest('[data-notif-id]')?.dataset.notifId;
          if (id) markNotificationRead(id).catch(() => {});
        });
      });
    } catch (e) {
      bellList.innerHTML = `<li class="notif-empty"><p class="notif-empty-text">Could not load notifications.</p></li>`;
    }
  }

  // Toggle dropdown
  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = bellMenu.classList.toggle('open');
    bellBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      // Close avatar menu if it's open
      const avatarMenu = root.querySelector('#appAvatarMenu');
      if (avatarMenu) avatarMenu.classList.remove('open');
      loadDropdown();
    }
  });

  // Mark all read button
  bellMarkAll.addEventListener('click', async (e) => {
    e.stopPropagation();
    bellMarkAll.disabled = true;
    try {
      await markAllRead();
      bellDot.style.display = 'none';
      bellList.querySelectorAll('.notif-row-unread').forEach((row) => {
        row.classList.remove('notif-row-unread');
        row.querySelector('.notif-unread-dot')?.remove();
      });
      bellMarkAll.style.display = 'none';
    } catch (e) {
      // Silent — user can retry
    } finally {
      bellMarkAll.disabled = false;
    }
  });

  // Outside click closes
  document.addEventListener('click', (e) => {
    if (!bellMenu.contains(e.target) && e.target !== bellBtn && !bellBtn.contains(e.target)) {
      bellMenu.classList.remove('open');
      bellBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Escape closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bellMenu.classList.contains('open')) {
      bellMenu.classList.remove('open');
      bellBtn.setAttribute('aria-expanded', 'false');
      bellBtn.focus();
    }
  });
}
