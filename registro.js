/* Registro central de documentos en Supabase.
   Cada vez que se genera una cotización o cuenta de cobro, este módulo avisa a la base de datos de JR
   para que el dashboard pueda contarlos y para que el número consecutivo no se repita entre dispositivos.
   Si no hay internet, el documento se genera igual con un número provisional (COT-L-XXXXX) y el aviso
   queda en cola hasta que vuelva la conexión. */
(function () {
  "use strict";
  var C = window.JR_CONFIG || {};
  var LS_PEND = "jr_pendientes_v1";
  var PREFIJO = { cotizacion: "COT", cuenta_cobro: "CDC" };
  var HABILITADO = !!(C.supabaseUrl && C.supabaseKey);

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function rpc(fn, body, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 8000) : null;
    return fetch(C.supabaseUrl + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": C.supabaseKey },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.message) || ("HTTP " + r.status)); e.status = r.status; throw e; }
        return j;
      });
    }).then(function (j) { if (timer) clearTimeout(timer); return j; },
            function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function aleatorio() {
    var s = "";
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (var i = 0; i < 5; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
    return s;
  }
  function cola() { return lsGet(LS_PEND, []); }
  function guardarCola(q) { lsSet(LS_PEND, q); }
  function encolar(item) { var q = cola(); q.push(item); guardarCola(q); }

  /* Número que se asignará al próximo documento (solo para mostrarlo). */
  function siguiente(tipo) {
    if (!HABILITADO) return Promise.resolve(null);
    return rpc("siguiente_numero", { p_tipo: tipo }, 6000).then(function (n) { return n; }, function () { return null; });
  }

  /* Documento nuevo: devuelve { numero, offline }. */
  function registrar(tipo, fecha, cliente, valor) {
    var datos = { p_tipo: tipo, p_fecha: fecha || null, p_cliente: cliente || null, p_valor: valor || 0 };
    function sinConexion() {
      var numero = PREFIJO[tipo] + "-L-" + aleatorio();
      encolar({ tipo: tipo, numero: numero, fecha: fecha || null, cliente: cliente || null, valor: valor || 0, intentos: 0 });
      return { numero: numero, offline: true };
    }
    if (!HABILITADO) return Promise.resolve(sinConexion());
    return rpc("registrar_documento", datos).then(function (r) {
      vaciarCola();
      return { numero: r.numero, offline: false };
    }, function () { return sinConexion(); });
  }

  /* Corrección de un documento ya registrado (el servidor solo la acepta dentro de las primeras 48 horas). */
  function actualizar(tipo, numero, fecha, cliente, valor) {
    if (!HABILITADO) return Promise.resolve();
    var q = cola(), enCola = false;
    q.forEach(function (it) {
      if (it.tipo === tipo && it.numero === numero) { it.fecha = fecha || null; it.cliente = cliente || null; it.valor = valor || 0; enCola = true; }
    });
    if (enCola) { guardarCola(q); return vaciarCola(); }
    return rpc("registrar_documento", { p_tipo: tipo, p_numero: numero, p_fecha: fecha || null, p_cliente: cliente || null, p_valor: valor || 0, p_origen: "offline" })
      .then(function () {}, function () {});
  }

  var vaciando = false;
  function vaciarCola() {
    if (!HABILITADO || vaciando) return Promise.resolve();
    var q = cola();
    if (!q.length) return Promise.resolve();
    vaciando = true;
    var restantes = [];
    return q.reduce(function (p, it) {
      return p.then(function () {
        return rpc("registrar_documento", { p_tipo: it.tipo, p_numero: it.numero, p_fecha: it.fecha, p_cliente: it.cliente, p_valor: it.valor, p_origen: "offline" })
          .then(function () {}, function (e) {
            it.intentos = (it.intentos || 0) + 1;
            var definitivo = e && e.status && e.status >= 400 && e.status < 500 && it.intentos >= 5;
            if (!definitivo) restantes.push(it);
          });
      });
    }, Promise.resolve()).then(function () { guardarCola(restantes); vaciando = false; }, function () { vaciando = false; });
  }

  window.addEventListener("online", vaciarCola);
  window.JRRegistro = { habilitado: HABILITADO, siguiente: siguiente, registrar: registrar, actualizar: actualizar, vaciarCola: vaciarCola, pendientes: function () { return cola().length; } };
})();
