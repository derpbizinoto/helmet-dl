// client/js/main.js — Helmet DL
// Ponto de partida do painel: liga os botões e campos aos módulos e faz a
// verificação inicial. A lógica fica nos outros arquivos (ver o mapa em config.js).

(function () {
    var C = HDL_CONFIG;
    var U = HDLUi;
    var els = U.els;

    function bindEvents() {
        els.btnDownload.addEventListener("click", HDLQueue.enqueue);
        els.urlInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); HDLQueue.enqueue(); }
        });
        els.urlInput.addEventListener("input", function () { U.setStatus(""); HDLPreview.schedule(); });
        els.urlInput.addEventListener("paste", function () {
            setTimeout(function () { HDLPreview.cancel(); HDLPreview.update(); }, 0);
        });

        els.btnPaste.addEventListener("click", function () {
            HDLClipboard.read().then(function (t) {
                t = String(t || "").trim();
                if (!t) { U.setStatus("A área de transferência está vazia.", "warning"); return; }
                els.urlInput.value = t;
                U.setStatus("");
                HDLPreview.cancel();
                HDLPreview.update();
            }, function () {
                U.setStatus("Não consegui ler a área de transferência. Use Ctrl+V no campo.", "warning");
                els.urlInput.focus();
            });
        });

        var settingInputs = [els.qualitySelect, els.containerSelect, els.codecSelect, els.compatCheckbox, els.audioFormatSelect,
            els.binCheckbox, els.playlistCheckbox, els.trimCheckbox, els.trimStart, els.trimEnd, els.cookiesSelect, els.autoUpdateCheckbox];
        Array.prototype.slice.call(els.contentRadios).concat(Array.prototype.slice.call(els.modeRadios),
            Array.prototype.slice.call(els.encoderRadios), settingInputs)
            .forEach(function (input) {
                input.addEventListener("change", function () { U.updateVisibility(); U.saveSettings(); });
            });
        // playlist/cookies mudam o que o yt-dlp enxerga: atualiza a prévia
        [els.playlistCheckbox, els.cookiesSelect].forEach(function (input) {
            input.addEventListener("change", function () { if (els.urlInput.value.trim()) HDLPreview.update(); });
        });

        els.queue.addEventListener("click", HDLQueue.onListClick);
        els.btnClearDone.addEventListener("click", HDLQueue.clearDone);

        els.btnOpenFolder.addEventListener("click", HDLProject.openFolder);
        els.projectInfo.addEventListener("click", HDLProject.refresh);
        window.addEventListener("focus", HDLProject.refresh);

        [["btnYtdlp", "ytdlp"], ["btnFfmpeg", "ffmpeg"], ["btnDeno", "deno"]].forEach(function (p) {
            els[p[0]].addEventListener("click", function () { HDLToolsUI.onButton(p[1]); });
        });
    }

    function init() {
        els.versionNote.textContent = "v" + C.CLIENT_VERSION;
        U.loadSettings();
        U.updateVisibility();
        bindEvents();
        HDLQueue.bindDock();
        HDLToolsUI.render();

        if (!U.hasNode) {
            els.projectInfo.textContent = "Prévia fora do Premiere";
            if (/demo/.test(location.search)) HDLQueue.demo();
            return;
        }

        HDLBridge.setLogger(U.appendLog);
        els.binDirNote.textContent = HDLTools.binDir;
        // Ao fechar o painel (ou o Premiere), nenhum yt-dlp/FFmpeg fica rodando sozinho
        // e as sobras do download interrompido são apagadas.
        var onClose = function () {
            HDLTools.killAll();
            HDLQueue.cleanupOnClose();
        };
        window.addEventListener("beforeunload", onClose);
        window.addEventListener("unload", onClose);
        HDLProject.refresh();
        if (HDLBridge.available) {
            HDLBridge.hostVersion().then(function (v) {
                if (v !== C.CLIENT_VERSION) U.appendLog("Aviso: host " + v + " ≠ painel " + C.CLIENT_VERSION + " (reinstale a extensão inteira).");
            });
        }
        HDLTools.detectAll().then(function (st) {
            HDLToolsUI.render();
            U.updateEncoderHint();
            U.appendLog("yt-dlp: " + (st.ytdlp ? st.ytdlp.version + " (" + st.ytdlp.cmd + ")" : "não encontrado"));
            U.appendLog("FFmpeg: " + (st.ffmpeg ? st.ffmpeg.version + " (" + st.ffmpeg.cmd + ")" : "não encontrado"));
            U.appendLog("Deno: " + (st.deno ? st.deno.version + " (" + st.deno.cmd + ")" : "não encontrado"));
            if (!st.ytdlp || !st.ffmpeg) {
                els.toolsDetails.open = true;
                U.setStatus("Na primeira vez, as ferramentas (yt-dlp, FFmpeg e Deno) são baixadas automaticamente quando você clicar em Download.", "");
            }
            HDLToolsUI.maybeAutoUpdate();
            if (els.urlInput.value.trim()) HDLPreview.update();
        });
    }

    init();
})();
