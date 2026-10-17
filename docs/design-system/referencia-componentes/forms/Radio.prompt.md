One choice from two to five visible options — when the options are worth reading side by side.

```jsx
<Field label="Visibilidade do link de aprovação">
  <Radio name="vis" label="Somente equipe" defaultChecked />
  <Radio name="vis" label="Cliente com link" />
</Field>
```

More than five options: use `Select`. Radios stack vertically with 8px gaps.
