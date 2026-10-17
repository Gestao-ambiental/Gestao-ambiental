The loading state for any list, board or panel — AgroFuturo never shows a spinner on a full view.

```jsx
<Card padding="none"><SkeletonRows rows={5} /></Card>
<Skeleton width={120} height={20} />
<Skeleton width={32} height={32} radius="var(--radius-circle)" />
```

Placeholders mirror the layout that will replace them, at the same 40px row rhythm. Shimmer is a 1.2s sweep — no pulsing opacity.
