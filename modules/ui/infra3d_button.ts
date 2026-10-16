import { t } from '../core/localizer';
import { infra3dTargetOfEntity, infra3dUrl, openInfra3d } from '../infra3d/infra3d';
import { uiTooltip } from './tooltip';

/**
 * A button in the inspector's preset header, next to the favorite heart: opens infra3D looking
 * at the selected feature (the middle of a line). Only shown where infra3D has images.
 */
export function uiInfra3dButton(context: iD.Context) {
    let _entityIDs: string[] = [];

    function url() {
        if (_entityIDs.length !== 1) return undefined;
        const entity = context.hasEntity(_entityIDs[0] as iD.OsmEntity['id']);
        const target = entity && infra3dTargetOfEntity(entity, context.graph());
        return target && infra3dUrl(target);
    }

    const tooltip = (uiTooltip() as any)
        .title(() => t.append('infra3d.tooltip_feature'))
        .placement('bottom');

    function infra3dButton(selection: d3.Selection) {
        const button = selection.selectAll<HTMLButtonElement, string>('.infra3d-button')
            .data(url() ? [0] : []);

        button.exit()
            .remove();

        button.enter()
            .append('button')
            .attr('class', 'infra3d-button')
            .attr('aria-label', t('infra3d.tooltip_feature'))
            .text('3D')
            .on('click', (d3_event: MouseEvent) => {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                // read it at click time: the way may have been edited since the render
                const link = url();
                if (link) openInfra3d(link);
            })
            .on('pointerdown pointerup mousedown mouseup', (d3_event: Event) => d3_event.stopPropagation())
            .call(tooltip);
    }

    infra3dButton.entityIDs = function(val: string[]) {
        _entityIDs = val;
        return infra3dButton;
    };

    return infra3dButton;
}
