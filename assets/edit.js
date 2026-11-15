/* Owner-only inline editor.
   The button appears only in a browser that holds a GitHub token (first time: open any page with ?edit).
   Saving commits the changed page to tion-source/tion-source.github.io (main) through the GitHub API. */
(function () {
  var REPO = "tion-source/tion-source.github.io", BRANCH = "main", KEY = "tion_edit_token";
  var SEL = "h1,h2,h3,h4,p,li,td,th,figcaption,dt,dd,blockquote";
  var qs = new URLSearchParams(location.search);
  if (qs.has("edit-logout")) { try { localStorage.removeItem(KEY); } catch (e) {} }
  var token = null;
  try { token = localStorage.getItem(KEY); } catch (e) {}
  if (!token && !qs.has("edit")) return;

  var path = decodeURIComponent(location.pathname.replace(/^\//, "")) || "index.html";
  if (path.endsWith("/")) path += "index.html";

  function pick(root) {
    var all = Array.prototype.slice.call(root.querySelectorAll(SEL)).filter(function (el) {
      return !el.closest("nav, script, noscript, .lb, #tion-edit");
    });
    return all.filter(function (el) {
      var p = el.parentElement;
      while (p) { if (p.matches && p.matches(SEL) && all.indexOf(p) >= 0) return false; p = p.parentElement; }
      return true;
    });
  }
  function b64decode(s) {
    var bin = atob(s.replace(/\n/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  var box = document.createElement("div");
  box.id = "tion-edit";
  box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:60;display:flex;gap:6px;font:13px/1 sans-serif";
  function btn(label, primary) {
    var b = document.createElement("button");
    b.type = "button"; b.textContent = label;
    b.style.cssText = "padding:8px 14px;border-radius:6px;cursor:pointer;border:1px solid #222;" +
      (primary ? "background:#222;color:#fff" : "background:#fff;color:#222");
    return b;
  }
  var bEdit = btn("Edit", true), bSave = btn("Save", true), bCancel = btn("Cancel", false), msg = document.createElement("span");
  msg.style.cssText = "align-self:center;background:#fff;padding:6px 8px;border-radius:6px;color:#555";
  bSave.style.display = bCancel.style.display = "none";
  box.append(msg, bCancel, bSave, bEdit);
  document.body.appendChild(box);

  var els = [], before = [];
  bEdit.onclick = function () {
    if (!token) {
      token = (prompt("GitHub token (fine-grained, this repo only, Contents: Read and write)") || "").trim();
      if (!token) return;
      try { localStorage.setItem(KEY, token); } catch (e) {}
    }
    els = pick(document.body);
    before = els.map(function (el) { return el.innerHTML; });
    els.forEach(function (el) { el.contentEditable = "true"; el.style.outline = "1px dashed #bbb"; });
    bEdit.style.display = "none"; bSave.style.display = bCancel.style.display = "";
    msg.textContent = "편집 중";
  };
  bCancel.onclick = function () { location.reload(); };
  bSave.onclick = async function () {
    var changed = [];
    els.forEach(function (el, i) { if (el.innerHTML !== before[i]) changed.push(i); });
    if (!changed.length) { msg.textContent = "바뀐 내용 없음"; return; }
    bSave.disabled = true; msg.textContent = "저장 중…";
    var api = "https://api.github.com/repos/" + REPO + "/contents/" + encodeURIComponent(path).replace(/%2F/g, "/");
    var hdr = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
    try {
      var r = await fetch(api + "?ref=" + BRANCH, { headers: hdr, cache: "no-store" });
      if (r.status === 401 || r.status === 403) { try { localStorage.removeItem(KEY); } catch (e) {} throw new Error("토큰 거부됨 (" + r.status + "). 다시 Edit을 눌러 토큰을 넣어줘"); }
      if (!r.ok) throw new Error("파일 읽기 실패 " + r.status);
      var j = await r.json(), src = b64decode(j.content);
      var out = src, fails = 0, done = 0;
      for (var k = 0; k < changed.length; k++) {
        var i = changed[k], tag = els[i].tagName.toLowerCase();
        var needle = ">" + before[i] + "</" + tag, nth = 0;
        for (var q = 0; q < i; q++) if (before[q] === before[i] && els[q].tagName === els[i].tagName) nth++;
        var pos = -1, from = 0;
        for (var n = 0; n <= nth; n++) { pos = out.indexOf(needle, from); if (pos < 0) break; from = pos + 1; }
        if (pos < 0) { fails++; els[i].style.outline = "2px solid #c33"; continue; }
        out = out.slice(0, pos + 1) + els[i].innerHTML + out.slice(pos + 1 + before[i].length);
        done++;
      }
      if (!done) throw new Error("원본에서 위치를 못 찾아 저장 못 함 (빨간 칸)");
      var put = await fetch(api, { method: "PUT", headers: hdr, body: JSON.stringify({
        message: "edit " + path + " (" + done + " block" + (done > 1 ? "s" : "") + ") from page editor",
        content: b64encode(out), sha: j.sha, branch: BRANCH }) });
      if (!put.ok) throw new Error("저장 실패 " + put.status);
      els.forEach(function (el) { el.removeAttribute("contenteditable"); if (el.style.outline.indexOf("dashed") >= 0) el.style.outline = ""; });
      bSave.style.display = bCancel.style.display = "none"; bEdit.style.display = "";
      msg.textContent = "저장됨 (" + done + "곳)" + (fails ? ", 실패 " + fails + "곳(빨간 칸)" : "") + ". 사이트 반영 1~2분";
    } catch (e) {
      msg.textContent = e.message;
    } finally { bSave.disabled = false; }
  };
})();
