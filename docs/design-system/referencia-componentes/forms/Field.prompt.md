Wraps any control with the AgroFuturo label / help / error scaffolding. TextField, TextArea and Select already use it internally — reach for `Field` directly only around Checkbox groups, Radio groups or a custom control.

```jsx
<Field label="Canais" help="Escolha ao menos um">
  <div style={{display:'flex',gap:'var(--space-200)'}}>
    <Checkbox label="Instagram" /> <Checkbox label="LinkedIn" />
  </div>
</Field>
```

Labels are 12px/600 in `--text-subtle`, sentence case, no colon.
