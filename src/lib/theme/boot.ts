import { THEME_PRESETS } from './presets'
import { THEME_CSS_VARS } from './apply'

/**
 * 首帧启动脚本（在 `<head>` 里同步执行，早于 React）。
 *
 * 亮暗模式与纸色如果等 `SettingsProvider` 的 effect 再落，会先闪一帧默认纸白；
 * 这里直接读 localStorage 把 class / `data-theme` / `data-palette` 与九个变量
 * 一次写好。主题数据由 `presets.ts` 序列化而来，不在字符串里手抄色值。
 *
 * 只做「落值」，不做校验以外的逻辑；非法值一律回 `paper`。
 */
const TOKENS_BY_PRESET = JSON.stringify(
  Object.fromEntries(THEME_PRESETS.map((preset) => [preset.id, preset.tokens])),
)

export const THEME_BOOT_SCRIPT = `(function(){try{
var s={};try{s=JSON.parse(localStorage.getItem('oc-studio-settings')||'{}')}catch(e){}
var mode=s.theme||'auto';
var dark=mode==='auto'?window.matchMedia('(prefers-color-scheme:dark)').matches:mode==='dark';
var root=document.documentElement;
root.classList.toggle('dark',dark);
root.setAttribute('data-theme',dark?'dark':'light');
var presets=${TOKENS_BY_PRESET};
var id=presets[s.themePreset]?s.themePreset:'paper';
var tokens=presets[id][dark?'dark':'light'];
var vars=${JSON.stringify(THEME_CSS_VARS)};
for(var key in vars){root.style.setProperty(vars[key],tokens[key])}
root.setAttribute('data-palette',id);
if(window.__TAURI__||window.__TAURI_INTERNALS__){root.classList.add('tauri-mica')}
}catch(e){}})()`
