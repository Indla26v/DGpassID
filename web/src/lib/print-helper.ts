/**
 * Isolated badge printer to guarantee strictly ONE single page output
 * on Letter paper with the conference badge default layout:
 * - Paper size: Letter (portrait)
 * - Margins: Top 0.5", Left 0.43", Right 2.47", Bottom 3.14"
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
  iframe.style.width = '8.5in';
  iframe.style.height = '11in';
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
            size: letter portrait;
            margin-top: 0.5in !important;
            margin-left: 0.43in !important;
            margin-right: 2.47in !important;
            margin-bottom: 3.14in !important;
            margin: 0.5in 2.47in 3.14in 0.43in !important;
          }
          @media print {
            @page {
              size: letter portrait;
              margin-top: 0.5in !important;
              margin-left: 0.43in !important;
              margin-right: 2.47in !important;
              margin-bottom: 3.14in !important;
              margin: 0.5in 2.47in 3.14in 0.43in !important;
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
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
              background: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            #print-root {
              width: 85mm !important;
              height: 130mm !important;
              max-width: 85mm !important;
              max-height: 130mm !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
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
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          #print-root {
            width: 85mm !important;
            height: 130mm !important;
            max-width: 85mm !important;
            max-height: 130mm !important;
            margin: 0 !important;
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
            width: 85mm !important;
            height: 130mm !important;
            min-width: 85mm !important;
            max-width: 85mm !important;
            min-height: 130mm !important;
            max-height: 130mm !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-before: avoid !important;
            break-before: avoid !important;
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
