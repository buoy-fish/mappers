import puppeteer from '/tmp/tl-verify/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
async function shot(file,url,w,h,scale,clip){
  const p=await b.newPage();
  await p.setViewport({width:w,height:h,deviceScaleFactor:scale});
  await p.goto(url,{waitUntil:'networkidle0'});
  await p.evaluate(()=>document.fonts?document.fonts.ready:true);
  await new Promise(r=>setTimeout(r,350));
  await p.screenshot({path:file,clip:{x:0,y:0,width:w,height:h}});
  await p.close();
  console.log('wrote',file);
}
// OG card at exactly 1200x630 (matches declared og:image dims)
await shot('/tmp/og-build/og-cover.png','file:///tmp/og-build/og-card.html',1200,630,1);
// icons from the flower mark
await shot('/tmp/og-build/apple-touch-icon.png','file:///tmp/og-build/icon.html',512,512,1);
await shot('/tmp/og-build/favicon.png','file:///tmp/og-build/icon.html',512,512,1);
await b.close();
