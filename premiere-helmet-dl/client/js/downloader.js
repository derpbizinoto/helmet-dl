// client/js/downloader.js — Helmet DL
// Monta os argumentos do yt-dlp a partir das opções do painel, roda o download
// lendo o progresso linha a linha, e faz o pós-processamento com o FFmpeg
// (reencode, remover áudio no modo "Só vídeo", sondagem de codecs).

var HDLDownloader = (function () {
    if (typeof require !== "function" || !HDLTools) return null;

    var path = require("path");
    var fs = require("fs");
    var os = require("os");

    var T = HDLTools;
    var tr = HDLI18n.t;

    // Codecs que o Premiere abre sem dor de cabeça.
    var PREMIERE_VCODECS = ["h264", "hevc", "prores", "dnxhd", "mpeg2video", "mpeg4", "mjpeg", "cfhd"];
    var PREMIERE_ACODECS = ["aac", "mp3", "pcm_s16le", "pcm_s24le", "pcm_f32le", "alac", "ac3", "eac3"];

    var CODECS = {
        h264: {
            label: "H.264", ext: "mp4",
            video: ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p"],
            audio: ["-c:a", "aac", "-b:a", "320k", "-ar", "48000"],
            extra: ["-movflags", "+faststart"]
        },
        h265: {
            label: "H.265", ext: "mp4",
            video: ["-c:v", "libx265", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-tag:v", "hvc1"],
            audio: ["-c:a", "aac", "-b:a", "320k", "-ar", "48000"],
            extra: ["-movflags", "+faststart"]
        },
        prores: {
            label: "ProRes 422", ext: "mov",
            video: ["-c:v", "prores_ks", "-profile:v", "2", "-pix_fmt", "yuv422p10le", "-vendor", "apl0"],
            audio: ["-c:a", "pcm_s16le", "-ar", "48000"],
            extra: []
        }
    };

    // Encoders de GPU (só o encode vai para a GPU; a decodificação fica na CPU, que é
    // o caminho mais compatível). Ordem de preferência: NVIDIA, AMD, Intel.
    var GPU_ENCODERS = {
        nvenc: {
            label: "NVIDIA NVENC",
            h264: ["-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", "19", "-b:v", "0", "-profile:v", "high", "-pix_fmt", "yuv420p"],
            h265: ["-c:v", "hevc_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", "21", "-b:v", "0", "-pix_fmt", "yuv420p", "-tag:v", "hvc1"]
        },
        amf: {
            label: "AMD AMF",
            h264: ["-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", "18", "-qp_p", "20", "-qp_b", "22", "-pix_fmt", "yuv420p"],
            h265: ["-c:v", "hevc_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", "20", "-qp_p", "22", "-pix_fmt", "yuv420p", "-tag:v", "hvc1"]
        },
        qsv: {
            label: "Intel Quick Sync",
            h264: ["-c:v", "h264_qsv", "-preset", "slow", "-global_quality", "20", "-pix_fmt", "nv12"],
            h265: ["-c:v", "hevc_qsv", "-preset", "slow", "-global_quality", "22", "-pix_fmt", "nv12", "-tag:v", "hvc1"]
        }
    };
    var GPU_TEST_NAMES = { nvenc: ["h264_nvenc", "hevc_nvenc"], amf: ["h264_amf", "hevc_amf"], qsv: ["h264_qsv", "hevc_qsv"] };
    var gpuPromise = null;

    // Descobre qual encoder de GPU funciona de verdade nesta máquina (um encode de
    // teste de 0,2 s; o ffmpeg lista encoders mesmo sem a placa correspondente).
    // Resolve com { vendor, label, codecs: { h264: bool, h265: bool } } ou null.
    function detectGpu() {
        if (gpuPromise) return gpuPromise;
        var ff = T.state.ffmpeg;
        if (!ff) return Promise.resolve(null);
        function works(enc) {
            return T.runCapture(ff.cmd, ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=black:s=256x256:d=0.2",
                "-c:v", enc, "-f", "null", "-"], HDL_CONFIG.TIMEOUT.gpuTest).then(function (r) { return r.code === 0; });
        }
        gpuPromise = ["nvenc", "amf", "qsv"].reduce(function (p, vendor) {
            return p.then(function (found) {
                if (found) return found;
                return works(GPU_TEST_NAMES[vendor][0]).then(function (ok264) {
                    if (!ok264) return null;
                    return works(GPU_TEST_NAMES[vendor][1]).then(function (ok265) {
                        return { vendor: vendor, label: GPU_ENCODERS[vendor].label, codecs: { h264: true, h265: ok265 } };
                    });
                });
            });
        }, Promise.resolve(null));
        return gpuPromise;
    }

    // Argumentos de vídeo da GPU para o codec, ou null se não houver suporte.
    function gpuVideoArgs(gpu, codecKey) {
        if (!gpu || !gpu.codecs[codecKey]) return null;
        return GPU_ENCODERS[gpu.vendor][codecKey] || null;
    }

    // --- utilidades -------------------------------------------------------------

    // "90", "1:30", "01:02:03.5" -> segundos (ou null se inválido)
    function parseTime(s) {
        s = String(s || "").trim().replace(",", ".");
        if (!s) return null;
        if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(s)) return NaN;
        var parts = s.split(":").map(parseFloat);
        var sec = 0;
        for (var i = 0; i < parts.length; i++) sec = sec * 60 + parts[i];
        return sec;
    }

    function fmtBytes(n) {
        if (!n || isNaN(n)) return "";
        var u = ["B", "KB", "MB", "GB"], i = 0;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return (i >= 2 ? n.toFixed(1) : Math.round(n)) + " " + u[i];
    }

    function fmtEta(sec) {
        sec = Math.round(sec);
        if (!isFinite(sec) || sec < 0) return "";
        var m = Math.floor(sec / 60), s = sec % 60;
        if (m >= 60) return Math.floor(m / 60) + "h" + ("0" + (m % 60)).slice(-2);
        return m + ":" + ("0" + s).slice(-2);
    }

    function num(v) {
        var n = parseFloat(v);
        return isNaN(n) ? null : n;
    }

    // Erro de "cancelado pelo usuário" (o painel o reconhece por e.canceled).
    function canceledError() {
        var e = new Error(tr("Cancelado"));
        e.canceled = true;
        return e;
    }

    // "> yt-dlp --opcao "valor com espaço" …" para o card Log.
    function commandForLog(name, args) {
        return "> " + name + " " + args.map(function (x) { return /\s/.test(x) ? '"' + x + '"' : x; }).join(" ");
    }

    // --- nomes e caminhos de arquivo ---------------------------------------------

    // true se `file` está dentro da pasta `dir` (nunca fora dela, nem com "..").
    function isInside(dir, file) {
        var rel = path.relative(path.resolve(dir), path.resolve(file));
        return !!rel && rel.split(/[\\/]/)[0] !== ".." && !path.isAbsolute(rel);
    }

    var RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

    // Nome de arquivo seguro no Windows (sem pasta): tira \ / : * ? " < > | e
    // caracteres de controle, troca ".." por ".", evita nomes reservados (CON, NUL…),
    // tira pontos/espaços do fim e limita o tamanho em bytes sem quebrar emoji.
    function safeName(name, maxBytes) {
        maxBytes = maxBytes || 180;
        var s = String(name || "")
            .replace(/[\\/:*?"<>|\u0000-\u001F\u007F]/g, "_")
            .replace(/\.{2,}/g, ".")
            .trim();
        var out = "", bytes = 0;
        var chars = Array.from(s);
        for (var i = 0; i < chars.length; i++) {
            var b = Buffer.byteLength(chars[i], "utf8");
            if (bytes + b > maxBytes) break;
            out += chars[i];
            bytes += b;
        }
        out = out.replace(/[. ]+$/, "");
        if (!out) out = "download";
        if (RESERVED.test(out.split(".")[0])) out = "_" + out;
        return out;
    }

    // Se o arquivo já existe, devolve "<nome> (2).ext", "<nome> (3).ext"…
    // (nunca grava por cima de um arquivo que já está na pasta).
    function uniquePath(p) {
        if (!fs.existsSync(p)) return p;
        var ext = path.extname(p);
        var base = p.slice(0, p.length - ext.length);
        for (var n = 2; n < 1000; n++) {
            var cand = base + " (" + n + ")" + ext;
            if (!fs.existsSync(cand)) return cand;
        }
        throw new Error(tr("Arquivos demais com o mesmo nome: {0}", p));
    }

    function ytdlpSupportsJsRuntimes() {
        var v = T.state.ytdlp && T.state.ytdlp.version;
        return !!v && v >= "2025.11";
    }

    // Argumentos comuns a todas as chamadas do yt-dlp.
    function baseArgs(opts) {
        // --encoding utf-8: sem isso, no Windows, o yt-dlp escreve a saída na codificação
        // antiga e acentos/emoji de títulos e caminhos chegam estragados ao painel.
        var a = ["--ignore-config", "--no-color", "--encoding", "utf-8"];
        if (T.state.ffmpeg) a.push("--ffmpeg-location", T.state.ffmpeg.dir);
        if (T.state.deno && ytdlpSupportsJsRuntimes()) a.push("--js-runtimes", "deno:" + T.state.deno.cmd);
        if (opts.cookies) a.push("--cookies-from-browser", opts.cookies);
        a.push(opts.playlist ? "--yes-playlist" : "--no-playlist");
        return a;
    }

    function ytdlpCmd() {
        var y = T.state.ytdlp;
        if (!y) throw new Error(tr("yt-dlp não encontrado."));
        return { cmd: y.cmd, base: y.base || [] };
    }

    // Lê a saída de um processo linha a linha (aceita \n e \r).
    function lineReader(stream, onLine) {
        var buf = "";
        stream.setEncoding("utf8");
        stream.on("data", function (d) {
            buf += d;
            var parts = buf.split(/\r\n|\n|\r/);
            buf = parts.pop();
            parts.forEach(function (l) { if (l.length) onLine(l); });
        });
        stream.on("end", function () { if (buf.length) onLine(buf); buf = ""; });
    }

    // --- informações do link (prévia) --------------------------------------------

    function fetchInfo(url, opts) {
        var y = ytdlpCmd();
        var args = y.base.concat(baseArgs(opts), ["-J", "--skip-download", "--no-warnings"]);
        if (opts.playlist) args.push("--flat-playlist");
        args.push("--", url);
        var child = T.spawnTool(y.cmd, args);
        var out = "", err = "";
        var promise = new Promise(function (resolve, reject) {
            child.stdout.setEncoding("utf8");
            child.stderr.setEncoding("utf8");
            child.stdout.on("data", function (d) { out += d; });
            child.stderr.on("data", function (d) { err += d; });
            child.on("error", reject);
            child.on("close", function (code) {
                if (code !== 0) {
                    reject(new Error(cleanError(err) || tr("yt-dlp saiu com código {0}", code)));
                    return;
                }
                try { resolve(summarizeInfo(JSON.parse(out))); }
                catch (e) { reject(new Error(tr("Resposta inesperada do yt-dlp."))); }
            });
        });
        return { promise: promise, cancel: function () { T.killTree(child); } };
    }

    function summarizeInfo(info) {
        var isPlaylist = info._type === "playlist";
        var maxRes = 0;
        (info.formats || []).forEach(function (f) {
            if (!f.vcodec || f.vcodec === "none") return;
            var r = (f.width && f.height) ? Math.min(f.width, f.height) : (f.height || 0);
            if (r > maxRes) maxRes = r;
        });
        var thumb = info.thumbnail || "";
        if (!thumb && info.thumbnails && info.thumbnails.length) thumb = info.thumbnails[info.thumbnails.length - 1].url;
        return {
            isPlaylist: isPlaylist,
            count: isPlaylist ? (info.playlist_count || (info.entries || []).length) : 1,
            id: info.id || "",
            title: info.title || info.fulltitle || tr("(sem título)"),
            uploader: info.uploader || info.channel || info.creator || "",
            site: info.extractor_key || info.ie_key || "",
            duration: info.duration || 0,
            isLive: !!info.is_live,
            thumbnail: thumb,
            maxRes: maxRes
        };
    }

    function cleanError(stderr) {
        var lines = String(stderr || "").split(/\r?\n/).filter(function (l) { return /^ERROR:/.test(l); });
        var msg = lines.length ? lines[lines.length - 1] : String(stderr || "").trim().split(/\r?\n/).pop();
        return (msg || "").replace(/^ERROR:\s*/, "").replace(/^\[[^\]]+\]\s*[^:]+:\s*/, "").trim();
    }

    // Traduz os erros mais comuns para algo acionável.
    function friendlyError(msg) {
        var m = String(msg || "");
        if (T.isNetworkError(m)) return tr(T.NETWORK_MESSAGE);
        // "age" sozinho também casaria com "webpage"/"message"; aqui é só restrição de idade
        if (/Sign in to confirm|\bage\b|age[- ]restricted|login required|log in|rate-limit|private/i.test(m)) {
            return tr("{0} — tente escolher um navegador em \"Cookies do navegador\" (onde você está logado).", m);
        }
        if (/Could not copy .* cookie database|Failed to decrypt|DPAPI/i.test(m)) {
            return tr("Não deu para ler os cookies do navegador. Feche o navegador e tente de novo, ou use o Firefox. ({0})", m);
        }
        if (/Unsupported URL/i.test(m)) return tr("Este site não é suportado (o yt-dlp não sabe baixar desse endereço).");
        if (/ffmpeg|ffprobe/i.test(m) && /not found|not installed/i.test(m)) return tr("FFmpeg não encontrado — instale em Ferramentas.");
        if (/Requested format is not available/i.test(m)) return tr("O formato pedido não existe para esse vídeo. Tente outra qualidade.");
        return m;
    }

    // --- download ----------------------------------------------------------------

    function formatArgs(o) {
        var a = [];
        if (o.content === "audio") {
            a.push("-f", "ba/b", "-x");
            if (o.audioFormat !== "best") a.push("--audio-format", o.audioFormat);
            if (o.audioFormat === "mp3") a.push("--audio-quality", "320K");
            return a;
        }

        // "res" no -S usa a MENOR dimensão, então 1080 também funciona para vídeos em pé.
        var sort = [o.quality === "best" ? "res" : "res:" + o.quality];
        if (o.compat) sort.push("vcodec:h264", "acodec:aac", "ext:mp4:m4a");
        a.push("-S", sort.join(","));
        a.push("-f", o.content === "video" ? "bv/bv*" : "bv*+ba/b");

        if (o.mode === "remux" || o.mode === "both") {
            a.push("--merge-output-format", o.container, "--remux-video", o.container);
        } else if (o.mode === "reencode") {
            a.push("--merge-output-format", "mkv"); // aceita qualquer combinação de codecs; será reencodado
        } else if (o.compat) {
            a.push("--merge-output-format", "mp4/mkv");
        }
        return a;
    }

    // opts: opções do painel. outDir: pasta de destino.
    // cb.onProgress({ phase, percent, text, nums }), cb.onLog(line)
    // Retorna { promise -> [arquivos finais], cancel() }.
    function download(url, opts, outDir, cb) {
        var y = ytdlpCmd();
        T.ensureDir(outDir);

        var printFile = path.join(os.tmpdir(), "helmet-dl-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".txt");

        var nameTpl = HDL_CONFIG.NAME_TEMPLATE;
        var args = y.base.concat(baseArgs(opts), [
            "--newline", "--no-mtime", "--concurrent-fragments", HDL_CONFIG.CONCURRENT_FRAGMENTS,
            "--progress-template", "download:HDLP|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress.fragment_index)s|%(progress.fragment_count)s",
            "--print-to-file", "after_move:filepath", printFile,
            // o yt-dlp limpa o título (barras, caracteres inválidos do Windows) para
            // virar nome de arquivo; explícito para valer também no Mac
            "--windows-filenames",
            "-P", outDir
        ]);

        if (opts.trim) {
            var s = opts.trimStart || 0;
            var e = opts.trimEnd;
            args.push("--download-sections", "*" + s + "-" + (e ? e : "inf"));
            // No áudio o corte sem reencode volta até o ponto de busca anterior (pode trazer
            // vários segundos a mais). Forçar o corte exato é barato para áudio.
            if (opts.content === "audio") args.push("--force-keyframes-at-cuts");
            nameTpl += " " + Math.round(s) + "-" + (e ? Math.round(e) : "fim") + "s";
        }
        if (opts.playlist) nameTpl = "%(playlist_index|)s%(playlist_index& - |)s" + nameTpl;
        args.push("-o", nameTpl + ".%(ext)s");
        args = args.concat(formatArgs(opts));
        args.push("--", url);

        cb.onLog(commandForLog("yt-dlp", args.slice(y.base.length)));

        var child = T.spawnTool(y.cmd, args);
        var canceled = false;
        var errLines = [];
        var part = 0;
        var item = null; // "2 de 5" em playlists
        var alreadyHad = false;
        var created = []; // arquivos que o yt-dlp começou a baixar (para limpar se der erro/cancelar)
        var finished = []; // arquivos que ficaram prontos (ex.: vídeos já concluídos de uma playlist)
        var existing = []; // arquivos que já estavam na pasta antes ("has already been downloaded")

        // Arquivos prontos até agora, segundo o --print-to-file (dentro da pasta de destino).
        function readFinished() {
            var list = [];
            try {
                if (fs.existsSync(printFile)) {
                    list = fs.readFileSync(printFile, "utf8").split(/\r?\n/).map(function (l) { return l.trim(); })
                        .filter(function (l) { return l && fs.existsSync(l); });
                }
            } catch (e) { HDLLog.debug("não consegui ler", printFile, e.message); }
            return list.filter(function (f, i) { return list.indexOf(f) === i; });
        }

        function phase(text, percent, nums) {
            cb.onProgress({ text: text, percent: percent, nums: nums || "" });
        }

        function onLine(line) {
            if (line.indexOf("HDLP|") === 0) {
                var p = line.split("|");
                var done = num(p[2]), total = num(p[3]) || num(p[4]);
                var speed = num(p[5]), eta = num(p[6]);
                var fi = num(p[7]), fc = num(p[8]);
                var pct = total ? done / total : (fi && fc ? fi / fc : null);
                var nums = [];
                if (pct !== null) nums.push(Math.floor(pct * 100) + "%");
                if (speed) nums.push(fmtBytes(speed) + "/s");
                if (eta) nums.push(fmtEta(eta));
                // Em "Vídeo + áudio" o yt-dlp baixa o vídeo e depois o áudio (2ª parte).
                var audioNow = opts.content === "audio" || (opts.content === "both" && part > 1);
                var label = audioNow ? tr("Baixando áudio") : tr("Baixando vídeo");
                if (item) label += " · " + item;
                phase(label, pct, nums.join(" · "));
                return;
            }
            cb.onLog(line);
            var m;
            if ((m = line.match(/^\[download\] Destination:\s*(.+)$/))) {
                part++;
                if (isInside(outDir, m[1].trim())) created.push(m[1].trim());
            }
            else if ((m = line.match(/^\[download\] Downloading item (\d+) of (\d+)/))) { item = tr("{0} de {1}", m[1], m[2]); part = 0; }
            else if (/has already been downloaded/.test(line)) {
                alreadyHad = true;
                var had = line.match(/^\[download\]\s+(.+?)\s+has already been downloaded/);
                if (had) existing.push(had[1]);
                phase(tr("Já estava baixado"), 1);
            }
            else if (/^\[Merger\]/.test(line)) phase(tr("Juntando áudio e vídeo…"), null);
            else if (/^\[VideoRemuxer\]/.test(line)) phase(tr("Fazendo remux…"), null);
            else if (/^\[ExtractAudio\]/.test(line)) phase(tr("Convertendo áudio…"), null);
            else if (/^\[Fixup/.test(line)) phase(tr("Corrigindo o arquivo…"), null);
            else if (/^\[(youtube|info)\]/i.test(line) && part === 0) phase(tr("Lendo informações…"), null);
            if (/^ERROR:/.test(line)) errLines.push(line);
        }

        lineReader(child.stdout, onLine);
        lineReader(child.stderr, onLine);

        var promise = new Promise(function (resolve, reject) {
            child.on("error", function (e) { reject(e); });
            child.on("close", function (code) {
                var files = readFinished();
                try { if (fs.existsSync(printFile)) fs.unlinkSync(printFile); } catch (e) { HDLLog.debug("não apaguei", printFile); }
                // só aceita arquivos dentro da pasta de destino (o painel importa e
                // pode apagar esses arquivos depois)
                files = files.filter(function (f) {
                    if (isInside(outDir, f)) return true;
                    cb.onLog(tr("Ignorado (fora da pasta {0}): {1}", outDir, f));
                    return false;
                });
                Array.prototype.push.apply(finished, files);

                if (canceled) { reject(canceledError()); return; }
                if (code !== 0 && !files.length) {
                    reject(new Error(friendlyError(cleanError(errLines.join("\n"))) || tr("yt-dlp saiu com código {0}", code)));
                    return;
                }
                if (!files.length) {
                    reject(new Error(tr("O yt-dlp terminou, mas não informou o arquivo baixado.")));
                    return;
                }
                resolve({ files: files, alreadyHad: alreadyHad, partialError: code !== 0 ? cleanError(errLines.join("\n")) : null });
            });
        });

        return {
            promise: promise,
            created: created,
            finished: finished,
            existing: existing,
            printFile: printFile,
            // prontos até agora (para a limpeza quando o painel fecha antes do fim)
            readFinished: function () { return readFinished().filter(function (f) { return isInside(outDir, f); }); },
            cancel: function () { canceled = true; T.killTree(child); }
        };
    }

    // --- FFmpeg --------------------------------------------------------------------

    function probe(file) {
        var ff = T.state.ffmpeg;
        if (!ff || !ff.probe) return Promise.resolve(null);
        return T.runCapture(ff.probe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], HDL_CONFIG.TIMEOUT.probe)
            .then(function (r) {
                if (r.code !== 0) return null;
                var j;
                try { j = JSON.parse(r.stdout); } catch (e) { return null; }
                var v = (j.streams || []).filter(function (s) { return s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic); })[0];
                var a = (j.streams || []).filter(function (s) { return s.codec_type === "audio"; })[0];
                return {
                    duration: num(j.format && j.format.duration) || num(v && v.duration) || 0,
                    size: num(j.format && j.format.size) || 0,
                    vcodec: v ? v.codec_name : null,
                    acodec: a ? a.codec_name : null,
                    width: v ? v.width : 0,
                    height: v ? v.height : 0,
                    fps: v ? frameRate(v.avg_frame_rate) || frameRate(v.r_frame_rate) : 0
                };
            });
    }

    function frameRate(s) {
        if (!s) return 0;
        var p = String(s).split("/");
        var n = parseFloat(p[0]), d = p.length > 1 ? parseFloat(p[1]) : 1;
        return d ? n / d : 0;
    }

    // Arredonda para a taxa padrão mais próxima (vídeos de celular/TikTok/Twitch
    // costumam ter frame rate variável, o que causa dessincronia no Premiere).
    function standardRate(fps) {
        var std = [
            ["24000/1001", 23.976], ["24", 24], ["25", 25], ["30000/1001", 29.97], ["30", 30],
            ["48", 48], ["50", 50], ["60000/1001", 59.94], ["60", 60], ["120", 120]
        ];
        if (!fps || !isFinite(fps)) return "30";
        var best = std[0];
        std.forEach(function (s) { if (Math.abs(s[1] - fps) < Math.abs(best[1] - fps)) best = s; });
        return best[0];
    }

    function ffmpegMajorAtLeast(major, minor) {
        var v = T.state.ffmpeg && T.state.ffmpeg.version || "";
        if (/^N-|^git|master/i.test(v)) return true; // builds de desenvolvimento são recentes
        var m = v.match(/^(\d+)\.(\d+)/) || v.match(/^(\d+)/);
        if (!m) return true;
        var a = parseInt(m[1], 10), b = parseInt(m[2] || "0", 10);
        return a > major || (a === major && b >= minor);
    }

    // Roda o ffmpeg com -progress e chama onProgress(fração).
    function runFfmpeg(args, duration, onProgress, onLog) {
        var ff = T.state.ffmpeg;
        if (!ff) throw new Error(tr("FFmpeg não encontrado."));
        // -n: nunca grava por cima de um arquivo existente (os nomes de saída já são únicos)
        var full = ["-hide_banner", "-n", "-nostats", "-progress", "pipe:1"].concat(args);
        onLog(commandForLog("ffmpeg", full));
        var child = T.spawnTool(ff.cmd, full);
        var canceled = false;
        var tail = [];
        lineReader(child.stdout, function (l) {
            var m = l.match(/^out_time_us=(\d+)/) || l.match(/^out_time_ms=(\d+)/);
            if (m && duration > 0) onProgress(Math.min(1, parseInt(m[1], 10) / 1e6 / duration));
        });
        lineReader(child.stderr, function (l) {
            tail.push(l);
            if (tail.length > 30) tail.shift();
        });
        var promise = new Promise(function (resolve, reject) {
            child.on("error", reject);
            child.on("close", function (code) {
                if (canceled) { reject(canceledError()); return; }
                if (code !== 0) {
                    tail.forEach(onLog);
                    reject(new Error(tr("O FFmpeg falhou (código {0}): {1}", code, tail[tail.length - 1] || "")));
                    return;
                }
                resolve();
            });
        });
        return { promise: promise, cancel: function () { canceled = true; T.killTree(child); } };
    }

    // "<nome> [H.264].mp4" ao lado do original; "(2)", "(3)"… se já existir.
    function reencodeOutput(input, codecKey) {
        var c = CODECS[codecKey] || CODECS.h264;
        var dir = path.dirname(input);
        var base = path.basename(input, path.extname(input));
        return uniquePath(path.join(dir, safeName(base + " [" + c.label + "]") + "." + c.ext));
    }

    // Reencoda para um codec amigável ao Premiere, com frame rate constante.
    // gpu: resultado de detectGpu() para usar o encoder de hardware, ou null (CPU).
    function reencode(input, output, codecKey, videoOnly, info, onProgress, onLog, gpu) {
        var c = CODECS[codecKey] || CODECS.h264;
        var args = ["-i", input, "-map", "0:v:0", "-map", "0:a:0?"];
        args = args.concat(gpuVideoArgs(gpu, codecKey) || c.video);
        // dimensões pares (exigência do yuv420p/x264)
        args.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2");
        args.push("-r", standardRate(info && info.fps));
        if (ffmpegMajorAtLeast(5, 1)) args.push("-fps_mode", "cfr"); else args.push("-vsync", "cfr");
        if (videoOnly) args.push("-an"); else args = args.concat(c.audio);
        args = args.concat(c.extra, [output]);
        return runFfmpeg(args, info ? info.duration : 0, onProgress, onLog);
    }

    // "Só vídeo": tira a trilha de áudio sem reencodar (para quando o site só
    // oferece arquivo com áudio embutido, como TikTok).
    function stripAudio(input, onLog) {
        var ext = path.extname(input);
        var tmp = uniquePath(input.slice(0, -ext.length) + ".noaudio" + ext);
        var job = runFfmpeg(["-i", input, "-map", "0:v:0", "-c", "copy", tmp], 0, function () {}, onLog);
        return {
            cancel: job.cancel,
            promise: job.promise.then(function () {
                fs.unlinkSync(input);
                fs.renameSync(tmp, input);
                return input;
            }, function (e) { try { fs.unlinkSync(tmp); } catch (x) { /* ignora */ } throw e; })
        };
    }

    function compatWarning(info) {
        if (!info) return null;
        var issues = [];
        if (info.vcodec && PREMIERE_VCODECS.indexOf(info.vcodec) < 0) issues.push(tr("vídeo em {0}", info.vcodec.toUpperCase()));
        if (info.acodec && PREMIERE_ACODECS.indexOf(info.acodec) < 0) issues.push(tr("áudio em {0}", info.acodec.toUpperCase()));
        if (!issues.length) return null;
        return tr("Veio com {0}, que o Premiere pode não abrir. Se der problema, baixe de novo com Reencode.", issues.join(tr(" e ")));
    }

    return {
        CODECS: CODECS,
        parseTime: parseTime,
        fmtBytes: fmtBytes,
        fetchInfo: fetchInfo,
        download: download,
        probe: probe,
        reencode: reencode,
        reencodeOutput: reencodeOutput,
        detectGpu: detectGpu,
        gpuVideoArgs: gpuVideoArgs,
        stripAudio: stripAudio,
        compatWarning: compatWarning,
        friendlyError: friendlyError,
        isInside: isInside,
        safeName: safeName,
        uniquePath: uniquePath,
        canceledError: canceledError,
        // expostos para os testes automáticos
        _formatArgs: formatArgs,
        _cleanError: cleanError
    };
})();
