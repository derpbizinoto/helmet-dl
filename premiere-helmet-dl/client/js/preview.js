// client/js/preview.js — Helmet DL
// Validação dos links colados e a prévia (título, miniatura, duração, resolução),
// lida com `yt-dlp -J` alguns instantes depois que o usuário para de digitar.

var HDLPreview = (function () {
    var C = HDL_CONFIG;
    var U = HDLUi;
    var tr = HDLI18n.t;
    var els = U.els;

    var timer = null;
    var handle = null;
    var currentKey = "";
    var currentInfo = null;
    var infoCache = {};

    // Devolve o link pronto para o yt-dlp, ou null se não for um link http/https.
    // "youtu.be/abc" (sem https://) ganha o https:// na frente. Recusa file:, javascript:,
    // data: etc. e qualquer texto começando com "-" (que poderia virar opção do yt-dlp —
    // o "--" antes da URL já impede isso; aqui é a segunda barreira).
    function normalizeUrl(t) {
        t = String(t || "");
        if (!t || t.charAt(0) === "-") return null;
        var candidate = t;
        if (!/^https?:\/\//i.test(t)) {
            if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null;             // outro esquema (file:, javascript:…)
            if (!/^[\w-]+(\.[\w-]+)+(\/|$)/.test(t)) return null;        // não parece "site.com/…"
            candidate = "https://" + t;
        }
        var u;
        try { u = new URL(candidate); } catch (e) { return null; }
        if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname) return null;
        return candidate;
    }

    // Separa os links (por espaço) em válidos e inválidos.
    function parseUrls(text) {
        var valid = [], invalid = [];
        String(text || "").split(/\s+/).forEach(function (t) {
            if (!t) return;
            var url = normalizeUrl(t);
            if (url) valid.push(url); else invalid.push(t);
        });
        return { valid: valid, invalid: invalid };
    }

    function hide() {
        els.preview.style.display = "none";
        els.previewNote.style.display = "none";
        currentInfo = null;
    }

    function cancel() {
        clearTimeout(timer);
        if (handle) { handle.cancel(); handle = null; }
    }

    // Limpa tudo (depois que os links foram para a fila).
    function reset() {
        cancel();
        currentKey = "";
        hide();
    }

    function schedule() {
        cancel();
        timer = setTimeout(update, C.PREVIEW_DELAY_MS);
    }

    // Playlist e cookies mudam o que o yt-dlp enxerga, então entram na chave do cache.
    function cacheKey(url) {
        var o = U.readOptions();
        return url + "|" + (o.playlist ? "pl" : "") + "|" + o.cookies;
    }

    function cachedInfo(url) {
        return infoCache[cacheKey(url)] || null;
    }

    function update() {
        var parsed = parseUrls(els.urlInput.value);
        if (parsed.valid.length !== 1) {
            currentKey = "";
            hide();
            if (parsed.valid.length > 1) {
                els.previewNote.textContent = tr("{0} links — todos vão para a fila.", parsed.valid.length);
                els.previewNote.style.display = "";
            }
            return;
        }
        var url = parsed.valid[0];
        var key = cacheKey(url);
        if (key === currentKey && currentInfo) return;
        currentKey = key;
        if (!U.hasNode || !HDLTools.state.ytdlp) { hide(); return; }

        if (infoCache[key]) { render(infoCache[key]); return; }

        els.preview.style.display = "";
        els.preview.className = "preview loading";
        els.previewThumb.removeAttribute("src");
        els.previewDuration.textContent = "";
        els.previewTitle.textContent = tr("Carregando informações…");
        els.previewMeta.textContent = url;
        els.previewNote.style.display = "none";

        var o = U.readOptions();
        var h = HDLDownloader.fetchInfo(url, { cookies: o.cookies, playlist: o.playlist });
        handle = h;
        h.promise.then(function (info) {
            if (handle !== h) return;
            handle = null;
            infoCache[key] = info;
            render(info);
        }, function (e) {
            if (handle !== h) return;
            handle = null;
            els.preview.style.display = "none";
            els.previewNote.textContent = tr("Não deu para ler o link: {0}", HDLDownloader.friendlyError(e.message));
            els.previewNote.style.display = "";
        });
    }

    function render(info) {
        currentInfo = info;
        els.preview.style.display = "";
        els.preview.className = "preview";
        // Só miniatura http(s): um endereço file://servidor/… faria o Windows se conectar
        // a esse servidor e enviar a identificação de login do usuário.
        if (/^https?:\/\//i.test(info.thumbnail || "")) els.previewThumb.src = info.thumbnail;
        else els.previewThumb.removeAttribute("src");
        els.previewDuration.textContent = info.isLive ? tr("AO VIVO") : U.fmtDuration(info.duration);
        els.previewTitle.textContent = info.title;
        var meta = [];
        if (info.isPlaylist) meta.push(tr("Playlist · {0} vídeos", info.count));
        if (info.uploader) meta.push(info.uploader);
        if (info.site) meta.push(info.site);
        if (info.maxRes) meta.push(tr("até {0}p", info.maxRes));
        els.previewMeta.textContent = meta.join(" · ");
        updateQualityNote();
    }

    function updateQualityNote() {
        if (!currentInfo || currentInfo.isPlaylist) return;
        var o = U.readOptions();
        var q = parseInt(o.quality, 10);
        if (o.content !== "audio" && q && currentInfo.maxRes && q > currentInfo.maxRes) {
            els.previewNote.textContent = tr("Esse vídeo vai só até {0}p — vai baixar nessa qualidade.", currentInfo.maxRes);
            els.previewNote.style.display = "";
        } else if (currentInfo.isLive) {
            els.previewNote.textContent = tr("É uma live: o download segue até ela acabar (ou até você cancelar).");
            els.previewNote.style.display = "";
        } else {
            els.previewNote.style.display = "none";
        }
    }

    // Idioma trocado: redesenha a prévia que está na tela.
    function relabel() {
        if (currentInfo) render(currentInfo);
        else if (handle) els.previewTitle.textContent = tr("Carregando informações…");
    }

    return {
        relabel: relabel,
        normalizeUrl: normalizeUrl,
        parseUrls: parseUrls,
        schedule: schedule,
        cancel: cancel,
        reset: reset,
        update: update,
        cachedInfo: cachedInfo,
        updateQualityNote: updateQualityNote
    };
})();
