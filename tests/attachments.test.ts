// attachments.test.ts — Unit tests for attachment rendering logic
import { describe, it, expect } from 'vitest';

// Mirror the formatSize helper from ThreadReader/Compose
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Mirror the MIME → emoji mapping from ThreadReader
function mimeIcon(mime: string): string {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('archive')) return '📦';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  return '📎';
}

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatSize(1024)).toBe('1 KB');
    expect(formatSize(245760)).toBe('240 KB');
    expect(formatSize(38912)).toBe('38 KB');
  });

  it('formats megabytes', () => {
    expect(formatSize(1048576)).toBe('1.0 MB');
    expect(formatSize(5242880)).toBe('5.0 MB');
    expect(formatSize(1572864)).toBe('1.5 MB');
  });
});

describe('mimeIcon', () => {
  it('returns image icon for image types', () => {
    expect(mimeIcon('image/png')).toBe('🖼️');
    expect(mimeIcon('image/jpeg')).toBe('🖼️');
  });

  it('returns PDF icon', () => {
    expect(mimeIcon('application/pdf')).toBe('📄');
  });

  it('returns spreadsheet icon for Excel/CSV', () => {
    expect(mimeIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('📊');
  });

  it('returns doc icon for Word', () => {
    expect(mimeIcon('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('📝');
  });

  it('returns archive icon', () => {
    expect(mimeIcon('application/zip')).toBe('📦');
  });

  it('returns generic for unknown', () => {
    expect(mimeIcon('application/octet-stream')).toBe('📎');
  });
});

describe('attachment filtering by message', () => {
  const attachments = [
    { id: 'att1', message_id: 'm05', thread_id: 't05', filename: 'invoice.pdf', mime_type: 'application/pdf', size: 245760 },
    { id: 'att2', message_id: 'm07', thread_id: 't07', filename: 'boarding.pdf', mime_type: 'application/pdf', size: 152000 },
    { id: 'att3', message_id: 'm07', thread_id: 't07', filename: 'weather.png', mime_type: 'image/png', size: 89000 },
  ];

  it('filters attachments by message_id', () => {
    const m07Atts = attachments.filter(a => a.message_id === 'm07');
    expect(m07Atts).toHaveLength(2);
    expect(m07Atts[0].filename).toBe('boarding.pdf');
    expect(m07Atts[1].filename).toBe('weather.png');
  });

  it('returns empty for message with no attachments', () => {
    const noAtts = attachments.filter(a => a.message_id === 'm99');
    expect(noAtts).toHaveLength(0);
  });

  it('only shows one attachment for single-attachment message', () => {
    const m05Atts = attachments.filter(a => a.message_id === 'm05');
    expect(m05Atts).toHaveLength(1);
    expect(m05Atts[0].filename).toBe('invoice.pdf');
  });
});
