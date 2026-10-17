The account tile on the clients screen — and the only card in AgroFuturo that carries brand colour.

```jsx
<ClientCard
  name="Verde Natural" slot={2}
  meta="Contrato mensal · 12 peças/mês"
  stats={[{label:'Em produção',value:5},{label:'Aguardando',value:2},{label:'Publicadas',value:31}]}
  onClick={() => open('verde-natural')}
/>
```

Keep `slot` stable per client forever — the team recognises accounts by that colour before reading the name.
