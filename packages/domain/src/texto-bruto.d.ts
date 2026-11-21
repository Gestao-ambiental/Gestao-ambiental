// Import `?raw` do Vite/Vitest: o conteúdo do arquivo como texto. Só os testes usam (o domínio não
// lê arquivo nem depende do Node); ver espelho-no-edge.test.ts.
declare module '*?raw' {
  const texto: string
  export default texto
}
