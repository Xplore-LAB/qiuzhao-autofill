# PDF.js local text extraction

Pinned source: `pdfjs-dist@6.3.289`, downloaded from the official npm registry.
Upstream: https://github.com/mozilla/pdf.js (Apache-2.0; see LICENSE).

Included unchanged from the npm package:

- `legacy/build/pdf.min.mjs` and `legacy/build/pdf.worker.min.mjs`
- `cmaps/` and `standard_fonts/` (including their license notices)

The legacy build includes compatibility polyfills for older supported browsers.
The importer explicitly disables eval, WebAssembly, font rendering, and XFA. It
uses a same-origin module worker and local character maps/font data. It reads
document bytes supplied by the file picker and does not accept a remote PDF URL.

To refresh these files after deliberately updating the pinned dependency, copy
the same paths from `node_modules/pdfjs-dist`, then run:

```sh
node test/pdf-import-regression.cjs
```
