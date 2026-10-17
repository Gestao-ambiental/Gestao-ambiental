Row actions, view switchers, the client picker, the account menu.

```jsx
<DropdownMenu
  align="right"
  trigger={<IconButton icon="ellipsis" label="Ações da peça" />}
  items={[
    {label:'Editar',icon:'pencil'},
    {label:'Duplicar',icon:'copy'},
    {label:'Copiar link',icon:'link',shortcut:'⌘L'},
    '-',
    {label:'Excluir',icon:'trash-2',tone:'danger'},
  ]}
/>
```

32px rows, 1px border plus `--shadow-overlay`, 4px below the trigger. Destructive items go last, after a separator.
