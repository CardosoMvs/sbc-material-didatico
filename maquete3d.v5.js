/* ============================================================
   maquete3d.v5.js — Diorama Three.js da Maquete da Fazenda (SBC)
   Requer three.min.js e OrbitControls.js (builds globais r128).

   Desenho 3D-nativo: uma ilha de fazenda com corte de terra em
   camadas, terreno esculpido (morros, calhas de rio), cores por
   vértice no solo, plantio seguindo curvas de nível reais e
   iluminação de sol com sombras suaves.

   Versão refinada: malha de terreno densa, relevo acentuado,
   vegetação com troncos/copas irregulares e suaves, culturas e
   palhada volumétricas com formas arredondadas, margens de rio com
   pedras e areia, placas 3D do briefing, céu gradiente e névoa de
   profundidade.

   Foco desta versão: culturas mais fiéis ao briefing — palhada
   progressiva no Talhão 1, plantio em contorno e consórcios variados
   nos Talhões 2 e 3, com maior detalhe e cores distintas.

   API:
     Maquete3D.init({ container, ano, aoMarcar })  → true/false
     Maquete3D.trocarAno(1|2|3)
     Maquete3D.info() → contagens para depuração
   aoMarcar(dados) recebe por quadro: { id: { x, y, visivel } }
   ============================================================ */
