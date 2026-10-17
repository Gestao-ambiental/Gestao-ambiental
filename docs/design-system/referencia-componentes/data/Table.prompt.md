Every list of pieces, clients or approvals. Wrap it in `<Card padding="none">` so rows run edge to edge.

```jsx
<Table
  columns={[
    {key:'titulo',label:'Peça',render:r=><span style={{fontWeight:500}}>{r.titulo}</span>},
    {key:'cliente',label:'Cliente',width:180},
    {key:'status',label:'Status',width:140,render:r=><Lozenge tone={r.tone}>{r.status}</Lozenge>},
    {key:'prazo',label:'Prazo',width:100,align:'right',isSortable:true},
  ]}
  rows={rows}
  selectedIds={selected}
  onToggleRow={toggle}
  onRowClick={open}
/>
```

Rows are 40px with a 1px bottom line; hover fills `--surface-hover`, selection fills `--surface-selected`. Row actions live in the last column and appear on hover (`state.isHovered`). Never zebra-stripe.
