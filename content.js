(() => {
  if (window.__KJG_S_DOWNLOADER__) return;
  window.__KJG_S_DOWNLOADER__ = true;

  let stopped = false;
  let usedVideoKeys = new Set();
  let lastTrace = null;
  const capturedMedia = [];
  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.type !== "KJG_MEDIA_CAPTURE") return;
    for (const url of event.data.urls || []) capturedMedia.push({ url, at: event.data.at || Date.now(), source: event.data.source || "page" });
    if (capturedMedia.length > 2000) capturedMedia.splice(0, capturedMedia.length - 2000);
  });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const text = el => (el?.innerText || el?.textContent || "").trim();

  function parseCard(card, index) {
    const raw = text(card);
    const days = Number(raw.match(/投放天数\s*(\d+)\s*天/)?.[1]);
    const dateRange = raw.match(/(\d{2}\/\d{2}\s*[-—]\s*\d{2}\/\d{2})/)?.[1] || "";
    const image = card.querySelector(".item-info-img img[src*='/material/'], img.img-box-size");
    const materialId = image?.src.match(/\/material\/(\d+)/)?.[1] || "";
    const lines = raw.split(/\n+/).map(x => x.trim()).filter(Boolean);
    const excluded = /^(商品展示|真人口播|情景剧|图文展示|动画展示|其他视频类型|投放天数|关联数据|计划数|直播数|\d+天|\d{2}\/\d{2})/;
    const title = lines.find(line => !excluded.test(line) && line.length > 3) || `素材-${index + 1}`;
    return { index, card, days, dateRange, materialId, title, sourcePage: location.href };
  }

  async function badgeIsS(card) {
    const badge = card.querySelector(".rank img");
    if (!badge) return false;
    try {
      if (!badge.complete || !badge.naturalWidth) await Promise.race([
        new Promise((resolve, reject) => {
          badge.addEventListener("load", resolve, { once: true });
          badge.addEventListener("error", reject, { once: true });
        }),
        sleep(1500)
      ]);
      if (!badge.naturalWidth) return false;
      const canvas = document.createElement("canvas");
      canvas.width = badge.naturalWidth || 44;
      canvas.height = badge.naturalHeight || 25;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(badge, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0, green = 0, colored = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
        if (a > 80 && Math.max(r, g, b) - Math.min(r, g, b) > 25) {
          colored++;
          if (r > g * 1.18 && r > b * 1.35) red++;
          if (g > r * 1.08 && g > b * 1.15) green++;
        }
      }
      return colored > 3 && red / colored > 0.38 && red > green * 1.8;
    } catch (_) {
      return false;
    }
  }

  const visible = el => !!el && el.getClientRects().length > 0;
  const folderName = range => range === "over30" ? "30天以上" : `${range}天以内`;
  const inRange = (days, range) => range === "over30" ? days > 30 : days <= Number(range);

  async function ensureVideoPlaying(video, panel) {
    video.muted = true;
    video.playsInline = true;
    try { await video.play(); } catch (_) {}
    if (video.paused) {
      const play = [
        ...panel.querySelectorAll("xg-start, .xgplayer-start, button[class*='play'], [role='button'][class*='play']")
      ].find(visible);
      if (play) play.click(); else video.click();
      try { await video.play(); } catch (_) {}
    }
    for (let i = 0; i < 20 && !stopped; i++) {
      if (!video.paused && video.readyState >= 2) return true;
      await sleep(100);
    }
    if (stopped) throw new Error("用户已停止");
    throw new Error("播放器未能开始播放");
  }

  async function closeDetailDrawer() {
    const selectors = [
      ".el-drawer__close-btn", ".el-dialog__headerbtn", ".k-drawer__close",
      "[class*='drawer'] [class*='close']", "[class*='Drawer'] [class*='close']",
      "[aria-label='关闭']", "[aria-label='Close']", "[title='关闭']", "[title='Close']"
    ];
    let close = selectors.flatMap(selector => [...document.querySelectorAll(selector)]).find(visible);
    if (!close) {
      close = [...document.querySelectorAll("button, [role='button'], i, span, div")].find(element => {
        if (!visible(element) || !/^(×|✕|关闭)$/.test(text(element))) return false;
        const rect = element.getBoundingClientRect();
        return rect.top < 100 && rect.left > innerWidth * 0.3;
      });
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const heading = [...document.querySelectorAll("h1, h2, h3, div, span")]
        .find(element => visible(element) && text(element) === "直播引流素材详情");
      const drawer = [...document.querySelectorAll(".el-drawer, .el-dialog, [class*='drawer'], [class*='detail-drawer']")].find(visible);
      if (!heading && !drawer) return true;
      close = selectors.flatMap(selector => [...document.querySelectorAll(selector)]).find(visible) || close;
      if (!close && heading) {
        const hr = heading.getBoundingClientRect();
        close = [...document.querySelectorAll("button, [role='button'], svg, i")]
          .filter(visible)
          .filter(element => {
            const r = element.getBoundingClientRect();
            return r.width <= 80 && r.height <= 80 && r.top < hr.bottom + 25 && r.bottom > hr.top - 25 && r.left > hr.left - 140 && r.right < hr.left + 10;
          })
          .sort((a, b) => Math.abs(b.getBoundingClientRect().right - hr.left) - Math.abs(a.getBoundingClientRect().right - hr.left))
          .at(-1);
      }
      if (close) close.click();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      await sleep(350);
      const mask = [...document.querySelectorAll(".v-modal, .el-overlay, [class*='drawer-mask'], [class*='modal-mask']")].find(visible);
      if (mask) mask.click();
      await sleep(450);
    }
    return ![...document.querySelectorAll("h1, h2, h3, div, span")]
      .some(element => visible(element) && text(element) === "直播引流素材详情");
  }

  const resourceUrls = () => performance.getEntriesByType("resource").map(entry => entry.name);
  const videoKey = url => String(url || "");
  const mediaScore = url => {
    const value = String(url || "");
    if (!/^https?:\/\//i.test(value) || /\.(jpe?g|png|gif|webp|svg|css|js)(?:$|[?#])/i.test(value)) return -1;
    let score = 0;
    if (/\.mp4(?:$|[?#])/i.test(value)) score += 120;
    if (/\.(webm|mov|m4v)(?:$|[?#])/i.test(value)) score += 100;
    if (/video|vod|play|media|aweme|tos-cn|byte/i.test(value)) score += 35;
    if (/mime[_-]?type=video|format=mp4/i.test(value)) score += 60;
    if (/\.m3u8(?:$|[?#])/i.test(value)) score -= 100;
    return score;
  };

  function dismissAllPreviews() {
    const body = document.body;
    for (const card of document.querySelectorAll(".item-info")) {
      for (const type of ["pointerleave", "pointerout", "mouseleave", "mouseout"]) {
        const EventType = type.startsWith("pointer") ? PointerEvent : MouseEvent;
        card.dispatchEvent(new EventType(type, { bubbles: true, view: window, relatedTarget: body }));
        const image = card.querySelector(".item-info-img");
        if (image) image.dispatchEvent(new EventType(type, { bubbles: true, view: window, relatedTarget: body }));
      }
      card.querySelectorAll("video").forEach(video => { try { video.pause(); } catch (_) {} });
    }
    body.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, view: window }));
    body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, view: window, clientX: 5, clientY: 5 }));
  }

  async function ownDownload(item, timeRange) {
    lastTrace = { title: item.title, materialId: item.materialId, days: item.days, mode: "hover", steps: [], candidateCount: 0, selectedHost: "" };
    const before = new Set(resourceUrls());
    const captureSince = Date.now();
    item.card.scrollIntoView({ block: "center", behavior: "instant" });
    const target = item.card.querySelector(".item-info-img") || item.card;
    const rect = target.getBoundingClientRect();
    const eventInit = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    target.dispatchEvent(new PointerEvent("pointerenter", eventInit));
    target.dispatchEvent(new MouseEvent("mouseenter", eventInit));
    target.dispatchEvent(new MouseEvent("mouseover", eventInit));
    target.dispatchEvent(new MouseEvent("mousemove", eventInit));
    await sleep(1800);
    lastTrace.steps.push("触发悬停并等待播放器");

    let video = [...target.querySelectorAll("video")].find(visible) || [...item.card.querySelectorAll("video")].find(visible);
    if (!video) {
      lastTrace.mode = "detail";
      lastTrace.steps.push("悬停未生成播放器，打开详情");
      target.click();
      await sleep(1400);
      video = [...document.querySelectorAll("video")].filter(visible).at(-1);
    }
    if (!video) throw new Error("详情中未找到播放器");

    const panel = video.closest("[role=dialog], .el-drawer, .el-dialog, .drawer, .detail") || document.body;
    await ensureVideoPlaying(video, panel);
    lastTrace.steps.push("播放器确认开始播放");
    await sleep(1800);
    if (stopped) throw new Error("用户已停止");

    const elementUrls = [video.currentSrc, video.src, video.getAttribute("src"), ...[...video.querySelectorAll("source")].flatMap(s => [s.src, s.getAttribute("src")])];
    const newResources = resourceUrls().filter(url => !before.has(url));
    const hookedResources = capturedMedia.filter(entry => entry.at >= captureSince).map(entry => entry.url);
    const candidates = [...new Set([...elementUrls, ...newResources, ...hookedResources])]
      .filter(url => mediaScore(url) > 0)
      .filter(url => !usedVideoKeys.has(videoKey(url)))
      .sort((a, b) => mediaScore(b) - mediaScore(a));
    let url = candidates[0];
    lastTrace.candidateCount = candidates.length;
    if (!url && lastTrace.mode === "hover") {
      lastTrace.steps.push("悬停模式没有直链，自动切换详情播放器重试");
      target.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true, view: window }));
      const retryBefore = new Set(resourceUrls());
      const retrySince = Date.now();
      target.click();
      await sleep(1200);
      const retryVideo = [...document.querySelectorAll("video")].filter(visible).at(-1);
      if (retryVideo) {
        const retryPanel = retryVideo.closest("[role=dialog], .el-drawer, .el-dialog, .drawer, .detail") || document.body;
        await ensureVideoPlaying(retryVideo, retryPanel);
        await sleep(1600);
        const retryElementUrls = [retryVideo.currentSrc, retryVideo.src, retryVideo.getAttribute("src"), ...[...retryVideo.querySelectorAll("source")].flatMap(s => [s.src, s.getAttribute("src")])];
        const retryResources = resourceUrls().filter(candidate => !retryBefore.has(candidate));
        const retryHooked = capturedMedia.filter(entry => entry.at >= retrySince).map(entry => entry.url);
        const retryCandidates = [...new Set([...retryElementUrls, ...retryResources, ...retryHooked])]
          .filter(candidate => mediaScore(candidate) > 0)
          .filter(candidate => !usedVideoKeys.has(videoKey(candidate)))
          .sort((a, b) => mediaScore(b) - mediaScore(a));
        lastTrace.mode = "detail-retry";
        lastTrace.candidateCount += retryCandidates.length;
        url = retryCandidates[0];
      }
    }
    if (!url) {
      const kind = video.currentSrc?.startsWith("blob:") ? "播放器使用 blob/分片流" : "播放器未暴露媒体地址";
      throw new Error(`${kind}，未找到可直接下载的文件`);
    }

    const response = await chrome.runtime.sendMessage({
      type: "KJG_DOWNLOAD_VIDEO", url, title: item.title, folder: folderName(timeRange)
    });
    target.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true, view: window }));
    target.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, view: window }));
    await closeDetailDrawer();
    dismissAllPreviews();
    if (!response?.ok) throw new Error(response?.error || "创建下载任务失败");
    usedVideoKeys.add(videoKey(url));
    try { lastTrace.selectedHost = new URL(url).host; } catch (_) {}
    lastTrace.steps.push("浏览器已创建下载任务");
    return response.filename;
  }

  async function run({ timeRange = "7", dryRun = false }) {
    if (document.documentElement.getAttribute("data-kjg-media-hook") !== "ready") {
      throw new Error("媒体监听器未启动：请重新加载扩展后完整刷新考古加页面");
    }
    stopped = false;
    usedVideoKeys = new Set();
    const originalScrollY = window.scrollY;
    const cards = [...document.querySelectorAll(".item-info")].map(parseCard).filter(x => Number.isFinite(x.days));
    const totalAll = cards.length;
    const items = [];
    const eligible = cards.filter(item => inRange(item.days, timeRange));
    for (let i = 0; i < eligible.length && !stopped; i++) {
      const item = eligible[i];
      item.card.scrollIntoView({ block: "center", behavior: "instant" });
      await sleep(180);
      if (await badgeIsS(item.card)) items.push(item);
      chrome.runtime.sendMessage({ type: "KJG_PROGRESS", phase: "scanning", totalAll, total: eligible.length, current: i + 1, found: items.length, ok: 0, failed: 0 });
    }
    window.scrollTo({ top: originalScrollY, behavior: "instant" });
    await sleep(250);
    chrome.runtime.sendMessage({ type: "KJG_PROGRESS", phase: "scanned", totalAll, total: items.length, current: 0, found: items.length, ok: 0, failed: 0 });
    const results = [];
    let ok = 0, failed = 0;
    for (let i = 0; i < items.length && !stopped; i++) {
      const item = items[i];
      const result = { ...item, card: undefined, rank: "S", status: "scanned", file: "" };
      if (!dryRun) {
        try {
          if (!await closeDetailDrawer()) throw new Error("上一条素材详情抽屉无法关闭");
          result.file = await ownDownload(item, timeRange);
          result.trace = lastTrace;
          result.status = "downloaded";
        } catch (error) {
          result.trace = lastTrace;
          if (!await closeDetailDrawer()) stopped = true;
          dismissAllPreviews();
          result.status = `failed: ${error.message}`;
        }
      }
      if (result.status === "downloaded" || result.status === "scanned") ok++; else failed++;
      results.push(result);
      chrome.runtime.sendMessage({ type: "KJG_PROGRESS", phase: "working", totalAll, total: items.length, current: i + 1, found: items.length, ok, failed });
    }
    sessionStorage.setItem("KJG_S_RESULTS", JSON.stringify(results));
    chrome.runtime.sendMessage({ type: "KJG_PROGRESS", phase: stopped ? "stopped" : "done", totalAll, total: items.length, current: results.length, found: items.length, ok, failed, results });
    return { totalAll, total: items.length, ok, failed, results, stopped };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "KJG_PING") { sendResponse({ ok: true }); return; }
    if (message?.type === "KJG_START") {
      run(message).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;
    }
    if (message?.type === "KJG_STOP") {
      stopped = true;
      closeDetailDrawer().then(closed => { dismissAllPreviews(); sendResponse({ ok: true, closed }); });
      return true;
    }
    if (message?.type === "KJG_RESULTS") {
      sendResponse({ results: JSON.parse(sessionStorage.getItem("KJG_S_RESULTS") || "[]") });
    }
  });
})();
