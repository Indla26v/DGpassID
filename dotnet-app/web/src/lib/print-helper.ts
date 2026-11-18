/**
 * Isolated badge printer to guarantee strictly ONE single page output
 * with exact page-center alignment on portrait paper:
 * - Paper orientation: Portrait
 * - Margins: Exact page middle (margin: 0 on @page with centered flex layout)
 * - Background graphics: exact color adjustments enabled
 * - Headers and footers: disabled
 */
export function printSingleBadge(element: HTMLElement, title: string = 'Duty Access Pass') {
  if (typeof window === 'undefined') return;

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

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) return;

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
        <title>${title}</title>
        ${headHtml}
        <style>
          @page {
            size: portrait;
            margin: 0 !important;
          }
          @media print {
            @page {
              size: portrait;
              margin: 0 !important;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
              box-sizing: border-box !important;
            }
            html, body {
              width: 100% !important;
              height: 100% !important;
              min-height: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
              background: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            #print-root {
              width: 100% !important;
              height: 100% !important;
              min-height: 100% !important;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
              margin: auto !important;
              padding: 0 !important;
              overflow: hidden !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              page-break-after: avoid !important;
              break-after: avoid !important;
              page-break-before: avoid !important;
              break-before: avoid !important;
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
              margin: auto !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              page-break-after: avoid !important;
              break-after: avoid !important;
              page-break-before: avoid !important;
              break-before: avoid !important;
            }
          }
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          html, body {
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            background: #ffffff !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          #print-root {
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: auto !important;
            padding: 0 !important;
            overflow: hidden !important;
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
            margin: auto !important;
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

  // Wait for images and fonts to render, then invoke print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn('Iframe print failed, falling back to window.print():', err);
      window.print();
    } finally {
      // Clean up iframe after 3 seconds
      setTimeout(() => {
        try {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch (_) {}
      }, 3000);
    }
  }, 350);
}
