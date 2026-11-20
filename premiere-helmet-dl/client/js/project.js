// client/js/project.js — Helmet DL
// O projeto aberto no Premiere e a pasta "Helmet DL" ao lado do .prproj,
// onde os downloads são salvos.

var HDLProject = (function () {
    var C = HDL_CONFIG;
    var U = HDLUi;
    var els = U.els;
    var nodePath = U.hasNode ? require("path") : null;

    var project = { path: "", name: "" };

    // Pasta de destino dos downloads ("" se o projeto nunca foi salvo).
    function helmetDir() {
        return project.path ? nodePath.join(nodePath.dirname(project.path), C.FOLDER_NAME) : "";
    }

    // Pergunta ao Premiere qual projeto está aberto e atualiza o cabeçalho.
    function refresh() {
        if (!HDLBridge.available) {
            els.projectInfo.textContent = "Prévia fora do Premiere";
            return Promise.resolve(project);
        }
        return HDLBridge.call("hdl_getProjectInfo").then(function (d) {
            project.path = d.path || "";
            project.name = d.name || "";
            if (project.path) {
                els.projectInfo.textContent = "Salvando em " + project.name.replace(/\.prproj$/i, "") + " › " + C.FOLDER_NAME;
                els.projectInfo.title = helmetDir() + "\n(clique para atualizar)";
            } else {
                els.projectInfo.textContent = "Salve o projeto para poder baixar";
                els.projectInfo.title = "A pasta Helmet DL é criada ao lado do arquivo .prproj";
            }
            return project;
        }, function (e) {
            project.path = "";
            els.projectInfo.textContent = "Nenhum projeto aberto";
            U.appendLog("Projeto: " + e.message);
            return project;
        });
    }

    // Abre a pasta (ou mostra o arquivo selecionado) no Explorer / Finder.
    function reveal(target, select) {
        if (!U.hasNode) return;
        try {
            HDLTools.reveal(target, select);
        } catch (e) {
            U.appendLog("Não foi possível abrir a pasta: " + e.message);
        }
    }

    // Botão de pasta no cabeçalho.
    function openFolder() {
        if (!U.hasNode) return;
        refresh().then(function () {
            if (!project.path) {
                U.setStatus("Salve o projeto primeiro — a pasta " + C.FOLDER_NAME + " fica ao lado do .prproj.", "warning");
                return;
            }
            HDLTools.ensureDir(helmetDir());
            reveal(helmetDir(), false);
        });
    }

    return {
        info: project,
        helmetDir: helmetDir,
        refresh: refresh,
        reveal: reveal,
        openFolder: openFolder
    };
})();
