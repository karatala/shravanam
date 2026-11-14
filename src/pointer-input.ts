export function releasePointerFocus(event: PointerEvent) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  target.ownerDocument.defaultView?.requestAnimationFrame(() => {
    if (target.ownerDocument.activeElement === target) target.blur();
  });
}

export function installHoverInput(ownerWindow: Window) {
  const root = ownerWindow.document.documentElement;
  const previous = root.getAttribute("data-ui-hover");
  root.setAttribute("data-ui-hover", "false");
  function pointer(event: PointerEvent) {
    if (!["mouse", "touch", "pen"].includes(event.pointerType)) return;
    const value = event.pointerType === "mouse" ? "true" : "false";
    if (root.getAttribute("data-ui-hover") !== value) root.setAttribute("data-ui-hover", value);
  }
  function blur() { root.setAttribute("data-ui-hover", "false"); }
  const options = { capture: true, passive: true };
  ownerWindow.addEventListener("pointerover", pointer, options);
  ownerWindow.addEventListener("pointermove", pointer, options);
  ownerWindow.addEventListener("pointerdown", pointer, options);
  ownerWindow.addEventListener("blur", blur);
  return () => {
    ownerWindow.removeEventListener("pointerover", pointer, options);
    ownerWindow.removeEventListener("pointermove", pointer, options);
    ownerWindow.removeEventListener("pointerdown", pointer, options);
    ownerWindow.removeEventListener("blur", blur);
    if (previous === null) root.removeAttribute("data-ui-hover");
    else root.setAttribute("data-ui-hover", previous);
  };
}
