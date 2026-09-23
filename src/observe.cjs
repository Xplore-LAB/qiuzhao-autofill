const CONTROL_SELECTOR = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]),textarea,select,[contenteditable=true],[role=combobox],[role=slider]';

// Observe normal DOM, open shadow roots and each attached frame. Popup internals
// are not independent application requirements; adapters inspect them when open.
async function observePage(page) {
  const requirements = [];
  for (const [frameIndex, frame] of page.frames().entries()) {
    const nodes = frame.locator(CONTROL_SELECTOR);
    for (let index = 0; index < await nodes.count(); index++) {
      const node = nodes.nth(index);
      if (!await node.isVisible()) continue;
      const meta = await node.evaluate(el => {
        if (el.closest('[role=dialog],[role=listbox],[role=tree]')) return null;
        if (el.parentElement?.closest('[role=combobox]')) return null;
        const root = el.getRootNode();
        const byId = id => root.getElementById?.(id) || document.getElementById(id);
        const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => byId(id)?.textContent || '').join(' ');
        const labels = Array.from(el.labels || []).map(l => l.textContent).join(' ');
        const label = (labelledBy || el.getAttribute('aria-label') || labels || el.getAttribute('placeholder') || '').trim();
        return {
          domId: el.id,
          label,
          section: el.closest('fieldset')?.querySelector(':scope > legend')?.textContent.trim() || '',
          tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || 'text',
          role: el.getAttribute('role') || '',
          required: el.required || el.getAttribute('aria-required') === 'true',
          disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
          readOnly: !!el.readOnly,
          unmarkedComposite: !el.getAttribute('role') && el.tagName === 'INPUT' &&
            !el.parentElement?.matches('label,form,fieldset') &&
            el.parentElement?.children.length >= 3 &&
            el.parentElement?.querySelectorAll('input,textarea,select').length === 1,
          popupId: el.getAttribute('aria-controls') || '',
          value: el.isContentEditable ? el.textContent : el.tagName === 'BUTTON' ? el.textContent.trim() : 'value' in el ? el.value : el.textContent.trim(),
        };
      });
      if (!meta) continue;
      // IDs survive sibling insertions. Missing-ID locators are sufficient for
      // static fixtures only; production needs semantic identity/rebinding.
      const locator = meta.domId ? frame.locator(`[id=${JSON.stringify(meta.domId)}]`) : node;
      requirements.push({id: `${frameIndex}:${meta.domId || index}`, ...meta, frame, locator});
    }
  }
  return requirements;
}
module.exports = {observePage};
