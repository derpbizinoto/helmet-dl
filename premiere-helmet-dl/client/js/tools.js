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
    var crypto = require("crypto");

    var isWin = process.platform === "win32";
    var isMac = process.platform === "darwin";
    var EXE = isWin ? ".exe" : "";

    var dataDir = isWin
        ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Helmet DL")
        : path.join(os.homedir(), "Library", "Application Support", "Helmet DL");
    var binDir = path.join(dataDir, "bin");

    var TOOLS = HDL_CONFIG.TOOLS;

    // Programas do sistema pelo caminho completo. Chamados só pelo nome, o Windows
    // procuraria primeiro na pasta atual (aqui, o %TEMP%), onde qualquer programa
    // poderia ter deixado um "powershell.exe" falso.
    var WINDIR = process.env.SystemRoot || process.env.windir || "C:\\Windows";
    var SYSTEM32 = path.join(WINDIR, "System32");
    var SYS = isWin ? {
        powershell: path.join(SYSTEM32, "WindowsPowerShell", "v1.0", "powershell.exe"),
        taskkill: path.join(SYSTEM32, "taskkill.exe"),
        tar: path.join(SYSTEM32, "tar.exe"),
        explorer: path.join(WINDIR, "explorer.exe")
    } : {
        ditto: "/usr/bin/ditto",
        open: "/usr/bin/open",
        pbpaste: "/usr/bin/pbpaste"
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
    // Entradas relativas do PATH (ex.: ".") são ignoradas.
    function searchDirs() {
        var dirs = (process.env.PATH || "").split(path.delimiter)
            .map(function (d) { return d.trim().replace(/^"(.*)"$/, "$1"); })
            .filter(function (d) { return d && path.isAbsolute(d); });
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

    // extra: variáveis a mais só para este processo (ex.: valores para o PowerShell).
    function childEnv(extra) {
        var env = Object.assign({}, process.env, extra || {});
        env.PYTHONIOENCODING = "utf-8";
        env.PYTHONUTF8 = "1";
        // garante que o yt-dlp encontre ffmpeg/deno instalados pela extensão
        // No Windows a chave costuma ser "Path"; criar "PATH" ao lado duplicaria a variável.
        var key = Object.keys(env).filter(function (k) { return k.toUpperCase() === "PATH"; })[0] || "PATH";
        env[key] = binDir + path.delimiter + (env[key] || "");
        return env;
    }

    var running = []; // todos os processos abertos por este painel (para encerrar ao fechar)

    // opts: { cwd, env (variáveis extras) }. Sempre spawn(caminho, [argumentos]), sem shell.
    function spawnTool(cmd, args, opts) {
        opts = opts || {};
        var child = cp.spawn(cmd, args, {
            cwd: opts.cwd || os.tmpdir(),
            env: childEnv(opts.env),
            windowsHide: true
        });
        running.push(child);
        var forget = function () {
            var i = running.indexOf(child);
            if (i >= 0) running.splice(i, 1);
        };
        child.on("close", forget);
        child.on("error", forget);
        return child;
    }

    function runCapture(cmd, args, timeoutMs, env) {
        return new Promise(function (resolve) {
            var out = "", err = "", done = false, child;
            try {
                child = spawnTool(cmd, args, { env: env });
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
    // sync: espera o taskkill terminar (usado quando o painel está fechando).
    function killTree(child, sync) {
        if (!child || child.exitCode !== null) return;
        try {
            if (isWin && isFile(SYS.taskkill)) {
                var args = ["/pid", String(child.pid), "/T", "/F"];
                if (sync) cp.spawnSync(SYS.taskkill, args, { windowsHide: true, timeout: 3000 });
                else cp.spawn(SYS.taskkill, args, { windowsHide: true });
            } else {
                child.kill("SIGTERM");
            }
        } catch (e) {
            try { child.kill(); } catch (e2) { /* já terminou */ }
        }
    }

    // Chamado quando o painel fecha: nenhum yt-dlp/FFmpeg fica rodando sozinho.
    function killAll() {
        running.slice().forEach(function (child) { killTree(child, true); });
        running = [];
    }

    // PowerShell com texto de comando FIXO; os valores (endereços, caminhos) entram
    // por variáveis de ambiente, nunca dentro do texto. extraArgs: ex. ["-STA"].
    function runPowerShell(script, env, timeoutMs, extraArgs) {
        var args = ["-NoProfile", "-NonInteractive"].concat(extraArgs || [], ["-Command", script]);
        return runCapture(SYS.powershell, args, timeoutMs, env);
    }

    // Abre a pasta (ou mostra o arquivo selecionado) no Explorer / Finder.
    function reveal(target, select) {
        var cmd = isWin ? SYS.explorer : SYS.open;
        var args = isWin ? (select ? ["/select,", target] : [target]) : (select ? ["-R", target] : [target]);
        var child = cp.spawn(cmd, args, { detached: true, stdio: "ignore" });
        child.on("error", function () { /* sem Explorer: nada a fazer */ });
        child.unref();
    }

    // Texto da área de transferência pelo próprio sistema (plano C do botão colar).
    function readClipboardSystem() {
        if (isWin) {
            return runPowerShell("try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}; Get-Clipboard -Raw",
                null, 10000, ["-STA"]);
        }
        return runCapture(SYS.pbpaste, [], 10000);
    }

    function firstLine(s) {
        return String(s || "").split(/\r?\n/)[0].trim();
    }

    // --- download HTTP com redirecionamentos e progresso ---------------------

    // Só HTTPS e só servidores do GitHub (as releases, a API e o CDN de arquivos dele).
    // Vale para o endereço inicial e para cada redirecionamento.
    function isAllowedUrl(url) {
        try {
            var u = new URL(url);
            return u.protocol === "https:" &&
                (u.hostname === "github.com" || u.hostname === "api.github.com" ||
                 /\.githubusercontent\.com$/.test(u.hostname));
        } catch (e) {
            return false;
        }
    }

    function refuseUrl(url) {
        return Promise.reject(new Error("Download recusado: endereço fora do GitHub (" + url + ")."));
    }

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
        if (!isAllowedUrl(url)) return refuseUrl(url);
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
    // (proxy do sistema, outra ordem de IPs). Sem progresso detalhado. O arquivo
    // baixado por aqui também passa pela conferência de SHA-256 (downloadVerified).
    function downloadFilePowerShell(url, dest) {
        var tmp = dest + ".download";
        var script = "$ProgressPreference='SilentlyContinue'; " +
            "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; " +
            "Invoke-WebRequest -UseBasicParsing -Uri $env:HDL_URL -OutFile $env:HDL_OUT";
        return runPowerShell(script, { HDL_URL: url, HDL_OUT: tmp }, 30 * 60000).then(function (r) {
            if (r.code !== 0 || !isFile(tmp)) {
                rmrf(tmp);
                throw new Error("Não foi possível baixar " + url + " (" + (firstLine(r.stderr) || "PowerShell falhou") + ")");
            }
            return finishTmp(tmp, dest);
        });
    }

    // onProgress(baixado, total). baixado = -1 indica o modo alternativo (sem progresso).
    function downloadFile(url, dest, onProgress) {
        if (!isAllowedUrl(url)) return refuseUrl(url);
        return downloadFileNode(url, dest, onProgress).catch(function (e) {
            var network = e.phase === "connect" || /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|caiu|parou|incompleto/i.test(e.message);
            if (!isWin || !network) throw e;
            if (onProgress) onProgress(-1, 0);
            return downloadFilePowerShell(url, dest).catch(function (e2) {
                throw new Error(e.message + " / " + e2.message);
            });
        });
    }

    // --- conferência do SHA-256 ---------------------------------------------------

    function sha256File(file) {
        return new Promise(function (resolve, reject) {
            var hash = crypto.createHash("sha256");
            var stream = fs.createReadStream(file);
            stream.on("error", reject);
            stream.on("data", function (d) { hash.update(d); });
            stream.on("end", function () { resolve(hash.digest("hex")); });
        });
    }

    // Lê o arquivo de SHA-256 publicado na release.
    //  - lista ("<hash>  <arquivo>" por linha): procura a linha do arquivo;
    //  - arquivo de um pacote só (singleHash, caso do Deno): aceita o único hash
    //    de 64 caracteres que houver no texto (o do Windows vem no formato do
    //    Get-FileHash: "Hash : ABC…").
    function expectedHash(text, fileName, singleHash) {
        var lines = String(text || "").split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var m = lines[i].trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
            if (m && m[2].trim() === fileName) return m[1].toLowerCase();
        }
        if (singleHash) {
            var all = String(text || "").match(/\b[0-9a-fA-F]{64}\b/g) || [];
            if (all.length === 1) return all[0].toLowerCase();
        }
        return null;
    }

    // Baixa um pacote oficial e só o entrega (em `dest`) se o SHA-256 conferir.
    // Enquanto não confere, o arquivo fica com outro nome, então uma ferramenta que
    // já funcionava nunca é trocada por um arquivo ruim.
    function downloadVerified(tool, dest, onProgress) {
        var spec = TOOLS[tool];
        var staging = dest + ".verificando";
        var sums = dest + ".sha256";
        var expected = null;
        var cleanup = function () { rmrf(staging); rmrf(sums); };
        return downloadFile(spec.sumsUrl, sums)
            .then(function () {
                expected = expectedHash(fs.readFileSync(sums, "utf8"), spec.asset, spec.singleHash);
                if (!expected) {
                    throw new Error("Não encontrei a impressão digital (SHA-256) de " + spec.asset +
                        " na página oficial. Por segurança, a instalação foi cancelada. Tente de novo mais tarde.");
                }
                return downloadFile(spec.url, staging, onProgress);
            })
            .then(function () { return sha256File(staging); })
            .then(function (actual) {
                if (actual.toLowerCase() !== expected) {
                    throw new Error("O arquivo baixado (" + spec.asset + ") não confere com a impressão digital " +
                        "(SHA-256) publicada e foi apagado por segurança. Isso pode acontecer se uma versão nova " +
                        "saiu durante o download — tente de novo em alguns minutos.");
                }
                finishTmp(staging, dest);
                rmrf(sums);
                return dest;
            })
            .catch(function (e) { cleanup(); throw e; });
    }

    function extractZip(zip, destDir) {
        ensureDir(destDir);
        if (!isWin) {
            return runCapture(SYS.ditto, ["-x", "-k", zip, destDir], 300000).then(check);
        }
        var viaPowerShell = function () {
            return runPowerShell("Expand-Archive -LiteralPath $env:HDL_ZIP -DestinationPath $env:HDL_DEST -Force",
                { HDL_ZIP: zip, HDL_DEST: destDir }, 300000).then(check);
        };
        // tar.exe vem no Windows 10/11 e é bem mais rápido que o Expand-Archive
        if (!isFile(SYS.tar)) return viaPowerShell();
        return runCapture(SYS.tar, ["-xf", zip, "-C", destDir], 300000).then(function (r) {
            return r.code === 0 ? r : viaPowerShell();
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
        return downloadVerified("ytdlp", dest, onProgress).then(function () {
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
        return downloadVerified("ffmpeg", zip, onProgress)
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
        return downloadVerified("deno", zip, onProgress)
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
        return openGet(HDL_CONFIG.YTDLP_LATEST_API,
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
        killAll: killAll,
        reveal: reveal,
        readClipboardSystem: readClipboardSystem,
        rmrf: rmrf,
        ensureDir: ensureDir,
        isFile: isFile,
        // expostos para os testes automáticos
        _isAllowedUrl: isAllowedUrl,
        _expectedHash: expectedHash,
        _searchDirs: searchDirs,
        _downloadFilePowerShell: downloadFilePowerShell,
        _extractZip: extractZip
    };
})();
