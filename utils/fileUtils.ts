import { TranscriptSegment } from '../types';

/**
 * Extracts date/time information from a filename or file metadata
 * Attempts to parse common date patterns found in filenames
 */
export const extractDateFromFilename = (filename: string): { date: string | null; time: string | null; raw: string | null } => {
  const result = { date: null as string | null, time: null as string | null, raw: null as string | null };

  // Remove file extension for parsing
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

  // Common date patterns to match
  const patterns = [
    // YYYY-MM-DD or YYYY_MM_DD (ISO format)
    /(\d{4})[-_](\d{2})[-_](\d{2})/,
    // YYYYMMDD (compact format, common in VID_20230115 style)
    /(\d{4})(\d{2})(\d{2})/,
    // MM-DD-YYYY or MM_DD_YYYY (US format)
    /(\d{2})[-_](\d{2})[-_](\d{4})/,
    // DD-MM-YYYY (European format - less common)
    /(\d{2})[-_](\d{2})[-_](\d{4})/,
  ];

  // Time patterns
  const timePatterns = [
    // HH-MM-SS or HH_MM_SS or HHMMSS
    /(\d{2})[-_]?(\d{2})[-_]?(\d{2})(?=[^\d]|$)/,
    // HH:MM:SS
    /(\d{2}):(\d{2}):(\d{2})/,
  ];

  // Try to extract date
  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern);
    if (match) {
      let year: string, month: string, day: string;

      // Determine format based on position and value ranges
      if (match[1].length === 4) {
        // YYYY-MM-DD format
        year = match[1];
        month = match[2];
        day = match[3];
      } else if (match[3].length === 4) {
        // MM-DD-YYYY or DD-MM-YYYY format
        year = match[3];
        // Assume US format (MM-DD-YYYY)
        month = match[1];
        day = match[2];
      } else {
        continue;
      }

      // Validate ranges
      const monthNum = parseInt(month);
      const dayNum = parseInt(day);
      const yearNum = parseInt(year);

      if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2100) {
        const dateObj = new Date(yearNum, monthNum - 1, dayNum);
        result.date = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        result.raw = `${year}-${month}-${day}`;
        break;
      }
    }
  }

  // Try to extract time (look for pattern after the date)
  for (const pattern of timePatterns) {
    // Search in the part of filename after the date pattern
    const match = nameWithoutExt.match(pattern);
    if (match) {
      const hour = parseInt(match[1]);
      const minute = parseInt(match[2]);
      const second = parseInt(match[3] || '0');

      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59) {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        result.time = `${hour12}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')} ${ampm}`;
        break;
      }
    }
  }

  return result;
};

/**
 * Gets file metadata including last modified date
 */
export const getFileMetadata = (file: File): { lastModified: string; size: string; type: string } => {
  const lastModified = new Date(file.lastModified).toLocaleString();
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  const sizeDisplay = file.size > 1024 * 1024 ? `${sizeMB} MB` : `${(file.size / 1024).toFixed(2)} KB`;

  return {
    lastModified,
    size: sizeDisplay,
    type: file.type || 'Unknown'
  };
};

/**
 * Triggers a browser download for a Blob or String.
 */
