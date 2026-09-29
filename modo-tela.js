/* Modo de tela (celular / tablet / TV) — vale para TODAS as páginas do site.
   Guarda a escolha no aparelho (localStorage) e ajusta o zoom dos textos/controles. */
(function () {
    "use strict";

    var SALVA = "sbc-modo-tela";

    function ler() {
        try { return window.localStorage.getItem(SALVA) || ""; } catch (e) { return ""; }
    }

    function aplicar(m) {
        document.body.classList.remove("modo-celular", "modo-tv");
        if (m === "celular") document.body.classList.add("modo-celular");
        if (m === "tv") document.body.classList.add("modo-tv");
        if (window.Maquete3D && typeof Maquete3D.redimensionar === "function") {
            window.setTimeout(Maquete3D.redimensionar, 80);
        }
    }

    function guardar(m) {
        try { window.localStorage.setItem(SALVA, m); } catch (e) {}
        aplicar(m);
    }

    var estilo = document.createElement("style");
    estilo.textContent =
        ".tela-modo{display:none;position:fixed;inset:0;z-index:90;background:rgba(9,24,15,0.74);align-items:center;justify-content:center;}" +
        ".tela-modo.aerto{display:flex;}" +
        ".caixa-modo{display:grid;gap:10px;text-align:center;max-width:330px;width:88%;}" +
        ".caixa-modo .sub{margin:6px 0 0;font-size:0.9em;}" +
        ".btn-modo-fixo{position:fixed;right:6px;top:50%;transform:translateY(-50%);z-index:80;display:none;padding:5px 9px;font-size:1em;opacity:0.78;}" +
        ".btn-modo-fixo.aerto{display:inline-block;}" +
        "body.modo-celular{zoom:1.25;}" +
        "body.modo-tv{zoom:1.35;}";
    document.head.appendChild(estilo);

    var sobre = document.createElement("div");
    sobre.className = "tela-modo";
    sobre.innerHTML =
        '<div class="caixa-modo cartao">' +
        '<h2>Como você quer ver?</h2>' +
        '<button class="botao" type="button" data-modo="celular">📱 Modo celular</button>' +
        '<button class="botao secundario" type="button" data-modo="tablet">📲 Modo tablet</button>' +
        '<button class="botao neutro" type="button" data-modo="tv">📺 Modo TV</button>' +
        '<p class="sub">Pode trocar depois pelo botão ▪ do canto.</p>' +
        '</div>';
    document.body.appendChild(sobre);

    var fixo = document.createElement("button");
    fixo.type = "button";
    fixo.className = "botao neutro btn-modo-fixo";
    fixo.title = "Modo de tela (celular / tablet / TV)";
    fixo.setAttribute("aria-label", "Modo de tela");
    fixo.textContent = "▪";
    document.body.appendChild(fixo);

    sobre.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-modo]");
        if (!b) return;
        guardar(b.getAttribute("data-modo"));
        sobre.classList.remove("aerto");
        fixo.classList.add("aerto");
    });

    fixo.addEventListener("click", function () {
        var fs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
        if (fs && sobre.parentNode !== fs) fs.appendChild(sobre);
        sobre.classList.add("aerto");
        fixo.classList.remove("aerto");
    });

    /* em tela cheia (jogo 5), os avisos fixos moram dentro da cena p/ continuarem visíveis */
    function encaixeTelaCheia() {
        var fs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
        if (fs) {
            fs.appendChild(fixo);
            if (sobre.classList.contains("aerto")) fs.appendChild(sobre);
        } else {
            document.body.appendChild(fixo);
            document.body.appendChild(sobre);
        }
    }
    document.addEventListener("fullscreenchange", encaixeTelaCheia);
    document.addEventListener("webkitfullscreenchange", encaixeTelaCheia);

    var m = ler();
    aplicar(m);
    if (m) {
        fixo.classList.add("aerto");
    } else {
        sobre.classList.add("aerto");
    }
})();