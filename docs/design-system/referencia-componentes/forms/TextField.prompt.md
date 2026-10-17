The default form control: 32px tall, grey resting fill, white on focus with a blue ring.

```jsx
<TextField label="Título da peça" placeholder="Ex.: Carrossel institucional" isRequired />
<TextField label="Prazo" error="Informe uma data futura" defaultValue="03/08" />
<TextField iconBefore="search" placeholder="Buscar peças" />
<TextField label="ID" defaultValue="MNT-1042" isDisabled />
```

The resting background is `--surface-input` (#f6f7f5) — inputs read as recessed against white cards. Error state shows the red border and the message; don't also add an icon.
