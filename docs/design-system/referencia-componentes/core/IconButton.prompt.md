Icon-only button for row actions, toolbars and panel controls — always give it a `label`.

```jsx
<IconButton icon="ellipsis" label="Mais ações" />
<IconButton icon="panel-left" label="Recolher navegação" size="compact" />
<IconButton icon="bell" label="Notificações" isSelected />
```

Defaults to `subtle` (transparent until hover), which is what a dense UI wants. Use `default` only when the button sits alone on a large empty surface and needs a border to be findable.
