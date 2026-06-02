// icons.ts — Centralized icon system using Lucide (static SVG strings).
// Each icon renders as inline SVG with currentColor — inherits text color automatically.
// lucide-static has zero dependencies; Vite tree-shakes to only what's imported.

import {
  Archive, Mail, Clock, Pencil, Star, Trash2, Inbox, Search,
  Bell, BellOff, Settings, ChevronRight, ChevronDown, X, Check,
  Image, Undo2, Bold, Italic, Underline, Menu, LogOut, VolumeX,
  ArrowUp, Calendar, RefreshCw, Plus, Tag, Reply, Send, SunMoon,
  Keyboard, Paperclip, AlarmClock, MailOpen, Eye, ArrowLeft,
  ThumbsUp, ThumbsDown, Globe, Maximize2, ShieldBan, FolderInput,
  OctagonX,
} from 'lucide-static';

/**
 * Resize a Lucide SVG string (default 24x24) to a given CSS size.
 * Replaces width/height attributes and adds inline-block style.
 */
function sized(svg: string, size = '20px'): string {
  return svg
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`)
    .replace('<svg', '<svg style="display:inline-block;vertical-align:middle;"');
}

// Pre-rendered icon functions — call these throughout the app
export const icon = {
  // Navigation / Sidebar
  inbox:       (s?: string) => sized(Inbox, s),
  email:       (s?: string) => sized(Mail, s),
  emailOpen:   (s?: string) => sized(MailOpen, s),
  clock:       (s?: string) => sized(Clock, s),
  send:        (s?: string) => sized(Send, s),
  pencil:      (s?: string) => sized(Pencil, s),
  star:        (s?: string) => sized(Star, s),
  starOutline: (s?: string) => sized(Star, s), // Lucide star is outline by default
  calendar:    (s?: string) => sized(Calendar, s),

  // Thread actions
  archive:     (s?: string) => sized(Archive, s),
  trash:       (s?: string) => sized(Trash2, s),
  snooze:      (s?: string) => sized(AlarmClock, s),
  reply:       (s?: string) => sized(Reply, s),
  mute:        (s?: string) => sized(VolumeX, s),
  unsnooze:    (s?: string) => sized(ArrowUp, s),

  // Compose / formatting
  bold:        (s?: string) => sized(Bold, s),
  italic:      (s?: string) => sized(Italic, s),
  underline:   (s?: string) => sized(Underline, s),
  attach:      (s?: string) => sized(Paperclip, s),

  // UI
  search:      (s?: string) => sized(Search, s),
  close:       (s?: string) => sized(X, s),
  check:       (s?: string) => sized(Check, s),
  settings:    (s?: string) => sized(Settings, s),
  theme:       (s?: string) => sized(SunMoon, s),
  keyboard:    (s?: string) => sized(Keyboard, s),
  logout:      (s?: string) => sized(LogOut, s),
  menu:        (s?: string) => sized(Menu, s),
  undo:        (s?: string) => sized(Undo2, s),
  image:       (s?: string) => sized(Image, s),
  bell:        (s?: string) => sized(Bell, s),
  bellOff:     (s?: string) => sized(BellOff, s),
  refresh:     (s?: string) => sized(RefreshCw, s),
  plus:        (s?: string) => sized(Plus, s),
  tag:         (s?: string) => sized(Tag, s),
  chevronRight:(s?: string) => sized(ChevronRight, s),
  chevronDown: (s?: string) => sized(ChevronDown, s),
  focus:       (s?: string) => sized(Eye, s),

  // Thumb icons
  thumbUp:     (s?: string) => sized(ThumbsUp, s),
  thumbDown:   (s?: string) => sized(ThumbsDown, s),

  // Mark read / back
  markRead:    (s?: string) => sized(Eye, s),
  arrowLeft:   (s?: string) => sized(ArrowLeft, s),

  // Domain grouping
  globe:       (s?: string) => sized(Globe, s),

  // Expand/maximize
  expand:      (s?: string) => sized(Maximize2, s),

  // Block
  shieldBan:   (s?: string) => sized(ShieldBan, s),

  // Thread actions — move/spam
  folderMove:  (s?: string) => sized(FolderInput, s),
  spam:        (s?: string) => sized(OctagonX, s),

  // Custom render for any SVG string at a given size
  custom: sized,
};

export type IconName = keyof typeof icon;
