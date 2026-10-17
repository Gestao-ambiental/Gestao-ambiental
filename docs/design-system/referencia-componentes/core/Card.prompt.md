The container for everything on the sunken page background: white surface, 1px border, 3px radius, **no shadow**.

```jsx
<Card title="Produção da semana" actions={<IconButton icon="ellipsis" label="Opções" />}>
  …
</Card>
<Card padding="none"><Table … /></Card>
```

Use `padding="none"` whenever the card wraps a table or list so rows can run edge to edge. Cards never stack shadows or gain a coloured left border.
