import { t } from '../../core/localizer';
import {
    RESERVED_LENS_SHORTCUTS,
    addUploadedLens,
    getShortcutForLens,
    removeLensShortcut,
    renameUploadedLens,
    setLensShortcut,
    setSelectedLensId,
    type UploadedLens
} from '../../core/lenses';
import { utilNoAuto } from '../../util';
import { uiConfirm } from '../confirm';


/** An error text for `letter`, or `undefined` if it can be used as a lens shortcut */
function shortcutError(letter: string) {
    if (!letter) return undefined;
    if (!/^[a-z]$/.test(letter)) return t('map_data.lens.shortcut.invalid');
    if (RESERVED_LENS_SHORTCUTS.has(letter)) return t('map_data.lens.shortcut.reserved');
    return undefined;
}


/**
 * Modal to import a CSS lens, or to edit the name and shortcut of an imported lens.
 * Follows the custom background and custom data layer modals.
 */
export function uiSettingsLens(context: iD.Context, lens?: UploadedLens) {
    const modal = uiConfirm(context.container()).okButton();
    let _file: { name: string; css: string } | undefined;

    modal
        .classed('settings-modal settings-lens', true);

    modal.select('.modal-section.header')
        .append('h3')
        .call(t.append(lens ? 'map_data.lens.header_edit' : 'map_data.lens.header_add'));

    const text = modal.select('.modal-section.message-text');

    if (!lens) {
        text
            .append('div')
            .attr('class', 'settings-lens-callout')
            .call(t.append('map_data.lens.upload_warning'));

        text
            .append('label')
            .call(t.append('map_data.lens.upload'));

        const fileRow = text
            .append('div')
            .attr('class', 'settings-lens-file');

        const fileInput = fileRow
            .append('input')
            .attr('type', 'file')
            .attr('accept', '.css,text/css')
            .attr('class', 'hide')
            .on('change', function(this: HTMLInputElement) {
                const file = this.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    _file = { name: file.name, css: String(reader.result ?? '') };
                    fileRow.select('.settings-lens-file-name').text(file.name);
                    const nameInput = text.select<HTMLInputElement>('input.field-name');
                    if (!nameInput.property('value')) {
                        nameInput.property('value', file.name.replace(/\.css$/i, ''));
                    }
                    updateSaveDisabled();
                };
                reader.readAsText(file);
            });

        fileRow
            .append('button')
            .attr('class', 'button secondary-action')
            .call(t.append('map_data.lens.choose_file'))
            .on('click', () => fileInput.node()?.click());

        fileRow
            .append('span')
            .attr('class', 'settings-lens-file-name deemphasize')
            .call(t.append('map_data.lens.no_file'));

        text
            .append('div')
            .attr('class', 'instructions deemphasize')
            .call(t.append('map_data.lens.upload_description'));
    }

    text
        .append('label')
        .call(t.append('map_data.lens.name'));

    const nameInput = text
        .append('input')
        .attr('type', 'text')
        .attr('class', 'field-name')
        .call(utilNoAuto)
        .property('value', lens?.name ?? '');

    text
        .append('label')
        .call(t.append('map_data.lens.shortcut.label'));

    const shortcutRow = text
        .append('div')
        .attr('class', 'settings-lens-shortcut');

    shortcutRow
        .append('kbd')
        .text('⌥');

    const shortcutInput = shortcutRow
        .append('input')
        .attr('type', 'text')
        .attr('class', 'field-shortcut')
        .attr('maxlength', 1)
        .call(utilNoAuto)
        .property('value', lens ? getShortcutForLens(lens.id) ?? '' : '')
        .on('input', updateSaveDisabled);

    const shortcutMessage = shortcutRow
        .append('span')
        .attr('class', 'settings-lens-shortcut-error');

    const buttons = modal.select('.modal-section.buttons');
    buttons
        .insert('button', '.ok-button')
        .attr('class', 'button cancel-button secondary-action')
        .call(t.append('confirm.cancel'))
        .on('click.cancel', () => modal.close());
    buttons.select('.ok-button')
        .on('click.save', save);

    updateSaveDisabled();


    function currentShortcut() {
        return String(shortcutInput.property('value')).trim().toLowerCase();
    }

    function updateSaveDisabled() {
        const error = shortcutError(currentShortcut());
        shortcutMessage.text(error ?? '');
        shortcutInput.classed('invalid', !!error);
        buttons.select('.ok-button')
            .attr('disabled', (lens || _file) && !error ? null : true);
    }

    function save() {
        const letter = currentShortcut();
        if (shortcutError(letter) || (!lens && !_file)) return;

        const name = String(nameInput.property('value')).trim();
        modal.close();

        let id: string;
        if (lens) {
            id = lens.id;
            renameUploadedLens(id, name || lens.name);
        } else {
            id = addUploadedLens({ name: name || _file!.name.replace(/\.css$/i, ''), css: _file!.css }).id;
            setSelectedLensId(id);
        }

        if (letter) {
            setLensShortcut(id, letter);
        } else {
            removeLensShortcut(id);
        }
    }
}
