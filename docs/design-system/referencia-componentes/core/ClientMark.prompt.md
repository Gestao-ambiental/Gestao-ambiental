The client's coloured sigla block — allowed only on the client card and in the account switcher avatar. Nowhere else in the product carries brand colour.

```jsx
<ClientMark name="Verde Natural" slot={2} size="large" />
<ClientMark sigla="MT" slot={1} size="small" />
```

`slot` maps to `--client-1…6`, all taken from the AgroFuturo palette: 1 green-800 #166534, 2 amber-500 #f59e0b, 3 blue-600 #2563eb, 4 green-muted #a7c4b0, 5 amber-800 #78350f, 6 blue-800 #1e40af. Use it for a supplier (fornecedor) or origin. Assign a slot when the supplier is registered and never change it — people navigate by that colour.
