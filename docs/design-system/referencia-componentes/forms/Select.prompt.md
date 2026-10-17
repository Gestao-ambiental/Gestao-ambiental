Single choice from a known list — client, responsável, canal, formato.

```jsx
<Select label="Cliente" placeholder="Selecione um cliente" options={["Verde Natural","Órbita Fitness","Casa Lume"]} />
<Select label="Etapa" options={[{value:'brief',label:'Briefing'},{value:'prod',label:'Em produção'}]} />
```

Same 32px box as TextField with a chevron on the right. For 8+ options that need search, use the dropdown pattern from `DropdownMenu` instead.
