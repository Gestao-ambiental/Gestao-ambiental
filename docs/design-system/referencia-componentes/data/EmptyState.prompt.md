Shown whenever a list, board column or search returns nothing.

```jsx
<EmptyState
  icon="square-kanban"
  title="Nenhuma peça neste quadro"
  description="Crie a primeira peça ou importe o plano de conteúdo do mês."
  primaryAction={<Button appearance="primary" iconBefore="plus">Nova peça</Button>}
  secondaryAction={<Button>Importar plano</Button>}
/>
```

No illustration, no colour — one grey 24px icon, a factual title, one instructive sentence. Never apologise ("Ops!") and never use an emoji.
