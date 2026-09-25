/* ============================================================
   maquete3d.js — Diorama Three.js da Maquete da Fazenda (SBC)
   Requer three.min.js e OrbitControls.js (builds globais r128).
   Uso:
     Maquete3D.init({ container, ano, aoMarcar })  → true/false
     Maquete3D.trocarAno(1|2|3)
     Maquete3D.info()  → contagens p/ depuração
   aoMarcar(dados) recebe, a cada quadro:
     { id: { x, y, visivel } }  — coordenadas em px do container.
   ============================================================ */
var Maquete3D = (function () {
    "use strict";

    /* ---------- coordenadas: SVG (1240x820) → mundo 3D ---------- */
    var ESC = 50, CX = 620, CZ = 410;
    function sx(x) { return (x - CX) / ESC; }
    function sz(y) { return (y - CZ) / ESC; }

    /* ---------- utilidades ---------- */
    function rng(seed) {
        return function () {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };
    }
    function lam(c) { return new THREE.MeshLambertMaterial({ color: c }); }
    function brilho(c) { return new THREE.MeshPhongMaterial({ color: c, shininess: 80, specular: 0x9ecbdd }); }
    function caixa(w, h, d, mat) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.castShadow = true; m.receiveShadow = true;
        return m;
    }

    var renderer, scene, camera, controls, container, opts;
    var gEstatico, gAno, gVida;
    var drone, helices = [], vacas = [], borboletas = [], abelhas = [], nuvens = [];
    var tGlobal = 0, relogio;

    /* posições 3D dos marcadores (SVG + altura livre) */
    var POS = {
        t1: { x: 250, y: 420, h: 1.1 },
        t2: { x: 560, y: 320, h: 1.1 },
        t3: { x: 940, y: 420, h: 1.1 },
        appd: { x: 115, y: 640, h: 0.8 },
        appp: { x: 1100, y: 420, h: 2.6 },
        rl: { x: 940, y: 230, h: 2.8 },
        vacas: { x: 790, y: 178, h: 1.3 },
        bio: { x: 960, y: 620, h: 1.0 },
        sede: { x: 632, y: 205, h: 1.5 },
        drone: { segue: true }
    };
    var posFixas = {};

    /* ---------- geometrias e materiais compartilhados ---------- */
    var GEO = {
        tronco: new THREE.CylinderGeometry(0.05, 0.08, 0.5, 6),
        copa: new THREE.SphereGeometry(0.3, 8, 6),
        tufo: new THREE.ConeGeometry(0.05, 0.18, 4),
        palha: new THREE.BoxGeometry(0.2, 0.05, 0.08),
        linha: new THREE.BoxGeometry(0.14, 0.18, 1),
        flor: new THREE.SphereGeometry(0.035, 6, 5),
        haste: new THREE.CylinderGeometry(0.012, 0.02, 0.3, 5)
    };
    var MAT = {
        tronco: lam(0x6b4a2b),
        palha: lam(0xd9c27e),
        tufo: lam(0x2f7d3c),
        branco: lam(0xffffff)
    };

    /* ---------- céu (textura de degradê) ---------- */
    function ceuTextura() {
        var cv = document.createElement("canvas");
        cv.width = 2; cv.height = 256;
        var c = cv.getContext("2d");
        var g = c.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, "#5fa8e0");
        g.addColorStop(0.55, "#a5d4f2");
        g.addColorStop(0.85, "#dbeaf2");
        g.addColorStop(1, "#f4ecc9");
        c.fillStyle = g;
        c.fillRect(0, 0, 2, 256);
        var t = new THREE.CanvasTexture(cv);
        return t;
    }

    /* ---------- luz ---------- */
    function luzes() {
        scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x7a9a5f, 0.72));
        scene.add(new THREE.AmbientLight(0xffffff, 0.16));
        var sol = new THREE.DirectionalLight(0xfff1d6, 1.1);
        sol.position.set(15, 20, -8);
        sol.castShadow = true;
        sol.shadow.mapSize.set(2048, 2048);
        sol.shadow.camera.left = -17; sol.shadow.camera.right = 17;
        sol.shadow.camera.top = 15; sol.shadow.camera.bottom = -15;
        sol.shadow.camera.near = 2; sol.shadow.camera.far = 60;
        sol.shadow.bias = -0.0006;
        scene.add(sol);
    }

    /* ---------- árvore low-poly ---------- */
    function arvore(pal, s) {
        var g = new THREE.Group();
        var tronco = new THREE.Mesh(GEO.tronco, MAT.tronco);
        tronco.scale.setScalar(s); tronco.position.y = 0.25 * s;
        tronco.castShadow = true;
        g.add(tronco);
        [[0, 0.66, 0, 1], [0.17, 0.55, 0.06, 0.72], [-0.16, 0.58, -0.05, 0.66]].forEach(function (b, i) {
            var m = new THREE.Mesh(GEO.copa, lam(pal[i % pal.length]));
            m.scale.setScalar(s * b[3]);
            m.position.set(b[0] * s, b[1] * s, b[2] * s);
            m.castShadow = true;
            g.add(m);
        });
        return g;
    }

    function floresta(r, qtd, paletas, seed, sMin, sMax) {
        var g = new THREE.Group(), r2 = rng(seed);
        for (var i = 0; i < qtd; i++) {
            var a = arvore(paletas[i % paletas.length], sMin + r2() * (sMax - sMin));
            a.position.set(sx(r.x + 12 + r2() * (r.w - 24)), 0, sz(r.y + 14 + r2() * (r.h - 28)));
            g.add(a);
        }
        return g;
    }

    /* ---------- rio (fita achatada sobre curva) ---------- */
    function rio(pontosSvg, corAgua, corMargem, largura) {
        var g = new THREE.Group();
        var pts = pontosSvg.map(function (p) { return new THREE.Vector3(sx(p[0]), 0, sz(p[1])); });
        var curva = new THREE.CatmullRomCurve3(pts);
        var margem = new THREE.Mesh(new THREE.TubeGeometry(curva, 70, largura, 10), lam(corMargem));
        margem.scale.y = 0.3; margem.position.y = 0.1; margem.receiveShadow = true;
        var agua = new THREE.Mesh(new THREE.TubeGeometry(curva, 70, largura * 0.72, 10), brilho(corAgua));
        agua.scale.y = 0.22; agua.position.y = 0.14;
        g.add(margem); g.add(agua);
        return g;
    }

    /* ---------- vaca low-poly ---------- */
    function vaca(escala) {
        var g = new THREE.Group();
        var corpo = caixa(0.42, 0.2, 0.24, MAT.branco);
        corpo.position.y = 0.3;
        g.add(corpo);
        [[0.1, 0.02], [-0.12, -0.05]].forEach(function (p) {
            var mancha = caixa(0.14, 0.12, 0.26, lam(0x3a3a3a));
            mancha.position.set(p[0], 0.3 + p[1], 0);
            g.add(mancha);
        });
        var cabeca = caixa(0.12, 0.13, 0.13, MAT.branco);
        cabeca.position.set(0.26, 0.36, 0);
        g.add(cabeca);
        var focinho = caixa(0.05, 0.07, 0.11, lam(0xf2cfc9));
        focinho.position.set(0.33, 0.32, 0);
        g.add(focinho);
        [[-0.1, 0.09], [0.08, -0.1], [0.12, -0.08], [0.15, 0.1]].forEach(function (p) {
            var perna = caixa(0.05, 0.22, 0.05, MAT.branco);
            perna.position.set(p[0], 0.1, p[1]);
            g.add(perna);
        });
        g.scale.setScalar(escala || 1);
        return g;
    }

    /* ---------- trator ---------- */
    function trator() {
        var g = new THREE.Group();
        var corpo = caixa(0.44, 0.2, 0.24, lam(0xc23b22));
        corpo.position.y = 0.3; g.add(corpo);
        var capo = caixa(0.2, 0.13, 0.22, lam(0xa92f1a));
        capo.position.set(0.3, 0.42, 0); g.add(capo);
        var cabine = caixa(0.2, 0.2, 0.18, lam(0xc23b22));
        cabine.position.set(-0.12, 0.5, 0); g.add(cabine);
        var janela = caixa(0.02, 0.12, 0.12, brilho(0xbfe3f2));
        janela.position.set(-0.01, 0.52, 0); g.add(janela);
        var geoRoda = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10);
        var matRoda = lam(0x2f2f2f);
        [[-0.14, 0.14, 0.1], [-0.14, -0.14, 0.1], [0.16, 0.12, 0.07], [0.16, -0.12, 0.07]].forEach(function (p) {
            var roda = new THREE.Mesh(geoRoda, matRoda);
            roda.rotation.x = Math.PI / 2;
            roda.scale.set(p[2] / 0.1, 1, 1);
            roda.position.set(p[0], p[2], p[1]);
            roda.castShadow = true;
            g.add(roda);
        });
        return g;
    }

    /* ---------- drone ---------- */
    function montarDrone() {
        drone = new THREE.Group();
        var corpo = caixa(0.18, 0.09, 0.18, lam(0x37474f));
        corpo.position.y = 0; drone.add(corpo);
        var braco = caixa(0.56, 0.03, 0.05, lam(0x37474f));
        drone.add(braco);
        var braco2 = caixa(0.05, 0.03, 0.56, lam(0x37474f));
        drone.add(braco2);
        var geoDisco = new THREE.CylinderGeometry(0.12, 0.12, 0.015, 8);
        var matDisco = lam(0x8aa0ac);
        [[0.28, 0.28], [-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28]].forEach(function (p) {
            var d = new THREE.Mesh(geoDisco, matDisco);
            d.position.set(p[0], 0.06, p[1]);
            drone.add(d);
            helices.push(d);
        });
        var cam = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), lam(0x263238));
        cam.position.y = -0.07;
        drone.add(cam);
        drone.position.set(0.6, 3.2, 1.9);
        gEstatico.add(drone);
    }

    /* ---------- nuvens ---------- */
    function montarNuvens() {
        var mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa5ad });
        var geo = new THREE.SphereGeometry(1, 10, 8);
        [[-9, 6.4, -5, 1.5], [2, 7.2, -6.5, 1.1], [11, 6.1, -4, 1.3]].forEach(function (n, idx) {
            var g = new THREE.Group();
            for (var i = 0; i < 4; i++) {
                var m = new THREE.Mesh(geo, mat);
                m.scale.set(0.9 + i * 0.2, 0.32, 0.55 + i * 0.1);
                m.position.set(i * 0.85 - 1.2, (i % 2) * 0.18, (i % 2) * 0.3);
                g.add(m);
            }
            g.position.set(n[0], n[1], n[2]);
            g.scale.setScalar(n[3]);
            g.userData.vel = 0.14 + idx * 0.05;
            nuvens.push(g);
            gEstatico.add(g);
        });
    }

    /* ---------- talhões (camada que muda com o ano) ---------- */
    var T1 = { x: 170, y: 250, w: 280, h: 510 };
    var T2 = { x: 490, y: 250, w: 320, h: 510 };
    var T3 = { x: 850, y: 250, w: 215, h: 510 };
    var M1 = { cx: 610, cy: 470, rx: 128, ry: 98 };
    var M2 = { cx: 730, cy: 640, rx: 95, ry: 72 };
    var MORROS = [
        { c: [sx(M1.cx), sz(M1.cy)], r: [M1.rx / ESC, M1.ry / ESC], a: 0.85 },
        { c: [sx(M2.cx), sz(M2.cy)], r: [M2.rx / ESC, M2.ry / ESC], a: 0.62 }
    ];
    var COR_SOJA = [0x79b25c, 0x4ea24f, 0x2f9e42];
    var COR_BASE1 = [0xb08d5f, 0xa3935a, 0x77804a];
    var COR_BASE2 = [0xc3a26b, 0x94b56d, 0x6fa254];

    function disposeGrupo(g) {
        g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
        while (g.children.length) g.remove(g.children[0]);
    }

    /* InstancedMesh a partir de lista { p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz], c:cor } */
    function instancias(geo, mat, itens) {
        var m = new THREE.InstancedMesh(geo, mat, itens.length);
        var mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
        var e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
        var col = new THREE.Color();
        for (var i = 0; i < itens.length; i++) {
            var it = itens[i];
            e.set(it.r ? it.r[0] : 0, it.r ? it.r[1] : 0, it.r ? it.r[2] : 0);
            q.setFromEuler(e);
            var sc = it.s || [1, 1, 1];
            v.set(it.p[0], it.p[1], it.p[2]);
            s.set(sc[0], sc[1], sc[2]);
            mtx.compose(v, q, s);
            m.setMatrixAt(i, mtx);
            if (it.c !== undefined) m.setColorAt(i, col.set(it.c));
        }
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.castShadow = true; m.receiveShadow = true;
        return m;
    }

    function palhadaItens(r, qtd, seed) {
        var r2 = rng(seed), itens = [];
        var cores = [0xd9c27e, 0xcbb26a, 0xe2cf90, 0xbfa15a];
        for (var i = 0; i < qtd; i++) {
            itens.push({
                p: [sx(r.x + 8 + r2() * (r.w - 16)), 0.17, sz(r.y + 8 + r2() * (r.h - 16))],
                r: [0, r2() * Math.PI, 0],
                c: cores[(r2() * 4) | 0]
            });
        }
        return itens;
    }

    /* fileiras retas (ao longo do eixo z) */
    function fileirasRetas(r, passo, cor, alt, y) {
        var itens = [];
        for (var x = r.x + 18; x <= r.x + r.w - 14; x += passo) {
            itens.push({ p: [sx(x), y, sz(r.y + r.h / 2)], s: [1, alt, (r.h - 30) / ESC], c: cor });
        }
        return itens;
    }

    /* fileiras em contorno (onduladas ao longo do eixo x) */
    function fileiraOndulada(geo, mat, x0, x1, zLinha, y, amp, freq, cor) {
        var pts = [];
        for (var x = x0; x <= x1; x += 0.35) {
            pts.push(new THREE.Vector3(x, y, zLinha + Math.sin(x * freq) * amp));
        }
        var curva = new THREE.CatmullRomCurve3(pts);
        var m = new THREE.Mesh(new THREE.TubeGeometry(curva, 28, 0.075, 6), cor !== undefined ? mat : mat);
        m.scale.y = 0.55;
        m.castShadow = true;
        return m;
    }

    /* ---------- Talhão 1: evolução da palhada ---------- */
    function talhao1(ano) {
        var g = new THREE.Group();
        var base = caixa(T1.w / ESC, 0.14, T1.h / ESC, lam(COR_BASE1[ano - 1]));
        base.position.set(sx(T1.x + T1.w / 2), 0.07, sz(T1.y + T1.h / 2));
        g.add(base);

        var itens = fileirasRetas(T1, 26, 0xffffff, 1, 0.2);
        /* milho na safrinha: cada 5ª fileira mais alta e amarela */
        itens.forEach(function (it, i) {
            if (i % 5 === 4) { it.s = [1.1, 1.9, (T1.h - 30) / ESC]; it.c = 0x9ccc65; }
            else { it.c = COR_SOJA[ano - 1]; it.s = [1, 1 + ano * 0.08, (T1.h - 30) / ESC]; }
        });
        g.add(instancias(GEO.linha, MAT.branco, itens));

        g.add(instancias(GEO.palha, MAT.branco, palhadaItens(T1, [50, 220, 470][ano - 1], 11 + ano)));

        /* lavoura avançando perto demais do rio (APP degradada) */
        var inv = [];
        for (var e = 98; e <= 154; e += 14) {
            inv.push({ p: [sx(e), 0.14, sz(515)], s: [1, 1, 370 / ESC], c: COR_SOJA[ano - 1] });
        }
        g.add(instancias(GEO.linha, MAT.branco, inv));
        return g;
    }

    /* ---------- Talhão 2: relevo e plantio em contorno ---------- */
    function talhao2(ano) {
        var g = new THREE.Group();
        var base = caixa(T2.w / ESC, 0.14, T2.h / ESC, lam(COR_BASE2[ano - 1]));
        base.position.set(sx(T2.x + T2.w / 2), 0.07, sz(T2.y + T2.h / 2));
        g.add(base);

        var corMorro = ano === 1 ? 0xb28c52 : (ano === 2 ? 0x79b069 : 0x5a9a5d);
        MORROS.forEach(function (m) {
            var morro = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), lam(corMorro));
            morro.scale.set(m.r[0], m.a, m.r[1]);
            morro.position.set(m.c[0], 0.1, m.c[1]);
            morro.castShadow = true; morro.receiveShadow = true;
            g.add(morro);
        });

        if (ano === 1) {
            /* linhas retas morro abaixo + ravinas */
            g.add(instancias(GEO.linha, MAT.branco, fileirasRetas(T2, 22, 0x8a9a55, 1, 0.24)));
            MORROS.forEach(function (m, mi) {
                var n = mi === 0 ? 2 : 1;
                for (var k = 0; k < n; k++) {
                    var dx = m.r[0] * 0.4 * (k ? -1 : 1);
                    var pts = [
                        new THREE.Vector3(m.c[0] + dx, m.a * 0.92 + 0.1, m.c[1] - m.r[1] * 0.3),
                        new THREE.Vector3(m.c[0] + dx * 1.3, m.a * 0.5 + 0.1, m.c[1] + m.r[1] * 0.5),
                        new THREE.Vector3(m.c[0] + dx * 1.6, 0.16, m.c[1] + m.r[1] * 1.05)
                    ];
                    var ravina = new THREE.Mesh(
                        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.07, 6),
                        lam(0x7c4a28));
                    ravina.castShadow = true;
                    g.add(ravina);
                    /* leque de sedimento no pé */
                    var sed = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.05, 12), lam(0x8a5a33));
                    sed.position.set(m.c[0] + dx * 1.6, 0.18, m.c[1] + m.r[1] * 1.15);
                    sed.scale.set(1, 1, 0.6);
                    sed.receiveShadow = true;
                    g.add(sed);
                }
            });
            g.add(instancias(GEO.palha, MAT.branco, palhadaItens(T2, 40, 221)));
        } else {
            /* plantio em contorno: anéis nos morros + faixas onduladas */
            var corLinha = ano === 2 ? 0xd9b64e : 0x2f7d3c;
            var corAnel = ano === 2 ? 0xb8cf9a : 0x67b26a;
            MORROS.forEach(function (m) {
                var aneis = [];
                for (var k = 1; k <= 5; k++) {
                    var f = k / 5.6;
                    var py = m.a * Math.sqrt(Math.max(0, 1 - f * f)) + 0.12;
                    for (var a = 0; a < Math.PI * 2; a += 0.32) {
                        aneis.push({
                            p: [m.c[0] + Math.cos(a) * m.r[0] * f, py, m.c[1] + Math.sin(a) * m.r[1] * f],
                            r: [0, Math.atan2(-Math.sin(a) * m.r[0], Math.cos(a) * m.r[1]), 0],
                            s: [0.8, 0.7, 1.4], c: corAnel
                        });
                    }
                }
                g.add(instancias(GEO.linha, MAT.branco, aneis));
            });
            var matLinha = lam(corLinha);
            for (var z = sz(T2.y + 30); z <= sz(T2.y + T2.h - 40); z += 0.62) {
                var dentroMorro = MORROS.some(function (m) {
                    return Math.abs(z - m.c[1]) < m.r[1] * 1.1;
                });
                if (!dentroMorro) {
                    g.add(fileiraOndulada(null, matLinha, sx(T2.x + 20), sx(T2.x + T2.w - 20), z, 0.2, 0.22, 1.7, 1));
                }
            }
            if (ano === 3) {
                var tufos = [];
                var r2 = rng(223);
                for (var i = 0; i < 130; i++) {
                    tufos.push({ p: [sx(T2.x + 8 + r2() * (T2.w - 16)), 0.2, sz(T2.y + 8 + r2() * (T2.h - 16))] });
                }
                g.add(instancias(GEO.tufo, MAT.tufo, tufos));
            }
            g.add(instancias(GEO.palha, MAT.branco, palhadaItens(T2, ano === 2 ? 200 : 380, 22 + ano)));
        }
        return g;
    }

    /* ---------- Talhão 3: manejo avançado ---------- */
    function talhao3(ano) {
        var g = new THREE.Group();
        var base = caixa(T3.w / ESC, 0.14, T3.h / ESC, lam(0x4e9455));
        base.position.set(sx(T3.x + T3.w / 2), 0.07, sz(T3.y + T3.h / 2));
        g.add(base);

        var r2 = rng(33 + ano);

        /* braquiária densa */
        var tufos = [];
        for (var i = 0; i < 170; i++) {
            tufos.push({
                p: [sx(T3.x + 8 + r2() * (T3.w - 16)), 0.2, sz(T3.y + 8 + r2() * (T3.h - 16))],
                r: [0, r2() * Math.PI, 0]
            });
        }
        g.add(instancias(GEO.tufo, MAT.tufo, tufos));

        /* faixas em contorno pelo talhão todo */
        var matFaixa = lam(0x57b05c);
        for (var z = sz(T3.y + 36); z <= sz(T3.y + T3.h - 40); z += 0.72) {
            g.add(fileiraOndulada(null, matFaixa, sx(T3.x + 16), sx(T3.x + T3.w - 16), z, 0.22, 0.2, 2.2, 1));
        }

        if (ano === 1) {
            /* crotalária ochroleuca em flor */
            var flores = [];
            for (var f = 0; f < 70; f++) {
                flores.push({ p: [sx(T3.x + 10 + r2() * (T3.w - 20)), 0.32, sz(T3.y + 12 + r2() * (T3.h - 24))] });
            }
            g.add(instancias(GEO.flor, lam(0xe9c937), flores));
        } else if (ano === 2) {
            var matTrigo = lam(0xd9b64e);
            for (var zt = sz(T3.y + 50); zt <= sz(T3.y + T3.h - 60); zt += 1.4) {
                g.add(fileiraOndulada(null, matTrigo, sx(T3.x + 16), sx(T3.x + T3.w - 16), zt, 0.24, 0.18, 2.2, 1));
            }
            var milheto = [];
            for (var m2 = 0; m2 < 60; m2++) {
                milheto.push({ p: [sx(T3.x + 8 + r2() * (T3.w - 16)), 0.34, sz(T3.y + 10 + r2() * (T3.h - 20))] });
            }
            g.add(instancias(GEO.haste, lam(0xc7d17e), milheto));
        } else {
            var milho = [];
            for (var mz = 0; mz < 46; mz++) {
                milho.push({
                    p: [sx(T3.x + 10 + r2() * (T3.w - 20)), 0.42, sz(T3.y + 12 + r2() * (T3.h - 24))],
                    s: [1, 1.7, 1]
                });
            }
            g.add(instancias(GEO.haste, lam(0x6a9a3a), milho));
            var espigas = [];
            for (var ep = 0; ep < 46; ep++) {
                espigas.push({ p: [sx(T3.x + 10 + r2() * (T3.w - 20)), 0.66, sz(T3.y + 12 + r2() * (T3.h - 24))] });
            }
            g.add(instancias(GEO.flor, lam(0xe6c84a), espigas));
        }
        g.add(instancias(GEO.palha, MAT.branco, palhadaItens(T3, ano === 1 ? 120 : 200, 33 + ano)));
        return g;
    }

    /* ---------- vida na cena (por ano) ---------- */
    function montarVida(ano) {
        disposeGrupo(gVida);
        borboletas = []; abelhas = [];
        if (ano >= 2) {
            var cores = [0xf2b134, 0xe8788a, 0x7ec6e8, 0xf2b134];
            var geoAsa = new THREE.PlaneGeometry(0.11, 0.09);
            for (var b = 0; b < 4; b++) {
                var g = new THREE.Group();
                var matA = new THREE.MeshLambertMaterial({ color: cores[b], side: THREE.DoubleSide });
                var a1 = new THREE.Mesh(geoAsa, matA);
                var a2 = new THREE.Mesh(geoAsa, matA);
                a1.position.x = 0.055; a2.position.x = -0.055;
                var asa1 = new THREE.Group(); asa1.add(a1);
                var asa2 = new THREE.Group(); asa2.add(a2);
                g.add(asa1); g.add(asa2);
                var corpo = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.09), lam(0x3a2a1a));
                g.add(corpo);
                g.userData = { asa1: asa1, asa2: asa2, fase: b * 1.7, cx: 6.4 + b * 0.35, cz: 3.4 + b * 0.5 };
                borboletas.push(g);
                gVida.add(g);
            }
        }
        if (ano === 3) {
            var geoAb = new THREE.SphereGeometry(0.045, 6, 5);
            for (var ab = 0; ab < 4; ab++) {
                var z = new THREE.Mesh(geoAb, lam(0xf4c430));
                z.userData = { fase: ab * 2.1, cx: 6.8 + ab * 0.3, cz: 4.0 + ab * 0.4 };
                abelhas.push(z);
                gVida.add(z);
            }
        }
    }

    function montarAno(ano) {
        disposeGrupo(gAno);
        gAno.add(talhao1(ano));
        gAno.add(talhao2(ano));
        gAno.add(talhao3(ano));
        montarVida(ano);
    }

    /* ---------- elementos fixos ---------- */
    function estaticos() {
        /* plataforma de terra + moldura de madeira */
        var terra = caixa(28, 1, 19, lam(0x8fbf6f));
        terra.position.y = -0.5;
        gEstatico.add(terra);
        var madeira = lam(0x6b4a2b);
        var madeiraClara = lam(0x7d5a38);
        [[29.6, 1.3, 0.9, 0, 9.75], [29.6, 1.3, 0.9, 0, -9.75], [0.9, 1.3, 18.6, 14.3, 0], [0.9, 1.3, 18.6, -14.3, 0]].forEach(function (p, i) {
            var t = caixa(p[0], p[1], p[2], i % 2 ? madeira : madeiraClara);
            t.position.set(p[3], -0.1, p[4]);
            gEstatico.add(t);
            var topinho = caixa(p[0] * 0.97, 0.1, p[2] * 0.8, lam(0x8a5f39));
            topinho.position.set(p[3], 0.58, p[4]);
            gEstatico.add(topinho);
        });

        /* colinas ao fundo */
        [[-9, -8.4, 4.4, 1.5, 0xaac98f], [-1, -8.6, 3.2, 1.1, 0x9dbb84], [7, -8.5, 3.8, 1.3, 0xa4c290], [12, -8.3, 2.6, 0.9, 0xb3cba0]].forEach(function (h) {
            var d = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), lam(h[4]));
            d.scale.set(h[2], h[3], 1.6);
            d.position.set(h[0], -0.05, h[1]);
            d.castShadow = true; d.receiveShadow = true;
            gEstatico.add(d);
        });

        /* estradas de terra */
        var matEstrada = lam(0xd9c9a3);
        var roadV1 = caixa(0.8, 0.04, 16.2, matEstrada);
        roadV1.position.set(sx(470), 0.02, 0);
        gEstatico.add(roadV1);
        var roadV2 = caixa(0.8, 0.04, 16.2, matEstrada);
        roadV2.position.set(sx(830), 0.02, 0);
        gEstatico.add(roadV2);
        var frontal = caixa(26, 0.04, 0.96, matEstrada);
        frontal.position.set(0, 0.02, sz(792));
        gEstatico.add(frontal);

        /* rios: esquerdo (degradado, barrento) e direito (preservado) */
        gEstatico.add(rio(
            [[62, 0], [95, 140], [45, 260], [78, 380], [108, 500], [52, 600], [84, 700], [80, 820]],
            0x8a7448, 0xb99a6a, 0.55));
        gEstatico.add(rio(
            [[1198, 0], [1172, 150], [1218, 300], [1188, 430], [1162, 550], [1206, 650], [1180, 760], [1182, 820]],
            0x3d9bd6, 0x6f8f5c, 0.5));

        /* APP degradada (esquerda): solo exposto, poucas árvores, tocos */
        var soloExp = caixa(3.3, 0.07, 16.4, lam(0xc9ab7c));
        soloExp.position.set(-10.75, 0.035, 0);
        gEstatico.add(soloExp);
        [[128, 470, 0.6], [104, 560, 0.5], [142, 370, 0.55]].forEach(function (a) {
            var arv = arvore([0x5d7a44, 0x6e8f52, 0x7fa05f], a[2]);
            arv.position.set(sx(a[0]), 0, sz(a[1]));
            gEstatico.add(arv);
        });
        var geoToco = new THREE.CylinderGeometry(0.07, 0.09, 0.16, 6);
        [[138, 305], [146, 668], [60, 520]].forEach(function (t) {
            var toco = new THREE.Mesh(geoToco, lam(0x7c4a28));
            toco.position.set(sx(t[0]), 0.1, sz(t[1]));
            toco.castShadow = true;
            gEstatico.add(toco);
        });

        /* APP preservada (direita): faixa densa entre o talhão 3 e o rio */
        var faixa = caixa(2.1, 0.08, 16.4, lam(0x3e7d46));
        faixa.position.set(9.85, 0.04, 0);
        gEstatico.add(faixa);
        gEstatico.add(floresta({ x: 1070, y: 245, w: 90, h: 520 }, 24,
            [[0x2a6e34, 0x38853f, 0x4c9a4e], [0x1f5c2a, 0x2e7a3a, 0x3f9448]], 4242, 0.75, 1.35));

        /* Reserva Legal (fundo, direita) */
        var rl = caixa(7.1, 0.1, 2.9, lam(0x2e6b35));
        rl.position.set(8.75, 0.05, -4.15);
        gEstatico.add(rl);
        gEstatico.add(floresta({ x: 880, y: 130, w: 355, h: 145 }, 30,
            [[0x1f5c2a, 0x2e7a3a, 0x3f9448], [0x266b30, 0x357f3c, 0x4a9c50]], 777, 0.9, 1.6));

        /* sede da fazenda */
        var sede = new THREE.Group();
        var casa = caixa(1.0, 0.5, 0.62, lam(0xf3e3c3));
        casa.position.y = 0.25; sede.add(casa);
        var telhado = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.36, 4), lam(0xb3402e));
        telhado.rotation.y = Math.PI / 4;
        telhado.position.y = 0.68;
        telhado.castShadow = true;
        sede.add(telhado);
        var porta = caixa(0.18, 0.28, 0.03, lam(0x8a5a33));
        porta.position.set(0, 0.14, 0.33); sede.add(porta);
        var janela = caixa(0.2, 0.16, 0.03, brilho(0xffe9a8));
        janela.position.set(-0.28, 0.32, 0.32); sede.add(janela);
        var silo = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 12), lam(0xd7dee2));
        silo.position.set(0.62, 0.35, 0); silo.castShadow = true; sede.add(silo);
        var tampa = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 12), lam(0x9aa7ad));
        tampa.position.set(0.62, 0.78, 0); tampa.castShadow = true; sede.add(tampa);
        sede.position.set(sx(631), 0, sz(195));
        gEstatico.add(sede);
        [[588, 212, 1.05], [700, 214, 0.9]].forEach(function (a) {
            var arv = arvore([0x2f7a3a, 0x3c9448, 0x56ad57], a[2]);
            arv.position.set(sx(a[0]), 0, sz(a[1]));
            gEstatico.add(arv);
        });

        /* pasto com cerca e vacas (integração lavoura-pecuária) */
        var pasto = caixa(2.7, 0.07, 1.5, lam(0x8fc46b));
        pasto.position.set(3.3, 0.035, -4.5);
        gEstatico.add(pasto);
        var cerca = new THREE.Group();
        for (var px = 2.05; px <= 4.61; px += 0.32) {
            [[px, -5.2], [px, -3.85]].forEach(function (p) {
                var poste = caixa(0.045, 0.24, 0.045, lam(0x8a5a33));
                poste.position.set(p[0], 0.14, p[1]);
                cerca.add(poste);
            });
        }
        [[-5.2], [-3.85]].forEach(function (zz) {
            var trilho = caixa(2.6, 0.04, 0.05, lam(0x9a6a3f));
            trilho.position.set(3.32, 0.2, zz[0]);
            cerca.add(trilho);
        });
        gEstatico.add(cerca);
        [[755, 196, 1], [798, 183, 0.85], [830, 197, 0.9]].forEach(function (v, i) {
            var vacaG = vaca(v[2]);
            vacaG.position.set(sx(v[0]), 0, sz(v[1]));
            vacaG.rotation.y = (i % 2) * 0.5 - 0.25;
            vacaG.userData.fase = i * 1.3;
            vacas.push(vacaG);
            gEstatico.add(vacaG);
        });

        /* tratores */
        var t1 = trator();
        t1.position.set(1.4, 0, sz(792));
        t1.rotation.y = Math.PI / 2;
        t1.scale.setScalar(1.15);
        gEstatico.add(t1);
        var t2 = trator();
        t2.position.set(sx(470), 0, 3.4);
        t2.rotation.y = Math.PI / 2 + 0.2;
        gEstatico.add(t2);

        montarDrone();
        montarNuvens();
    }

    /* ---------- animação ---------- */
    function animar() {
        requestAnimationFrame(animar);
        var dt = Math.min(relogio.getDelta(), 0.05);
        tGlobal += dt;

        controls.update();

        /* drone: voo suave sobre o talhão 2 */
        if (drone) {
            drone.position.x = 0.6 + Math.sin(tGlobal * 0.4) * 2.3;
            drone.position.z = 1.9 + Math.cos(tGlobal * 0.55) * 1.9;
            drone.position.y = 3.1 + Math.sin(tGlobal * 1.3) * 0.25;
            drone.rotation.z = -Math.cos(tGlobal * 0.4) * 0.07;
            drone.rotation.y = Math.sin(tGlobal * 0.55) * 0.4;
            for (var h = 0; h < helices.length; h++) helices[h].rotation.y += dt * 40;
        }

        vacas.forEach(function (v) {
            v.position.y = Math.abs(Math.sin(tGlobal * 1.1 + v.userData.fase)) * 0.015;
        });

        nuvens.forEach(function (n) {
            n.position.x += n.userData.vel * dt;
            if (n.position.x > 22) n.position.x = -22;
        });

        borboletas.forEach(function (b) {
            var f = tGlobal * 0.8 + b.userData.fase;
            b.position.set(b.userData.cx + Math.sin(f) * 0.7, 0.55 + Math.sin(f * 2.3) * 0.22, b.userData.cz + Math.cos(f * 0.8) * 0.6);
            var flap = Math.sin(tGlobal * 14 + b.userData.fase) * 0.9;
            b.userData.asa1.rotation.z = 0.35 + flap;
            b.userData.asa2.rotation.z = -0.35 - flap;
        });

        abelhas.forEach(function (a) {
            var f = tGlobal * 1.6 + a.userData.fase;
            a.position.set(a.userData.cx + Math.sin(f) * 0.35, 0.45 + Math.sin(f * 3) * 0.12, a.userData.cz + Math.cos(f * 1.3) * 0.3);
        });

        renderer.render(scene, camera);
        atualizarMarcadores();
    }

    function atualizarMarcadores() {
        if (!opts.aoMarcar) return;
        var w = container.clientWidth, h = container.clientHeight;
        var dados = {};
        Object.keys(POS).forEach(function (id) {
            var p = POS[id].segue && drone ? drone.position.clone().add(new THREE.Vector3(0, 0.35, 0)) : posFixas[id];
            var v = p.clone().project(camera);
            dados[id] = { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visivel: v.z < 1 };
        });
        opts.aoMarcar(dados);
    }

    function aoRedimensionar() {
        var w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    /* ---------- API ---------- */
    function init(config) {
        opts = config || {};
        container = opts.container;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true });
        } catch (e) {
            return false;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        scene = new THREE.Scene();
        scene.background = ceuTextura();

        camera = new THREE.PerspectiveCamera(42, 1.5, 0.1, 300);
        camera.position.set(3.5, 13, 16);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0.6);
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;
        controls.enablePan = false;
        controls.minDistance = 7;
        controls.maxDistance = 30;
        controls.minPolarAngle = 0.22;
        controls.maxPolarAngle = 1.28;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.55;
        renderer.domElement.addEventListener("pointerdown", function () { controls.autoRotate = false; });

        gEstatico = new THREE.Group();
        gAno = new THREE.Group();
        gVida = new THREE.Group();
        scene.add(gEstatico); scene.add(gAno); scene.add(gVida);

        Object.keys(POS).forEach(function (id) {
            if (!POS[id].segue) posFixas[id] = new THREE.Vector3(sx(POS[id].x), POS[id].h, sz(POS[id].y));
        });

        luzes();
        estaticos();
        montarAno(opts.ano || 1);

        container.appendChild(renderer.domElement);
        aoRedimensionar();
        window.addEventListener("resize", aoRedimensionar);

        relogio = new THREE.Clock();
        animar();
        return true;
    }

    return {
        init: init,
        trocarAno: montarAno,
        info: function () {
            return {
                estaticos: gEstatico.children.length,
                ano: gAno.children.length,
                vida: gVida.children.length,
                marcadores: Object.keys(POS).length
            };
        }
    };
})();