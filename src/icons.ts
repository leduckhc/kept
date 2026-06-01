// icons.ts — Centralized icon system using MDI Light (primary) + MDI (fallback)
// Each icon renders as inline SVG with currentColor — inherits text color automatically.

import emailIcon from '@iconify/icons-mdi-light/email';
import clockIcon from '@iconify/icons-mdi-light/clock';
import pencilIcon from '@iconify/icons-mdi-light/pencil';
import starIcon from '@iconify/icons-mdi-light/star';
import deleteIcon from '@iconify/icons-mdi-light/delete';
import inboxIcon from '@iconify/icons-mdi-light/inbox';
import magnifyIcon from '@iconify/icons-mdi-light/magnify';
import bellIcon from '@iconify/icons-mdi-light/bell';
import bellOffIcon from '@iconify/icons-mdi-light/bell-off';
import cogIcon from '@iconify/icons-mdi-light/cog';
import chevronRightIcon from '@iconify/icons-mdi-light/chevron-right';
import chevronDownIcon from '@iconify/icons-mdi-light/chevron-down';
import closeIcon from '@iconify/icons-mdi-light/cancel';
import checkIcon from '@iconify/icons-mdi-light/check';
import imageIcon from '@iconify/icons-mdi-light/image';
import undoIcon from '@iconify/icons-mdi-light/undo-variant';
import formatBoldIcon from '@iconify/icons-mdi-light/format-bold';
import formatItalicIcon from '@iconify/icons-mdi-light/format-italic';
import formatUnderlineIcon from '@iconify/icons-mdi-light/format-underline';
import menuIcon from '@iconify/icons-mdi-light/menu';
import logoutIcon from '@iconify/icons-mdi-light/logout';
import volumeMuteIcon from '@iconify/icons-mdi-light/volume-mute';
import arrowUpIcon from '@iconify/icons-mdi-light/arrow-up';
import calendarIcon from '@iconify/icons-mdi-light/calendar';
import refreshIcon from '@iconify/icons-mdi-light/refresh';
import plusIcon from '@iconify/icons-mdi-light/plus';
import tagIcon from '@iconify/icons-mdi-light/tag';

// MDI full (for icons not in MDI Light)
import replyIcon from '@iconify/icons-mdi/reply';
import sendIcon from '@iconify/icons-mdi/send';
import archiveIcon from '@iconify/icons-mdi/archive-arrow-down';
import starOutlineIcon from '@iconify/icons-mdi/star-outline';
import themeLightDark from '@iconify/icons-mdi/theme-light-dark';
import keyboardIcon from '@iconify/icons-mdi/keyboard';
import attachIcon from '@iconify/icons-mdi/attachment';
import snoozeIcon from '@iconify/icons-mdi/alarm-snooze';
import emailOpenIcon from '@iconify/icons-mdi/email-open';
import eyeIcon from '@iconify/icons-mdi/eye';
import arrowLeftIcon from '@iconify/icons-mdi/arrow-left';

interface IconData {
  width?: number;
  height?: number;
  body: string;
}

/**
 * Render an icon as inline SVG HTML string.
 * Uses currentColor so it inherits the text color of its container.
 * @param size - CSS size (default: '20px')
 */
function renderSvg(data: IconData, size = '20px', cls = ''): string {
  const w = data.width ?? 24;
  const h = data.height ?? 24;
  const classAttr = cls ? ` class="${cls}"` : '';
  return `<svg${classAttr} xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${w} ${h}" fill="currentColor" style="display:inline-block;vertical-align:middle;">${data.body}</svg>`;
}

// Cast helper — iconify types have optional width/height but data always has them
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const i = (mod: any): IconData => mod as IconData;

