// AquaHub — Notifications
//
// Shared helpers for the bell dropdown, the /notifications.html page,
// and the settings toggle. Encapsulates fetching, marking-read, and
// realtime subscription so callers don't repeat the logic.

import { supabase, getCurrentUser } from '/lib/supabase.js';

// ============================================================
// Fetch
// ============================================================

/**
 * Fetch the user's notifications. Default = last 30 days, max 50 rows.
 * Returns { notifications, unreadCount }.
 *
 * Each notification row is hydrated with thread.title and actor profile
 * (display_name, avatar_url) so the caller can render without N+1 queries.
 */
export async function fetchNotifications({ limit = 50, unreadOnly = false } = {}) {
  let q = supabase
    .from('notifications')
    .select('id, type, thread_id, reply_id, actor_id, read_at, created_at, payload')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) q = q.is('read_at', null);

  const { data: notifs, error } = await q;
  if (error) throw new Error(error.message);

  if (!notifs || notifs.length === 0) {
    return { notifications: [], unreadCount: 0 };
  }

  // Hydrate thread titles + actor profiles in two batched queries
  const threadIds = [...new Set(notifs.map((n) => n.thread_id).filter(Boolean))];
  const actorIds = [...new Set(notifs.map((n) => n.actor_id).filter(Boolean))];

  const [threadsRes, actorsRes] = await Promise.all([
    threadIds.length
      ? supabase.from('forum_threads').select('id, title').in('id', threadIds)
      : Promise.resolve({ data: [] }),
    actorIds.length
      ? supabase.from('forum_user_profiles').select('user_id, display_name, avatar_url').in('user_id', actorIds)
      : Promise.resolve({ data: [] }),
  ]);

  const threadMap = {};
  for (const t of (threadsRes.data || [])) threadMap[t.id] = t;
  const actorMap = {};
  for (const a of (actorsRes.data || [])) actorMap[a.user_id] = a;

  // Attach
  const hydrated = notifs.map((n) => ({
    ...n,
    thread: threadMap[n.thread_id] || null,
    actor: actorMap[n.actor_id] || null,
  }));

  const unreadCount = hydrated.filter((n) => !n.read_at).length;

  return { notifications: hydrated, unreadCount };
}

/**
 * Lightweight unread-count check — just for the bell indicator.
 * Returns an integer, fast (head: true so no rows are pulled).
 */
export async function fetchUnreadCount() {
  const user = await getCurrentUser();
  if (!user) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) return 0;
  return count || 0;
}


// ============================================================
// Mark read
// ============================================================

/** Mark a single notification read */
export async function markNotificationRead(id) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Mark all of the current user's notifications read */
export async function markAllRead() {
  const user = await getCurrentUser();
  if (!user) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);
  if (error) throw new Error(error.message);
}


// ============================================================
// Realtime subscription
// ============================================================
// Subscribe to inserts on the notifications table for the current user.
// The callback fires with the new notification row. Returns an unsubscribe fn.
//
// Use this in the topnav to bump the unread count without polling.

export function subscribeToNotifications(userId, onInsert) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        try { onInsert(payload.new); } catch (e) { console.error(e); }
      }
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}


// ============================================================
// Rendering helpers
// ============================================================

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function avatarColorClass(seed) {
  if (!seed) return 'avatar-c0';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `avatar-c${Math.abs(h) % 8}`;
}

/**
 * Render a single notification row as HTML.
 * Pass deleted = true to wrap the actor name in the "Deleted user" style.
 */
export function renderNotificationRow(n) {
  const actorName = n.actor?.display_name || (n.actor_id ? 'Someone' : 'Deleted user');
  const actorIsDeleted = !n.actor_id;
  const actorAvatar = n.actor?.avatar_url
    ? `<span class="notif-avatar has-image"><img src="${escapeHtml(n.actor.avatar_url)}" alt=""></span>`
    : `<span class="notif-avatar ${avatarColorClass(actorName)}">${escapeHtml(actorName.charAt(0).toUpperCase())}</span>`;
  const threadTitle = n.thread?.title || '(deleted thread)';
  const threadAvailable = !!n.thread;
  const href = threadAvailable && n.reply_id
    ? `/forum-thread.html?id=${encodeURIComponent(n.thread_id)}#reply-${encodeURIComponent(n.reply_id)}`
    : threadAvailable
      ? `/forum-thread.html?id=${encodeURIComponent(n.thread_id)}`
      : '#';

  const text = n.type === 'forum_reply'
    ? `<strong class="${actorIsDeleted ? 'forum-author-deleted' : ''}">${escapeHtml(actorName)}</strong> replied to <strong>${escapeHtml(threadTitle)}</strong>`
    : 'Notification';

  return `
    <li class="notif-row ${n.read_at ? '' : 'notif-row-unread'}" data-notif-id="${n.id}">
      <a href="${href}" class="notif-link" data-mark-read-on-click="1">
        ${actorAvatar}
        <span class="notif-body">
          <span class="notif-text">${text}</span>
          <span class="notif-time">${timeAgo(n.created_at)}</span>
        </span>
        ${n.read_at ? '' : '<span class="notif-unread-dot" aria-label="Unread"></span>'}
      </a>
    </li>
  `;
}

/**
 * Render the "empty state" for the dropdown or the page.
 */
export function renderEmptyNotifications() {
  return `
    <li class="notif-empty">
      <div class="notif-empty-icon">🔔</div>
      <p class="notif-empty-text">No notifications yet</p>
      <p class="notif-empty-sub">When someone replies to a thread you're in, you'll see it here.</p>
    </li>
  `;
}
