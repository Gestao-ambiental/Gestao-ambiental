The standard action control — one `primary` per screen region, everything else `default` or `subtle`.

```jsx
<Button appearance="primary" iconBefore="plus">Nova peça</Button>
<Button>Cancelar</Button>
<Button appearance="subtle" size="compact" iconBefore="funnel">Filtros</Button>
<Button appearance="danger">Excluir</Button>
<Button isDisabled>Enviar para aprovação</Button>
```

`default` is transparent with a 1px border; `subtle` drops the border and only fills on hover — use it inside toolbars and table rows where a border would add noise. `isSelected` washes the button blue for view switchers. Never stack two primaries side by side.
