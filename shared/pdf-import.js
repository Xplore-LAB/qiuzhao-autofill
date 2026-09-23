/* Local PDF text import. No document upload, rendering, scripting, or OCR. */
import { getDocument, PDFWorker } from '../vendor/pdfjs/pdf.min.mjs';

export const PDF_LIMITS = Object.freeze({ bytes: 20 * 1024 * 1024, pages: 50, characters: 300000, timeoutMs: 30000 });

export async function extractPdfText(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('请选择 PDF 文件');
  if (file.size > PDF_LIMITS.bytes) throw new Error('资料文件不能超过 20MB');
  const data = new Uint8Array(await file.arrayBuffer());
  if (data.byteLength > PDF_LIMITS.bytes) throw new Error('资料文件不能超过 20MB');
  if (!data.length) throw new Error('PDF 文件为空');

  // Supplying the port avoids PDF.js creating a blob worker for extension URLs.
  // Every dependency is packaged with the extension; no remote PDF URL is accepted.
  const port = new Worker(new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
  const worker = new PDFWorker({ port });
  let task, timer, timedOut = false;
  try {
    task = getDocument({
      data, worker, isEvalSupported: false, useWasm: false,
      disableFontFace: true, enableXfa: false, stopAtErrors: true,
      cMapUrl: new URL('../vendor/pdfjs/cmaps/', import.meta.url).href,
      cMapPacked: true,
      standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
    });
    const extract = async () => {
      const pdf = await task.promise;
      if (pdf.numPages > PDF_LIMITS.pages) throw new Error('PDF 超过 50 页，请只保留需要导入的简历内容');
      const pages = [];
      let characters = 0;
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index);
        const reader = page.streamTextContent().getReader();
        const parts = [];
        let overLimit = false;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            for (const item of chunk.value.items) {
              if (typeof item.str !== 'string') continue;
              const text = item.str.replace(/\u0000/g, '') + (item.hasEOL ? '\n' : ' ');
              characters += text.length;
              if (characters > PDF_LIMITS.characters) overLimit = true;
              if (!overLimit) parts.push(text);
            }
          }
        } finally {
          reader.releaseLock();
          page.cleanup();
        }
        // Drain this page's stream without retaining excess text, then stop.
        // Cancelling mid-stream races PDF.js's final close message in Chromium.
        if (overLimit) throw new Error('PDF 文本超过 30 万字，请精简后重新导入');
        pages.push(parts.join('').trim());
      }
      const text = pages.join('\n\n').trim();
      if (!text) throw new Error('PDF 中没有可读取的文本，可能是扫描件或图片。请先用 OCR 转为文本，或导入 Word / 文本文件');
      if (text.length > PDF_LIMITS.characters) throw new Error('PDF 文本超过 30 万字，请精简后重新导入');
      return { text, pages: pdf.numPages };
    };
    return await Promise.race([
      extract(),
      new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error('PDF 读取超过 30 秒，请精简文件后重试')); }, PDF_LIMITS.timeoutMs); }),
    ]);
  } catch (error) {
    if (error?.name === 'PasswordException') throw new Error('PDF 已加密，请先在本机解密后重新导入');
    if (error?.name === 'InvalidPDFException') throw new Error('PDF 格式无效或文件已损坏，请重新导出后导入');
    throw error;
  } finally {
    clearTimeout(timer);
    // Terminate the worker even when parsing, limits, or a timeout abort the read.
    // A busy worker cannot acknowledge task.destroy(); a timeout terminates it directly.
    try { if (task && !timedOut) await task.destroy(); } finally { worker.destroy(); port.terminate(); }
  }
}