// Custom icon data (not from iconify packages)
const thumbUpData: IconData = { width: 24, height: 24, body: '<path d="M2 20h2c.55 0 1-.45 1-1v-9c0-.55-.45-1-1-1H2v11zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66-.23-.45-.52-.86-.88-1.22L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83v7.84C7 18.95 8.05 20 9.34 20h8.11c.7 0 1.36-.37 1.72-.97l2.66-6.15z"/>' };
const thumbDownData: IconData = { width: 24, height: 24, body: '<path d="M22 4h-2c-.55 0-1 .45-1 1v9c0 .55.45 1 1 1h2V4zM2.17 11.12c-.11.25-.17.52-.17.8V13c0 1.1.9 2 2 2h5.5l-.92 4.65c-.05.22-.02.46.08.66.23.45.52.86.88 1.22L10 22l6.41-6.41c.38-.38.59-.89.59-1.42V6.34C17 5.05 15.95 4 14.66 4h-8.1c-.71 0-1.37.37-1.72.97l-2.67 6.15z"/>' };

// Pre-rendered icon functions — call these throughout the app
export const icon = {
  // Navigation / Sidebar
  inbox:       (s?: string) => renderSvg(i(inboxIcon), s),
  email:       (s?: string) => renderSvg(i(emailIcon), s),
  emailOpen:   (s?: string) => renderSvg(i(emailOpenIcon), s),
  clock:       (s?: string) => renderSvg(i(clockIcon), s),
  send:        (s?: string) => renderSvg(i(sendIcon), s),
  pencil:      (s?: string) => renderSvg(i(pencilIcon), s),
  star:        (s?: string) => renderSvg(i(starIcon), s),
  starOutline: (s?: string) => renderSvg(i(starOutlineIcon), s),
  calendar:    (s?: string) => renderSvg(i(calendarIcon), s),

  // Thread actions
  archive:     (s?: string) => renderSvg(i(archiveIcon), s),
  trash:       (s?: string) => renderSvg(i(deleteIcon), s),
  snooze:      (s?: string) => renderSvg(i(snoozeIcon), s),
  reply:       (s?: string) => renderSvg(i(replyIcon), s),
  mute:        (s?: string) => renderSvg(i(volumeMuteIcon), s),
  unsnooze:    (s?: string) => renderSvg(i(arrowUpIcon), s),

  // Compose / formatting
  bold:        (s?: string) => renderSvg(i(formatBoldIcon), s),
  italic:      (s?: string) => renderSvg(i(formatItalicIcon), s),
  underline:   (s?: string) => renderSvg(i(formatUnderlineIcon), s),
  attach:      (s?: string) => renderSvg(i(attachIcon), s),

  // UI
  search:      (s?: string) => renderSvg(i(magnifyIcon), s),
  close:       (s?: string) => renderSvg(i(closeIcon), s),
  check:       (s?: string) => renderSvg(i(checkIcon), s),
  settings:    (s?: string) => renderSvg(i(cogIcon), s),
  theme:       (s?: string) => renderSvg(i(themeLightDark), s),
  keyboard:    (s?: string) => renderSvg(i(keyboardIcon), s),
  logout:      (s?: string) => renderSvg(i(logoutIcon), s),
  menu:        (s?: string) => renderSvg(i(menuIcon), s),
  undo:        (s?: string) => renderSvg(i(undoIcon), s),
  image:       (s?: string) => renderSvg(i(imageIcon), s),
  bell:        (s?: string) => renderSvg(i(bellIcon), s),
  bellOff:     (s?: string) => renderSvg(i(bellOffIcon), s),
  refresh:     (s?: string) => renderSvg(i(refreshIcon), s),
  plus:        (s?: string) => renderSvg(i(plusIcon), s),
  tag:         (s?: string) => renderSvg(i(tagIcon), s),
  chevronRight:(s?: string) => renderSvg(i(chevronRightIcon), s),
  chevronDown: (s?: string) => renderSvg(i(chevronDownIcon), s),

  // Thumb icons
  thumbUp:     (s?: string) => renderSvg(thumbUpData, s),
  thumbDown:   (s?: string) => renderSvg(thumbDownData, s),

  // Mark read / back
  markRead:    (s?: string) => renderSvg(i(eyeIcon), s),
  arrowLeft:   (s?: string) => renderSvg(i(arrowLeftIcon), s),

  // Custom render for any icon data
  custom: renderSvg,
};

export type IconName = keyof typeof icon;
