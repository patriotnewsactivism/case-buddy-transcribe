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
 * Generates a filename with timestamp.
 */
export const generateFilename = (prefix: string, extension: string): string => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}_${timestamp}.${extension}`;
};

/**
 * Opens a print window formatted as Legal Pleading Paper.
 */
export const printLegalDocument = (text: string, title: string = "TRANSCRIPT OF RECORDING") => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Please allow popups to print the transcript.");
    return;
  }

  const lines = text.split('\n');
  const date = new Date().toLocaleDateString();

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
            line-height: 2.0; /* Double spacing */
            color: #000;
            background: #fff;
            margin: 0;
            padding: 0;
          }
          .header {
            text-align: center;
            font-weight: bold;
            margin-bottom: 2em;
            text-decoration: underline;
          }
          .meta {
            margin-bottom: 2em;
            font-size: 10pt;
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
            line-height: 2.4; /* Adjust to align with double spaced text */
          }
          .content {
            flex: 1;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <div class="header">${title}</div>
        <div class="meta">
          GENERATED: ${date}<br/>
          SYSTEM: GEMINI WHISPER AI
        </div>
        
        ${lines.map((line, i) => `
          <div class="line-container">
            <div class="line-number">${i + 1}</div>
            <div class="content">${line || '&nbsp;'}</div>
          </div>
        `).join('')}

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