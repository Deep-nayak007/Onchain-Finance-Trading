import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
async function run(command, args) {
  await new Promise((res, rej) => {
    const p = spawn(command, args, { stdio: 'inherit' });
    p.on('error', rej);
    p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${command} exited ${code}`))));
  });
}
const escapeHtml = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export async function renderPreview({ input, trimStart, scenes, out, raw }) {
  const fonts = resolve('../../node_modules/@expo-google-fonts');
  const display = (
    await readFile(resolve(fonts, 'big-shoulders-display/BigShouldersDisplay_800ExtraBold.ttf'))
  ).toString('base64');
  const body = (
    await readFile(resolve(fonts, 'ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf'))
  ).toString('base64');
  const mono = (
    await readFile(resolve(fonts, 'ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf'))
  ).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    await page.setContent(`<!doctype html><style>
    @font-face{font-family:Display;src:url(data:font/ttf;base64,${display})} @font-face{font-family:Body;src:url(data:font/ttf;base64,${body})} @font-face{font-family:Mono;src:url(data:font/ttf;base64,${mono})}
    *{box-sizing:border-box}body{margin:0;background:#0F0D16;color:#EEEBF7}main{position:absolute;left:120px;top:98px;width:1130px}h1{font:116px Display;margin:0;letter-spacing:7px}p{font:45px Body;margin:50px 0 0;line-height:1.35}p span{color:#ECA43F}h2{font:48px Display;color:#ECA43F;margin:0;letter-spacing:.7px}article{position:absolute;top:460px;width:1120px}article p{font:29px Body;color:#9C97AF;line-height:1.65;white-space:pre-line;margin:20px 0 0}footer{position:absolute;left:125px;bottom:75px;font:18px Mono;color:#9C97AF;letter-spacing:1px}.knots{position:absolute;top:334px;left:5px;width:980px;display:flex;justify-content:space-between;font:17px Mono;color:#9C97AF}.knots:before{content:'';position:absolute;height:2px;background:#ECA43F55;left:30px;right:30px;top:22px}.k{width:140px;text-align:center;position:relative}.k b{display:block;position:relative;margin:0 auto 18px;border:1px solid #ECA43F99;border-radius:50%;width:46px;height:46px;background:#0F0D16;color:#ECA43F;font:16px Mono;line-height:44px}.frame{position:absolute;left:1338px;top:41px;width:474px;height:998px;border:1px solid #2D2939;border-radius:28px;background:#08070D}
    </style><main><h1>LEASH</h1><p>Give your AI trader slack.<br><span>Never your keys.</span></p><div class="knots">${['Rules', 'Wallet', 'Exchange', 'Referee', 'You'].map((k, n) => `<div class="k"><b>0${n + 1}</b>${k.toUpperCase()}</div>`).join('')}</div><article><h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.caption)}</p></article></main><footer>DEMO PREVIEW / SAMPLE DATA / NO FUNDS MOVED</footer><div class="frame"></div>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(raw, `background-${i}.png`) });
  }
  await browser.close();
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input];
  for (let i = 0; i < scenes.length; i++)
    args.push(
      '-loop',
      '1',
      '-t',
      String(scenes[i].duration),
      '-i',
      resolve(raw, `background-${i}.png`),
    );
  for (let i = 0; i < scenes.length; i++) args.push('-i', resolve(raw, `voice-${i}.aiff`));
  const bgFilters =
    scenes.map((_, i) => `[${i + 1}:v]fps=30,setsar=1,setpts=PTS-STARTPTS[b${i}]`).join(';') +
    ';' +
    scenes.map((_, i) => `[b${i}]`).join('') +
    `concat=n=${scenes.length}:v=1:a=0[bg]`;
  const videoFilter = `[0:v]trim=start=${trimStart}:duration=120,setpts=PTS-STARTPTS,scale=450:974,fps=30,setsar=1[phone];${bgFilters};[bg][phone]overlay=1350:53:shortest=1[v]`;
  const audioFilters =
    scenes
      .map(
        (s, i) =>
          `[${scenes.length + i + 1}:a]atrim=duration=${s.duration},apad=whole_dur=${s.duration},atrim=duration=${s.duration},asetpts=PTS-STARTPTS[a${i}]`,
      )
      .join(';') +
    ';' +
    scenes.map((_, i) => `[a${i}]`).join('') +
    `concat=n=${scenes.length}:v=0:a=1[a]`;
  args.push(
    '-filter_complex',
    videoFilter + ';' + audioFilters,
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-t',
    '120',
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    resolve(out, 'leash-demo-preview.mp4'),
  );
  await run('ffmpeg', args);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const metadata = JSON.parse(
    await readFile(resolve('../../artifacts/raw/video-render.json'), 'utf8'),
  );
  await renderPreview(metadata);
  console.log('Demo preview rendered.');
}
