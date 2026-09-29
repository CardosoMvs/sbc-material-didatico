/* Sojinho — mascote 3D do site.
   Base: modelo "Farmer" (Quaternius, licenca CC0) adaptado no tema SBC:
   camisa amarela, jardineira/calca verde e crachá SBC pendurado no chapéu.
   Animacoes prontas do modelo: Wave (acenando) na home, Idle nos outros lugares.

   Uso nas páginas (antes do </body>, junto do modo-tela.js):
     <script src="three.min.js"></script>            (no jogo5 já tem)
     <script src="modelos/GLTFLoader.js"></script>   (no jogo5 já tem)
     <script src="sojinho-glb.js"></script>          (modelo embutido em base64)
     <script src="sojinho3d.js"></script>
   - O modelo vem EMBUTIDO no sojinho-glb.js (base64): funciona até abrindo
     o arquivo com duplo clique (file://), offline, sem servidor nenhum.
     Se o sojinho-glb.js não estiver na página, tenta baixar o .glb normal.
   - Se a página tiver um elemento com id="sojinho-3d", o Sojinho monta ali (herói do index).
   - Senão aparece flutuando no canto inferior esquerdo (acompanha todos os jogos,
     inclusive dentro da tela cheia do jogo5).
   - Se o WebGL ou o modelo falharem, cai no Sojinho 2D (sojinho.svg). */
