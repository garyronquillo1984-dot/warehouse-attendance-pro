import pw from '/opt/node-tools/node_modules/playwright/index.js';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const qrcode = require(process.argv[2] + '/libs/qrcode-generator-1.4.4/qrcode.js');
const SP = process.argv[2], OUT = process.argv[3];
const q = qrcode(0, 'M'); q.addData('SMSTO:+16147323986:JOBS FLORENCE - Name/Nombre: ___ Email/Correo: ___'); q.make();
const n = q.getModuleCount(); let path = '';
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) path += `M${c} ${r}h1.02v1.02h-1.02z`;
const qr = `<svg viewBox="-3 -3 ${n + 6} ${n + 6}" xmlns="http://www.w3.org/2000/svg"><rect x="-3" y="-3" width="${n + 6}" height="${n + 6}" fill="#fff"/><path d="${path}" fill="#211E1C"/></svg>`;
const page = (w, h, story) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@500;700;800&family=Cormorant+Garamond:wght@600;700&display=swap"><style>
*{box-sizing:border-box;margin:0}body{width:${w}px;height:${h}px;background:#433B36;color:#F0E9E1;font-family:Barlow,Arial,sans-serif;display:flex;flex-direction:column;padding:${story ? 110 : 70}px 80px;gap:${story ? 46 : 26}px}
.brand{font-family:'Cormorant Garamond',Georgia,serif;font-size:44px;display:flex;justify-content:space-between;align-items:baseline}.brand small{font-family:Barlow;font-size:30px;opacity:.8}
h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:700;font-size:${story ? 128 : 104}px;line-height:.95}h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:${story ? 72 : 58}px;opacity:.92;margin-top:6px}
.pay{background:#C9A24A;color:#211E1C;border-radius:10px;padding:${story ? 30 : 20}px 30px;display:flex;justify-content:space-between;align-items:center;gap:20px}.pay b{font-size:${story ? 110 : 88}px;font-weight:800;line-height:1}.pay span{font-size:${story ? 38 : 32}px;font-weight:700;text-align:right;line-height:1.2}
.roles{font-size:${story ? 40 : 34}px;font-weight:700;letter-spacing:.02em}
.cta{display:flex;gap:36px;align-items:center;${story ? 'flex-direction:column;align-items:flex-start' : ''}}.cta svg{width:${story ? 430 : 290}px;height:${story ? 430 : 290}px;border-radius:12px;flex:none}
.cta p{font-size:${story ? 44 : 34}px;line-height:1.25}.cta p b{display:block;font-size:${story ? 66 : 52}px;color:#fff;margin-top:10px}
.fine{margin-top:auto;font-size:${story ? 26 : 21}px;opacity:.75;line-height:1.35}</style></head><body>
<div class="brand">Top Tier HR<small>Florence, KY</small></div>
<div><h1>Warehouse jobs</h1><h2>Trabajos de almacén</h2></div>
<div class="pay"><b>$17/hr</b><span>Start Thu Nov 5 &amp; Fri Nov 6<br>Empieza jue 5 y vie 6 de nov</span></div>
<div class="roles">Picking · Packing · Sorting · Material handling</div>
<div class="cta">${qr}<p>Text your name &amp; email · Envía tu nombre y correo por texto<b>(614) 732-3986</b></p></div>
<div class="fine">Gary Ronquillo · Onsite Representative · Top Tier HR. Registering does not guarantee employment. · Registrarte no garantiza empleo. We speak English · Hablamos español.</div>
</body></html>`;
const b = await pw.chromium.launch();
for (const [name, w, h, story] of [['TopTierHR_Post_Cuadrado_1080.png', 1080, 1080, false], ['TopTierHR_Historia_1080x1920.png', 1080, 1920, true]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(page(w, h, story), { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: OUT + '/' + name });
}
await b.close();
