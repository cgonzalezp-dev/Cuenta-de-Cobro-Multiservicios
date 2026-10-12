/* Cuenta de cobro · JR Multiservicios
   Todo corre en el navegador: nada se envía a ningún servidor. */
(function () {
  "use strict";

  var CFG = window.JR_CONFIG;
  var LS_HISTORY = "jr_cuentas_cobro_v1";
  var LS_EMISOR = "jr_cuentas_cobro_emisor_v1";
  var DOC_W = 794;

  /* ---------- utilidades ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var money = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
  function cop(n) { return "$ " + money.format(Math.round(n || 0)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n, l) { n = String(n); while (n.length < l) n = "0" + n; return n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2);
  }
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function fechaLarga(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    if (p.length !== 3) return iso;
    return parseInt(p[2], 10) + " de " + MESES[parseInt(p[1], 10) - 1] + " de " + p[0];
  }
  function toNumber(str) { return parseInt(String(str || "").replace(/[^\d]/g, ""), 10) || 0; }
  function gross(neto, ret) {
    ret = Math.min(Math.max(Number(ret) || 0, 0), 90);
    return ret ? Math.ceil(neto / (1 - ret / 100)) : neto;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var toastTimer;
  function toast(msg, err) {
    var t = $("toast");
    t.textContent = msg;
    t.className = "toast show" + (err ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; }, 3600);
  }

  /* ---------- número a letras (pesos colombianos) ---------- */
  var UN = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince",
    "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco",
    "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
  var DEC = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  var CEN = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

  function menorMil(n) {
    if (n === 0) return "";
    if (n === 100) return "cien";
    var c = Math.floor(n / 100), r = n % 100, out = [];
    if (c) out.push(CEN[c]);
    if (r) {
      if (r < 30) out.push(UN[r]);
      else {
        var d = Math.floor(r / 10), u = r % 10;
        out.push(u ? DEC[d] + " y " + UN[u] : DEC[d]);
      }
    }
    return out.join(" ");
  }
  function apocope(t) { return t.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un"); }
  function enLetras(n) {
    n = Math.floor(n);
    if (n === 0) return "cero";
    var millones = Math.floor(n / 1000000), miles = Math.floor((n % 1000000) / 1000), resto = n % 1000, out = [];
    if (millones) {
      if (millones === 1) out.push("un millón");
      else {
        out.push(apocope(enLetras(millones)) + " millones");
      }
    }
    if (miles) {
      if (miles === 1) out.push("mil");
      else out.push(apocope(menorMil(miles)) + " mil");
    }
    if (resto) out.push(menorMil(resto));
    return out.join(" ");
  }
  function pesosEnLetras(n) {
    var t = apocope(enLetras(n));
    t = t.charAt(0).toUpperCase() + t.slice(1);
    var sufijo = (n >= 1000000 && n % 1000000 === 0) ? " de pesos m/cte." : " pesos m/cte.";
    if (n === 1) return "Un peso m/cte.";
    return t + sufijo;
  }

  /* ---------- estado ---------- */
  function emisorGuardado() {
    var e = lsGet(LS_EMISOR, {});
    return {
      titular: e.titular || CFG.titular || "",
      cedula: e.cedula || CFG.cedula || "",
      ciudad: e.ciudad || CFG.ciudad || "",
      banco: e.banco || CFG.banco || "",
      tipoCuenta: e.tipoCuenta || CFG.tipoCuenta || "Ahorros",
      numeroCuenta: e.numeroCuenta || CFG.numeroCuenta || ""
    };
  }
  function blankState() {
    var e = emisorGuardado();
    return {
      cliente: "", nitCliente: "", titular: e.titular, cedula: e.cedula, ciudad: e.ciudad,
      fecha: todayISO(), desde: "", hasta: "", concepto: "", retencion: 0, neto: 0,
      banco: e.banco, tipoCuenta: e.tipoCuenta, numeroCuenta: e.numeroCuenta
    };
  }
  var state = blankState();
  var editing = null;

  function persistEmisor() {
    lsSet(LS_EMISOR, {
      titular: state.titular, cedula: state.cedula, ciudad: state.ciudad,
      banco: state.banco, tipoCuenta: state.tipoCuenta, numeroCuenta: state.numeroCuenta
    });
  }
  var serverNext = null;   // número que la base asignará a la próxima cuenta de cobro
  function currentNumber() { return editing ? editing.numero : (serverNext || "CDC-····"); }
  function numberLabel() { return editing ? editing.numero : (serverNext || "Se asigna al generar"); }
  function refreshNext() {
    if (!window.JRRegistro) return;
    window.JRRegistro.siguiente("cuenta_cobro").then(function (n) { serverNext = n; renderPreview(); });
  }
  function valorCuenta(s) { return gross(s.neto, s.retencion); }

  /* ---------- documento (HTML) ---------- */
  function docHTML(s, numero) {
    var valor = valorCuenta(s);
    var periodo;
    if (s.desde && s.hasta) periodo = "Del " + fechaLarga(s.desde) + " al " + fechaLarga(s.hasta);
    else if (s.desde) periodo = "Desde el " + fechaLarga(s.desde);
    else if (s.hasta) periodo = "Hasta el " + fechaLarga(s.hasta);
    else periodo = "";

    var info = function (label, val, ph, full) {
      return '<div' + (full ? ' class="full"' : "") + "><dt>" + label + "</dt><dd" + (val ? "" : ' class="muted"') + ">" + (val ? esc(val) : ph) + "</dd></div>";
    };
    var pay = function (label, val) {
      return "<div><dt>" + label + "</dt><dd" + (val ? "" : ' class="muted"') + ">" + (val ? esc(val) : "—") + "</dd></div>";
    };
    var contacto = "<b>" + esc(CFG.telefono) + "</b><br>WhatsApp " + esc(CFG.telefono) +
      (CFG.correo ? "<br>" + esc(CFG.correo) : "") + "<br>" + esc(CFG.ciudad);
    var ciudadFecha = (s.ciudad.trim() ? s.ciudad.trim() + ", " : "") + (fechaLarga(s.fecha) || "—");
    var nitCli = s.nitCliente.trim();

    return (
      '<div class="doc">' +
      '<div class="doc-accent"></div>' +
      '<div class="doc-body">' +
      '<div class="doc-top">' +
      '<div class="doc-brand"><img src="icono.png" alt=""><div class="b-text"><span class="b-name">' + esc(CFG.empresa) +
      '</span><span class="b-slogan">' + esc(CFG.slogan) + '</span><span class="b-serv">' + esc(CFG.servicios) + "</span></div></div>" +
      '<div class="doc-meta"><div class="doc-title">Cuenta de cobro</div><div class="m-num">N.° ' + esc(numero) +
      '</div><div class="m-date">' + esc(ciudadFecha) + "</div></div>" +
      "</div>" +
      '<div class="doc-rule"></div>' +
      '<dl class="doc-info" style="margin:0">' +
      info("Cobrado por", s.titular.trim(), "Sin diligenciar", true) +
      info("Cédula de ciudadanía", s.cedula.trim(), "Sin diligenciar") +
      info("Período del servicio", periodo, "No especificado") +
      info("Señor(es)", s.cliente.trim() + (nitCliente(s) ? "  ·  " + nitCli : ""), "Sin diligenciar", true) +
      "</dl>" +
      '<div class="doc-sum"><div class="s-lbl">La suma de</div><div class="s-words">' + esc(pesosEnLetras(valor)) +
      '</div><div class="s-num">' + cop(valor) + "</div></div>" +
      '<div class="doc-block"><div class="k">Por concepto de</div><div class="v' + (s.concepto.trim() ? "" : " muted") + '">' +
      (s.concepto.trim() ? esc(s.concepto.trim()) : "Sin diligenciar") + "</div></div>" +
      '<div class="doc-block"><div class="k">Forma de pago</div><dl class="doc-pay" style="margin-top:0">' +
      pay("Banco", s.banco.trim()) + pay("Tipo de cuenta", s.banco.trim() || s.numeroCuenta.trim() ? s.tipoCuenta : "") + pay("Número de cuenta", s.numeroCuenta.trim()) +
      "</dl></div>" +
      '<div class="doc-sign"><div class="line"></div><div class="n">' + esc(s.titular.trim() || " ") + '</div><div class="c">C.C. ' +
      esc(s.cedula.trim() || "________________") + "</div></div>" +
      "</div>" +
      '<div class="doc-foot"><div class="f-phrase">Protegemos tu hogar y tu negocio con <span>tecnología profesional</span>.' +
      '<span class="f-sub">' + esc(CFG.garantias) + '</span></div><div class="f-contact">' + contacto + "</div></div>" +
      "</div>"
    );
  }
  function nitCliente(s) { return !!s.nitCliente.trim(); }

  /* ---------- vista previa ---------- */
  function fitPreview() {
    var wrap = $("paperWrap"), scaleEl = $("paperScale");
    var k = Math.min(1, (wrap.clientWidth - 20) / DOC_W);
    scaleEl.style.transform = "scale(" + k + ")";
    wrap.style.height = Math.ceil(scaleEl.offsetHeight * k + 20) + "px";
  }
  function renderPreview() {
    $("numero").value = numberLabel();
    $("netBox").textContent = cop(valorCuenta(state));
    $("paperScale").innerHTML = docHTML(state, currentNumber());
    fitPreview();
  }

  /* ---------- formulario ---------- */
  var SIMPLE = {
    cliente: "cliente", nitCliente: "nitCliente", titular: "titular", cedula: "cedula", ciudad: "ciudad",
    fecha: "fecha", desde: "desde", hasta: "hasta", concepto: "concepto",
    banco: "banco", tipoCuenta: "tipoCuenta", numeroCuenta: "numeroCuenta"
  };
  var EMISOR_KEYS = { titular: 1, cedula: 1, ciudad: 1, banco: 1, tipoCuenta: 1, numeroCuenta: 1 };

  function syncControls() {
    Object.keys(SIMPLE).forEach(function (id) { $(id).value = state[SIMPLE[id]]; });
    $("neto").value = state.neto ? "$ " + money.format(state.neto) : "";
    $("retencion").value = state.retencion;
    document.querySelectorAll("#retChips .chip").forEach(function (c) {
      c.classList.toggle("is-on", Number(c.dataset.ret) === Number(state.retencion));
    });
  }
  function bindForm() {
    Object.keys(SIMPLE).forEach(function (id) {
      var ev = $(id).tagName === "SELECT" ? "change" : "input";
      $(id).addEventListener(ev, function () {
        state[SIMPLE[id]] = this.value;
        if (EMISOR_KEYS[id]) persistEmisor();
        renderPreview();
      });
    });
    $("neto").addEventListener("input", function () {
      state.neto = toNumber(this.value);
      this.value = state.neto ? "$ " + money.format(state.neto) : "";
      renderPreview();
    });
    document.querySelectorAll("#retChips .chip").forEach(function (c) {
      c.addEventListener("click", function () { state.retencion = Number(c.dataset.ret); syncControls(); renderPreview(); });
    });
    $("retencion").addEventListener("input", function () {
      state.retencion = Math.min(Math.max(Number(this.value) || 0, 0), 50);
      document.querySelectorAll("#retChips .chip").forEach(function (c) {
        c.classList.toggle("is-on", Number(c.dataset.ret) === state.retencion);
      });
      renderPreview();
    });

    $("btnPdf").addEventListener("click", function () { exportPdf("download"); });
    $("btnShare").addEventListener("click", function () { exportPdf("share"); });
    $("btnNew").addEventListener("click", function () {
      state = blankState(); editing = null;
      syncControls(); renderPreview();
      window.scrollTo({ top: 0, behavior: "smooth" });
      refreshNext();
      toast("Cuenta de cobro nueva lista.");
    });

    $("history").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-act]");
      if (!b) return;
      var item = lsGet(LS_HISTORY, []).filter(function (h) { return h.id === b.dataset.id; })[0];
      if (!item) return;
      if (b.dataset.act === "open") openFromHistory(item);
      if (b.dataset.act === "pdf") exportPdf("download", item);
      if (b.dataset.act === "del") {
        if (!confirm("¿Borrar " + item.numero + " del historial? El número no se reutiliza.")) return;
        lsSet(LS_HISTORY, lsGet(LS_HISTORY, []).filter(function (h) { return h.id !== item.id; }));
        if (editing && editing.id === item.id) editing = null;
        renderHistory(); renderPreview();
      }
    });
    window.addEventListener("resize", fitPreview);
  }

  /* ---------- historial ---------- */
  function renderHistory() {
    var list = lsGet(LS_HISTORY, []);
    $("historyEmpty").hidden = list.length > 0;
    $("history").innerHTML = list.map(function (h) {
      return '<li><div class="h-main"><div class="h-num">' + esc(h.numero) + " · " + cop(h.valor) + '</div><div class="h-sub">' +
        esc(h.cliente || "Sin cliente") + " · " + esc(fechaLarga(h.fecha)) + '</div></div><div class="h-actions">' +
        '<button class="h-btn" data-act="open" data-id="' + h.id + '">Abrir</button>' +
        '<button class="h-btn" data-act="pdf" data-id="' + h.id + '">PDF</button>' +
        '<button class="h-btn del" data-act="del" data-id="' + h.id + '">Borrar</button></div></li>';
    }).join("");
  }
  function openFromHistory(item) {
    state = JSON.parse(JSON.stringify(item.data));
    editing = { id: item.id, numero: item.numero };
    syncControls(); renderPreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Abriste " + item.numero + ". Al descargar se actualiza esa misma cuenta de cobro.");
  }
  function saveToHistory(numero) {
    var list = lsGet(LS_HISTORY, []);
    var base = { fecha: state.fecha, cliente: state.cliente.trim(), valor: valorCuenta(state), data: JSON.parse(JSON.stringify(state)) };
    if (editing) {
      list = list.map(function (h) {
        return h.id === editing.id ? Object.assign({ id: h.id, numero: h.numero }, base) : h;
      });
    } else {
      var item = Object.assign({ id: uid(), numero: numero }, base);
      list.unshift(item);
      editing = { id: item.id, numero: numero };
    }
    lsSet(LS_HISTORY, list.slice(0, 200));
    persistEmisor();
    renderHistory(); renderPreview();
  }

  /* ---------- PDF ---------- */
  function validate() {
    var checks = [
      [!state.cliente.trim(), "Escribe a quién le cobras (Paso 1).", "cliente"],
      [!state.titular.trim(), "Escribe el nombre de quien cobra (Paso 1).", "titular"],
      [!state.cedula.trim(), "Escribe la cédula de quien cobra (Paso 1).", "cedula"],
      [!state.concepto.trim(), "Cuenta qué trabajo hiciste (Paso 2).", "concepto"],
      [!valorCuenta(state), "Escribe cuánto quieres recibir (Paso 2).", "neto"]
    ];
    for (var i = 0; i < checks.length; i++) {
      if (checks[i][0]) { toast(checks[i][1], true); $(checks[i][2]).focus(); return false; }
    }
    return true;
  }
  function safeName(s) { return String(s).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim(); }

  function buildPdf(s, numero) {
    var holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;width:" + DOC_W + "px;background:#fff;z-index:-1";
    holder.innerHTML = docHTML(s, numero);
    document.body.appendChild(holder);
    var node = holder.firstChild;
    var loaded = Array.prototype.map.call(holder.querySelectorAll("img"), function (im) {
      return im.complete ? Promise.resolve() : new Promise(function (r) { im.onload = im.onerror = r; });
    });
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return Promise.all(loaded.concat([fontsReady])).then(function () {
      return html2canvas(node, { scale: 3, backgroundColor: "#ffffff", useCORS: true, width: DOC_W, windowWidth: DOC_W, logging: false });
    }).then(function (canvas) {
      document.body.removeChild(holder);
      var pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
      var pageHpx = Math.floor(canvas.width * 297 / 210);
      var pages = Math.max(1, Math.ceil((canvas.height - 2) / pageHpx));
      for (var p = 0; p < pages; p++) {
        var sliceH = Math.min(pageHpx, canvas.height - p * pageHpx);
        var c = document.createElement("canvas");
        c.width = canvas.width; c.height = sliceH;
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(canvas, 0, p * pageHpx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (p > 0) pdf.addPage();
        pdf.addImage(c.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, sliceH * 210 / canvas.width, undefined, "FAST");
      }
      return pdf;
    }).catch(function (err) {
      if (holder.parentNode) holder.parentNode.removeChild(holder);
      throw err;
    });
  }

  var busy = false;
  function setBusy(b) { busy = b; $("btnPdf").disabled = b; $("btnShare").disabled = b; }

  function exportPdf(mode, fromItem) {
    if (busy) return;
    var s, p, offline = false;
    if (fromItem) {
      s = fromItem.data;
      p = Promise.resolve(fromItem.numero);
    } else {
      if (!validate()) return;
      s = JSON.parse(JSON.stringify(state));
      var valor = valorCuenta(s), cli = s.cliente.trim();
      if (editing) {
        window.JRRegistro.actualizar("cuenta_cobro", editing.numero, s.fecha, cli, valor);
        p = Promise.resolve(editing.numero);
      } else {
        p = window.JRRegistro.registrar("cuenta_cobro", s.fecha, cli, valor).then(function (r) {
          offline = r.offline;
          return r.numero;
        });
      }
      p = p.then(function (numero) { saveToHistory(numero); refreshNext(); return numero; });
    }
    setBusy(true);
    p.then(function (numero) {
      return buildPdf(s, numero).then(function (pdf) {
        var name = "Cuenta de cobro " + numero + (s.cliente.trim() ? " - " + safeName(s.cliente.trim()) : "") + ".pdf";
        if (mode === "share") return shareOrFallback(pdf, name, numero);
        pdf.save(name);
        toast(offline ? "Listo: " + name + ". Sin conexión: se avisará al panel cuando vuelva internet." : "Listo: " + name);
      });
    }).catch(function (err) {
      console.error(err);
      toast("No se pudo generar el PDF. Intenta de nuevo.", true);
    }).then(function () { setBusy(false); });
  }
  function shareOrFallback(pdf, name, numero) {
    var blob = pdf.output("blob");
    var file = new File([blob], name, { type: "application/pdf" });
    var text = "Hola, te comparto la cuenta de cobro " + numero + ".";
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: "Cuenta de cobro " + numero, text: text }).catch(function (e) {
        if (e && e.name === "AbortError") return;
        throw e;
      });
    }
    pdf.save(name);
    var subject = encodeURIComponent("Cuenta de cobro " + numero);
    var body = encodeURIComponent(text + "\n\nAdjunta el PDF que se acaba de descargar.");
    window.location.href = "mailto:?subject=" + subject + "&body=" + body;
    toast("Se descargó el PDF. Adjúntalo al correo.");
  }

  /* ---------- arranque ---------- */
  function init() {
    $("topTel").href = "tel:+57" + CFG.telefono.replace(/\D/g, "");
    $("topTelText").textContent = CFG.telefono;
    $("topWa").href = "https://wa.me/" + CFG.whatsapp + "?text=" + encodeURIComponent("Hola, quiero hablar con " + CFG.empresa);
    bindForm();
    syncControls(); renderHistory(); renderPreview();
    refreshNext();
    if (window.JRRegistro) window.JRRegistro.vaciarCola();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPreview);
  }
  document.addEventListener("DOMContentLoaded", init);
})();