(function () {
    "use strict";

    var MODELO = "modelos/farmer_quaternius.glb";
    var SOQUETE = "sojinho.svg";

    /* base64 -> ArrayBuffer (para o GLTFLoader.parse do modelo embutido) */
    function b64paraBuf(b) {
        var bin = atob(b), n = bin.length;
        var buf = new ArrayBuffer(n), arr = new Uint8Array(buf);
        for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
        return buf;
    }

    function soquete2D(el) {
        el.innerHTML = '<img src="' + SOQUETE + '" alt="Sojinho" style="height:100%;width:auto;display:block;">';
    }

    /* altura (min/max Y) medida pelos ossos, em pose de descanso */
    function pontosOssos(cara) {
        var yMin = Infinity, yMax = -Infinity;
        cara.updateMatrixWorld(true);
        cara.traverse(function (o) {
            if (o && o.isBone) {
                var p = o.getWorldPosition(new THREE.Vector3());
                if (p.y < yMin) yMin = p.y;
                if (p.y > yMax) yMax = p.y;
            }
        });
        return { min: yMin, h: yMax - yMin };
    }

    function montar(el, opts) {
        opts = opts || {};
        try {
            if (!window.THREE || !THREE.GLTFLoader) { soquete2D(el); return; }
            var larg = el.clientWidth || 190, alt = el.clientHeight || 200;

            var render = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
            render.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            render.setSize(larg, alt, false);
            if (THREE.sRGBEncoding !== undefined) render.outputEncoding = THREE.sRGBEncoding;
            render.domElement.style.width = "100%";
            render.domElement.style.height = "100%";
            render.domElement.style.display = "block";
            el.innerHTML = "";
            el.style.pointerEvents = "none";
            el.appendChild(render.domElement);

            var cena = new THREE.Scene();
            var camera = new THREE.PerspectiveCamera(34, larg / alt, 0.05, 80);
            cena.add(new THREE.HemisphereLight(0xffffff, 0x9db98a, 0.95));
            var sol = new THREE.DirectionalLight(0xffffff, 0.85);
            sol.position.set(2, 3, 2.5);
            cena.add(sol);

            function pronto(gltf) {
                try {
                    armado(gltf, el, opts);
                } catch (e) {
                    if (window.console) console.error("Sojinho3D:", e && (e.stack || e));
                    soquete2D(el);
                }
            }
            function falhou(e) {
                if (window.console) console.error("Sojinho3D: falha no modelo", e);
                soquete2D(el);
            }
            var carregador = new THREE.GLTFLoader();
            if (window.SojinhoGLB64) {
                /* modelo embutido (base64) — funciona em file:// e offline */
                carregador.parse(b64paraBuf(window.SojinhoGLB64), "", pronto, falhou);
            } else {
                carregador.load(MODELO, pronto, undefined, falhou);
            }
                function armado(gltf, el, opts) {

                var cara = gltf.scene;
                cena.add(cara);   /* <— faltava isto: sem add, so a sombra aparecia */
                cara.updateMatrixWorld(true);

                /* ---- pintura tema SBC (material novo por peca; cores mantidas
                   copiadas dos fatores do proprio glb) ---- */
                var PALAVRA = {
                    "Farmer_Head:Skin": 0x7e5531,
                    "Farmer_Head:Beige": 0x443f29,
                    "Farmer_Head:Eyebrows": 0x0a0704,
                    "Farmer_Head:Red": 0x290103,
                    "Farmer_Head:Eye": 0x060402,
                    "Farmer_Body:Skin": 0x7e5531,
                    "Farmer_Body:Beige": 0x443f29
                };
                var pintura = {
                    "Farmer_Body:Brown": 0xf2cf37,      /* camisa amarela SBC */
                    "Farmer_Pants:LightBlue": 0x2e7a3a, /* jardineira verde SBC */
                    "Farmer_Body:LightBlue": 0x2e7a3a,  /* peitoril da jardineira */
                    "Farmer_Feet:Brown": 0xc19a5b,      /* bota */
                    "Farmer_Feet:Brown2": 0x8a6b3f
                };
                var pecas = ["Farmer_Head", "Farmer_Feet", "Farmer_Body", "Farmer_Pants"];
                cara.traverse(function (o) {
                    if (!o.isSkinnedMesh || !o.material) return;
                    /* GLTFLoader parte malhas multi-primitiva: nomes vem com _1, _2... */
                    var nome = o.name.replace(/_\d+$/, "");
                    if (pecas.indexOf(nome) < 0) return;
                    o.frustumCulled = false;   /* o bbox do bind-pose (T) engana o culling */
                    var orig = [].concat(o.material);
                    o.material = orig.map(function (m) {
                        var cor = pintura[nome + ":" + m.name];
                        if (cor === undefined) cor = PALAVRA[nome + ":" + m.name];
                        if (cor === undefined) cor = m.name === "Skin" ? 0x7e5531 : 0x9a552b;
                        return new THREE.MeshStandardMaterial({
                            color: cor, roughness: 0.92, metalness: 0, skinning: true
                        });
                    });
                });

                /* ---- para que lado ele olha? (media dos vertices dos olhos) ---- */
                var caraZ = 1;
                var meshCara = cara.getObjectByName("Farmer_Head", true);
                if (meshCara && meshCara.isSkinnedMesh && meshCara.geometry) {
                    var g = meshCara.geometry;
                    var pos = g.attributes.position;
                    var mats = [].concat(meshCara.material);
                    var soma = new THREE.Vector3(), n = 0;
                    (g.groups || []).forEach(function (gp, idx) {
                        if (!mats[idx] || mats[idx].name !== "Eye") return;
                        for (var i = gp.start; i < gp.start + gp.count; i++) {
                            soma.x += pos.getX(i); soma.y += pos.getY(i); soma.z += pos.getZ(i); n++;
                        }
                    });
                    if (n) {
                        var olhoLocal = soma.multiplyScalar(1 / n);
                        olhoLocal.applyMatrix4(meshCara.matrixWorld);
                        var dz = olhoLocal.z - meshCara.getWorldPosition(new THREE.Vector3()).z;
                        caraZ = (dz > 0) ? 1 : -1;
                    }
                }
                if (caraZ < 0) cara.rotation.y = Math.PI;
                cara.updateMatrixWorld(true);

                /* ---- enquadrar pela medida óssea NO CRU (sem mexer na escala do
                   root: em r128 escalar o gltf.scene depois do bind bagunça a
                   pele; o teste cirúrgico provou que enquadrar a câmera funciona) ---- */
                var medida = pontosOssos(cara);
                var H = (medida.h > 0.01) ? medida.h : 11.2;   /* cru: ~11.2 (braco × 100) */
                var y0 = (medida.min === Infinity ? 0 : medida.min);

                /* ---- crachá SBC pendurado no chapéu (segue a cabeça) ---- */
                var osso = cara.getObjectByName("Head", true);
                var topo = cara.getObjectByName("Head_end", true);
                if (osso && topo) {
                    var pBase = osso.getWorldPosition(new THREE.Vector3());
                    var pTopo = topo.getWorldPosition(new THREE.Vector3());
                    var L = pBase.distanceTo(pTopo) || 0.18;      /* medida da cabeca */
                    var s = osso.getWorldScale(new THREE.Vector3()).x || 1;

                    var cv = document.createElement("canvas");
                    cv.width = 128; cv.height = 128;
                    var cx = cv.getContext("2d");
                    cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, 128, 128);
                    cx.beginPath(); cx.arc(64, 64, 62, 0, 6.2832);
                    cx.fillStyle = "#ffffff"; cx.fill();
                    cx.lineWidth = 10; cx.strokeStyle = "#2e7a3a"; cx.stroke();
                    cx.fillStyle = "#1d4427";
                    cx.font = "bold 52px Arial, sans-serif";
                    cx.textAlign = "center"; cx.textBaseline = "middle";
                    cx.fillText("SBC", 64, 66);

                    var cracha = new THREE.Mesh(
                        new THREE.CircleGeometry(L * 0.22, 20),
                        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) })
                    );
                    osso.add(cracha);
                    cracha.scale.setScalar(1 / s);
                    var alvoMundo = new THREE.Vector3(pBase.x, pTopo.y + L * 0.28, pBase.z + L * 0.5);
                    cracha.position.copy(osso.worldToLocal(alvoMundo));
                    if (caraZ < 0) cracha.rotation.y = Math.PI;
                }

                /* ---- sombra no chao + enquadrar ---- */
                var h = H, y0 = y0;

                var sombra = new THREE.Mesh(
                    new THREE.CircleGeometry(h * 0.19, 22),
                    new THREE.MeshBasicMaterial({ color: 0x0a2413, transparent: true, opacity: 0.22 })
                );
                sombra.rotation.x = -Math.PI / 2;
                sombra.position.set(0, y0 + 0.01, 0);
                cena.add(sombra);
                console.log("Sojinho3D: modelo ok, ossos min=", y0.toFixed(2), "h=", h);

                camera.position.set(0, y0 + h * 0.60, h * 1.95);
                camera.lookAt(new THREE.Vector3(0, y0 + h * 0.50, 0));
                if (camera.near > h * 0.1) { camera.near = h * 0.1; camera.far = h * 12; camera.updateProjectionMatrix(); }

                /* ---- animacao (Wave na home, Idle nos cantos) ---- */
                var clipe = (opts.animacao === "Idle") ? "Idle" : "Wave";
                var achado = null;
                (gltf.animations || []).forEach(function (a) {
                    var nm = a.name || "";
                    if (nm === "CharacterArmature|" + clipe) achado = a;
                });
                if (!achado) {
                    (gltf.animations || []).forEach(function (a) {
                        if ((a.name || "").indexOf(clipe) >= 0) achado = a;
                    });
                }
                var mixer = null;
                if (achado) {
                    mixer = new THREE.AnimationMixer(cara);
                    mixer.clipAction(achado).play();
                }

                var rel = new THREE.Clock();
                var t = 0;
                var contaQuadro = 0;
                (function quadro() {
                    requestAnimationFrame(quadro);
                    var dt = Math.min(rel.getDelta(), 0.1);
                    t += dt;
                    if (mixer) mixer.update(dt);
                    cara.rotation.z = Math.sin(t * 1.6) * 0.02;   /* balanco de vida */
                    render.render(cena, camera);
                    contaQuadro++;
                    if (contaQuadro === 1) console.log("Sojinho3D: 1o quadro ok, h=", h.toFixed(2), "el=", larg, "x", alt);
                })();

                }

        } catch (e) { soquete2D(el); }
    }

    /* ---- mascote flutuante (paginas sem id="sojinho-3d") ---- */
    function flutuante() {
        var caixa = document.createElement("div");
        caixa.id = "sojinho-flutuante";
        caixa.style.cssText =
            "position:fixed;left:8px;bottom:8px;width:112px;height:142px;z-index:40;pointer-events:none;";
        document.body.appendChild(caixa);
        montar(caixa, { animacao: "Idle" });

        /* em tela cheia (jogo5) entra junto, para nao sumir */
        function encaixe() {
            var fs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
            if (fs) { fs.appendChild(caixa); } else { document.body.appendChild(caixa); }
        }
        document.addEventListener("fullscreenchange", encaixe);
        document.addEventListener("webkitfullscreenchange", encaixe);
    }

    function iniciar() {
        var alvo = document.getElementById("sojinho-3d");
        if (alvo) montar(alvo, { animacao: "Wave" });
        else flutuante();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

    window.Sojinho3D = { montar: montar, flutuante: flutuante };
})();