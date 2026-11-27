export async function openPrintDialog(target: Window = window): Promise<void> {
  let finish: () => void = () => {};
  const closed = new Promise<void>(resolve => { finish = resolve; });
  target.addEventListener('afterprint', finish, { once: true });
  let fallback: number | undefined;
  try {
    target.print();
    // Blocking print dialogs return after closing, even if afterprint is omitted.
    fallback = window.setTimeout(finish, 750);
    await closed;
  } finally {
    window.clearTimeout(fallback);
    target.removeEventListener('afterprint', finish);
  }
}

/**
 * Isolated badge printer to guarantee strictly ONE single page output
 * with horizontal centering and a 3mm top inset on portrait paper:
 * - Paper orientation: Portrait
 * - Margins: Zero page margins, with the inset applied inside the print area
 * - Background graphics: exact color adjustments enabled
 * - Headers and footers: disabled
 */
export async function printSingleBadge(element: HTMLElement, title: string = 'Duty Access Pass') {
  // Remove any pre-existing print iframe
  const oldIframe = document.getElementById('duty-pass-print-iframe');
  if (oldIframe) {
    oldIframe.remove();
  }

  // Create an invisible, isolated iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'duty-pass-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.style.zIndex = '-9999';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;
  if (!printWindow) {
    iframe.remove();
    throw new Error('Could not open the badge print frame. Try printing again.');
  }
  const iframeDoc = printWindow.document;

  // Clone head styles and links from main document
  const headElements = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style')
  );
  const headHtml = headElements.map((el) => el.outerHTML).join('\n');

  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Duty Access Pass</title>
        ${headHtml}
        <style>
          @page {
            size: portrait;
            margin: 0 !important;
          }
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          html, body {
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            display: block !important;
            background: #ffffff !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          #print-root {
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            margin: 0 !important;
            padding: 3mm 0 0 !important;
            break-inside: avoid;
          }
          .printable-card-size {
            width: 80mm !important;
            height: 120mm !important;
            min-width: 80mm !important;
            max-width: 80mm !important;
            min-height: 120mm !important;
            max-height: 120mm !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 auto !important;
            zoom: 0.96;
            overflow: hidden !important;
          }
          .shadow-xl, .shadow-2xl, .shadow-md, .shadow-sm {
            box-shadow: none !important;
          }
        </style>
      </head>
      <body>
        <div id="print-root">
          ${element.outerHTML}
        </div>
      </body>
    </html>
  `);
  iframeDoc.close();
  iframeDoc.title = title;

  // Wait for images and fonts to render, then invoke print
  await new Promise(resolve => window.setTimeout(resolve, 350));
  try {
    printWindow.focus();
    await openPrintDialog(printWindow);
  } finally {
    iframe.remove();
  }
}
