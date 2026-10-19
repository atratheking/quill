// Render the actual Quill UI against measured shipped-reference layout facts.
// No microphone, native helper, account or installed Quill app is used.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fixture = require('../tests/fixtures/wispr-layout.json');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'quill-layout-check-'));
app.setName('QuillLayoutCheck');
app.setPath('userData', profile);
const selectors = {
  sidebar: '.sidebar', nav: '.nav-item', panel: '.main-panel',
  heading: '.page-heading h1', historyList: '.history-list',
  historyTime: '.history-time', historyText: '.history-row > p',
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({width:1200, height:810, useContentSize:true,
    frame:false, show:false, webPreferences:{sandbox:true, contextIsolation:true, backgroundThrottling:false}});
  const run = code => win.webContents.executeJavaScript(code);
  try {
    await win.loadFile(path.join(root, 'dist/index.html'));
    win.showInactive();
    await run('document.fonts.ready.then(()=>true)');
    await win.webContents.insertCSS('*{animation:none!important;transition:none!important}');
    await pause(200);
    let checks = 0;
    for (const [viewport, expected] of Object.entries(fixture.expected)) {
      const [width, theme] = viewport.split('-');
      win.setContentSize(Number(width),810);
      await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Settings').click()`);
      await pause(100);
      await run(`(()=>{const s=document.querySelector('select[aria-label="Appearance"]');s.value=${JSON.stringify(theme)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await pause(100);
      await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',metaKey:true,bubbles:true}))`);
      assert.equal(await run(`document.querySelector('.settings-dialog').contains(document.activeElement) && document.querySelector('.app').inert`),true,'Settings must retain focus');
      if (Number(width) === 1200) {
        const dialog=await run(`(()=>{const d=document.querySelector('.settings-dialog'),r=d.getBoundingClientRect();return{width:r.width,height:r.height,borderTopLeftRadius:getComputedStyle(d).borderTopLeftRadius,navWidth:document.querySelector('.settings-nav').getBoundingClientRect().width}})()`);
        assert.deepEqual(dialog,fixture.settingsDialog);
        checks += Object.keys(dialog).length;
      }
      await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
      await pause(150);
      assert.equal(await run(`!!document.querySelector('.settings-dialog')`),false,'Escape must close Settings');
      const measured = await run(`(()=>{const result={},expected=${JSON.stringify(expected)},selectors=${JSON.stringify(selectors)};for(const [key,props]of Object.entries(expected)){const e=document.querySelector(selectors[key]),s=getComputedStyle(e),r=e.getBoundingClientRect();result[key]={};for(const p of Object.keys(props))result[key][p]=['x','y','width','height'].includes(p)?r[p]:s[p]}return result})()`);
      assert.deepEqual(measured,expected,`Reference layout drift at ${viewport}`);
      checks+=Object.values(expected).reduce((n,props)=>n+Object.keys(props).length,0);
    }
    console.log(`${checks} reference layout checks passed; Settings focus and Escape verified at all three widths.`);
    win.destroy(); app.exit(0);
  } catch(error) { console.error(error); win.destroy(); app.exit(1); }
});
