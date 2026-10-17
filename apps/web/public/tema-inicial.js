// Aplica o tema salvo antes do React montar, para não piscar claro ao abrir em escuro.
// Arquivo externo (e não <script> inline) porque a CSP só permite scripts do próprio domínio.
// A chave, os valores e o padrão (claro) precisam bater com src/lib/tema.ts.
;(function () {
  var preferencia = 'claro'
  try {
    var salvo = window.localStorage.getItem('grama.tema')
    if (salvo === 'claro' || salvo === 'escuro' || salvo === 'sistema') preferencia = salvo
  } catch {
    // localStorage bloqueado (janela privada, política do navegador): fica no padrão
  }
  var escuro =
    preferencia === 'escuro' ||
    (preferencia === 'sistema' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', escuro ? 'dark' : 'light')
})()
