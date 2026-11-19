// client/js/tools.js — Helmet DL
// Encontra, instala e atualiza as ferramentas externas:
//   yt-dlp  (baixador; a versão .exe oficial já traz o Python embutido)
//   FFmpeg  (juntar áudio+vídeo, remux, reencode, extrair áudio)
//   Deno    (runtime JavaScript que o yt-dlp usa para ler o YouTube)
// Tudo que a extensão instala fica numa pasta do usuário (não precisa de admin):
//   Windows: %APPDATA%\Helmet DL\bin      macOS: ~/Library/Application Support/Helmet DL/bin

var HDLTools = (function () {
    if (typeof require !== "function") return null; // fora do Premiere (prévia no navegador)

    var path = require("path");
    var fs = require("fs");
    var os = require("os");
    var https = require("https");
    var dns = require("dns");
    var cp = require("child_process");

    var isWin = process.platform === "win32";
    var isMac = process.platform === "darwin";
    var EXE = isWin ? ".exe" : "";

    var dataDir = isWin
        ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Helmet DL")
        : path.join(os.homedir(), "Library", "Application Support", "Helmet DL");
    var binDir = path.join(dataDir, "bin");

    var URLS = {
        ytdlp: isWin
            ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
            : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
        // builds recomendados pelo próprio yt-dlp (com correções para o yt-dlp)
        ffmpeg: "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
        deno: isWin
            ? "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip"
            : (process.arch === "arm64"
                ? "https://github.com/denoland/deno/releases/latest/download/deno-aarch64-apple-darwin.zip"
                : "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-apple-darwin.zip")
    };

    // --- utilidades de arquivo ----------------------------------------------

    function ensureDir(d) {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }

    function isFile(p) {
        try { return fs.statSync(p).isFile(); } catch (e) { return false; }
    }

    function rmrf(p) {
        try {
            if (fs.rmSync) fs.rmSync(p, { recursive: true, force: true });
            else if (fs.existsSync(p)) fs.rmdirSync(p, { recursive: true });
        } catch (e) { /* ignora */ }
    }

    function findFileRecursive(dir, name, depth) {
        if (depth < 0) return null;
        var entries;
        try { entries = fs.readdirSync(dir); } catch (e) { return null; }
        for (var i = 0; i < entries.length; i++) {
            var full = path.join(dir, entries[i]);
            if (entries[i].toLowerCase() === name.toLowerCase() && isFile(full)) return full;
        }
        for (var j = 0; j < entries.length; j++) {
            var sub = path.join(dir, entries[j]);
            try {
                if (fs.statSync(sub).isDirectory()) {
                    var hit = findFileRecursive(sub, name, depth - 1);
                    if (hit) return hit;
                }
            } catch (e) { /* ignora */ }
        }
        return null;
    }

    // Pastas onde costumam ficar executáveis. O Premiere herda o PATH de quando foi
    // aberto, então também olhamos locais comuns de instaladores (winget, scoop, brew…).
    function searchDirs() {
        var dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
        if (isWin) {
            var local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
            dirs.push(path.join(local, "Microsoft", "WinGet", "Links"));
            dirs.push(path.join(os.homedir(), "scoop", "shims"));
            dirs.push(path.join(process.env.ProgramData || "C:\\ProgramData", "chocolatey", "bin"));
            dirs.push("C:\\ffmpeg\\bin");
            dirs.push(path.join(process.env.ProgramFiles || "C:\\Program Files", "ffmpeg", "bin"));
            dirs.push(path.join(os.homedir(), ".deno", "bin"));
        } else {
            dirs.push("/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".deno", "bin"));
        }
        return dirs;
    }

    function which(name, opts) {
        opts = opts || {};
        var dirs = searchDirs();
        for (var i = 0; i < dirs.length; i++) {
            // "python.exe" dentro de WindowsApps é só um atalho para a Microsoft Store
            if (opts.skipWindowsApps && /WindowsApps/i.test(dirs[i])) continue;
            var cand = path.join(dirs[i], name + EXE);
            if (isFile(cand)) return cand;
        }
        return null;
    }

    // --- execução de processos ---------------------------------------------

    function childEnv() {
        var env = Object.assign({}, process.env);
        env.PYTHONIOENCODING = "utf-8";
        env.PYTHONUTF8 = "1";
        // garante que o yt-dlp encontre ffmpeg/deno instalados pela extensão
        // No Windows a chave costuma ser "Path"; criar "PATH" ao lado duplicaria a variável.
        var key = Object.keys(env).filter(function (k) { return k.toUpperCase() === "PATH"; })[0] || "PATH";
        env[key] = binDir + path.delimiter + (env[key] || "");
        return env;
    }

    function spawnTool(cmd, args, opts) {
        opts = opts || {};
        return cp.spawn(cmd, args, {
            cwd: opts.cwd || os.tmpdir(),
            env: childEnv(),
            windowsHide: true
        });
    }

    function runCapture(cmd, args, timeoutMs) {
        return new Promise(function (resolve) {
            var out = "", err = "", done = false, child;
            try {
                child = spawnTool(cmd, args);
            } catch (e) {
                resolve({ code: -1, stdout: "", stderr: String(e.message || e) });
                return;
            }
            var timer = setTimeout(function () {
                if (done) return;
                killTree(child);
                done = true;
                resolve({ code: -2, stdout: out, stderr: err + "\n(tempo esgotado)" });
            }, timeoutMs || 30000);
            child.stdout.setEncoding("utf8");
            child.stderr.setEncoding("utf8");
            child.stdout.on("data", function (d) { out += d; });
            child.stderr.on("data", function (d) { err += d; });
            child.on("error", function (e) {
                if (done) return;
                done = true; clearTimeout(timer);
                resolve({ code: -1, stdout: out, stderr: String(e.message || e) });
            });
            child.on("close", function (code) {
                if (done) return;
                done = true; clearTimeout(timer);
                resolve({ code: code, stdout: out, stderr: err });
            });
        });
    }

    // Mata o processo e os filhos (o yt-dlp.exe abre um subprocesso Python e o ffmpeg).
    function killTree(child) {
        if (!child || child.exitCode !== null) return;
        try {
            if (isWin) {
                cp.spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
            } else {
                child.kill("SIGTERM");
            }
        } catch (e) {
            try { child.kill(); } catch (e2) { /* ignora */ }
        }
    }

    function firstLine(s) {
        return String(s || "").split(/\r?\n/)[0].trim();
    }

    // --- download HTTP com redirecionamentos e progresso ---------------------

    // Os arquivos do GitHub ficam num CDN com vários IPs, e em algumas redes parte
    // deles não responde. Por isso cada IP é tentado com um tempo curto de conexão,
    // em vez de esperar o timeout longo do sistema no primeiro.
    var CONNECT_TIMEOUT = 8000;
    var HTTP_HEADERS = { "User-Agent": "Helmet-DL" };

    function lookupAll(host) {
        return new Promise(function (resolve) {
            dns.lookup(host, { all: true }, function (err, list) { resolve(err || !list ? [] : list); });
        });
    }

    function tryAddress(url, headers, addr) {
        return new Promise(function (resolve, reject) {
            var opts = { headers: headers };
            if (addr) {
                opts.lookup = function (h, o, cb) {
                    if (typeof o === "function") { cb = o; o = {}; }
                    if (o && o.all) cb(null, [{ address: addr.address, family: addr.family }]);
                    else cb(null, addr.address, addr.family);
                };
            }
            var connected = false;
            var req = https.get(url, opts, function (res) {
                connected = true;
                clearTimeout(timer);
                resolve(res);
            });
            var timer = setTimeout(function () {
                if (!connected) req.destroy(new Error("Tempo esgotado conectando em " + (addr ? addr.address : url)));
            }, CONNECT_TIMEOUT);
            req.on("error", function (e) {
                clearTimeout(timer);
                if (!connected) e.phase = "connect";
                reject(e);
            });
        });
    }

    // GET que tenta cada IP do servidor e segue redirecionamentos. Resolve com a resposta.
    function openGet(url, headers, redirects) {
        redirects = redirects || 0;
        if (redirects > 8) return Promise.reject(new Error("Redirecionamentos demais em " + url));
        var host = new URL(url).hostname;
        return lookupAll(host).then(function (addrs) {
            if (!addrs.length) addrs = [null];
            var lastErr = null;
            return addrs.reduce(function (p, addr) {
                return p.then(function (res) {
                    if (res) return res;
                    return tryAddress(url, headers, addr).catch(function (e) {
                        lastErr = e;
                        if (e.phase !== "connect") throw e; // falhou depois de conectar: outro IP não ajuda
                        return null;
                    });
                });
            }, Promise.resolve(null)).then(function (res) {
                if (!res) {
                    var err = lastErr || new Error("Sem conexão com " + host);
                    err.phase = "connect";
                    throw err;
                }
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    return openGet(new URL(res.headers.location, url).toString(), headers, redirects + 1);
                }
                return res;
            });
        });
    }

    function finishTmp(tmp, dest) {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        fs.renameSync(tmp, dest);
        return dest;
    }

    function downloadFileNode(url, dest, onProgress) {
        return openGet(url, HTTP_HEADERS).then(function (res) {
            return new Promise(function (resolve, reject) {
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error("HTTP " + res.statusCode + " ao baixar " + url));
                    return;
                }
                var total = parseInt(res.headers["content-length"] || "0", 10);
                var got = 0;
                var tmp = dest + ".download";
                var file = fs.createWriteStream(tmp);
                var failed = false;
                function fail(e) {
                    if (failed) return;
                    failed = true;
                    try { file.destroy(); } catch (x) { /* ignora */ }
                    setTimeout(function () { rmrf(tmp); }, 200);
                    reject(e);
                }
                if (res.socket) {
                    res.socket.setTimeout(60000, function () { res.destroy(new Error("O download parou de responder.")); });
                }
                res.on("data", function (chunk) {
                    got += chunk.length;
                    if (onProgress) onProgress(got, total);
                });
                res.on("aborted", function () { fail(new Error("A conexão caiu no meio do download.")); });
                res.on("error", fail);
                file.on("error", fail);
                res.pipe(file);
                file.on("finish", function () {
                    file.close(function () {
                        if (failed) return;
                        if (total && got < total) { fail(new Error("Download incompleto.")); return; }
                        try { resolve(finishTmp(tmp, dest)); } catch (e) { reject(e); }
                    });
                });
            });
        });
    }

    // Último recurso no Windows: o PowerShell usa a pilha de rede do Windows
    // (proxy do sistema, outra ordem de IPs). Sem progresso detalhado.
    function downloadFilePowerShell(url, dest) {
        var tmp = dest + ".download";
        var cmd = "$ProgressPreference='SilentlyContinue'; " +
            "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; " +
            "Invoke-WebRequest -UseBasicParsing -Uri '" + url.replace(/'/g, "''") + "' -OutFile '" + tmp.replace(/'/g, "''") + "'";
        return runCapture("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], 30 * 60000).then(function (r) {
            if (r.code !== 0 || !isFile(tmp)) {
                rmrf(tmp);
                throw new Error("Não foi possível baixar " + url + " (" + (firstLine(r.stderr) || "PowerShell falhou") + ")");
            }
            return finishTmp(tmp, dest);
        });
    }

    // onProgress(baixado, total). baixado = -1 indica o modo alternativo (sem progresso).
    function downloadFile(url, dest, onProgress) {
        return downloadFileNode(url, dest, onProgress).catch(function (e) {
            var network = e.phase === "connect" || /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|caiu|parou|incompleto/i.test(e.message);
            if (!isWin || !network) throw e;
            if (onProgress) onProgress(-1, 0);
            return downloadFilePowerShell(url, dest).catch(function (e2) {
                throw new Error(e.message + " / " + e2.message);
            });
        });
    }

    function extractZip(zip, destDir) {
        ensureDir(destDir);
        if (isMac) {
            return runCapture("ditto", ["-x", "-k", zip, destDir], 300000).then(check);
        }
        // tar.exe vem no Windows 10/11 e é bem mais rápido que o Expand-Archive
        var tarExe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
        return runCapture(isFile(tarExe) ? tarExe : "tar", ["-xf", zip, "-C", destDir], 300000).then(function (r) {
            if (r.code === 0) return r;
            return runCapture("powershell", ["-NoProfile", "-NonInteractive", "-Command",
                "Expand-Archive -LiteralPath '" + zip.replace(/'/g, "''") + "' -DestinationPath '" +
                destDir.replace(/'/g, "''") + "' -Force"], 300000).then(check);
        });
        function check(r) {
            if (r.code !== 0) throw new Error("Falha ao extrair " + path.basename(zip) + ": " + (r.stderr || r.stdout));
            return r;
        }
    }

    // --- detecção -------------------------------------------------------------

    var state = { ytdlp: null, ffmpeg: null, deno: null };

    function detectYtdlp() {
        var managed = path.join(binDir, "yt-dlp" + EXE);
        var candidates = [];
        if (isFile(managed)) candidates.push({ cmd: managed, base: [], source: "managed" });
        var onPath = which("yt-dlp");
        if (onPath) candidates.push({ cmd: onPath, base: [], source: "path" });
        // Python com o módulo yt_dlp instalado via pip
        var py = isWin ? (which("py", { skipWindowsApps: true }) || which("python", { skipWindowsApps: true }))
                       : (which("python3") || which("python"));
        if (py) candidates.push({ cmd: py, base: (/py(\.exe)?$/i.test(py) && isWin ? ["-3"] : []).concat(["-m", "yt_dlp"]), source: "python" });

        return candidates.reduce(function (p, c) {
            return p.then(function (found) {
                if (found) return found;
                return runCapture(c.cmd, c.base.concat(["--version"]), 60000).then(function (r) {
                    var v = firstLine(r.stdout);
                    if (r.code === 0 && /^\d{4}\.\d{2}\.\d{2}/.test(v)) {
                        c.version = v;
                        return c;
                    }
                    return null;
                });
            });
        }, Promise.resolve(null)).then(function (found) {
            state.ytdlp = found;
            return found;
        });
    }

    function detectFfmpeg() {
        var managed = path.join(binDir, "ffmpeg" + EXE);
        var ff = isFile(managed) ? managed : which("ffmpeg");
        if (!ff) { state.ffmpeg = null; return Promise.resolve(null); }
        var probe = path.join(path.dirname(ff), "ffprobe" + EXE);
        return runCapture(ff, ["-hide_banner", "-version"], 20000).then(function (r) {
            if (r.code !== 0) { state.ffmpeg = null; return null; }
            var line = firstLine(r.stdout); // "ffmpeg version 7.1-full_build-www.gyan.dev ..."
            var m = line.match(/ffmpeg version\s+(\S+)/i);
            state.ffmpeg = {
                cmd: ff,
                probe: isFile(probe) ? probe : null,
                dir: path.dirname(ff),
                version: m ? m[1] : line,
                source: ff === managed ? "managed" : "path"
            };
            return state.ffmpeg;
        });
    }

    function detectDeno() {
        var managed = path.join(binDir, "deno" + EXE);
        var d = isFile(managed) ? managed : which("deno");
        if (!d) { state.deno = null; return Promise.resolve(null); }
        return runCapture(d, ["--version"], 20000).then(function (r) {
            if (r.code !== 0) { state.deno = null; return null; }
            var m = firstLine(r.stdout).match(/deno\s+(\S+)/i);
            state.deno = { cmd: d, version: m ? m[1] : firstLine(r.stdout), source: d === managed ? "managed" : "path" };
            return state.deno;
        });
    }

    function detectAll() {
        return Promise.all([detectYtdlp(), detectFfmpeg(), detectDeno()]).then(function () { return state; });
    }

    // --- instalação ------------------------------------------------------------

    function installYtdlp(onProgress) {
        ensureDir(binDir);
        var dest = path.join(binDir, "yt-dlp" + EXE);
        return downloadFile(URLS.ytdlp, dest, onProgress).then(function () {
            if (!isWin) fs.chmodSync(dest, 0o755);
            return detectYtdlp();
        });
    }

    function installFfmpeg(onProgress) {
        if (!isWin) {
            return Promise.reject(new Error("No macOS, instale o FFmpeg pelo Homebrew: brew install ffmpeg"));
        }
        ensureDir(binDir);
        var zip = path.join(dataDir, "ffmpeg.zip");
        var tmp = path.join(dataDir, "ffmpeg-tmp");
        rmrf(tmp);
        return downloadFile(URLS.ffmpeg, zip, onProgress)
            .then(function () { return extractZip(zip, tmp); })
            .then(function () {
                ["ffmpeg.exe", "ffprobe.exe"].forEach(function (name) {
                    var found = findFileRecursive(tmp, name, 4);
                    if (!found) throw new Error(name + " não encontrado no pacote baixado");
                    fs.copyFileSync(found, path.join(binDir, name));
                });
                rmrf(tmp); rmrf(zip);
                return detectFfmpeg();
            }, function (e) { rmrf(tmp); rmrf(zip); throw e; });
    }

    function installDeno(onProgress) {
        ensureDir(binDir);
        var zip = path.join(dataDir, "deno.zip");
        var tmp = path.join(dataDir, "deno-tmp");
        rmrf(tmp);
        return downloadFile(URLS.deno, zip, onProgress)
            .then(function () { return extractZip(zip, tmp); })
            .then(function () {
                var found = findFileRecursive(tmp, "deno" + EXE, 2);
                if (!found) throw new Error("deno não encontrado no pacote baixado");
                var dest = path.join(binDir, "deno" + EXE);
                fs.copyFileSync(found, dest);
                if (!isWin) fs.chmodSync(dest, 0o755);
                rmrf(tmp); rmrf(zip);
                return detectDeno();
            }, function (e) { rmrf(tmp); rmrf(zip); throw e; });
    }

    // Atualiza o yt-dlp. A versão gerenciada pela extensão é simplesmente baixada de
    // novo (mais confiável que o -U); outras usam o mecanismo da própria instalação.
    function updateYtdlp(onProgress) {
        var y = state.ytdlp;
        if (!y || y.source === "managed") return installYtdlp(onProgress);
        if (y.source === "python") {
            return runCapture(y.cmd, y.base.slice(0, -2).concat(["-m", "pip", "install", "-U", "yt-dlp[default]"]), 300000)
                .then(function (r) {
                    if (r.code !== 0) throw new Error(firstLine(r.stderr) || "pip falhou");
                    return detectYtdlp();
                });
        }
        return runCapture(y.cmd, ["-U"], 300000).then(function (r) {
            if (r.code !== 0) throw new Error(firstLine(r.stderr) || firstLine(r.stdout) || "yt-dlp -U falhou");
            return detectYtdlp();
        });
    }

    // Versão mais recente publicada (para a atualização automática diária).
    function latestYtdlpVersion() {
        return openGet("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
            { "User-Agent": "Helmet-DL", "Accept": "application/vnd.github+json" }).then(function (res) {
            return new Promise(function (resolve) {
                var body = "";
                res.setEncoding("utf8");
                res.on("data", function (d) { body += d; });
                res.on("end", function () {
                    try { resolve(JSON.parse(body).tag_name || null); } catch (e) { resolve(null); }
                });
                res.on("error", function () { resolve(null); });
            });
        }, function () { return null; });
    }

    return {
        isWin: isWin,
        isMac: isMac,
        binDir: binDir,
        dataDir: dataDir,
        state: state,
        detectAll: detectAll,
        detectYtdlp: detectYtdlp,
        detectFfmpeg: detectFfmpeg,
        detectDeno: detectDeno,
        installYtdlp: installYtdlp,
        installFfmpeg: installFfmpeg,
        installDeno: installDeno,
        updateYtdlp: updateYtdlp,
        latestYtdlpVersion: latestYtdlpVersion,
        spawnTool: spawnTool,
        runCapture: runCapture,
        killTree: killTree,
        rmrf: rmrf,
        ensureDir: ensureDir,
        isFile: isFile
    };
})();
