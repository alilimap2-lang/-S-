const safe = (value, limit = 100) => String(value || "未命名")
  .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
  .replace(/\s+/g, " ")
  .replace(/[ ._]+$/g, "")
  .slice(0, limit) || "未命名";

function mediaExtension(url) {
  const ext = String(url || "").match(/\.(mp4|webm|mov|m4v)(?:$|[?#])/i)?.[1];
  return ext ? `.${ext.toLowerCase()}` : ".mp4";
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type !== "KJG_DOWNLOAD_VIDEO") return;
  const filename = `考古加S级视频/${safe(message.folder, 24)}/${safe(message.title)}${mediaExtension(message.url)}`;
  chrome.downloads.download({
    url: message.url,
    filename,
    conflictAction: "uniquify",
    saveAs: false
  }).then(downloadId => reply({ ok: true, downloadId, filename }))
    .catch(error => reply({ ok: false, error: error.message }));
  return true;
});
