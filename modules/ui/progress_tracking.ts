import { t, localizer } from '../core/localizer';
import { progressFeatureID, progressTracker, type ProgressMark } from '../progress/tracker';
import { customDataLayerOfFeature, customDataLineBBox } from '../svg/custom_data';

type DataFeature = { properties?: Record<string, unknown> | null };

type State = {
    name: string;
    /** the line has no usable id, so it cannot be tracked */
    featureID: string | undefined;
    mark: ProgressMark | undefined;
    disabled: 'unavailable' | 'logged_out' | 'no_id' | undefined;
};


/**
 * A "Done" toggle for the selected line of a custom data layer with a progress tracker
 * (WORKDOC feature 35), in the sidebar above the line's properties.
 */
export function uiProgressTracking(context: iD.Context) {
    let _selection: d3.Selection | undefined;
    let _datum: DataFeature | undefined;
    let _saving = false;


    function state(): State | undefined {
        const layer = _datum && customDataLayerOfFeature(_datum);
        if (!layer?.tracker) return undefined;
        const tracker = progressTracker(context, layer.tracker);
        const featureID = progressFeatureID(_datum?.properties);
        return {
            name: t(`map_data.custom_data_layers.settings.tracker.${layer.tracker}`),
            featureID,
            mark: featureID ? tracker.get(featureID) : undefined,
            disabled: featureID ? tracker.disabledReason() : 'no_id'
        };
    }


    /** Done, or back to nothing */
    function toggle() {
        const layer = _datum && customDataLayerOfFeature(_datum);
        const featureID = progressFeatureID(_datum?.properties);
        if (!layer?.tracker || !featureID || _saving) return;
        const tracker = progressTracker(context, layer.tracker);
        const done = !tracker.get(featureID);
        const bbox = customDataLineBBox(layer.id, featureID);
        if (done && !bbox) return;

        _saving = true;
        render();
        (done ? tracker.setDone(featureID, bbox!) : tracker.setNotDone(featureID))
            .catch(() => {
                (context.ui() as unknown as { flash: { iconName(name: string): { label(text: string): () => void } } })
                    .flash.iconName('#iD-icon-no').label(t('progress_tracking.error'))();
            })
            .then(() => {
                _saving = false;
                render();
            });
    }


    function render() {
        if (!_selection) return;
        const current = state();

        let section = _selection.selectAll<HTMLDivElement, State>('.progress-tracking')
            .data(current ? [current] : []);

        section.exit()
            .remove();

        // above the properties, also when they were drawn first (a line of another layer before)
        const enter = section.enter()
            .insert('div', '.raw-tag-editor')
            .attr('class', 'progress-tracking');

        enter.append('div').attr('class', 'progress-tracking-title');
        enter.append('div').attr('class', 'progress-tracking-buttons')
            .append('button')
            .attr('class', 'progress-done')
            .attr('role', 'switch')
            .on('click', toggle);
        enter.append('div').attr('class', 'progress-tracking-byline deemphasize');

        section = section.merge(enter);
        if (!current) return;

        section.select('.progress-tracking-title').text(current.name);
        section.select('.progress-done')
            .classed('active', !!current.mark)
            .attr('aria-checked', String(!!current.mark))
            .attr('title', t(current.mark ? 'progress_tracking.undo_tooltip' : 'progress_tracking.done_tooltip'))
            .text(`${current.mark ? '✓ ' : ''}${t('progress_tracking.done')}`)
            // "unavailable" is only a note: the last request failed, a click tries again
            .property('disabled', (!!current.disabled && current.disabled !== 'unavailable') || _saving);

        const date = current.mark && new Date(current.mark.at).toLocaleDateString(localizer.languageCode(), { dateStyle: 'medium' });
        section.select('.progress-tracking-byline')
            .text(current.disabled
                ? t(`progress_tracking.disabled.${current.disabled}`)
                : current.mark ? t('progress_tracking.done_by', { user: current.mark.user, date }) : '');
    }


    function progressTracking(selection: d3.Selection) {
        _selection = selection;
        const layer = _datum && customDataLayerOfFeature(_datum);
        // someone else's marks arrive, or ours was saved
        if (layer?.tracker) progressTracker(context, layer.tracker).on('change.uiProgressTracking', render);
        render();
    }

    progressTracking.datum = function(datum: DataFeature | undefined) {
        _datum = datum;
        return progressTracking;
    };

    return progressTracking;
}
