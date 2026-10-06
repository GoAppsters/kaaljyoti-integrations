/**
 * Register an inner element's class, once, whichever bundle got there
 * first. A widget that draws a `<kj-chart>` or a `<kj-reading>` inside its
 * card calls it before creating one: the page may have loaded only this
 * widget's chunk, and a second bundle on the page must not throw on a name
 * the first one took.
 */
export function defineOnce(element: CustomElementConstructor & { readonly tag: string }): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(element.tag)) customElements.define(element.tag, element);
}
