const {isDeepStrictEqual} = require('node:util');
const {observePage} = require('./observe.cjs');

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

class PlaywrightTool {
  constructor(page) { this.page = page; this.calls = []; }
  async observePage() { return observePage(this.page); }
  async ensureRepeatedRecords(spec, count) {
    const section = this.page.getByRole('group', {name: spec.section, exact: true});
    const recordName = spec.recordName || spec.section;
    const existing = section.getByRole('group', {name: new RegExp(`^${escapeRegExp(recordName)} \\d+$`)});
    if (count > 20) throw Error('too-many-records');
    while (await existing.count() < count) {
      const before = await existing.count();
      await section.getByRole('button', {name: spec.addButton, exact:true}).click();
      await existing.nth(before).waitFor({state:'visible', timeout:2000});
    }
  }
  async read(control) {
    return control.locator.evaluate(el => el.isContentEditable ? el.textContent : el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.tagName === 'BUTTON' ? el.textContent.trim() : 'value' in el ? el.value : el.textContent.trim());
  }
  async inspect(control) {
    if (control.disabled) return 'blocked';
    if (control.unmarkedComposite) return 'unsupported';
    if (['file', 'password', 'checkbox'].includes(control.type)) return 'manual';
    if (control.role === 'combobox') return 'combobox';
    if (control.tag === 'select') return 'select';
    if (control.type === 'radio') return 'radio';
    if (control.role === 'slider' || control.readOnly) return 'unsupported';
    if (['input', 'textarea'].includes(control.tag)) return 'input';
    return await control.locator.getAttribute('contenteditable') === 'true' ? 'input' : 'unsupported';
  }
  async write(control, value) {
    const kind = await this.inspect(control);
    this.calls.push({id: control.id, kind});
    if (kind === 'input') return control.locator.fill(String(value));
    if (kind === 'select') return control.locator.selectOption({label: String(value)});
    if (kind === 'radio') return control.locator.setChecked(Boolean(value));
    if (kind !== 'combobox') throw Error(`unsupported:${kind}`);
    if (!control.popupId) throw Error('missing-popup-association');
    const popup = control.frame.locator(`[id=${JSON.stringify(control.popupId)}]`);
    await control.locator.click();
    await popup.waitFor({state: 'visible'});
    const role = await popup.getAttribute('role');
    if (role === 'listbox' && typeof value === 'string') {
      if (!control.readOnly && control.tag === 'input') await control.locator.fill(value);
      const option = popup.getByRole('option', {name: value, exact: true});
      await option.first().waitFor({state:'visible'});
      if (await option.count() !== 1) throw Error('ambiguous-option');
      await option.click();
    } else if (role === 'tree' && Array.isArray(value)) {
      for (const part of value) {
        const item = popup.getByRole('treeitem', {name: part, exact: true});
        await item.first().waitFor({state:'visible'});
        if (await item.count() !== 1) throw Error('ambiguous-tree-path');
        await item.click();
      }
    } else if (role === 'dialog' && value?.start && value?.end) {
      // A semantic date-input dialog. Calendar grids without editable dates
      // deliberately remain unsupported until another adapter is implemented.
      const inputs = popup.locator('input[type=date]');
      if (await inputs.count() !== 2) throw Error('unsupported-calendar');
      await inputs.nth(0).fill(value.start);
      await inputs.nth(1).fill(value.end);
      const confirm = popup.getByRole('button', {name: '确定', exact: true});
      if (await confirm.count() !== 1) throw Error('ambiguous-confirm');
      await confirm.click();
    } else throw Error('unsupported-popup');
  }
  expected(value) {
    return Array.isArray(value) ? value.join('/') : value?.start ? `${value.start} 至 ${value.end}` : value;
  }
  async verify(control, value, settleMs = 350) {
    const expected = this.expected(value);
    const before = await this.read(control);
    await this.page.waitForTimeout(settleMs);
    const after = await this.read(control);
    const invalid = await control.locator.evaluate(el => (el.validity && !el.validity.valid) || el.getAttribute('aria-invalid') === 'true');
    return {ok: isDeepStrictEqual(before, expected) && isDeepStrictEqual(after, expected) && !invalid, actual: after};
  }
  async dismiss(control) { await control.locator.press('Escape').catch(() => {}); }
}
module.exports = {PlaywrightTool};
