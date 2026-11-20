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
    var EXE = isWin ? ".exe" : "";

    // (o Helmet Cutter também procura o FFmpeg nesta pasta — não mudar o caminho)
    var dataDir = isWin
        ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Helmet DL")
        : path.join(os.homedir(), "Library", "Application Support", "Helmet DL");
    var binDir = path.join(dataDir, "bin");

    var TOOLS = HDL_CONFIG.TOOLS;
    var tr = HDLI18n.t;
    var TIMEOUT = HDL_CONFIG.TIMEOUT;

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
        } catch (e) { HDLLog.debug("não consegui apagar", p, e.message); }
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
            } catch (e) { /* ignora entradas ilegíveis */ }
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
                resolve({ code: -2, stdout: out, stderr: err + "\n" + tr("(tempo esgotado)") });
            }, timeoutMs || TIMEOUT.toolVersion);
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
                null, TIMEOUT.clipboard, ["-STA"]);
        }
        return runCapture(SYS.pbpaste, [], TIMEOUT.clipboard);
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
        return Promise.reject(new Error(tr("Download recusado: endereço fora do GitHub ({0}).", url)));
    }

    // Os arquivos do GitHub ficam num CDN com vários IPs, e em algumas redes parte
    // deles não responde. Por isso cada IP é tentado com um tempo curto de conexão,
    // em vez de esperar o timeout longo do sistema no primeiro.

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
                if (!connected) req.destroy(new Error(tr("Tempo esgotado conectando em {0}", addr ? addr.address : url)));
            }, TIMEOUT.connect);
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
        if (redirects > 8) return Promise.reject(new Error(tr("Redirecionamentos demais em {0}", url)));
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
                    var err = lastErr || new Error(tr("Sem conexão com {0}", host));
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
                    reject(new Error(tr("HTTP {0} ao baixar {1}", res.statusCode, url)));
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
                    try { file.destroy(); } catch (x) { /* já fechado */ }
                    setTimeout(function () { rmrf(tmp); }, 200);
                    reject(e);
                }
                if (res.socket) {
                    res.socket.setTimeout(TIMEOUT.stalled, function () { res.destroy(new Error(tr("O download parou de responder."))); });
                }
                res.on("data", function (chunk) {
                    got += chunk.length;
                    if (onProgress) onProgress(got, total);
                });
                res.on("aborted", function () { fail(new Error(tr("A conexão caiu no meio do download."))); });
                res.on("error", fail);
                file.on("error", fail);
                res.pipe(file);
                file.on("finish", function () {
                    file.close(function () {
                        if (failed) return;
                        if (total && got < total) { fail(new Error(tr("Download incompleto."))); return; }
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
        return runPowerShell(script, { HDL_URL: url, HDL_OUT: tmp }, TIMEOUT.psDownload).then(function (r) {
            if (r.code !== 0 || !isFile(tmp)) {
                rmrf(tmp);
                throw new Error(tr("Não foi possível baixar {0} ({1})", url, firstLine(r.stderr) || tr("PowerShell falhou")));
            }
            return finishTmp(tmp, dest);
        });
    }

    // Reconhece falha de rede nas mensagens do Node, do PowerShell (em inglês ou
    // português) e do yt-dlp (Python), para mostrar um aviso claro em vez do erro técnico.
    // (texto em português; quem mostra passa por tr())
    var NETWORK_MESSAGE = HDLI18n.N("Sem conexão com a internet (ou o site não respondeu). Confira a conexão e tente de novo.");

    function isNetworkError(msg) {
        return /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|getaddrinfo|Errno 1100[0-9]|Errno -?[23]\b|WinError 100(5[01]|6[015])|Failed to establish a new connection|Unable to connect to proxy|Nenhuma conexão pôde ser feita|Name or service not known|Temporary failure in name resolution|Failed to resolve|Network is unreachable|timed out|Connection (refused|reset|aborted)|remote name could not be resolved|nome remoto n.o p.de ser resolvido|Unable to connect to the remote server|Impossível conectar-se ao servidor remoto|operation has timed out|tempo limite da operação|Tempo esgotado conectando|Sem conexão com|parou de responder|conexão caiu|No connection to|stopped responding|connection dropped/i.test(String(msg || ""));
    }

    // onProgress(baixado, total). baixado = -1 indica o modo alternativo (sem progresso).
    function downloadFile(url, dest, onProgress) {
        if (!isAllowedUrl(url)) return refuseUrl(url);
        return downloadFileNode(url, dest, onProgress).catch(function (e) {
            var network = e.phase === "connect" || /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|caiu|parou|incompleto|dropped|stopped responding|incomplete/i.test(e.message);
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
                    throw new Error(tr("Não encontrei a impressão digital (SHA-256) de {0} na página oficial. Por segurança, a instalação foi cancelada. Tente de novo mais tarde.", spec.asset));
                }
                return downloadFile(spec.url, staging, onProgress);
            })
            .then(function () { return sha256File(staging); })
            .then(function (actual) {
                if (actual.toLowerCase() !== expected) {
                    throw new Error(tr("O arquivo baixado ({0}) não confere com a impressão digital (SHA-256) publicada e foi apagado por segurança. Isso pode acontecer se uma versão nova saiu durante o download — tente de novo em alguns minutos.", spec.asset));
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
            return runCapture(SYS.ditto, ["-x", "-k", zip, destDir], TIMEOUT.extract).then(check);
        }
        var viaPowerShell = function () {
            return runPowerShell("Expand-Archive -LiteralPath $env:HDL_ZIP -DestinationPath $env:HDL_DEST -Force",
                { HDL_ZIP: zip, HDL_DEST: destDir }, TIMEOUT.extract).then(check);
        };
        // tar.exe vem no Windows 10/11 e é bem mais rápido que o Expand-Archive
        if (!isFile(SYS.tar)) return viaPowerShell();
        return runCapture(SYS.tar, ["-xf", zip, "-C", destDir], TIMEOUT.extract).then(function (r) {
            return r.code === 0 ? r : viaPowerShell();
        });
        function check(r) {
            if (r.code !== 0) throw new Error(tr("Falha ao extrair {0}: {1}", path.basename(zip), r.stderr || r.stdout));
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
                return runCapture(c.cmd, c.base.concat(["--version"]), TIMEOUT.ytdlpVersion).then(function (r) {
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

    // O da extensão (binDir) ou, se não houver, o do sistema. Roda `versionArgs` e
    // lê a versão da 1ª linha com `versionRe`. Resolve com { cmd, version, source } ou null.
    function detectSimple(name, versionArgs, versionRe) {
        var managed = path.join(binDir, name + EXE);
        var cmd = isFile(managed) ? managed : which(name);
        if (!cmd) return Promise.resolve(null);
        return runCapture(cmd, versionArgs, TIMEOUT.toolVersion).then(function (r) {
            if (r.code !== 0) return null;
            var line = firstLine(r.stdout);
            var m = line.match(versionRe);
            return { cmd: cmd, version: m ? m[1] : line, source: cmd === managed ? "managed" : "path" };
        });
    }

    function detectFfmpeg() {
        // 1ª linha: "ffmpeg version 7.1-full_build-www.gyan.dev ..."
        return detectSimple("ffmpeg", ["-hide_banner", "-version"], /ffmpeg version\s+(\S+)/i).then(function (t) {
            if (t) {
                var probe = path.join(path.dirname(t.cmd), "ffprobe" + EXE);
                t.probe = isFile(probe) ? probe : null;
                t.dir = path.dirname(t.cmd);
            }
            state.ffmpeg = t;
            return t;
        });
    }

    function detectDeno() {
        return detectSimple("deno", ["--version"], /deno\s+(\S+)/i).then(function (t) {
            state.deno = t;
            return t;
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

    // Baixa o .zip oficial (com SHA-256 conferido), extrai numa pasta temporária e
    // copia os executáveis `exeNames` (procurados até `depth` subpastas) para binDir.
    function installZipTool(tool, exeNames, depth, onProgress) {
        ensureDir(binDir);
        var zip = path.join(dataDir, tool + ".zip");
        var tmp = path.join(dataDir, tool + "-tmp");
        var cleanup = function () { rmrf(tmp); rmrf(zip); };
        rmrf(tmp);
        return downloadVerified(tool, zip, onProgress)
            .then(function () { return extractZip(zip, tmp); })
            .then(function () {
                exeNames.forEach(function (name) {
                    var found = findFileRecursive(tmp, name, depth);
                    if (!found) throw new Error(tr("{0} não encontrado no pacote baixado", name));
                    var dest = path.join(binDir, name);
                    fs.copyFileSync(found, dest);
                    if (!isWin) fs.chmodSync(dest, 0o755);
                });
                cleanup();
            }, function (e) { cleanup(); throw e; });
    }

    function installFfmpeg(onProgress) {
        if (!isWin) {
            return Promise.reject(new Error(tr("No macOS, instale o FFmpeg pelo Homebrew: brew install ffmpeg")));
        }
        return installZipTool("ffmpeg", ["ffmpeg.exe", "ffprobe.exe"], 4, onProgress).then(detectFfmpeg);
    }

    function installDeno(onProgress) {
        return installZipTool("deno", ["deno" + EXE], 2, onProgress).then(detectDeno);
    }

    // Atualiza o yt-dlp. A versão gerenciada pela extensão é simplesmente baixada de
    // novo (mais confiável que o -U); outras usam o mecanismo da própria instalação.
    function updateYtdlp(onProgress) {
        var y = state.ytdlp;
        if (!y || y.source === "managed") return installYtdlp(onProgress);
        if (y.source === "python") {
            return runCapture(y.cmd, y.base.slice(0, -2).concat(["-m", "pip", "install", "-U", "yt-dlp[default]"]), TIMEOUT.update)
                .then(function (r) {
                    if (r.code !== 0) throw new Error(firstLine(r.stderr) || tr("pip falhou"));
                    return detectYtdlp();
                });
        }
        return runCapture(y.cmd, ["-U"], TIMEOUT.update).then(function (r) {
            if (r.code !== 0) throw new Error(firstLine(r.stderr) || firstLine(r.stdout) || tr("yt-dlp -U falhou"));
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
        binDir: binDir,
        state: state,
        detectAll: detectAll,
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
        ensureDir: ensureDir,
        isNetworkError: isNetworkError,
        NETWORK_MESSAGE: NETWORK_MESSAGE,
        // expostos para os testes automáticos
        _isAllowedUrl: isAllowedUrl,
        _expectedHash: expectedHash,
        _searchDirs: searchDirs,
        _downloadFilePowerShell: downloadFilePowerShell,
        _extractZip: extractZip
    };
})();
