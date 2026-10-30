/**
 * Estrae il testo da un PDF direttamente nel browser con pdfjs-dist.
 * La libreria viene caricata solo quando serve (code splitting).
 * Nessun dato lascia il dispositivo durante il parsing.
 */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let pageText = '';
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2 && !pageText.endsWith('\n')) pageText += '\n';
      pageText += item.str;
      pageText += item.hasEOL ? '\n' : ' ';
      lastY = y;
    }
    pages.push(pageText);
  }
  await doc.destroy();
  return pages.join('\n\n');
}