export const downloadFile = (data: Blob | string, filename: string, type: string) => {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Formats timestamp from seconds to MM:SS format
 */
export const formatTimestamp = (seconds: number): string => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

/**
 * Formats transcript with speaker names and timestamps
 */
export const formatTranscriptWithSpeakers = (
  segments: TranscriptSegment[],
  speakerMap: Record<string, string> = {},
  options: { includeTimestamps?: boolean; groupBySpeaker?: boolean } = {}
): string => {
  const { includeTimestamps = true, groupBySpeaker = false } = options;

  if (!segments || segments.length === 0) return '';

  const getSpeakerName = (speaker: string) => speakerMap[speaker] || speaker;

  if (groupBySpeaker) {
    // Group consecutive segments by the same speaker
    const grouped: Array<{ speaker: string; start: number; end: number; texts: string[] }> = [];

    segments.forEach((seg) => {
      const lastGroup = grouped[grouped.length - 1];
      if (lastGroup && lastGroup.speaker === seg.speaker) {
        lastGroup.texts.push(seg.text);
        lastGroup.end = seg.end;
      } else {
        grouped.push({
          speaker: seg.speaker,
          start: seg.start,
          end: seg.end,
          texts: [seg.text]
        });
      }
    });

    return grouped.map(group => {
      const speakerName = getSpeakerName(group.speaker);
      const timestamp = includeTimestamps ? `[${formatTimestamp(group.start)}] ` : '';
      return `${timestamp}${speakerName}:\n${group.texts.join(' ')}\n`;
    }).join('\n');
  } else {
    // Standard format: each segment on its own line
    return segments.map(seg => {
      const speakerName = getSpeakerName(seg.speaker);
      const timestamp = includeTimestamps ? `[${formatTimestamp(seg.start)}] ` : '';
      return `${timestamp}${speakerName}: ${seg.text}`;
    }).join('\n');
  }
};

/**
 * Generates a filename with timestamp.
 */
export const generateFilename = (prefix: string, extension: string): string => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}_${timestamp}.${extension}`;
};

/**
 * Opens a print window formatted as Legal Pleading Paper.
 * Accepts segments for proper speaker-separated formatting.
 */
export const printLegalDocument = (
  text: string,
  title: string = "TRANSCRIPT OF RECORDING",
  segments?: TranscriptSegment[],
  speakerMap?: Record<string, string>,
  metadata?: { recordingDate?: string; summary?: string; filename?: string }
) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Please allow popups to print the transcript.");
    return;
  }

  const date = new Date().toLocaleDateString();
  const getSpeakerName = (speaker: string) => speakerMap?.[speaker] || speaker;

  // Generate content from segments if available, otherwise use raw text
  let contentHtml = '';
  let lineNumber = 1;

  if (segments && segments.length > 0) {
    // Group consecutive segments by speaker for cleaner legal format
    let currentSpeaker = '';

    segments.forEach((seg) => {
      const speakerName = getSpeakerName(seg.speaker);
      const timestamp = formatTimestamp(seg.start);

      if (seg.speaker !== currentSpeaker) {
        // New speaker block
        currentSpeaker = seg.speaker;
        contentHtml += `
          <div class="speaker-block">
            <div class="line-container speaker-header">
              <div class="line-number">${lineNumber++}</div>
              <div class="content"><strong>${speakerName}</strong> [${timestamp}]:</div>
            </div>
        `;
      }

      contentHtml += `
        <div class="line-container">
          <div class="line-number">${lineNumber++}</div>
          <div class="content indent">${seg.text}</div>
        </div>
      `;

      // Check if next segment is different speaker (close block)
      const idx = segments.indexOf(seg);
      const nextSeg = segments[idx + 1];
      if (!nextSeg || nextSeg.speaker !== seg.speaker) {
        contentHtml += `</div><div class="line-container"><div class="line-number">${lineNumber++}</div><div class="content">&nbsp;</div></div>`;
        currentSpeaker = '';
      }
    });
  } else {
    // Fallback to line-by-line text
    const lines = text.split('\n');
    contentHtml = lines.map((line) => `
      <div class="line-container">
        <div class="line-number">${lineNumber++}</div>
        <div class="content">${line || '&nbsp;'}</div>
      </div>
    `).join('');
  }

  // Build metadata section
  let metaHtml = `GENERATED: ${date}<br/>SYSTEM: GEMINI WHISPER AI`;
  if (metadata?.recordingDate) {
    metaHtml = `RECORDING DATE: ${metadata.recordingDate}<br/>` + metaHtml;
  }
  if (metadata?.filename) {
    metaHtml = `FILE: ${metadata.filename}<br/>` + metaHtml;
  }

  // Build summary section if available
  const summaryHtml = metadata?.summary ? `
    <div class="summary-section">
      <div class="summary-header">SUMMARY</div>
      <div class="summary-content">${metadata.summary}</div>
    </div>
  ` : '';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          @page {
            size: letter;
            margin: 1in;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 12pt;
            line-height: 2.0;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 0;
          }
          .header {
            text-align: center;
            font-weight: bold;
            margin-bottom: 1em;
            text-decoration: underline;
          }
          .meta {
            margin-bottom: 1.5em;
            font-size: 10pt;
            border-bottom: 1px solid #ccc;
            padding-bottom: 1em;
          }
          .summary-section {
            margin-bottom: 2em;
            padding: 1em;
            background: #f5f5f5;
            border: 1px solid #ddd;
          }
          .summary-header {
            font-weight: bold;
            margin-bottom: 0.5em;
            text-decoration: underline;
          }
          .summary-content {
            font-size: 11pt;
            line-height: 1.6;
          }
          .speaker-block {
            margin-bottom: 0;
          }
          .speaker-header .content {
            font-weight: bold;
          }
          .line-container {
            display: flex;
          }
          .line-number {
            width: 3em;
            border-right: 1px solid #ccc;
            margin-right: 1em;
            padding-right: 0.5em;
            text-align: right;
            color: #666;
            user-select: none;
            font-size: 10pt;
            line-height: 2.4;
          }
          .content {
            flex: 1;
            white-space: pre-wrap;
          }
          .content.indent {
            padding-left: 2em;
          }
        </style>
      </head>
      <body>
        <div class="header">${title}</div>
        <div class="meta">${metaHtml}</div>
        ${summaryHtml}
        ${contentHtml}

        <script>
          window.onload = () => {
            window.print();
          }
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};