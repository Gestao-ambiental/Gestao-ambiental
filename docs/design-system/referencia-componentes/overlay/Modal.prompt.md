Blocking dialogs: create a piece, confirm a destructive action, send for approval.

```jsx
<Modal
  title="Enviar para aprovação"
  onClose={close}
  actions={<><Button onClick={close}>Cancelar</Button><Button appearance="primary">Enviar</Button></>}
>
  <p>O cliente Verde Natural recebe um link para comentar as 4 peças selecionadas.</p>
</Modal>
```

Dimmed `--scrim` backdrop (#0A241C a 54%), top-aligned 64px from the top, `--shadow-overlay`. Primary action last on the right. Modals and dropdowns are the only elements with shadow.
