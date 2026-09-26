/* driver de teste: congela rAF cedo (SwiftShader é lento) e exercita o fluxo */
(function () {
    var raf = window.requestAnimationFrame.bind(window);
    var parado = false;
    window.requestAnimationFrame = function (cb) {
        if (parado) return 0;
        return raf(function (ts) { if (!parado) cb(ts); });
    };
    setTimeout(function () {
        parado = true;   // congela o loop após o 1º quadro (marcadores já posicionados)
        try {
            var marks = [];
            function mark(id, v) {
                var el = document.getElementById(id);
                if (el) el.setAttribute("data-teste", String(v));
                else marks.push('FALTA-' + id);
            }
            var ok = document.getElementById("marc-t1") && document.getElementById("marc-rl");
            mark("t-ok-init", ok ? "ok" : "falhou");
            var posOk = true, n = 0;
            ["t1", "t2", "t3", "appd", "appp", "rl", "vacas", "bio", "sede"].forEach(function (id) {
                var el = document.getElementById("marc-" + id);
                if (!el) { posOk = false; return; }
                var st = el.style;
                if (st.display === "none") { posOk = false; return; }
                var lf = parseFloat(st.left), tp = parseFloat(st.top);
                if (isNaN(lf) || isNaN(tp) || (lf === 0 && tp === 0)) posOk = false;
                n++;
            });
            mark("t-pos", posOk && n === 9 ? "ok" : "falhou");
            var info = window.Maquete3D && Maquete3D.info ? Maquete3D.info() : null;
            mark("t-info", info && info.marcadores === 10 ? "ok" : "sem-info");
            /* clique nos 10 hotspots */
            ["t1", "t2", "t3", "appd", "appp", "rl", "drone", "vacas", "bio", "sede"].forEach(function (id) {
                var b = document.getElementById("marc-" + id);
                if (b) b.click();
            });
            var p = document.getElementById("pontos");
            mark("t-pontos-pre", p ? p.textContent : "sem");
            window.trocarAno(2); window.trocarAno(3);
            var ano = document.getElementById("ano-atual");
            mark("t-ano", ano ? ano.textContent : "sem");
            var f = document.getElementById("ficha");
            var fichaVis = f && f.style.display !== "none" && !f.classList.contains("oculto");
            mark("t-ficha-visivel", fichaVis ? "ok" : "falhou");
            var fechar = document.getElementById("fechar-ficha");
            if (fechar) fechar.click();
        } catch (e) {
            var el = document.createElement("div");
            el.id = "t-erro"; el.setAttribute("data-teste", String(e && e.message || e));
            document.body.appendChild(el);
        }
    }, 150);
    setTimeout(function () {
        try {
            var p = document.getElementById("pontos");
            var el = document.createElement("div");
            el.id = "t-pontos-final"; el.setAttribute("data-teste", p ? p.textContent : "sem");
            document.body.appendChild(el);
            var fim = document.getElementById("final");
            var e2 = document.createElement("div");
            e2.id = "t-final"; e2.setAttribute("data-teste",
                fim && fim.style.display !== "none" ? "visivel" : "oculto");
            document.body.appendChild(e2);
            var rank = document.getElementById("ranking");
            e2 = document.createElement("div");
            e2.id = "t-fim"; e2.setAttribute("data-teste", rank && rank.children.length ? "ok" : "vazio");
            document.body.appendChild(e2);
        } catch (e) { /* silencioso */ }
    }, 900);
})();