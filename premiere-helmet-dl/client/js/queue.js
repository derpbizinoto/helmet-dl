// client/js/queue.js — Helmet DL
// Fila de downloads (um por vez) e a barra fixa do rodapé.
//
// Fluxo de cada item:
//   garante as ferramentas -> lê o caminho do projeto -> yt-dlp baixa para
//   <pasta do projeto>/Helmet DL -> FFmpeg (reencode / tirar áudio, se pedido)
//   -> host/index.jsx importa na aba Project (nunca na timeline).

var HDLQueue = (function () {
    var C = HDL_CONFIG;
    var U = HDLUi;
    var els = U.els;
    var nodePath = U.hasNode ? require("path") : null;
    var nodeFs = U.hasNode ? require("fs") : null;

    var jobs = [];
    var nextJobId = 1;
    var running = null;

    var STATE_CLASS = { queued: "", running: "", done: "done", warn: "warn", error: "error", canceled: "canceled" };

    function isRunning() {
        return !!running;
    }

    // Opções do painel no momento do clique, com o trecho já validado.
    function jobOptions() {
        var o = U.readOptions();
        if (o.trim) {
            var s = HDLDownloader.parseTime(o.trimStartText);
            var e = HDLDownloader.parseTime(o.trimEndText);
            if ((s !== null && isNaN(s)) || (e !== null && isNaN(e))) {
                throw new Error("Trecho inválido. Use segundos ou o formato 00:01:30.");
            }
            if (s === null && e === null) throw new Error("Informe o início e/ou o fim do trecho.");
            if (s !== null && e !== null && e <= s) throw new Error("O fim do trecho precisa ser depois do início.");
            o.trimStart = s || 0;
            o.trimEnd = e;
        }
        return o;
    }

    // Clique em Download (ou Enter): cada link válido vira um item na fila.
    function enqueue() {
        U.setStatus("");
        var parsed = HDLPreview.parseUrls(els.urlInput.value);
        if (!parsed.valid.length) {
            U.setStatus(parsed.invalid.length ? "Isso não parece um link. Cole o endereço completo do vídeo." : "Cole um link primeiro.", "warning");
            els.urlInput.focus();
            return;
        }
        if (!U.hasNode || !HDLBridge.available) {
            U.setStatus("Abra o painel dentro do Premiere (Janela › Extensões › Helmet DL) para baixar.", "warning");
            return;
        }
        var opts;
        try { opts = jobOptions(); } catch (e) { U.setStatus(e.message, "error"); return; }

        parsed.valid.forEach(function (url) {
            var cached = HDLPreview.cachedInfo(url);
            var job = {
                id: nextJobId++,
                url: url,
                opts: JSON.parse(JSON.stringify(opts)),
                title: cached ? cached.title : url,
                state: "queued",
                text: "Na fila",
                nums: "",
                percent: null,
                files: [],
                handle: null,
                cancelRequested: false
            };
            jobs.push(job);
            renderJob(job);
        });
        if (parsed.invalid.length) U.setStatus("Ignorado (não é link): " + parsed.invalid.join(" "), "warning");

        els.urlInput.value = "";
        HDLPreview.reset();
        pump();
    }

    function pump() {
        if (running) return;
        var next = null;
        for (var i = 0; i < jobs.length; i++) if (jobs[i].state === "queued") { next = jobs[i]; break; }
        if (!next) return;
        running = next;
        runJob(next).then(function () {
            running = null;
            pump();
        });
    }

    function setJob(job, patch) {
        for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) job[k] = patch[k];
        renderJob(job);
    }

    function checkCanceled(job) {
        if (job.cancelRequested) throw HDLDownloader.canceledError();
    }

    function runJob(job) {
        var o = job.opts;
        var outDir = "";
        var startedAt = Date.now();
        job.startedAt = startedAt;
        job.outDir = "";       // pasta de destino (para a limpeza ao fechar o painel)
        job.tempOutputs = [];  // saídas de reencode ainda incompletas
        job.created = [];      // arquivos que o yt-dlp começou a baixar
        job.downloaded = [];   // arquivos finais entregues pelo yt-dlp (não são apagados na limpeza…)
        job.intermediates = []; // …exceto estes: originais do modo Reencode, que só existem para virar o [H.264]

        function progress(text, percent, nums) {
            setJob(job, { text: text, percent: percent === undefined ? null : percent, nums: nums || "" });
        }

        return Promise.resolve().then(function () {
            setJob(job, { state: "running", text: "Preparando…", percent: null, nums: "" });
            return HDLToolsUI.ensureEssential(function (t) { progress(t, null); });
        }).then(function () {
            checkCanceled(job);
            return HDLProject.refresh();
        }).then(function () {
            if (!HDLProject.info.path) {
                throw new Error("Salve o projeto do Premiere antes de baixar — a pasta \"" + C.FOLDER_NAME + "\" é criada ao lado do arquivo .prproj.");
            }
            outDir = HDLProject.helmetDir();
            job.outDir = outDir;
            HDLTools.ensureDir(outDir);
            U.appendLog("Baixando " + job.url + " → " + outDir);
            progress("Lendo informações…", null);
            job.handle = HDLDownloader.download(job.url, o, outDir, {
                onProgress: function (p) { progress(p.text, p.percent, p.nums); },
                onLog: U.appendLog
            });
            job.created = job.handle.created;
            savePending(job);
            return job.handle.promise;
        }).then(function (res) {
            job.downloaded = res.files.slice();
            // No Reencode o original é apagado quando dá certo; se o reencode for cancelado
            // ou falhar, ele também é apagado (a não ser que já existisse antes deste download).
            if (o.content !== "audio" && o.mode === "reencode" && !res.alreadyHad) job.intermediates = res.files.slice();
            savePending(job);
            if (res.partialError) U.appendLog("Aviso: " + res.partialError);
            if (res.files.length && job.title === job.url) job.title = nodePath.basename(res.files[0]);
            return postProcess(job, res.files, res.alreadyHad);
        }).then(function (finals) {
            checkCanceled(job);
            job.files = finals;
            progress("Importando no Project…", null);
            var list = finals.map(function (f) { return encodeURIComponent(f); }).join(",");
            return HDLBridge.call("hdl_importFiles", [list, o.bin ? C.BIN_NAME : ""])
                .then(function (r) { return { r: r, finals: finals }; });
        }).then(function (x) {
            var r = x.r;
            var where = r.bin ? "Project › " + r.bin : "Project";
            var text;
            if (r.imported && r.result) text = (r.imported > 1 ? r.imported + " arquivos importados em " : "Importado em ") + where;
            else if (r.imported && !r.result) text = "Baixado, mas o Premiere recusou a importação. O arquivo está na pasta " + C.FOLDER_NAME + ".";
            else text = "Já estava no " + where;
            var state = job.warn ? "warn" : (r.imported && !r.result ? "warn" : "done");
            if (job.warn) text += " · " + job.warn;
            var size = 0;
            x.finals.forEach(function (f) {
                try { size += nodeFs.statSync(f).size; } catch (e) { HDLLog.debug("sem tamanho para", f); }
            });
            setJob(job, { state: state, text: text, percent: null, nums: [job.resLabel, U.fmtBytes(size)].filter(Boolean).join(" · ") });
            U.appendLog("Concluído: " + x.finals.join(" | "));
            clearPending(job);
        }).catch(function (e) {
            job.handle = null;
            // cancelado ou com erro: apaga as sobras (o arquivo final já baixado fica)
            cleanupPartials(outDir, startedAt, job);
            if (e.canceled || job.cancelRequested) {
                setJob(job, { state: "canceled", text: "Cancelado", percent: null, nums: "" });
                U.appendLog("Cancelado: " + job.url);
            } else {
                setJob(job, { state: "error", text: e.message, percent: null, nums: "" });
                U.appendLog("ERRO: " + e.message);
            }
        });
    }

    // Reencode de um arquivo (GPU se pedido e disponível; se a GPU falhar, refaz na CPU).
    // Resolve com o caminho do arquivo reencodado.
    function reencodeFile(job, file, info, tag) {
        var o = job.opts;
        var codecLabel = (HDLDownloader.CODECS[o.codec] || HDLDownloader.CODECS.h264).label;
        var out = HDLDownloader.reencodeOutput(file, o.codec);
        job.tempOutputs.push(out);
        savePending(job);
        var gpuStep = (o.encoder === "gpu" && o.codec !== "prores")
            ? HDLDownloader.detectGpu().then(function (g) { return HDLDownloader.gpuVideoArgs(g, o.codec) ? g : null; })
            : Promise.resolve(null);
        var encodeWith = function (gpu) {
            setJob(job, { text: "Reencodando para " + codecLabel + (gpu ? " (GPU)" : " (CPU)") + tag + "…", percent: 0, nums: "" });
            job.handle = HDLDownloader.reencode(file, out, o.codec, o.content === "video", info, function (f) {
                setJob(job, { percent: f, nums: Math.floor(f * 100) + "%" });
            }, U.appendLog, gpu);
            return job.handle.promise;
        };
        return gpuStep.then(function (gpu) {
            if (o.encoder === "gpu" && !gpu) U.appendLog("GPU indisponível para " + codecLabel + "; usando a CPU.");
            return encodeWith(gpu).catch(function (e) {
                // a GPU falhou (driver, resolução não suportada…): refaz na CPU
                if (!gpu || e.canceled || job.cancelRequested) throw e;
                U.appendLog("O encode na GPU falhou (" + e.message + "). Refazendo na CPU…");
                try { nodeFs.unlinkSync(out); } catch (x) { /* a GPU não chegou a criar o arquivo */ }
                return encodeWith(null);
            });
        }).then(function () {
            job.tempOutputs = [];
            return out;
        });
    }

    // Reencode / remover áudio, conforme as opções. Retorna os arquivos finais.
    // alreadyHad: o arquivo já existia antes deste download (pode estar em uso no projeto),
    // então nunca é apagado depois do reencode.
    function postProcess(job, files, alreadyHad) {
        var o = job.opts;
        var finals = [];
        var wantsReencode = o.content !== "audio" && (o.mode === "reencode" || o.mode === "both");

        return files.reduce(function (chain, file, idx) {
            return chain.then(function () {
                checkCanceled(job);
                var tag = files.length > 1 ? " (" + (idx + 1) + "/" + files.length + ")" : "";
                if (o.content === "audio") { finals.push(file); return; }

                return HDLDownloader.probe(file).then(function (info) {
                    if (info && info.height) job.resLabel = Math.min(info.width || info.height, info.height) + "p";

                    if (wantsReencode) {
                        return reencodeFile(job, file, info, tag).then(function (out) {
                            if (o.mode === "reencode") {
                                if (!alreadyHad) {
                                    try { nodeFs.unlinkSync(file); } catch (e) { U.appendLog("Não apaguei o original: " + e.message); }
                                }
                                finals.push(out);
                            } else {
                                finals.push(file, out);
                            }
                        });
                    }

                    var after = Promise.resolve(info);
                    if (o.content === "video" && info && info.acodec) {
                        setJob(job, { text: "Removendo o áudio" + tag + "…", percent: null, nums: "" });
                        job.handle = HDLDownloader.stripAudio(file, U.appendLog);
                        after = job.handle.promise.then(function () { info.acodec = null; return info; });
                    }
                    return after.then(function (inf) {
                        var w = HDLDownloader.compatWarning(inf);
                        if (w) { job.warn = w; U.appendLog("Aviso: " + w); }
                        finals.push(file);
                    });
                });
            });
        }, Promise.resolve()).then(function () { return finals; });
    }

    // Apaga um arquivo. Com `wait`, insiste por até ~1 s enquanto o Windows ainda o
    // mantém travado (usado ao fechar o painel, quando não dá para esperar com setTimeout).
    function rmFile(f, wait) {
        for (var i = 0; ; i++) {
            try { nodeFs.unlinkSync(f); return; } catch (e) {
                if (e.code === "ENOENT") return;
                if (!wait || i >= 10 || (e.code !== "EBUSY" && e.code !== "EPERM" && e.code !== "EACCES")) {
                    HDLLog.debug("não apaguei a sobra", f, e.message);
                    return;
                }
                var until = Date.now() + 100;
                while (Date.now() < until) { /* espera o processo soltar o arquivo */ }
            }
        }
    }

    // Remove as sobras de um download cancelado, com erro ou interrompido pelo fechamento
    // do painel: .part, fragmentos, formatos intermediários, saída de reencode incompleta e
    // o original do modo Reencode (job.intermediates). Nunca apaga os demais arquivos finais
    // entregues pelo yt-dlp (job.downloaded) nem nada fora da pasta de destino.
    function removeLeftovers(outDir, since, job, wait) {
        if (!outDir) return;
        var intermediates = (job.intermediates || []).map(function (f) { return nodePath.resolve(f).toLowerCase(); });
        var keep = (job.downloaded || []).map(function (f) { return nodePath.resolve(f).toLowerCase(); })
            .filter(function (f) { return intermediates.indexOf(f) < 0; });
        (job.created || []).concat(job.intermediates || []).forEach(function (f) {
            if (!HDLDownloader.isInside(outDir, f) || keep.indexOf(nodePath.resolve(f).toLowerCase()) >= 0) return;
            [f, f + ".part", f + ".ytdl"].forEach(function (x) { rmFile(x, wait); });
        });
        try {
            nodeFs.readdirSync(outDir).forEach(function (name) {
                if (!/\.(part|ytdl|temp)$|\.part-Frag\d+|\.temp\.\w+$/i.test(name)) return;
                var full = nodePath.join(outDir, name);
                try {
                    if (nodeFs.statSync(full).mtimeMs >= since - 2000) rmFile(full, wait);
                } catch (e) { HDLLog.debug("não apaguei a sobra", full, e.message); }
            });
        } catch (e) { HDLLog.debug("não consegui listar", outDir, e.message); }
    }

    function cleanupPartials(outDir, since, job) {
        if (!U.hasNode) return;
        (job.tempOutputs || []).forEach(function (f) { rmFile(f, false); });
        job.tempOutputs = [];
        setTimeout(function () { // espera o processo soltar os arquivos
            removeLeftovers(outDir, since, job, false);
            clearPending(job);
        }, C.CLEANUP_DELAY_MS);
    }

    // --- download interrompido pelo fechamento do painel ------------------------------
    // Enquanto um download roda, fica anotado (no armazenamento do painel) onde estão as
    // sobras dele. Se o painel fechar no meio, a limpeza tenta rodar na hora; se o Premiere
    // não der tempo para isso, ela roda na próxima vez que o painel abrir.

    function savePending(job) {
        if (!U.hasNode || !job.outDir) return;
        try {
            localStorage.setItem(C.PENDING_CLEANUP_KEY, JSON.stringify({
                outDir: job.outDir,
                since: job.startedAt,
                created: (job.created || []).slice(),
                downloaded: (job.downloaded || []).slice(),
                intermediates: (job.intermediates || []).slice(),
                tempOutputs: (job.tempOutputs || []).slice()
            }));
        } catch (e) { HDLLog.debug("não consegui anotar o download em andamento", e.message); }
    }

    function readPending() {
        var rec = null;
        try { rec = JSON.parse(localStorage.getItem(C.PENDING_CLEANUP_KEY) || "null"); } catch (e) { rec = null; }
        if (!rec || typeof rec.outDir !== "string" || typeof rec.since !== "number") return null;
        // só a pasta "Helmet DL" de algum projeto, e listas só de texto
        if (!nodePath.isAbsolute(rec.outDir) || nodePath.basename(rec.outDir) !== C.FOLDER_NAME) return null;
        ["created", "downloaded", "intermediates", "tempOutputs"].forEach(function (k) {
            rec[k] = Array.isArray(rec[k]) ? rec[k].filter(function (f) { return typeof f === "string"; }) : [];
        });
        return rec;
    }

    // job: só apaga a anotação se ela for deste download (outro já pode ter começado).
    function clearPending(job) {
        try {
            if (job) {
                var rec = readPending();
                if (rec && rec.since !== job.startedAt) return;
            }
            localStorage.removeItem(C.PENDING_CLEANUP_KEY);
        } catch (e) { HDLLog.debug("não consegui limpar a anotação", e.message); }
    }

    // Painel (ou Premiere) fechando: anota o estado mais recente, encerra os processos e
    // apaga as sobras sem esperar.
    var closing = false;

    function cleanupOnClose(killAll) {
        if (closing || !U.hasNode) return;
        closing = true;
        var active = jobs.filter(function (job) { return job.state === "running"; });
        active.forEach(savePending);
        killAll();
        active.forEach(function (job) {
            job.cancelRequested = true;
            (job.tempOutputs || []).forEach(function (f) { rmFile(f, true); });
            removeLeftovers(job.outDir, job.startedAt, job, true);
            clearPending(job);
        });
    }

    // Ao abrir o painel: se a última sessão fechou no meio de um download, apaga as sobras.
    function cleanupLastSession() {
        if (!U.hasNode) return;
        var rec = readPending();
        if (!rec) { clearPending(); return; }
        setTimeout(function () {
            if (jobs.some(function (j) { return j.state === "running"; })) return; // nunca no meio de outro download
            rec.tempOutputs.forEach(function (f) { if (HDLDownloader.isInside(rec.outDir, f)) rmFile(f, false); });
            removeLeftovers(rec.outDir, rec.since, rec, false);
            clearPending();
            U.appendLog("Apaguei as sobras do download interrompido quando o painel foi fechado (" + rec.outDir + ").");
        }, C.CLEANUP_DELAY_MS);
    }

    function cancelJob(job) {
        job.cancelRequested = true;
        if (job.state === "queued") {
            setJob(job, { state: "canceled", text: "Cancelado" });
            return;
        }
        setJob(job, { text: "Cancelando…" });
        if (job.handle) job.handle.cancel();
    }

    function retryJob(job) {
        setJob(job, { state: "queued", text: "Na fila", percent: null, nums: "", cancelRequested: false, warn: null, files: [] });
        pump();
    }

    function removeJob(job) {
        jobs = jobs.filter(function (j) { return j !== job; });
        if (job.el && job.el.parentNode) job.el.parentNode.removeChild(job.el);
        updateDock();
    }

    function clearDone() {
        jobs.slice().forEach(function (j) { if (j.state !== "queued" && j.state !== "running") removeJob(j); });
    }

    function findJob(id) {
        for (var i = 0; i < jobs.length; i++) if (String(jobs[i].id) === String(id)) return jobs[i];
        return null;
    }

    // Botões de cada item da lista (um único "ouvinte" na lista inteira).
    function onListClick(e) {
        var btn = e.target.closest("button[data-action]");
        if (!btn) return;
        var li = btn.closest("li");
        var job = li && findJob(li.dataset.id);
        if (!job) return;
        var a = btn.dataset.action;
        if (a === "cancel") cancelJob(job);
        else if (a === "retry") retryJob(job);
        else if (a === "remove") removeJob(job);
        else if (a === "reveal" && job.files.length) HDLProject.reveal(job.files[job.files.length - 1], true);
    }

    // --- renderização da fila ---------------------------------------------------------------

    // Montagem dos elementos sem innerHTML: nenhum texto vira HTML por acidente.
    var SVG_NS = "http://www.w3.org/2000/svg";

    function el(tag, className, children) {
        var e = document.createElement(tag);
        if (className) e.className = className;
        (children || []).forEach(function (c) { e.appendChild(c); });
        return e;
    }

    function iconBtn(action, icon, title) {
        var svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", "icon");
        var use = document.createElementNS(SVG_NS, "use");
        use.setAttribute("href", "#" + icon);
        svg.appendChild(use);
        var b = el("button", "icon-btn sm", [svg]);
        b.dataset.action = action;
        b.title = title;
        return b;
    }

    function renderJob(job) {
        if (!job.el) {
            job.el = document.createElement("li");
            job.el.dataset.id = job.id;
            var progress = el("div", "progress", [el("div", "progress-bar")]);
            progress.style.display = "none";
            job.el.appendChild(el("div", "q-head", [el("span", "q-title"), el("div", "q-actions")]));
            job.el.appendChild(progress);
            job.el.appendChild(el("div", "q-line", [el("span", "q-state"), el("span", "q-nums")]));
            els.queue.insertBefore(job.el, els.queue.firstChild);
        }
        var active = job.state === "running";
        var cls = "q-item " + (STATE_CLASS[job.state] || "");
        if (active && (job.percent === null || job.percent === undefined)) cls += " indeterminate";
        job.el.className = cls;

        var title = job.el.querySelector(".q-title");
        title.textContent = job.title;
        title.title = job.url;

        var actionsEl = job.el.querySelector(".q-actions");
        if (actionsEl.dataset.key !== job.state) {
            var actions;
            if (job.state === "queued" || job.state === "running") actions = [iconBtn("cancel", "i-x", "Cancelar")];
            else if (job.state === "done" || job.state === "warn") actions = [iconBtn("reveal", "i-folder", "Mostrar na pasta"), iconBtn("remove", "i-x", "Tirar da lista")];
            else actions = [iconBtn("retry", "i-retry", "Tentar de novo"), iconBtn("remove", "i-x", "Tirar da lista")];
            while (actionsEl.firstChild) actionsEl.removeChild(actionsEl.firstChild);
            actions.forEach(function (b) { actionsEl.appendChild(b); });
            actionsEl.dataset.key = job.state;
        }

        var prog = job.el.querySelector(".progress");
        prog.style.display = active ? "" : "none";
        if (active) job.el.querySelector(".progress-bar").style.width = Math.round((job.percent || 0) * 100) + "%";

        job.el.querySelector(".q-state").textContent = job.text;
        job.el.querySelector(".q-state").title = job.text;
        job.el.querySelector(".q-nums").textContent = job.nums || "";
        updateDock();
    }

    // --- progresso fixo no rodapé -------------------------------------------------------------
    // Mostra o download em andamento enquanto a barra dele na lista está fora da área visível.
    // Some quando o item aparece na rolagem ou quando o download termina.

    var dockJob = null;

    function activeJob() {
        for (var i = 0; i < jobs.length; i++) if (jobs[i].state === "running") return jobs[i];
        for (var k = 0; k < jobs.length; k++) if (jobs[k].state === "queued") return jobs[k];
        return null;
    }

    function isOnScreen(node) {
        if (!node || !node.offsetParent) return false;
        var r = node.getBoundingClientRect(), c = els.content.getBoundingClientRect();
        return r.bottom > c.top && r.top < c.bottom;
    }

    function updateDock() {
        if (!els.dock) return;
        var job = activeJob();
        var target = job && job.el && (job.el.querySelector(".progress") || job.el);
        if (target && target.style.display === "none") target = job.el;
        var show = !!job && !isOnScreen(target);
        dockJob = show ? job : null;
        if (!show) {
            if (!els.dock.hidden) els.dock.hidden = true;
            return;
        }
        var waiting = job.state === "queued" || job.percent === null || job.percent === undefined;
        els.dock.className = "dock" + (waiting ? " indeterminate" : "");
        els.dockTitle.textContent = job.title;
        els.dockBar.style.width = Math.round((job.percent || 0) * 100) + "%";
        var queued = jobs.filter(function (j) { return j.state === "queued" && j !== job; }).length;
        els.dockState.textContent = job.text + (queued ? " · +" + queued + " na fila" : "");
        els.dockState.title = job.text;
        els.dockNums.textContent = job.nums || "";
        if (els.dock.hidden) els.dock.hidden = false;
    }

    function bindDock() {
        if (!els.dock) return;
        els.content.addEventListener("scroll", updateDock, { passive: true });
        window.addEventListener("resize", updateDock);
        els.dockTitle.addEventListener("click", function () {
            if (dockJob && dockJob.el) dockJob.el.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        els.dockCancel.addEventListener("click", function () { if (dockJob) cancelJob(dockJob); });
    }

    // --- prévia no navegador (fora do Premiere): index.html?demo ------------------------------

    function demo() {
        var samples = [
            { title: "Como montar um set de iluminação barato", state: "running", text: "Baixando vídeo", percent: 0.62, nums: "62% · 8.4 MB/s · 0:12" },
            { title: "Trailer oficial — 4K", state: "queued", text: "Na fila" },
            { title: "Entrevista completa (corte 10:00–12:30)", state: "done", text: "Importado em Project › Helmet DL", nums: "1080p · 54.2 MB" },
            { title: "clip_twitch_epic_moment", state: "warn", text: "Importado em Project › Helmet DL · Veio com vídeo em VP9, que o Premiere pode não abrir.", nums: "720p · 12.0 MB" },
            { title: "https://www.instagram.com/reel/xyz", state: "error", text: "Login necessário — escolha um navegador em \"Cookies do navegador\"." }
        ];
        samples.reverse().forEach(function (s) {
            var job = { id: nextJobId++, url: s.title, opts: {}, title: s.title, state: s.state, text: s.text, nums: s.nums || "", percent: s.percent, files: [] };
            jobs.push(job);
            renderJob(job);
        });
        els.preview.style.display = "";
        els.previewTitle.textContent = "Como montar um set de iluminação barato para gravar em casa";
        els.previewMeta.textContent = "Canal Exemplo · Youtube · até 2160p";
        els.previewDuration.textContent = "12:48";
    }

    return {
        enqueue: enqueue,
        isRunning: isRunning,
        clearDone: clearDone,
        onListClick: onListClick,
        bindDock: bindDock,
        cleanupOnClose: cleanupOnClose,
        cleanupLastSession: cleanupLastSession,
        demo: demo,
        // expostos para os testes automáticos
        _removeLeftovers: removeLeftovers,
        _savePending: savePending
    };
})();
