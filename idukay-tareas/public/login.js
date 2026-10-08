(function () {
  var e = new URLSearchParams(location.search).get('e');
  if (!e) return;
  var el = document.getElementById('err');
  el.textContent = e === 'limit' ? 'Demasiados intentos. Espera 15 minutos.' : 'Contraseña incorrecta.';
  el.hidden = false;
})();
