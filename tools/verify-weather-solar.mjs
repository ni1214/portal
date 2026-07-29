import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getWbgtLevel } from '../modules/weather-solar.js';

const root = resolve(import.meta.dirname, '..');
const read = pathname => readFile(resolve(root, pathname), 'utf8');

const [
  html,
  script,
  moduleSource,
  workspaceSource,
  style,
  weatherServer,
  vercelConfigSource,
] = await Promise.all([
  read('index.html'),
  read('script.js'),
  read('modules/weather-solar.js'),
  read('modules/workspace-view.js'),
  read('style.css'),
  read('server/weather.mjs'),
  read('vercel.json'),
]);

assert.match(html, /id="env-sidebar-btn"[\s\S]*?天気・太陽光/);
assert.match(html, /data-target="env-sidebar-btn"/);
assert.doesNotMatch(html, /id="weather-widget"|id="weather-panel"|id="wpanel-/);

assert.match(script, /initWeatherSolar\(\{\s*fetchWeatherFromApi\s*\}\)/);
assert.match(script, /elementId:\s*['"]env-workspace['"]/);
assert.match(script, /sourceButtonId:\s*['"]env-sidebar-btn['"]/);
assert.match(script, /getElementById\(['"]env-sidebar-btn['"]\)\.addEventListener/);
assert.doesNotMatch(
  script,
  /\b(?:openWeatherPanel|closeWeatherPanel|switchWeatherTab|fetchAndRenderWeather)\b/,
);

assert.match(workspaceSource, /['"]env-sidebar-btn['"]:\s*['"]bnav-more['"]/);
assert.match(moduleSource, /id="env-current"/);
assert.match(moduleSource, /id="env-sun"/);
assert.match(moduleSource, /id="env-heat"/);
assert.match(moduleSource, /id="env-solar-frame"/);
assert.match(moduleSource, /id="env-radar-frame"/);
assert.match(moduleSource, /日の出・日没/);
assert.match(moduleSource, /暑さ指数（WBGT）/);
assert.match(moduleSource, /https:\/\/mierukaweb\.energymntr\.com\/48429893PZ/);
assert.match(moduleSource, /https:\/\/embed\.windy\.com\/embed2\.html/);
assert.match(
  moduleSource,
  /sandbox="allow-scripts allow-same-origin allow-forms allow-popups"/,
);
assert.doesNotMatch(moduleSource, /allow-top-navigation|allow-top-navigation-by-user-activation/);

assert.equal(getWbgtLevel(20.9).key, 'safe');
assert.equal(getWbgtLevel(21).key, 'attention');
assert.equal(getWbgtLevel(25).key, 'warning');
assert.equal(getWbgtLevel(28).key, 'severe');
assert.equal(getWbgtLevel(31).key, 'danger');
assert.equal(getWbgtLevel(null).key, 'unknown');

assert.match(style, /\/\* ===== 天気・太陽光 ===== \*\//);
assert.match(style, /\.env-summary-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/);
assert.match(style, /@media \(max-width:\s*720px\)[\s\S]*?\.env-summary-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.match(style, /\.env-frame-wrap\s*\{[\s\S]*?overflow:\s*hidden/);
assert.doesNotMatch(style, /\.weather-widget|\.weather-panel|\.wpanel-/);

assert.match(weatherServer, /daily:\s*\[[\s\S]*?['"]sunrise['"][\s\S]*?['"]sunset['"]/);
assert.match(weatherServer, /WBGT_STATION_ID\s*=\s*['"]42251['"]/);
assert.match(weatherServer, /www\.wbgt\.env\.go\.jp\/est15WG\/dl/);

const vercelConfig = JSON.parse(vercelConfigSource);
const globalHeaders = vercelConfig.headers.find(entry => entry.source === '/(.*)')?.headers || [];
const csp = globalHeaders.find(header => header.key === 'Content-Security-Policy')?.value || '';
assert.match(
  csp,
  /frame-src[^;]*https:\/\/embed\.windy\.com[^;]*https:\/\/mierukaweb\.energymntr\.com/,
);

console.log('Weather, WBGT, solar monitor, and rain radar workspace checks passed.');
