/* Modo de tela (celular / tablet / TV) — seletor VISÍVEL no canto superior
   direito, em todas as páginas. Ajusta o zoom dos textos/controles e guarda
   a escolha no aparelho (localStorage). Na tela cheia do jogo 5, o seletor
   entra junto para continuar acessível. */
(function () {
    "use strict";

    var SALVA = "sbc-modo-tela";
    var MODOS = [
        { id: "celular", nome: "Celular" },
        { id: "tablet", nome: "Tablet" },
        { id: "tv", nome: "TV" }
    ];

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
        modoAtual = m || "tablet";
        aplicar(m);
        atualizar();
    }

    var estilo = document.createElement("style");
    estilo.textContent =
        "body.modo-celular{zoom:1.25;}" +
        "body.modo-tv{zoom:1.35;}" +
        /* telas pequenas não ganham zoom — o layout já é mobile-first */
        "@media (max-width:620px),(max-height:480px){body.modo-celular,body.modo-tv{zoom:1;}}" +
        "#sbc-modos{position:fixed;top:8px;right:8px;z-index:80;display:flex;gap:2px;" +
        "background:rgba(255,255,255,0.95);border:1px solid #dfe5e1;border-radius:9px;" +
        "padding:3px;box-shadow:0 1px 4px rgba(0, 60, 23,0.14);font-family:inherit;}" +
        "#sbc-modos button{border:0;background:transparent;border-radius:7px;" +
        "padding:6px 12px;font:inherit;font-size:0.75em;font-weight:700;color:#54635a;" +
        "line-height:1.2;cursor:pointer;-webkit-appearance:none;}" +
        "#sbc-modos button.ativo{background:#003c17;color:#fff;}" +
        "@media (max-width:620px),(max-height:480px){#sbc-modos button{padding:6px 9px;font-size:0.7em;}}";
    document.head.appendChild(estilo);

    var barra = document.createElement("div");
    barra.id = "sbc-modos";
    var botaoDe = {};
    MODOS.forEach(function (m) {
        var b = document.createElement("button");
        b.type = "button";
        b.title = "Ver como " + m.nome.toLowerCase();
        var rot = document.createElement("span");
        rot.className = "rot";
        rot.textContent = m.nome;
        b.appendChild(rot);
        b.addEventListener("click", function () { guardar(m.id); });
        barra.appendChild(b);
        botaoDe[m.id] = b;
    });

    function atualizar() {
        MODOS.forEach(function (m) {
            botaoDe[m.id].classList.toggle("ativo", m.id === modoAtual);
        });
    }

    /* na tela cheia, o seletor mora dentro da cena p/ continuar visível */
    function encaixeTelaCheia() {
        var fs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
        if (fs) { fs.appendChild(barra); } else { document.body.appendChild(barra); }
    }
    document.addEventListener("fullscreenchange", encaixeTelaCheia);
    document.addEventListener("webkitfullscreenchange", encaixeTelaCheia);

    var modoAtual = ler() || "tablet";
    aplicar(modoAtual);
    atualizar();
    document.body.appendChild(barra);
    encaixeTelaCheia();
})();