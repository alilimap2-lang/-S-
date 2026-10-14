(() => {
  if (window.__KJG_MEDIA_HOOK__) return;
  window.__KJG_MEDIA_HOOK__ = true;
  const markReady = () => document.documentElement?.setAttribute("data-kjg-media-hook", "ready");
  markReady();
  if (!document.documentElement) document.addEventListener("DOMContentLoaded", markReady, { once: true });

  const normalize = value => String(value || "")
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");

  function publish(values, source) {
    const urls = new Set();
    for (const raw of values) {
      const value = normalize(raw);
      if (/^https?:\/\//i.test(value)) urls.add(value);
      const matches = value.match(/https?:\\?\/\\?\/[^"'\s<>]+/gi) || [];
      matches.forEach(match => urls.add(normalize(match)));
    }
    if (urls.size) window.postMessage({ type: "KJG_MEDIA_CAPTURE", source, urls: [...urls], at: Date.now() }, "*");
  }

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    publish([response.url, String(args[0] || "")], "fetch-url");
    const type = response.headers.get("content-type") || "";
    if (/json|text|javascript/i.test(type)) {
      response.clone().text().then(body => publish([body], "fetch-body")).catch(() => {});
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__kjgUrl = url;
    this.addEventListener("load", function() {
      publish([this.responseURL, this.__kjgUrl], "xhr-url");
      try { if (!this.responseType || this.responseType === "text" || this.responseType === "json") publish([typeof this.response === "string" ? this.response : JSON.stringify(this.response)], "xhr-body"); } catch (_) {}
    }, { once: true });
    return originalOpen.call(this, method, url, ...rest);
  };

  new PerformanceObserver(list => publish(list.getEntries().map(entry => entry.name), "performance"))
    .observe({ type: "resource", buffered: true });
})();
