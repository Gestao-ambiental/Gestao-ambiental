Monochrome glyph from the bundled Lucide set — use it for every icon in a AgroFuturo UI; never paste inline SVG.

```jsx
<Icon name="search" />
<Icon name="circle-check" size={24} color="var(--text-success)" label="Aprovado" />
```

Icons are masked, so they take `currentColor` by default: put an `<Icon>` inside a button or a subtle-text row and it picks up the right colour automatically. Sizes: 12 dense metadata, 16 default, 24 empty states. Names are the file stems in `assets/icons/`.
