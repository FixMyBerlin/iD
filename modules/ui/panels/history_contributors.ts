import { debounce } from 'es-toolkit';
import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';

const LIMIT = 4;

/**
 * "Edits by a, b, c and 28 others": the mappers of the features in view.
 * Was in the footer bar (`ui/contributors.js`); now part of the History panel while nothing is selected.
 * The panel redraws with every map draw, so the list is computed on its own (debounced) and kept.
 */
export function uiHistoryContributors(context: iD.Context) {
    let _users: string[] | undefined;
    let _target: HTMLElement | undefined;
    let _listening = false;

    function compute() {
        const users = new Set<string>();
        const entities = context.history().intersects(context.map().extent()) as { user?: string }[];
        for (const entity of entities) {
            if (entity?.user) users.add(entity.user);
        }
        _users = [...users];
    }

    const debouncedUpdate = debounce(() => {
        compute();
        if (_target?.isConnected) draw(d3_select(_target));
    }, 1000);

    function listen() {
        if (_listening) return;
        _listening = true;
        (context.connection() as any)?.on('loaded.history-contributors', debouncedUpdate);
        context.map().on('move.history-contributors', debouncedUpdate);
    }

    function draw(selection: d3.Selection) {
        const osm = context.connection() as any;
        const users = _users ?? [];
        selection.text('');
        if (!osm || !users.length) return;

        const shown = users.slice(0, users.length > LIMIT ? LIMIT - 1 : LIMIT);
        const userList = (s: d3.Selection) => s.selectAll(null)
            .data(shown)
            .enter()
            .append('a')
            .attr('class', 'user-link')
            .attr('href', d => osm.userURL(d))
            .attr('target', '_blank')
            .text(String);

        if (users.length > LIMIT) {
            const others = users.length - LIMIT + 1;
            const count = (s: d3.Selection) => s
                .append('a')
                .attr('target', '_blank')
                .attr('href', () => osm.changesetsURL(context.map().center(), context.map().zoom()))
                .text(others);
            selection.call(t.append('contributors.truncated_list', { n: others, users: userList as any, count: count as any }));
        } else {
            selection.call(t.append('contributors.list', { users: userList as any }));
        }
    }

    return {
        render(selection: d3.Selection) {
            listen();
            if (!_users) compute();
            const wrap = selection
                .append('div')
                .attr('class', 'history-contributors user-list');
            _target = wrap.node() as HTMLElement;
            draw(wrap as unknown as d3.Selection);
        },

        off() {
            _listening = false;
            _target = undefined;
            _users = undefined;
            debouncedUpdate.cancel();
            (context.connection() as any)?.on('loaded.history-contributors', null);
            context.map().on('move.history-contributors', null);
        }
    };
}