var Maquete3D = (function () {
    "use strict";

    /* ====================== dimensões do mundo ====================== */
    var ILHA_W = 40, ILHA_D = 26;              // extensão x e z da ilha

    /* rios: polilinhas que serpenteiam e escavam o terreno */
    var RIO_ESQ_PTS = [[-17.2, -11.8], [-15.5, -7], [-17, -1], [-14.5, 4], [-16, 8.5], [-15, 11.8]];
    var RIO_DIR_PTS = [[18.4, -6.5], [17, -1.5], [18.3, 3.5], [16.8, 8], [17.6, 12.2]];

    /* caminhos de terra (polilinhas) */
    var CAMINHOS = [
        [[-1.2, 12.3], [1.5, 9], [-0.6, 4], [0.8, 0], [0, -4], [0.4, -8.6]],
        [[-4.6, 12.3], [-4.2, 6], [-4.8, 0], [-4.4, -5]],
        [[4.9, 12.3], [4.5, 6], [5.1, 0], [4.7, -5]]
    ];

    /* talhões (retângulos em x/z) */
    var T1 = { x0: -13, x1: -4.8, z0: -5.2, z1: 9.4 };
    var T2 = { x0: -4.0, x1: 4.4, z0: -5.2, z1: 9.4 };
    var T3 = { x0: 5.4, x1: 12.2, z0: -5.2, z1: 9.4 };
    var PASTO = { x0: 8.4, x1: 12.4, z0: -7.4, z1: -5.4 };
    var RL = { x0: 6.5, z0: -13, x1: 20, z1: -8 };
    var SEDE = { x: 0.6, z: -9.6 };

    /* morros do Talhão 2: suaves ondulações, não picos altos */
    var MORROS = [
        { cx: 0.2, cz: 0.8, a: 1.35, sx: 4.6, sz: 3.6 },
        { cx: 2.2, cz: 4.2, a: 0.85, sx: 3.4, sz: 2.8 }
    ];

    /* vala de drenagem */
    var VALE_PTS = [[-3.4, 3.4], [-7, 3.6], [-10.5, 4.2], [-13.8, 4.8]];

    /* lagoa do gado */
    var LAGOA = { x: 6.3, z: -6.9, p: 1.3, s: 0.85 };

    var NIVEL_AGUA = -0.45;

    /* ====================== utilidades ====================== */
    function rng(seed) {
        return function () {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };
    }
    function ruido(x, z) {
        var s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
        return s - Math.floor(s);
    }
    function vRuido(x, z) {
        var xi = Math.floor(x), zi = Math.floor(z);
        var xf = x - xi, zf = z - zi;
        var u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
        var a = ruido(xi, zi), b = ruido(xi + 1, zi);
        var c = ruido(xi, zi + 1), d = ruido(xi + 1, zi + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function noRect(r, x, z) { return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; }
    function dentro(p, margem, x, z) {
        return x >= p[0] - margem && x <= p[0] + margem && z >= p[1] - margem && z <= p[1] + margem;
    }

    var renderer, scene, camera, controls, container, opts;
    var gCena, gAno, gVida;
    var terreno;
    var rioCurvaEsq, rioCurvaDir;
    var rioAmoEsq = [], rioAmoDir = [], caminhoAmo = [], valeAmo = [];
    var ravinasT2Ano1 = [];
    var drone, rotores = [], vacas = [], aves = [], borboletas = [], abelhas = [], nuvens = [];
    var espuma = [];
    var aguaMatEsq = null, espumaMatEsq = null;
    var aguas = [];
    var tGlobal = 0, relogio;
    var posFixas = {};
    var MAT = {};

    function mat(cor, transparente) {
        var chave = (transparente ? "t" : "") + cor;
        if (!MAT[chave]) {
            MAT[chave] = new THREE.MeshLambertMaterial({ color: cor, transparent: !!transparente, opacity: transparente || 1 });
        }
        return MAT[chave];
    }
    function matStandard(cor) {
        var chave = "s" + cor;
        if (!MAT[chave]) MAT[chave] = new THREE.MeshStandardMaterial({ color: cor, roughness: 1, metalness: 0 });
        return MAT[chave];
    }
    function matPlano(cor) {
        var chave = "p" + cor;
        if (!MAT[chave]) MAT[chave] = new THREE.MeshLambertMaterial({ color: cor, side: THREE.DoubleSide });
        return MAT[chave];
    }

    /* carregamento assíncrono de modelos GLB */
    var gltfLoader = null;
    var cacheGLB = {};
    function carregarGLB(url, cb) {
        if (cacheGLB[url]) { cb(cacheGLB[url]); return; }
        if (!gltfLoader) {
            if (typeof THREE.GLTFLoader === "undefined") {
                console.error("GLTFLoader não encontrado. Verifique se modelos/GLTFLoader.js foi carregado.");
                return;
            }
            gltfLoader = new THREE.GLTFLoader();
        }
        gltfLoader.load(url, function (gltf) {
            cacheGLB[url] = gltf;
            cb(gltf);
        }, undefined, function (err) {
            console.error("Erro ao carregar " + url + ":", err);
        });
    }

    /* coloca um modelo GLB na cena ajustando escala e apoiando no terreno */
    function colocarModelo(url, x, z, escalaAlvo, rot, extras, preRot) {
        carregarGLB(url, function (gltf) {
            var obj = gltf.scene.clone();
            if (preRot) obj.rotation.set(preRot[0], preRot[1], preRot[2]);
            var box = new THREE.Box3().setFromObject(obj);
            var size = new THREE.Vector3();
            box.getSize(size);
            console.log(url.replace('modelos/', ''), 'raw size:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2));
            var escala = escalaAlvo / Math.max(size.x, size.y, size.z);
            obj.scale.setScalar(escala);
            obj.rotation.y += rot || 0;
            box.setFromObject(obj);
            obj.position.set(x, altura(x, z) - box.min.y, z);
            obj.traverse(function (o) {
                if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
            });
            if (extras) extras(obj, size, escala);
            gCena.add(obj);
        });
    }

    /* perturba vértices de uma geometria com noise para deixar orgânica */
    function perturbarGeo(geo, amp, seed) {
        var r2 = rng(seed || 1);
        var pos = geo.attributes.position;
        for (var i = 0; i < pos.count; i++) {
            var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            var n = (r2() - 0.5) * amp;
            pos.setXYZ(i, x + n, y + n * 0.7, z + n);
        }
        geo.computeVertexNormals();
        return geo;
    }

    /* ====================== geometria dos rios ====================== */
    function curvaDe(pontos) {
        return new THREE.CatmullRomCurve3(pontos.map(function (p) {
            return new THREE.Vector3(p[0], 0, p[1]);
        }));
    }
    function amostrar(curva, n) {
        var pts = curva.getPoints(n), saida = [];
        for (var i = 0; i < pts.length; i++) saida.push([pts[i].x, pts[i].z]);
        return saida;
    }
    function distAte(amostras, x, z) {
        var m = 1e9;
        for (var i = 0; i < amostras.length; i++) {
            var dx = amostras[i][0] - x, dz = amostras[i][1] - z;
            var d = dx * dx + dz * dz;
            if (d < m) m = d;
        }
        return Math.sqrt(m);
    }

    /* ====================== relevo ====================== */
    function altura(x, z) {
        var y = (vRuido(x * 0.16 + 5, z * 0.16 + 9) - 0.5) * 0.62
              + (vRuido(x * 0.42 + 2, z * 0.42 + 7) - 0.5) * 0.26
              + (ruido(x * 1.6, z * 1.6) - 0.5) * 0.06
              + (ruido(x * 4.3 + 1, z * 4.3 + 3) - 0.5) * 0.025; // micro-relevo
        for (var i = 0; i < MORROS.length; i++) {
            var m = MORROS[i];
            var dx = x - m.cx, dz = z - m.cz;
            y += m.a * Math.exp(-(dx * dx / (2 * m.sx * m.sx) + dz * dz / (2 * m.sz * m.sz)));
        }
        var rx = x - 12.5, rz = z + 10.5;
        y += 0.55 * Math.exp(-(rx * rx + rz * rz) / (2 * 5.5 * 5.5));
        var dv = distAte(valeAmo, x, z);
        y -= 0.5 * Math.exp(-(dv * dv) / (2 * 1.15 * 1.15));
        var lx = x - LAGOA.x, lz = z - LAGOA.z;
        y -= LAGOA.p * Math.exp(-(lx * lx + lz * lz) / (2 * LAGOA.s * LAGOA.s));
        var d = Math.min(distAte(rioAmoEsq, x, z), distAte(rioAmoDir, x, z));
        y -= 1.35 * Math.exp(-(d * d) / (2 * 0.95 * 0.95));
        return y;
    }

    /* ====================== cores do solo por ano ====================== */
    /* Talhão 1: solo exposto → coberto por palhada (torna-se mais claro/acinzentado) */
    var COR_T1 = [0x9a7455, 0xa88d68, 0xbba47a];
    /* Talhão 2: erosão → trigo/aveia → soja+milho+braquiária */
    var COR_T2 = [0xa87a55, 0x7aa86a, 0x56a05a];
    var COR_T3 = 0x4f9455;
    var COR_LEITO_ESQ = [0x5a7a62, 0x5c8a6a, 0x5f9f7e];
    var COR_RIO_ESQ = [0x9c9b6a, 0x8fb080, 0x74b287];
    var COR_RIO_DIR = 0x5ab4e8;

    function corSolo(x, z, ano, h) {
        var dE = distAte(rioAmoEsq, x, z), dD = distAte(rioAmoDir, x, z);
        var lx = x - LAGOA.x, lz = z - LAGOA.z;
        var naAgua = h < NIVEL_AGUA - 0.03 || (lx * lx + lz * lz) < 2.2 && h < NIVEL_AGUA;
        var c = 0x79ab5e;
        var k, dC;
        // leito do rio: só aparece se a margem estiver acima da água
        if (dE < 1.35) c = naAgua ? COR_RIO_ESQ[ano - 1] : COR_LEITO_ESQ[ano - 1];
        else if (dE < 2.8) c = 0x8fa878;
        if (dD < 1.35) c = naAgua ? COR_RIO_DIR : 0x6a9a8a;
        else if (dD < 2.8 && c === 0x79ab5e) c = 0x4e9a6a;
        for (k = 0; k < CAMINHOS.length; k++) {
            dC = distAte(caminhoAmo[k], x, z);
            if (dC < 0.9) c = 0xbfab85;
        }
        if (noRect(T1, x, z)) c = COR_T1[ano - 1];
        else if (noRect(T2, x, z)) c = COR_T2[ano - 1];
        else if (noRect(T3, x, z)) c = COR_T3;
        else if (x >= RL.x0 && z <= RL.z1 && z >= RL.z0) c = 0x2e6b35;
        else if (noRect(PASTO, x, z)) c = 0x7fb45e;
        else if (dentro([SEDE.x, SEDE.z], 2.6, x, z)) c = 0x9cb56f;
        return c;
    }

    function pintarTerreno(ano) {
        var pos = terreno.geometry.attributes.position;
        var cores = terreno.geometry.attributes.color;
        var c = new THREE.Color(), _cAgua = new THREE.Color();
        for (var i = 0; i < pos.count; i++) {
            var x = pos.getX(i), z = pos.getZ(i);
            var h = pos.getY(i);
            c.setHex(corSolo(x, z, ano, h));
            if (h < NIVEL_AGUA + 0.06) {
                var dE = distAte(rioAmoEsq, x, z), dD = distAte(rioAmoDir, x, z);
                var lx = x - LAGOA.x, lz = z - LAGOA.z;
                var dentroRio = dE < 3.2 || dD < 3.2 || (lx * lx + lz * lz) < 5.0;
                if (dentroRio) {
                    if (h < NIVEL_AGUA - 0.015) {
                        var prof = Math.min(1, (NIVEL_AGUA - h) / 1.0);
                        var corAgua = (lx * lx + lz * lz) < 5.0 ? 0x4b9ecb :
                            (dE <= dD ? COR_RIO_ESQ[ano - 1] : COR_RIO_DIR);
                        c.lerp(_cAgua.setHex(corAgua), 0.55 + prof * 0.25);
                        c.offsetHSL(0, 0, -prof * 0.05);
                    } else {
                        // faixa de margem molhada com tom verde-acinzentado, não marrom
                        c.lerp(_cAgua.setHex(0x7fa080), 0.42);
                    }
                }
            }
            var n1 = ruido(x * 0.9 + 11, z * 0.8 + 7);
            var n2 = ruido(x * 3.1, z * 2.7);
            c.offsetHSL((n1 - 0.5) * 0.03, (n1 - 0.5) * 0.06,
                (n1 - 0.5) * 0.07 + (n2 - 0.5) * 0.05);
            cores.setXYZ(i, c.r, c.g, c.b);
        }
        cores.needsUpdate = true;
    }

    /* ====================== instâncias ====================== */
    var _mtx = new THREE.Matrix4(), _q = new THREE.Quaternion();
    var _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
    var _col = new THREE.Color();

    function instanciar(geo, cor, itens, sombra) {
        if (!itens.length) return null;
        var m = new THREE.InstancedMesh(geo, typeof cor === "number" ? mat(cor) : cor, itens.length);
        for (var i = 0; i < itens.length; i++) {
            var it = itens[i];
            _e.set(it.r ? it.r[0] : 0, it.r ? it.r[1] : 0, it.r ? it.r[2] : 0);
            _q.setFromEuler(_e);
            var sc = it.s || [1, 1, 1];
            _v.set(it.p[0], it.p[1], it.p[2]);
            _s.set(sc[0], sc[1], sc[2]);
            _mtx.compose(_v, _q, _s);
            m.setMatrixAt(i, _mtx);
        }
        m.instanceMatrix.needsUpdate = true;
        m.castShadow = sombra !== false;
        m.receiveShadow = true;
        return m;
    }

    function disposeGrupo(g) {
        g.traverse(function (o) {
            if (o.geometry && !o.geometry.userData.compartilhada) o.geometry.dispose();
        });
        while (g.children.length) g.remove(g.children[0]);
    }

    /* geometrias refinadas de cultivo, palhada e natureza */
    var GE = null;
    function geos() {
        if (GE) return GE;
        GE = {
            tufo: perturbarGeo(new THREE.SphereGeometry(0.15, 7, 6), 0.04, 41),
            capim: perturbarGeo(new THREE.ConeGeometry(0.09, 0.34, 7), 0.03, 42),
            capimAlto: perturbarGeo(new THREE.ConeGeometry(0.10, 0.62, 8), 0.035, 421),
            palha: perturbarGeo(new THREE.CylinderGeometry(0.018, 0.022, 0.46, 7), 0.02, 43),
            palhaCurta: perturbarGeo(new THREE.CylinderGeometry(0.015, 0.018, 0.28, 7), 0.02, 44),
            palhaDeitada: perturbarGeo(new THREE.CylinderGeometry(0.014, 0.018, 0.62, 7), 0.025, 431),
            flor: perturbarGeo(new THREE.SphereGeometry(0.055, 7, 6), 0.02, 45),
            crotalaria: perturbarGeo(new THREE.SphereGeometry(0.09, 8, 7), 0.025, 451),
            haste: new THREE.CylinderGeometry(0.018, 0.028, 0.58, 7),
            folhaTrigo: perturbarGeo(new THREE.CylinderGeometry(0.012, 0.018, 0.72, 7), 0.02, 452),
            espiga: perturbarGeo(new THREE.CylinderGeometry(0.045, 0.025, 0.18, 8), 0.015, 453),
            tronco: new THREE.CylinderGeometry(0.09, 0.14, 1.0, 10),
            copa: perturbarGeo(new THREE.SphereGeometry(0.72, 11, 9), 0.09, 46),
            pedra: perturbarGeo(new THREE.SphereGeometry(0.18, 8, 6), 0.12, 47),
            poste: new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6),
            arvoreSeca: new THREE.CylinderGeometry(0.05, 0.09, 1.0, 8)
        };
        Object.keys(GE).forEach(function (k) { GE[k].userData.compartilhada = true; });
        return GE;
    }

    /* ====================== plantio ====================== */
    function fileirasZ(r, passoR, passoT, alturaT, escalaY) {
        var itens = [];
        for (var x = r.x0 + 0.4; x <= r.x1 - 0.4; x += passoR) {
            for (var z = r.z0 + 0.4; z <= r.z1 - 0.4; z += passoT) {
                itens.push({ p: [x, altura(x, z) + alturaT, z], s: [1, escalaY || 1, 1] });
            }
        }
        return itens;
    }

    function fileirasX(r, passoR, passoT, alturaT, onda) {
        var itens = [];
        for (var z = r.z0 + 0.4; z <= r.z1 - 0.4; z += passoR) {
            for (var x = r.x0 + 0.4; x <= r.x1 - 0.4; x += passoT) {
                var zz = z + Math.sin(x * 0.5 + z) * (onda || 0.3);
                itens.push({ p: [x, altura(x, zz) + alturaT, zz] });
            }
        }
        return itens;
    }

    function aneisContorno(m, rMax) {
        var itens = [];
        var kx = m.sx / 2.2, kz = m.sz / 2.2;
        for (var raio = 0.6; raio <= rMax; raio += 0.5) {
            for (var a = 0; a < Math.PI * 2; a += 0.24) {
                var x = m.cx + Math.cos(a) * raio * kx;
                var z = m.cz + Math.sin(a) * raio * kz;
                if (!noRect(T2, x, z)) continue;
                itens.push({ p: [x, altura(x, z) + 0.16, z] });
            }
        }
        return itens;
    }

    function espalhar(r, qtd, alturaT, seed, escalaExtra) {
        var r2 = rng(seed), itens = [];
        for (var i = 0; i < qtd; i++) {
            var x = r.x0 + r2() * (r.x1 - r.x0);
            var z = r.z0 + r2() * (r.z1 - r.z0);
            var rot = [(r2() - 0.5) * 0.4, r2() * Math.PI, (r2() - 0.5) * 0.4];
            var sx = 1 + (r2() - 0.5) * 0.4;
            var sz = escalaExtra ? 1 + (r2() - 0.5) * 0.5 : sx;
            itens.push({ p: [x, altura(x, z) + alturaT, z], r: rot, s: [sx, 1, sz] });
        }
        return itens;
    }

    function espalharEmArea(areaFn, qtd, alturaT, seed) {
        var r2 = rng(seed), itens = [];
        var tentativas = 0;
        while (itens.length < qtd && tentativas < qtd * 6) {
            var x = (r2() - 0.5) * ILHA_W * 0.96;
            var z = (r2() - 0.5) * ILHA_D * 0.96;
            if (areaFn(x, z)) {
                itens.push({ p: [x, altura(x, z) + alturaT, z], r: [0, r2() * Math.PI, 0] });
            }
            tentativas++;
        }
        return itens;
    }

    /* palhada deitada no solo: hastes secas espalhadas aleatoriamente */
    function palhada(r, qtd, comprimento, seed, inclinacao) {
        var r2 = rng(seed || 1), itens = [];
        for (var i = 0; i < qtd; i++) {
            var x = r.x0 + r2() * (r.x1 - r.x0);
            var z = r.z0 + r2() * (r.z1 - r.z0);
            var ax = (r2() - 0.5) * (inclinacao || 0.75);
            var az = (r2() - 0.5) * (inclinacao || 0.75);
            var escala = 0.7 + r2() * 0.6;
            var sy = comprimento ? comprimento * (0.8 + r2() * 0.4) : 1;
            itens.push({
                p: [x, altura(x, z) + 0.03, z],
                r: [ax, r2() * Math.PI, az],
                s: [escala, sy, escala]
            });
        }
        return itens;
    }

    /* ====================== talhões por ano ====================== */
    function talhao1(ano) {
        var g = new THREE.Group();
        var sojaItens = [], milhoItens = [], espigasItens = [];
        var nLinhas = 0;
        // fileiras de soja e milho intercaladas (sucessão soja / milho)
        for (var x = T1.x0 + 0.5; x <= T1.x1 - 0.5; x += 0.66, nLinhas++) {
            var ehMilho = nLinhas % 4 === 3;
            for (var z = T1.z0 + 0.4; z <= T1.z1 - 0.4; z += 0.42) {
                if (ehMilho) {
                    var escMilho = 0.85 + ano * 0.12;
                    milhoItens.push({ p: [x, altura(x, z) + 0.28, z], s: [0.85, escMilho, 0.85], r: [(Math.random() - 0.5) * 0.08, Math.random() * Math.PI, 0] });
                    if (ano >= 2 && Math.random() < 0.35) {
                        espigasItens.push({ p: [x, altura(x, z) + 0.48, z], s: [0.9, 0.9, 0.9] });
                    }
                } else {
                    var escSoja = 0.75 + ano * 0.12;
                    sojaItens.push({ p: [x, altura(x, z) + 0.10, z], s: [escSoja, escSoja, escSoja] });
                }
            }
        }
        // cores da soja evoluem de verde-claro para verde mais escuro/saudável
        g.add(instanciar(GE.tufo, [0x8db85c, 0x5fa84c, 0x3a963c][ano - 1], sojaItens));
        // milho mais alto e amarelado
        g.add(instanciar(GE.capimAlto, 0x9ccc65, milhoItens));
        if (espigasItens.length) g.add(instanciar(GE.espiga, 0xe6c84a, espigasItens));

        // palhada progressiva: 0-10% / ~40% / >90% de cobertura
        var densPalha = [160, 520, 1300][ano - 1];
        var comprPalha = [0.65, 0.85, 1.05][ano - 1];
        // palha longa e deitada (maior cobertura visual)
        g.add(instanciar(GE.palhaDeitada, 0xd9c27e, palhada(T1, densPalha, comprPalha, 11 + ano, 0.9), false));
        // palha curta e fina espalhada entre as fileiras
        g.add(instanciar(GE.palhaCurta, 0xcbb26a, palhada(T1, Math.floor(densPalha * 0.6), 0.55, 111 + ano, 1.1), false));

        return g;
    }

    function talhao2(ano) {
        var g = new THREE.Group();
        if (ano === 1) {
            // linhas retas descendo a vertente: plantio convencional que acelera erosão
            var fileirasItens = [];
            for (var x = T2.x0 + 0.4; x <= T2.x1 - 0.4; x += 0.7) {
                for (var z = T2.z0 + 0.4; z <= T2.z1 - 0.4; z += 0.48) {
                    // plantas baixas e amareladas, com solo exposto entre elas
                    fileirasItens.push({ p: [x, altura(x, z) + 0.12, z], s: [0.8, 0.65, 0.8] });
                }
            }
            g.add(instanciar(GE.tufo, 0xb8a85e, fileirasItens));

            // ravina de erosão visível: sulco escuro seguindo a vertente
            function ravinaVisible(m, ladoSinal) {
                var r2 = rng(551 + Math.floor(m.cx * 10) + Math.floor(ladoSinal * 10));
                var N = 24;
                var pts = [];
                for (var t = 0; t <= 1.001; t += 1 / N) {
                    var curvatura = Math.sin(t * Math.PI) * 0.35 * (ladoSinal > 0 ? 1 : -1);
                    var x = m.cx - t * m.sx * 1.15 * ladoSinal + curvatura * 0.18;
                    var z = m.cz + t * m.sz * 1.05;
                    pts.push(new THREE.Vector3(x, altura(x, z) + 0.02, z));
                }
                var curva = new THREE.CatmullRomCurve3(pts);
                // sulco marrom-claro no fundo (menos agressivo visualmente)
                var sulco = new THREE.Mesh(
                    new THREE.TubeGeometry(curva, 24, 0.13, 7),
                    mat(0x8a6a4a));
                sulco.castShadow = true; sulco.receiveShadow = true;
                g.add(sulco);

                // leque de sedimento no pé do morro (levemente menor)
                var fx = m.cx - m.sx * 1.15 * ladoSinal;
                var fz = m.cz + m.sz * 1.05;
                var leque = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.26, 0.78, 0.06, 16),
                    mat(0xc4a47a));
                leque.position.set(fx, altura(fx, fz) + 0.03, fz);
                leque.scale.set(1.45, 1, 1.05);
                leque.receiveShadow = true;
                g.add(leque);

                // faixa de solo exposto ao redor do sulco
                var soloRavina = [];
                var samples = curva.getPoints(N);
                for (var i = 0; i < samples.length; i += 1) {
                    var p = samples[i];
                    var prog = i / samples.length;
                    var larg = 0.25 + prog * 0.35;
                    for (var s = 0; s < 5; s++) {
                        var ang = r2() * Math.PI * 2;
                        var dist = r2() * larg;
                        var sx = p.x + Math.cos(ang) * dist;
                        var sz = p.z + Math.sin(ang) * dist;
                        var esc = 0.9 + r2() * 0.7;
                        soloRavina.push({
                            p: [sx, altura(sx, sz) + 0.02, sz],
                            s: [esc, 0.25, esc]
                        });
                    }
                }
                g.add(instanciar(GE.pedra, 0xb08a6a, soloRavina, true));
            }

            MORROS.forEach(function (m, mi) {
                var n = mi === 0 ? 2 : 1;
                for (var k = 0; k < n; k++) {
                    var lado = k === 0 ? 1 : -0.6;
                    ravinaVisible(m, lado);
                }
            });

            // pouca palhada: 0-10% de cobertura
            g.add(instanciar(GE.palhaDeitada, 0xcbb26a, palhada(T2, 90, 0.55, 221, 0.8), false));
        } else {
            // contorno: fileiras seguem as curvas de nível dos morros
            if (ano === 2) {
                // trigo (dourado) + aveia (verde-claro) em anéis de contorno
                MORROS.forEach(function (m, mi) {
                    var aneis = aneisContorno(m, m.sz * 1.6);
                    var trigo = [], aveia = [];
                    aneis.forEach(function (it, i) {
                        // alterna cores a cada anel
                        if (Math.floor(i / 24) % 2 === 0) trigo.push(it);
                        else aveia.push(it);
                    });
                    g.add(instanciar(GE.folhaTrigo, 0xd9b64e, trigo));
                    g.add(instanciar(GE.folhaTrigo, 0xa8c96a, aveia));
                });
                // fileiras onduladas fora dos morros: trigo + aveia
                var fora = [];
                for (var z = T2.z0 + 0.4; z <= T2.z1 - 0.4; z += 0.8) {
                    for (var x = T2.x0 + 0.4; x <= T2.x1 - 0.4; x += 0.45) {
                        var perto = MORROS.some(function (m2) {
                            var dx = x - m2.cx, dz = z - m2.cz;
                            return (dx * dx / (m2.sx * m2.sx) + dz * dz / (m2.sz * m2.sz)) < 1.8;
                        });
                        if (perto) continue;
                        var zz = z + Math.sin(x * 0.5 + z) * 0.35;
                        fora.push({ p: [x, altura(x, zz) + 0.28, zz], s: [0.85, 0.9 + Math.random() * 0.2, 0.85] });
                    }
                }
                g.add(instanciar(GE.folhaTrigo, 0xcfb058, fora));
                // palhada intermediária (~40%)
                g.add(instanciar(GE.palhaDeitada, 0xd9c27e, palhada(T2, 360, 0.75, 222, 0.9), false));
                g.add(instanciar(GE.palhaCurta, 0xcbb26a, palhada(T2, 220, 0.5, 1222, 1.0), false));
            } else {
                // ano 3: soja + milho + braquiária em contorno
                MORROS.forEach(function (m, mi) {
                    var aneis = aneisContorno(m, m.sz * 1.55);
                    var soja = [], milho = [];
                    aneis.forEach(function (it, i) {
                        // intercala anéis de soja e milho
                        if (Math.floor(i / 20) % 2 === 0) soja.push({ p: it.p, s: [1, 1.1, 1] });
                        else milho.push({ p: it.p, s: [0.85, 1.3, 0.85] });
                    });
                    g.add(instanciar(GE.tufo, 0x4ea24f, soja));
                    g.add(instanciar(GE.capimAlto, 0x6a9a3a, milho));
                });
                // braquiária densa fora dos morros
                var braq = [];
                for (var z2 = T2.z0 + 0.4; z2 <= T2.z1 - 0.4; z2 += 0.55) {
                    for (var x2 = T2.x0 + 0.4; x2 <= T2.x1 - 0.4; x2 += 0.55) {
                        var perto2 = MORROS.some(function (m2) {
                            var dx = x2 - m2.cx, dz = z2 - m2.cz;
                            return (dx * dx / (m2.sx * m2.sx) + dz * dz / (m2.sz * m2.sz)) < 1.6;
                        });
                        if (perto2) continue;
                        braq.push({ p: [x2, altura(x2, z2) + 0.12, z2], s: [0.9, 0.8 + Math.random() * 0.3, 0.9] });
                    }
                }
                g.add(instanciar(GE.capim, 0x3a8f3a, braq));
                // palhada densa (>90%)
                g.add(instanciar(GE.palhaDeitada, 0xd9c27e, palhada(T2, 900, 1.05, 223, 1.0), false));
                g.add(instanciar(GE.palhaCurta, 0xcbb26a, palhada(T2, 500, 0.55, 1223, 1.1), false));
            }
        }
        return g;
    }

    function talhao3(ano) {
        var g = new THREE.Group();

        // base de braquiária densa em todo o talhão
        var baseBraq = [];
        for (var zz = T3.z0 + 0.35; zz <= T3.z1 - 0.35; zz += 0.55) {
            for (var xx = T3.x0 + 0.35; xx <= T3.x1 - 0.35; xx += 0.55) {
                baseBraq.push({ p: [xx, altura(xx, zz) + 0.10, zz], s: [0.85, 0.75 + Math.random() * 0.25, 0.85] });
            }
        }
        g.add(instanciar(GE.capim, 0x358f3c, baseBraq));

        if (ano === 1) {
            // soja em fileiras regulares sobre a braquiária
            var soja = [];
            for (var z1 = T3.z0 + 0.5; z1 <= T3.z1 - 0.5; z1 += 0.8) {
                for (var x1 = T3.x0 + 0.5; x1 <= T3.x1 - 0.5; x1 += 0.45) {
                    soja.push({ p: [x1, altura(x1, z1) + 0.18, z1], s: [0.95, 0.95, 0.95] });
                }
            }
            g.add(instanciar(GE.tufo, 0x5fb44f, soja));
            // crotalária em flor (flores amarelas maiores e mais densas)
            var flores = [];
            for (var i = 0; i < 160; i++) {
                var fx = T3.x0 + Math.random() * (T3.x1 - T3.x0);
                var fz = T3.z0 + Math.random() * (T3.z1 - T3.z0);
                flores.push({ p: [fx, altura(fx, fz) + 0.38, fz], s: [0.9, 0.9, 0.9] });
            }
            g.add(instanciar(GE.crotalaria, 0xf0d040, flores));
            // pouca palhada no primeiro ano de transição
            g.add(instanciar(GE.palhaDeitada, 0xd9c27e, palhada(T3, 200, 0.65, 331, 0.8), false));
        } else if (ano === 2) {
            // soja + milheto + trigo em fileiras intercaladas
            var soja2 = [], milheto = [], trigo2 = [];
            var linha = 0;
            for (var z2 = T3.z0 + 0.5; z2 <= T3.z1 - 0.5; z2 += 0.9) {
                linha++;
                for (var x2 = T3.x0 + 0.5; x2 <= T3.x1 - 0.5; x2 += 0.4) {
                    if (linha % 4 === 1) {
                        trigo2.push({ p: [x2, altura(x2, z2) + 0.32, z2], s: [0.9, 1.05, 0.9] });
                    } else if (linha % 4 === 2) {
                        milheto.push({ p: [x2, altura(x2, z2) + 0.42, z2], s: [0.85, 1.15, 0.85] });
                    } else {
                        soja2.push({ p: [x2, altura(x2, z2) + 0.18, z2], s: [0.95, 0.95, 0.95] });
                    }
                }
            }
            g.add(instanciar(GE.tufo, 0x4ea24f, soja2));
            g.add(instanciar(GE.folhaTrigo, 0xd9b64e, trigo2));
            g.add(instanciar(GE.capimAlto, 0xc7c46a, milheto));
            // palhada intermediária
            g.add(instanciar(GE.palhaDeitada, 0xd9c27e, palhada(T3, 420, 0.85, 332, 0.9), false));
            g.add(instanciar(GE.palhaCurta, 0xcbb26a, palhada(T3, 260, 0.5, 1332, 1.0), false));
        } else {
            // consórcio braquiária-milho: milho em fileiras com braquiária entrelinhas
            var milho3 = [], espigas3 = [];
            for (var z3 = T3.z0 + 0.6; z3 <= T3.z1 - 0.6; z3 += 1.1) {
                for (var x3 = T3.x0 + 0.5; x3 <= T3.x1 - 0.5; x3 += 0.55) {
                    milho3.push({ p: [x3, altura(x3, z3) + 0.30, z3], s: [0.9, 1.25, 0.9] });
                    if (Math.random() < 0.45) {
                        espigas3.push({ p: [x3, altura(x3, z3) + 0.55, z3], s: [1, 1, 1] });
                    }
                }
            }
            g.add(instanciar(GE.capimAlto, 0x6a9a3a, milho3));
            g.add(instanciar(GE.espiga, 0xe6c84a, espigas3));
            // palhada densa característica do sistema avançado
            g.add(instanciar(GE.palhaDeitada, 0xd9c27e, palhada(T3, 800, 1.05, 333, 1.0), false));
            g.add(instanciar(GE.palhaCurta, 0xcbb26a, palhada(T3, 450, 0.55, 1333, 1.1), false));
        }
        return g;
    }

    /* lavoura invadindo a margem da APP degradada */
    function lavouraApp(ano) {
        var itens = [];
        var curva = rioCurvaEsq;
        for (var t = 0.25; t <= 0.85; t += 0.045) {
            var p = curva.getPointAt(t);
            var x = p.x + 2.1, z = p.z;
            for (var zz = z - 1.4; zz <= z + 1.4; zz += 0.55) {
                itens.push({ p: [x, altura(x, zz) + 0.14, zz] });
            }
        }
        return instanciar(GE.tufo, [0x79b25c, 0x4ea24f, 0x2f9e42][ano - 1], itens);
    }

    /* ====================== vida na cena ====================== */
    function montarVida(ano) {
        disposeGrupo(gVida);
        borboletas = []; abelhas = [];
        var geoAsa = new THREE.PlaneGeometry(0.36, 0.28);
        if (ano >= 2) {
            var cores = [0xf2b134, 0xe8788a, 0x7ec6e8, 0xf29134, 0xe8788a];
            for (var b = 0; b < 6; b++) {
                var g = new THREE.Group();
                var mA = new THREE.MeshLambertMaterial({ color: cores[b % cores.length], side: THREE.DoubleSide });
                var a1 = new THREE.Mesh(geoAsa, mA), a2 = new THREE.Mesh(geoAsa, mA);
                a1.position.x = 0.18; a2.position.x = -0.18;
                a1.scale.y = 0.85; a2.scale.y = 0.85;
                var asa1 = new THREE.Group(); asa1.add(a1);
                var asa2 = new THREE.Group(); asa2.add(a2);
                g.add(asa1); g.add(asa2);
                g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.26, 6), mat(0x3a2a1a)));
                g.userData = { asa1: asa1, asa2: asa2, f: b * 1.7, cx: 7.5 + b * 0.6, cz: 2 + b * 0.9, h: 1 + (b % 3) * 0.4 };
                borboletas.push(g);
                gVida.add(g);
            }
        }
        if (ano === 3) {
            // abelhas com listras pretas/amarelas
            var geoAb = new THREE.SphereGeometry(0.06, 7, 6);
            for (var ab = 0; ab < 6; ab++) {
                var z = new THREE.Mesh(geoAb, mat(0xf4c430));
                var listra = new THREE.Mesh(new THREE.SphereGeometry(0.062, 7, 6, 0, Math.PI * 2, 0, 0.6), mat(0x2a2a2a));
                listra.rotation.z = Math.PI / 2;
                z.add(listra);
                z.userData = { f: ab * 2.1, cx: 8.5 + ab * 0.4, cz: 4 + ab * 0.5, h: 0.9 };
                abelhas.push(z);
                gVida.add(z);
            }
        }
    }

    function montarAno(ano) {
        // limpa dados de ravinas do ano anterior para recalcular o terreno
        ravinasT2Ano1 = [];
        disposeGrupo(gAno);
        gAno.add(talhao1(ano));
        gAno.add(talhao2(ano));
        gAno.add(talhao3(ano));
        gAno.add(lavouraApp(ano));
        // recria o terreno para aplicar o corte das ravinas
        if (terreno) {
            gCena.remove(terreno);
            terreno.geometry.dispose();
        }
        montarIlha();
        pintarTerreno(ano);
        montarVida(ano);
        if (aguaMatEsq) aguaMatEsq.color.setHex(COR_RIO_ESQ[ano - 1]);
        if (espumaMatEsq) espumaMatEsq.color.setHex([0x8f7f52, 0x867f5e, 0x8fae9a][ano - 1]);
    }

    /* ====================== cenário fixo ====================== */
    function arvoresEstaticas() {
        var troncos = [], copas = [], galhosSecos = [], arbustos = [];
        function addArvore(x, z, esc, paleta, tipo) {
            var y = altura(x, z);
            if (tipo === "seca") {
                galhosSecos.push({ p: [x, y + 0.5 * esc, z], s: [esc * 0.65, esc, esc * 0.65], r: [(Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2] });
                copas.push({ p: [x, y + 1.05 * esc, z], s: [esc * 0.5, esc * 0.4, esc * 0.5], c: paleta[0] });
            } else {
                troncos.push({ p: [x, y + 0.5 * esc, z], s: [esc, esc, esc] });
                copas.push({ p: [x, y + 1.12 * esc, z], s: [esc * 1.0, esc * 0.9, esc * 1.0], c: paleta[0] });
                copas.push({ p: [x + 0.32 * esc, y + 0.85 * esc, z + 0.22 * esc], s: [esc * 0.55, esc * 0.5, esc * 0.55], c: paleta[1] });
                copas.push({ p: [x - 0.28 * esc, y + 0.92 * esc, z - 0.18 * esc], s: [esc * 0.48, esc * 0.45, esc * 0.48], c: paleta[2] });
            }
        }
        function addArbusto(x, z, esc, cor) {
            arbustos.push({ p: [x, altura(x, z) + 0.16 * esc, z], s: [esc, esc * 0.65, esc], c: cor });
        }

        var PAL = {
            rl: [[0x1f5c2a, 0x2e7a3a, 0x3f9448], [0x266b30, 0x357f3c, 0x4a9c50], [0x1e5228, 0x2c7035, 0x3a8540]],
            app: [[0x2a6e34, 0x38853f, 0x4c9a4e], [0x1f5c2a, 0x2e7a3a, 0x3f9448], [0x247232, 0x35803c, 0x46944d]],
            solta: [[0x2f7a3a, 0x3c9448, 0x56ad57], [0x35703a, 0x43884a, 0x58a75c]],
            seca: [[0x6e7a44, 0x7e8b50, 0x8c985a]]
        };
        var r2 = rng(9090);

        // Reserva Legal — floresta madura e densa
        for (var i = 0; i < 44; i++) {
            var ax = 7.2 + r2() * 11.5;
            var az = -12.4 + r2() * 3.7;
            addArvore(ax, az, 0.9 + r2() * 0.7, PAL.rl[i % 3]);
            if (r2() < 0.35) addArbusto(ax + (r2() - 0.5) * 1.2, az + (r2() - 0.5) * 1.2, 0.5 + r2() * 0.3, 0x4a8f4f);
        }

        // APP preservada — faixa densa junto ao rio direito
        var palIdx = 0;
        for (var t = 0.05; t <= 1; t += 0.045) {
            var p = rioCurvaDir.getPointAt(t);
            for (var k = 0; k < 2; k++) {
                var off = 1.9 + k * 0.9 + r2() * 0.5;
                addArvore(p.x - off, p.z + (r2() - 0.5) * 1.0, 0.65 + r2() * 0.5, PAL.app[palIdx % 3]);
                palIdx++;
            }
            if (r2() < 0.4) addArbusto(p.x - 1.5, p.z + (r2() - 0.5) * 0.8, 0.45, 0x3f8f45);
        }

        // APP degradada — rala e sofrida
        for (var t2 = 0.15; t2 <= 0.95; t2 += 0.14) {
            var p2 = rioCurvaEsq.getPointAt(t2);
            if (r2() < 0.55) continue;
            addArvore(p2.x + 2.4 + r2() * 0.7, p2.z + (r2() - 0.5) * 1.3, 0.45 + r2() * 0.2, PAL.seca[0], "seca");
        }

        // árvores soltas: sede e cantos do campo — voltar ao procedural
        [[-2.6, -8.2, 1.1], [3.4, -8.4, 0.9], [-16.5, 10.5, 1.0], [-11, 11.2, 0.9],
         [13.6, 10.8, 1.0], [-18.5, -3, 0.9], [15.2, -4.6, 1.0]].forEach(function (a, k) {
            addArvore(a[0], a[1], a[2], PAL.solta[k % 2]);
        });

        gCena.add(instanciar(GE.tronco, 0x6b4a2b, troncos));
        if (galhosSecos.length) gCena.add(instanciar(GE.arvoreSeca, 0x8a6a44, galhosSecos));

        var copaM = new THREE.InstancedMesh(GE.copa,
            new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: false, shininess: 6 }),
            copas.length);
        for (var c = 0; c < copas.length; c++) {
            var it = copas[c];
            _q.setFromEuler(_e.set((ruido(it.p[0], it.p[2]) - 0.5) * 0.3, ruido(it.p[0], it.p[2]) * 3, 0));
            _v.set(it.p[0], it.p[1], it.p[2]);
            _s.set(it.s[0], it.s[1], it.s[2]);
            _mtx.compose(_v, _q, _s);
            copaM.setMatrixAt(c, _mtx);
            copaM.setColorAt(c, _col.set(it.c));
        }
        copaM.instanceMatrix.needsUpdate = true;
        if (copaM.instanceColor) copaM.instanceColor.needsUpdate = true;
        copaM.castShadow = true; copaM.receiveShadow = true;
        gCena.add(copaM);

        if (arbustos.length) {
            var arbM = new THREE.InstancedMesh(GE.copa,
                new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: false, shininess: 4 }),
                arbustos.length);
            for (var a2 = 0; a2 < arbustos.length; a2++) {
                var ab = arbustos[a2];
                _q.setFromEuler(_e.set(0, ruido(ab.p[0], ab.p[2]) * 2, 0));
                _v.set(ab.p[0], ab.p[1], ab.p[2]);
                _s.set(ab.s[0], ab.s[1], ab.s[2]);
                _mtx.compose(_v, _q, _s);
                arbM.setMatrixAt(a2, _mtx);
                arbM.setColorAt(a2, _col.set(ab.c));
            }
            arbM.instanceMatrix.needsUpdate = true;
            if (arbM.instanceColor) arbM.instanceColor.needsUpdate = true;
            arbM.castShadow = true; arbM.receiveShadow = true;
            gCena.add(arbM);
        }

        return { troncos: troncos.length, copas: copas.length, arbustos: arbustos.length };
    }

    function montarAgua() {
        function margem(curva, t, sinal) {
            var p = curva.getPointAt(t);
            var tg = curva.getTangentAt(t);
            var l = Math.sqrt(tg.x * tg.x + tg.z * tg.z) || 1;
            var nx = -tg.z / l, nz = tg.x / l;
            for (var d = 0.5; d <= 2.8; d += 0.12) {
                var x = p.x + sinal * nx * d, z = p.z + sinal * nz * d;
                if (altura(x, z) > NIVEL_AGUA) return Math.max(0.85, d - 0.08);
            }
            return 2.8;
        }
        function fita(curva, cor, opac) {
            var N = 120, posArr = [], idx = [], fases = [];
            for (var i = 0; i <= N; i++) {
                var t = i / N;
                var p = curva.getPointAt(t);
                var tg = curva.getTangentAt(t);
                var l = Math.sqrt(tg.x * tg.x + tg.z * tg.z) || 1;
                var nx = -tg.z / l, nz = tg.x / l;
                var rampa = Math.min(1, t * 6, (1 - t) * 6);
                var wE = margem(curva, t, 1) * rampa;
                var wD = margem(curva, t, -1) * rampa;
                posArr.push(p.x + nx * wE, NIVEL_AGUA, p.z + nz * wE);
                posArr.push(p.x - nx * wD, NIVEL_AGUA, p.z - nz * wD);
                fases.push(i * 0.55, i * 0.55 + 1.7);
                if (i < N) {
                    var b = i * 2;
                    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
                }
            }
            var geo = new THREE.BufferGeometry();
            geo.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
            geo.setIndex(idx);
            geo.computeVertexNormals();
            var m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
                color: cor, transparent: true, opacity: opac, shininess: 100, specular: 0xbfe8f5
            }));
            m.receiveShadow = true;
            aguas.push({ mesh: m, fases: fases });
            return m;
        }
        var fitaEsq = fita(rioCurvaEsq, COR_RIO_ESQ[0], 0.95);
        aguaMatEsq = fitaEsq.material;
        gCena.add(fitaEsq);
        gCena.add(fita(rioCurvaDir, COR_RIO_DIR, 0.93));

        var NA = 40, posL = [LAGOA.x, NIVEL_AGUA, LAGOA.z], idxL = [];
        for (var a = 0; a < NA; a++) {
            var ang = (a / NA) * Math.PI * 2;
            var rr = 0.35;
            while (rr < 2.4) {
                var ax = LAGOA.x + Math.cos(ang) * rr, az = LAGOA.z + Math.sin(ang) * rr;
                if (altura(ax, az) > NIVEL_AGUA) break;
                rr += 0.08;
            }
            var re = Math.max(0.35, rr - 0.07);
            posL.push(LAGOA.x + Math.cos(ang) * re, NIVEL_AGUA, LAGOA.z + Math.sin(ang) * re);
        }
        for (var a2 = 0; a2 < NA; a2++) idxL.push(0, a2 + 1, ((a2 + 1) % NA) + 1);
        var geoL = new THREE.BufferGeometry();
        geoL.setAttribute("position", new THREE.Float32BufferAttribute(posL, 3));
        geoL.setIndex(idxL);
        geoL.computeVertexNormals();
        var lagoa = new THREE.Mesh(geoL, new THREE.MeshPhongMaterial({
            color: 0x4b9ecb, transparent: true, opacity: 0.88, shininess: 100,
            specular: 0xbfe8f5, side: THREE.DoubleSide
        }));
        lagoa.receiveShadow = true;
        gCena.add(lagoa);

        var geoEsp = new THREE.BoxGeometry(0.22, 0.025, 0.07);
        function espumas(curva, cor, n, vel) {
            var m = mat(cor);
            for (var i = 0; i < n; i++) {
                var e = new THREE.Mesh(geoEsp, m);
                e.scale.setScalar(0.8 + Math.random() * 0.4);
                espuma.push({ mesh: e, t: i / n, curva: curva, vel: vel });
                gCena.add(e);
            }
            return m;
        }
        espumaMatEsq = espumas(rioCurvaEsq, 0x8f7f52, 12, 0.026);
        espumas(rioCurvaDir, 0xeaf7fa, 14, 0.032);

        // pedras e seixos nas margens usando modelo GLB
        carregarGLB('modelos/rock.glb', function (gltf) {
            var base = gltf.scene;
            var box = new THREE.Box3().setFromObject(base);
            var size = new THREE.Vector3();
            box.getSize(size);
            console.log('rock size:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2));
            var pedras = [];
            [rioCurvaEsq, rioCurvaDir].forEach(function (curva) {
                for (var t3 = 0.05; t3 <= 0.95; t3 += 0.06) {
                    var p = curva.getPointAt(t3);
                    var tg = curva.getTangentAt(t3);
                    var l = Math.sqrt(tg.x * tg.x + tg.z * tg.z) || 1;
                    var nx = -tg.z / l, nz = tg.x / l;
                    for (var lado = -1; lado <= 1; lado += 2) {
                        if (Math.random() < 0.35) continue;
                        var d = 1.25 + Math.random() * 0.7;
                        var px = p.x + nx * d * lado + (Math.random() - 0.5) * 0.4;
                        var pz = p.z + nz * d * lado + (Math.random() - 0.5) * 0.4;
                        if (altura(px, pz) < NIVEL_AGUA + 0.05) continue;
                        pedras.push({ x: px, z: pz, s: 0.3 + Math.random() * 0.4, r: Math.random() * Math.PI });
                    }
                }
            });
            pedras.forEach(function (it) {
                var obj = base.clone();
                // o modelo rock vem com escala 100x, então o tamanho real já está em size
                var escala = it.s / Math.max(size.x, size.y, size.z);
                obj.scale.setScalar(escala);
                var box = new THREE.Box3().setFromObject(obj);
                obj.position.set(it.x, altura(it.x, it.z) - box.min.y, it.z);
                obj.rotation.y = it.r;
                obj.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
                gCena.add(obj);
            });
        });
    }

    function montarIlha() {
        var geo = new THREE.PlaneGeometry(ILHA_W, ILHA_D, 220, 150);
        geo.rotateX(-Math.PI / 2);
        var pos = geo.attributes.position;
        for (var i = 0; i < pos.count; i++) {
            pos.setY(i, altura(pos.getX(i), pos.getZ(i)));
        }
        geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3));
        geo.computeVertexNormals();
        terreno = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            vertexColors: true, flatShading: false, roughness: 1, metalness: 0
        }));
        terreno.receiveShadow = true;
        terreno.castShadow = true;
        gCena.add(terreno);

        function formaArredondada(w, d, r) {
            var f = new THREE.Shape();
            var x = w / 2 - r, z = d / 2 - r;
            f.moveTo(-x, -d / 2);
            f.lineTo(x, -d / 2);
            f.absarc(x, -z, r, -Math.PI / 2, 0, false);
            f.lineTo(w / 2, z);
            f.absarc(x, z, r, 0, Math.PI / 2, false);
            f.lineTo(-x, d / 2);
            f.absarc(-x, z, r, Math.PI / 2, Math.PI, false);
            f.lineTo(-w / 2, -z);
            f.absarc(-x, -z, r, Math.PI, Math.PI * 1.5, false);
            return f;
        }
        var forma = formaArredondada(ILHA_W - 0.15, ILHA_D - 0.15, 2.2);
        // camadas abaixo do terreno: topo bem abaixo do nível da água para não sobrepor
        [[-0.85, -0.75, 0x6e5a48], [-1.6, -1.25, 0x9a7a5a], [-2.85, -1.4, 0xb89b7a]].forEach(function (L) {
            var g = new THREE.ExtrudeGeometry(forma, { depth: L[1], bevelEnabled: false });
            g.rotateX(Math.PI / 2);
            var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
                color: L[2], flatShading: true, roughness: 1, metalness: 0
            }));
            m.position.y = L[0];
            m.castShadow = true; m.receiveShadow = true;
            gCena.add(m);
        });

        var cv = document.createElement("canvas");
        cv.width = cv.height = 256;
        var cx = cv.getContext("2d");
        var gr = cx.createRadialGradient(128, 128, 20, 128, 128, 126);
        gr.addColorStop(0, "rgba(20,45,60,0.5)");
        gr.addColorStop(1, "rgba(20,45,60,0)");
        cx.fillStyle = gr;
        cx.fillRect(0, 0, 256, 256);
        var sombra = new THREE.Mesh(
            new THREE.CircleGeometry(23, 40),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
        sombra.rotation.x = -Math.PI / 2;
        sombra.position.y = -6.2;
        scene.add(sombra);
    }

    function montarSede() {
        // casa um pouco maior para dar presenca na cena
        colocarModelo('modelos/farmhouse.glb', SEDE.x, SEDE.z, 2.2, 0.35, function (obj) {
            obj.userData.fumaca = null;
        });

        // caixa d'agua tipica de fazenda: base conica + cilindro + tampa
        var caixa = new THREE.Group();
        var base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.55, 10), mat(0x9a7a5a));
        base.position.y = 0.28;
        base.castShadow = true;
        caixa.add(base);
        var tambor = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.72, 14), mat(0x5a8ab0));
        tambor.position.y = 0.9;
        tambor.castShadow = true;
        caixa.add(tambor);
        var tampa = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.06, 14), mat(0x4a7aa0));
        tampa.position.y = 1.29;
        tampa.castShadow = true;
        caixa.add(tampa);
        // pequeno cano de saida
        var cano = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 6), mat(0x7a7a7a));
        cano.rotation.z = Math.PI / 2;
        cano.position.set(0.34, 0.55, 0);
        caixa.add(cano);

        // posiciona ao lado de fora da casa, proximo ao canto
        var ang = 0.35;
        var dist = 2.4;
        var cx = SEDE.x + Math.cos(ang) * dist;
        var cz = SEDE.z + Math.sin(ang) * dist;
        caixa.position.set(cx, altura(cx, cz), cz);
        caixa.rotation.y = ang + 0.2;
        gCena.add(caixa);
    }

    function montarPasto() {
        // cerca de madeira simples (procedural — o GLB de cerca era achatado)
        var postes = [];
        var passo = 0.62;
        for (var x = PASTO.x0; x <= PASTO.x1 + 0.01; x += passo) {
            postes.push([x, PASTO.z0]); postes.push([x, PASTO.z1]);
        }
        for (var z = PASTO.z0; z <= PASTO.z1 + 0.01; z += passo) {
            postes.push([PASTO.x0, z]); postes.push([PASTO.x1, z]);
        }
        var itens = postes.map(function (p) {
            return { p: [p[0], altura(p[0], p[1]) + 0.28, p[1]] };
        });
        gCena.add(instanciar(GE.poste, 0x8a5a33, itens));

        var r2 = rng(4321);
        for (var v = 0; v < 3; v++) {
            (function (idx) {
                var x = PASTO.x0 + 0.8 + r2() * (PASTO.x1 - PASTO.x0 - 1.6);
                var z = PASTO.z0 + 0.5 + r2() * (PASTO.z1 - PASTO.z0 - 1);
                var rot = r2() * Math.PI * 2;
                colocarModelo('modelos/cow_google.glb', x, z, 0.95, rot, function (obj) {
                    obj.userData.fase = idx * 1.3;
                    vacas.push(obj);
                });
            })(v);
        }
    }

    function montarTrator(x, z, rot) {
        colocarModelo('modelos/tractor_poly.glb', x, z, 1.5, rot);
    }

    function montarDrone() {
        drone = new THREE.Group();
        // corpo arredondado
        var corpo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), mat(0x37474f));
        corpo.scale.set(1.2, 0.45, 0.8);
        corpo.castShadow = true;
        drone.add(corpo);
        // braços arredondados
        var bracoX = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8), mat(0x37474f));
        bracoX.rotation.z = Math.PI / 2;
        bracoX.position.y = 0.02;
        drone.add(bracoX);
        var bracoZ = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8), mat(0x37474f));
        bracoZ.rotation.x = Math.PI / 2;
        bracoZ.position.y = 0.02;
        drone.add(bracoZ);
        var geoDisco = new THREE.CylinderGeometry(0.34, 0.34, 0.04, 12);
        [[0.95, 0.95], [-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95]].forEach(function (p) {
            var d = new THREE.Mesh(geoDisco, mat(0x8aa0ac));
            d.position.set(p[0], 0.16, p[1]);
            drone.add(d);
            rotores.push(d);
        });
        var cam = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(0x263238));
        cam.position.y = -0.18;
        drone.add(cam);
        // luzes piscantes
        var luzV = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0x00ff00, true));
        luzV.position.set(0.85, 0.04, 0.85);
        drone.add(luzV);
        var luzR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0xff0000, true));
        luzR.position.set(-0.85, 0.04, -0.85);
        drone.add(luzR);
        drone.userData.luzes = [luzV, luzR];
        gCena.add(drone);
    }

    function montarAvesNuvensSol() {
        var geoAsa = new THREE.PlaneGeometry(0.8, 0.22);
        for (var i = 0; i < 4; i++) {
            var g = new THREE.Group();
            var mA = new THREE.MeshLambertMaterial({ color: 0x44555f, side: THREE.DoubleSide });
            var a1 = new THREE.Mesh(geoAsa, mA); a1.position.x = 0.4;
            var a2 = new THREE.Mesh(geoAsa, mA); a2.position.x = -0.4;
            var asa1 = new THREE.Group(); asa1.add(a1);
            var asa2 = new THREE.Group(); asa2.add(a2);
            g.add(asa1); g.add(asa2);
            g.userData = { asa1: asa1, asa2: asa2, f: i * 2.4, r: 14 + i * 4, h: 10 + i * 1.6, vel: 0.1 + i * 0.03 };
            aves.push(g);
            gCena.add(g);
        }
        var matNuvem = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x8a95a0, flatShading: false, shininess: 0 });
        var geoNuvem = new THREE.SphereGeometry(1, 10, 8);
        [[-14, 13, -6, 2.2], [4, 15.5, -9, 1.6], [16, 12.5, -3, 1.9], [-2, 14, 8, 1.4], [10, 16, -12, 1.2]].forEach(function (n, k) {
            var g = new THREE.Group();
            for (var j = 0; j < 6; j++) {
                var m = new THREE.Mesh(geoNuvem, matNuvem);
                var sx = 1.2 + j * 0.22 + Math.random() * 0.2;
                m.scale.set(sx, 0.45 + (j % 2) * 0.18, 0.75 + j * 0.1);
                m.position.set(j * 1.0 - 2.5, (j % 2) * 0.4 + Math.random() * 0.15, (j % 2) * 0.5);
                g.add(m);
            }
            g.position.set(n[0], n[1], n[2]);
            g.scale.setScalar(n[3]);
            g.userData.vel = 0.25 + k * 0.07;
            nuvens.push(g);
            gCena.add(g);
        });
        var sol = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 14),
            new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
        sol.position.set(22, 17, -26);
        scene.add(sol);
        var cv = document.createElement("canvas");
        cv.width = cv.height = 128;
        var c2 = cv.getContext("2d");
        var gr = c2.createRadialGradient(64, 64, 6, 64, 64, 64);
        gr.addColorStop(0, "rgba(255,240,190,0.9)");
        gr.addColorStop(1, "rgba(255,240,190,0)");
        c2.fillStyle = gr;
        c2.fillRect(0, 0, 128, 128);
        var halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false
        }));
        halo.scale.setScalar(11);
        halo.position.copy(sol.position);
        scene.add(halo);
    }

    function montarPlacas() {
        function placa(texto, x, z, rot, esc) {
            var g = new THREE.Group();
            var h = altura(x, z);
            var poste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), mat(0x6b4a2b));
            poste.position.set(0, 0.55, 0);
            poste.castShadow = true;
            g.add(poste);

            var cv = document.createElement("canvas");
            cv.width = 512; cv.height = 160;
            var cx = cv.getContext("2d");
            cx.fillStyle = "#f3ead9";
            cx.fillRect(0, 0, 512, 160);
            cx.strokeStyle = "#6b4a2b";
            cx.lineWidth = 10;
            cx.strokeRect(5, 5, 502, 150);
            cx.fillStyle = "#3e2b18";
            cx.font = "bold 42px Arial";
            cx.textAlign = "center";
            cx.textBaseline = "middle";
            cx.fillText(texto, 256, 80);

            var tex = new THREE.CanvasTexture(cv);
            var m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
            m.position.set(0, 1.15, 0.02);
            g.add(m);
            var verso = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ color: 0xf3ead9, side: THREE.DoubleSide }));
            verso.position.set(0, 1.15, -0.02);
            g.add(verso);

            g.position.set(x, h, z);
            g.rotation.y = rot || 0;
            g.scale.setScalar(esc || 1);
            gCena.add(g);
        }
        placa("Talhão 1 · Evolução da palhada", (T1.x0 + T1.x1) / 2, T1.z1 + 1.4, 0, 1.1);
        placa("Talhão 2 · Plantio em contorno", (T2.x0 + T2.x1) / 2, T2.z1 + 1.4, 0, 1.1);
        placa("Talhão 3 · Manejo avançado", (T3.x0 + T3.x1) / 2, T3.z1 + 1.4, 0, 1.1);
        placa("APP degradada", -14.5, 6.5, 0.4, 0.9);
        placa("APP preservada", 15.8, 7.0, -0.35, 0.9);
        placa("RL preservada e excedente", 13.5, -9.5, -0.2, 0.95);
    }

    /* ====================== marcadores ====================== */
    var POS = {
        t1: { x: -8.7, z: 2, h: 1.4 },
        t2: { x: -1.6, z: 0.2, h: 1.6 },
        t3: { x: 8.8, z: 2, h: 1.4 },
        appd: { x: -12.8, z: 3, h: 1.2 },
        appp: { x: 15.2, z: 4, h: 3.2 },
        rl: { x: 12.5, z: -10.3, h: 3.6 },
        vacas: { x: 10.4, z: -6.4, h: 1.8 },
        bio: { x: 9.3, z: 5.8, h: 1.6 },
        sede: { x: 0.6, z: -9.6, h: 3.2 },
        drone: { segue: true }
    };

    function atualizarMarcadores() {
        if (!opts.aoMarcar) return;
        var w = container.clientWidth, h = container.clientHeight;
        var dados = {};
        Object.keys(POS).forEach(function (id) {
            var p = POS[id].segue && drone
                ? drone.position.clone().add(new THREE.Vector3(0, 0.6, 0))
                : posFixas[id];
            var v = p.clone().project(camera);
            dados[id] = { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visivel: v.z < 1 };
        });
        opts.aoMarcar(dados);
    }

    /* ====================== animação ====================== */
    function animar() {
        requestAnimationFrame(animar);
        var dt = Math.min(relogio.getDelta(), 0.05);
        tGlobal += dt;
        controls.update();

        if (drone) {
            drone.position.x = Math.sin(tGlobal * 0.3) * 6.5 + 1;
            drone.position.z = Math.cos(tGlobal * 0.42) * 4 + 1.5;
            drone.position.y = 4.4 + Math.sin(tGlobal * 1.1) * 0.35;
            drone.rotation.z = -Math.cos(tGlobal * 0.3) * 0.08;
            drone.rotation.y = Math.sin(tGlobal * 0.42) * 0.5;
            for (var h = 0; h < rotores.length; h++) rotores[h].rotation.y += dt * 45;
            if (drone.userData.luzes) {
                drone.userData.luzes[0].material.emissive.setHex(Math.sin(tGlobal * 6) > 0 ? 0x00ff00 : 0x002200);
                drone.userData.luzes[1].material.emissive.setHex(Math.sin(tGlobal * 6 + Math.PI) > 0 ? 0xff0000 : 0x220000);
            }
        }
        espuma.forEach(function (e) {
            e.t += e.vel * dt * 10;
            if (e.t > 1) e.t -= 1;
            var p = e.curva.getPointAt(e.t);
            e.mesh.position.set(p.x, NIVEL_AGUA + 0.05, p.z);
            var tg = e.curva.getTangentAt(e.t);
            e.mesh.rotation.y = Math.atan2(tg.x, tg.z);
        });
        aguas.forEach(function (a) {
            var pos = a.mesh.geometry.attributes.position;
            for (var i = 0; i < pos.count; i++) {
                pos.setY(i, NIVEL_AGUA + Math.sin(tGlobal * 1.8 + a.fases[i]) * 0.02);
            }
            pos.needsUpdate = true;
        });
        vacas.forEach(function (v) {
            v.position.y = altura(v.position.x, v.position.z) + Math.abs(Math.sin(tGlobal * 1.1 + v.userData.fase)) * 0.03;
        });
        // fumaça da chaminé
        gCena.traverse(function (o) {
            if (o.userData && o.userData.fumaca) {
                var f = o.userData.fumaca;
                f.position.y = 2.7 + Math.sin(tGlobal * 0.8) * 0.08;
                f.scale.setScalar(1 + Math.sin(tGlobal * 1.2) * 0.15);
                f.material.opacity = 0.25 + Math.sin(tGlobal * 0.5) * 0.1;
            }
        });
        aves.forEach(function (a) {
            var f = tGlobal * a.userData.vel + a.userData.f;
            a.position.set(Math.cos(f) * a.userData.r, a.userData.h + Math.sin(f * 2) * 0.6, Math.sin(f) * a.userData.r);
            a.rotation.y = -f + Math.PI / 2;
            var flap = Math.sin(tGlobal * 6 + a.userData.f) * 0.55;
            a.userData.asa1.rotation.z = 0.25 + flap;
            a.userData.asa2.rotation.z = -0.25 - flap;
        });
        nuvens.forEach(function (n) {
            n.position.x += n.userData.vel * dt;
            if (n.position.x > 34) n.position.x = -34;
        });
        borboletas.forEach(function (b) {
            var f = tGlobal * 0.9 + b.userData.f;
            var x = b.userData.cx + Math.sin(f) * 1.2;
            var z = b.userData.cz + Math.cos(f * 0.8) * 1;
            b.position.set(x, altura(x, z) + b.userData.h + Math.sin(f * 2.3) * 0.3, z);
            var flap = Math.sin(tGlobal * 14 + b.userData.f) * 0.85;
            b.userData.asa1.rotation.z = 0.3 + flap;
            b.userData.asa2.rotation.z = -0.3 - flap;
        });
        abelhas.forEach(function (a) {
            var f = tGlobal * 1.6 + a.userData.f;
            a.position.set(
                a.userData.cx + Math.sin(f) * 0.5,
                altura(a.userData.cx, a.userData.cz) + a.userData.h + Math.sin(f * 3) * 0.2,
                a.userData.cz + Math.cos(f * 1.3) * 0.45);
        });

        renderer.render(scene, camera);
        atualizarMarcadores();
    }

    function aoRedimensionar() {
        var w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    /* ====================== céu e luz ====================== */
    function ceuTextura() {
        var cv = document.createElement("canvas");
        cv.width = 2; cv.height = 512;
        var c = cv.getContext("2d");
        var g = c.createLinearGradient(0, 0, 0, 512);
        g.addColorStop(0, "#3b7ab8");
        g.addColorStop(0.35, "#5fa3d4");
        g.addColorStop(0.6, "#9fd0ec");
        g.addColorStop(0.85, "#d6ecf5");
        g.addColorStop(1, "#f5ecd0");
        c.fillStyle = g;
        c.fillRect(0, 0, 2, 512);
        return new THREE.CanvasTexture(cv);
    }

    function luzes() {
        scene.add(new THREE.HemisphereLight(0xbfdfff, 0x7a9a5f, 0.62));
        scene.add(new THREE.AmbientLight(0xffffff, 0.24));
        var sol = new THREE.DirectionalLight(0xfff1d6, 1.2);
        sol.position.set(24, 26, -14);
        sol.castShadow = true;
        sol.shadow.mapSize.set(2048, 2048);
        sol.shadow.camera.left = -24; sol.shadow.camera.right = 24;
        sol.shadow.camera.top = 20; sol.shadow.camera.bottom = -18;
        sol.shadow.camera.near = 4; sol.shadow.camera.far = 90;
        sol.shadow.bias = -0.0006;
        scene.add(sol);
        // névoa sutil de profundidade
        scene.fog = new THREE.Fog(0xd6ecf5, 35, 95);
    }

    /* ====================== init ====================== */
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

        camera = new THREE.PerspectiveCamera(40, 1.55, 0.1, 400);
        camera.position.set(28, 18.5, 34);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0.2, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.enablePan = false;
        controls.minDistance = 14;
        controls.maxDistance = 70;
        controls.minPolarAngle = 0.18;
        controls.maxPolarAngle = 1.42;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.45;
        renderer.domElement.addEventListener("pointerdown", function () { controls.autoRotate = false; });

        gCena = new THREE.Group(); gAno = new THREE.Group(); gVida = new THREE.Group();
        scene.add(gCena); scene.add(gAno); scene.add(gVida);

        rioCurvaEsq = curvaDe(RIO_ESQ_PTS);
        rioCurvaDir = curvaDe(RIO_DIR_PTS);
        rioAmoEsq = amostrar(rioCurvaEsq, 64);
        rioAmoDir = amostrar(rioCurvaDir, 64);
        caminhoAmo = CAMINHOS.map(function (pts) {
            return amostrar(curvaDe(pts), 40);
        });
        valeAmo = amostrar(curvaDe(VALE_PTS), 24);

        geos();
        luzes();
        montarIlha();
        montarAgua();
        arvoresEstaticas();
        montarSede();
        montarPasto();
        montarTrator(1.6, 11.2, 1.2);
        montarTrator(-5.2, 6.5, 0.2);
        montarDrone();
        montarAvesNuvensSol();
        montarPlacas();

        Object.keys(POS).forEach(function (id) {
            if (!POS[id].segue) posFixas[id] = new THREE.Vector3(POS[id].x, altura(POS[id].x, POS[id].z) + POS[id].h, POS[id].z);
        });

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
                fixos: gCena.children.length,
                ano: gAno.children.length,
                vida: gVida.children.length,
                marcadores: Object.keys(POS).length
            };
        }
    };
})();
