const $ = id => document.getElementById(id);
let tabId = null, latestResults = [], latestSummary = {};
const csvCell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;

async function ensureContentScript(targetTabId) {
  try { await chrome.tabs.sendMessage(targetTabId, { type: "KJG_PING" }); }
  catch (_) {
    await chrome.scripting.executeScript({ target: { tabId: targetTabId }, files: ["content.js"] });
    await new Promise(r => setTimeout(r, 250));
  }
}

async function getPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/ad\.kaogujia\.com\/list\/live/.test(tab.url || "")) throw new Error("请先打开考古加直播引流素材列表页");
  tabId = tab.id;
  await ensureContentScript(tabId);
}

function progress(m) {
  latestSummary = { ...latestSummary, ...m };
  $("progress").max = Math.max(m.total || 1, 1); $("progress").value = m.current || 0;
  $("totalAll").textContent = m.totalAll ?? $("totalAll").textContent;
  $("found").textContent = m.found ?? m.total ?? 0; $("ok").textContent = m.ok || 0; $("failed").textContent = m.failed || 0;
  if (m.results) latestResults = m.results;
  const label = { scanning: "正在加载并识别全部卡片", scanned: "扫描完成", working: "正在提取并下载视频", done: "完成", stopped: "已停止" }[m.phase] || "处理中";
  const lastFailure = m.results?.filter(x => String(x.status).startsWith("failed:")).at(-1)?.status;
  $("status").textContent = `${label} ${m.current || 0}/${m.total || 0}${lastFailure ? `\n${lastFailure}` : ""}`;
  if (["done", "stopped"].includes(m.phase)) {
    $("report").textContent = `运行报告：一共 ${m.totalAll ?? 0} 条，识别 ${m.found ?? m.total ?? 0} 条，下载 ${m.ok ?? 0} 条，失败 ${m.failed ?? 0} 条。`;
  } else {
    $("report").textContent = `运行中：一共 ${m.totalAll ?? 0} 条，已识别 ${m.found ?? 0} 条，已下载 ${m.ok ?? 0} 条。`;
  }
  if (["done", "stopped"].includes(m.phase)) { $("start").disabled = false; $("stop").disabled = true; $("export").disabled = !latestResults.length; $("exportDebug").disabled = !latestResults.length; }
}
chrome.runtime.onMessage.addListener(m => { if (m?.type === "KJG_PROGRESS") progress(m); });

$("start").onclick = async () => {
  try {
    await getPage();
    const timeRange = $("timeRange").value;
    await chrome.storage.local.set({ timeRange });
    $("start").disabled = true; $("stop").disabled = false; $("export").disabled = true; $("exportDebug").disabled = true; $("status").textContent = "正在扫描…";
    $("totalAll").textContent = "0"; $("found").textContent = "0"; $("ok").textContent = "0"; $("failed").textContent = "0";
    $("report").textContent = "运行报告：正在统计…";
    const result = await chrome.tabs.sendMessage(tabId, { type: "KJG_START", timeRange, dryRun: $("dryRun").checked });
    if (result?.error) throw new Error(result.error);
  } catch (e) { $("status").textContent = e.message; $("start").disabled = false; $("stop").disabled = true; }
};
$("stop").onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/ad\.kaogujia\.com\/list\/live/.test(tab.url || "")) throw new Error("当前不是考古加素材页");
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "KJG_STOP" });
    $("status").textContent = "正在停止并关闭当前素材详情…";
    $("stop").disabled = true;
  } catch (error) { $("status").textContent = `停止失败：${error.message}`; }
};
$("export").onclick = () => {
  const fields = ["materialId", "title", "days", "dateRange", "rank", "sourcePage", "file", "status"];
  const csv = "\ufeff" + [fields, ...latestResults.map(x => fields.map(k => x[k] ?? ""))].map(r => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  chrome.downloads.download({ url, filename: `考古加S级视频/manifest-${Date.now()}.csv` });
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
$("exportDebug").onclick = () => {
  const report = {
    generatedAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    summary: {
      total: latestSummary.totalAll ?? 0,
      recognized: latestSummary.found ?? latestSummary.total ?? 0,
      downloaded: latestSummary.ok ?? 0,
      failed: latestSummary.failed ?? 0,
      stopped: latestSummary.phase === "stopped"
    },
    items: latestResults
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" }));
  chrome.downloads.download({ url, filename: `考古加S级视频/纠错报告-${Date.now()}.json` });
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
chrome.storage.local.get({ timeRange: "7" }).then(x => { $("timeRange").value = x.timeRange; });
