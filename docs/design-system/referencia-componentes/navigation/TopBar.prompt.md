The 56px application header: product mark left, global search centre, account right.

```jsx
<TopBar
  left={<ProductMark />}
  center={<SearchField placeholder="Buscar peças, clientes, campanhas" width={360} />}
  right={<><Button appearance="primary" iconBefore="plus">Criar</Button><IconButton icon="bell" label="Notificações" /><Avatar name="Ana Ribeiro" size="large" /></>}
/>
```

`ProductMark` renders the official AgroFuturo lockup (symbol, lettering and ®) inline, inked with `--logo-ink` — brand green #003d22 on light, white on dark. Never separate the symbol from the lettering, never recolour it. Separated from the page by a border, never a shadow.
