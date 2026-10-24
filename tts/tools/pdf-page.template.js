// Runs inside headless Edge via cdp.js. Renders PDF pages with pdf.js and returns {page: dataURL} as JSON.
// Parameters are read from window.name? No: they are baked in below by the caller (sed).
(async () => {
  const PDF_URL = "__PDF_URL__";
  const PAGES = __PAGES__;
  const SCALE = __SCALE__;
  const load = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("script failed " + src)); document.head.appendChild(s); });
  await load("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf = await (await fetch(PDF_URL)).arrayBuffer();
  const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const out = { numPages: doc.numPages };
  for (const p of PAGES) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: SCALE });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    out[p] = c.toDataURL("image/jpeg", 0.9);
    out["size" + p] = [c.width, c.height];
  }
  return JSON.stringify(out);
})()
