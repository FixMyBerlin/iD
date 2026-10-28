import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { svgIcon } from '../../svg/icon';
import { uiTooltip } from '../tooltip';

type OsmUser = { display_name: string; image_url?: string };

/**
 * Top toolbar, far end: the OSM account.
 * - Logged out: a "Log in" button.
 * - Logged in: the user's picture; a click opens a menu with the name (link to the profile),
 *   the Preferences pane and "Log out".
 * Was the user name and the "Log out" link in the footer bar (`ui/account.js`).
 */
export function uiToolAccount(context: iD.Context) {
    const osm = context.connection() as any;

    const tool: Record<string, any> = {
        id: 'account',
        label: t.append('account.title')
    };

    let _wrap: d3.Selection = d3_select(null!);
    let _user: OsmUser | null = null;

    function closeMenu() {
        _wrap.select('.account-menu').classed('hide', true);
        _wrap.select('button.account-button').classed('active', false);
        d3_select(document).on('pointerdown.account-menu keydown.account-menu', null);
    }

    function openMenu() {
        _wrap.select('.account-menu').classed('hide', false);
        _wrap.select('button.account-button').classed('active', true);
        d3_select(document)
            .on('pointerdown.account-menu', (d3_event: PointerEvent) => {
                const node = _wrap.node() as HTMLElement | null;
                if (!node?.contains(d3_event.target as Node)) closeMenu();
            })
            .on('keydown.account-menu', (d3_event: KeyboardEvent) => {
                if (d3_event.key === 'Escape') closeMenu();
            });
    }

    function logout() {
        closeMenu();
        osm.logout();
        // OAuth2's "logout" only drops the token; a new login would silently get it again.
        // Like the former footer link: open the popup where the user can log out of OSM and switch users.
        osm.authenticate(undefined, { switchUser: true });
    }

    function openPreferences() {
        closeMenu();
        const pane = context.container().select('.map-panes .preferences-pane');
        if (!pane.empty() && !pane.classed('shown')) (context.ui() as any).togglePanes(pane);
    }

    function render() {
        _wrap.text('');

        const button = _wrap
            .append('button')
            .attr('class', 'bar-button account-button')
            .classed('logged-in', !!_user);

        if (!_user) {
            button
                .call(svgIcon('#iD-icon-avatar', ''))
                .on('click', (d3_event: MouseEvent) => {
                    d3_event.preventDefault();
                    osm.authenticate();
                })
                .append('span')
                .attr('class', 'label')
                .call(t.append('login'));
            return;
        }

        const user = _user;
        if (user.image_url) {
            button
                .append('img')
                .attr('class', 'user-icon')
                .attr('alt', '')
                .attr('src', user.image_url);
        } else {
            button.call(svgIcon('#iD-icon-avatar', ''));
        }
        button
            .attr('aria-label', user.display_name)
            .attr('aria-haspopup', 'menu')
            .call((uiTooltip() as any)
                .placement('bottom')
                .title(() => t.append('account.tooltip', { user: user.display_name }))
                .scrollContainer(context.container().select('.top-toolbar'))
            )
            .on('click', function(this: HTMLButtonElement, d3_event: MouseEvent) {
                d3_event.preventDefault();
                d3_select(this).selectAll('.tooltip').classed('in', false);
                if (_wrap.select('.account-menu').classed('hide')) {
                    openMenu();
                } else {
                    closeMenu();
                }
            });

        const menu = _wrap
            .append('ul')
            .attr('class', 'account-menu fillL hide')
            .attr('role', 'menu');

        menu
            .append('li')
            .attr('class', 'account-menu-user')
            .append('a')
            .attr('href', osm.userURL(user.display_name))
            .attr('target', '_blank')
            .on('click', closeMenu)
            .call(svgIcon('#iD-icon-out-link', 'inline'))
            .append('span')
            .text(user.display_name);

        menu
            .append('li')
            .append('a')
            .attr('href', '#')
            .on('click', (d3_event: MouseEvent) => {
                d3_event.preventDefault();
                openPreferences();
            })
            .call(t.append('preferences.title'));

        menu
            .append('li')
            .append('a')
            .attr('href', '#')
            .on('click', (d3_event: MouseEvent) => {
                d3_event.preventDefault();
                logout();
            })
            .call(t.append('logout'));
    }

    function update() {
        if (!osm.authenticated()) {
            _user = null;
            render();
            return;
        }
        osm.userDetails((err: { status?: number } | null, user: OsmUser) => {
            if (err && err.status === 401) {
                // cannot load the own user data (e.g. the token was revoked): log out, so the user can log in again
                osm.logout();
            }
            _user = err ? null : user;
            render();
        });
    }

    tool.render = function(selection: d3.Selection) {
        _wrap = selection
            .append('div')
            .attr('class', 'account-wrap') as unknown as d3.Selection;
        if (!osm) return;
        osm.on('change.account', update);
        update();
    };

    tool.uninstall = function() {
        closeMenu();
        osm?.on('change.account', null);
        _wrap = d3_select(null!);
    };

    return tool;
}
