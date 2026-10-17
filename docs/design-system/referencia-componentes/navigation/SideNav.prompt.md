The persistent left rail on every AgroFuturo screen. White, bordered on the right, 240px.

```jsx
<SideNav header={<ClientSwitcher … />} footer={<SideNavItem icon="settings">Configurações</SideNavItem>}>
  <SideNavSection>
    <SideNavItem icon="house" isActive>Visão geral</SideNavItem>
    <SideNavItem icon="inbox" count={4}>Aprovações</SideNavItem>
  </SideNavSection>
  <SideNavSection label="Produção">
    <SideNavItem icon="square-kanban">Quadro</SideNavItem>
    <SideNavItem icon="calendar">Calendário</SideNavItem>
  </SideNavSection>
</SideNav>
```

Active item = washed blue fill (`--surface-selected`) with blue text; there is no left accent bar. Section labels are 11px uppercase and used sparingly — two or three per rail.
