// client/js/config.js — Helmet DL
// Constantes do painel num lugar só.

var HDL_CONFIG = (function () {
    var isWin = typeof process !== "undefined" && process.platform === "win32";
    var arm64 = typeof process !== "undefined" && process.arch === "arm64";

    var YTDLP_RELEASE = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";
    var FFMPEG_RELEASE = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/";
    var DENO_RELEASE = "https://github.com/denoland/deno/releases/latest/download/";

    var ytdlpAsset = isWin ? "yt-dlp.exe" : "yt-dlp_macos";
    var ffmpegAsset = "ffmpeg-master-latest-win64-gpl.zip"; // builds recomendados pelo próprio yt-dlp
    var denoAsset = isWin ? "deno-x86_64-pc-windows-msvc.zip"
        : (arm64 ? "deno-aarch64-apple-darwin.zip" : "deno-x86_64-apple-darwin.zip");

    return {
        // --- Ferramentas baixadas -------------------------------------------------
        // Cada uma só é usada se o SHA-256 do arquivo bater com o publicado pelo
        // projeto oficial na mesma release (sumsUrl). Downloads só por HTTPS e só de
        // servidores do GitHub (ver HDLTools.isAllowedUrl).
        TOOLS: {
            ytdlp: {
                asset: ytdlpAsset,
                url: YTDLP_RELEASE + ytdlpAsset,
                sumsUrl: YTDLP_RELEASE + "SHA2-256SUMS"            // "<hash>  <arquivo>" por linha
            },
            ffmpeg: {
                asset: ffmpegAsset,
                url: FFMPEG_RELEASE + ffmpegAsset,
                sumsUrl: FFMPEG_RELEASE + "checksums.sha256"       // "<hash>  <arquivo>" por linha
            },
            deno: {
                asset: denoAsset,
                url: DENO_RELEASE + denoAsset,
                sumsUrl: DENO_RELEASE + denoAsset + ".sha256sum",  // um arquivo por pacote
                singleHash: true
            }
        },
        YTDLP_LATEST_API: "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest"
    };
})();
