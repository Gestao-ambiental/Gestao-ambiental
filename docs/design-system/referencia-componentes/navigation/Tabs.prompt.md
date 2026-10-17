Switches views inside one screen — the client detail page, the piece drawer. Not for top-level navigation (that's `SideNav`).

```jsx
<Tabs items={[{id:'pecas',label:'Peças',count:24},{id:'brief',label:'Briefing'},{id:'metricas',label:'Métricas'}]} />
```

Active tab: blue label with a 2px blue underline, sitting on the 1px divider. Counts render as a pill only when the number is actionable.
