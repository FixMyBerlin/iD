import { marked } from 'marked';
import {
    select as d3_select
} from 'd3-selection';

import { prefs } from '../core/preferences';
import { t, localizer } from '../core/localizer';
import { presetManager } from '../presets';
import { behaviorHash } from '../behavior';
import { behaviorPresetFavorites } from '../behavior/preset_favorites';
import { behaviorLensShortcuts } from '../behavior/lens_shortcuts';
import { modeBrowse } from '../modes/browse';
import { svgDefs } from '../svg';
import { utilDetect } from '../util/detect';
import { utilGetDimensions } from '../util/dimensions';

import { uiAttribution } from './attribution';
import { uiEditMenu } from './edit_menu';
import { uiFeatureInfo } from './feature_info';
import { uiFlash } from './flash';
import { uiFullScreen } from './full_screen';
import { uiGeolocate } from './geolocate';
import { uiInfo } from './info';
import { uiWayTablePanel } from './way_table_panel';
import { installWidthIndicatorListeners } from '../width/width_indicator';
import { installMeasureTapeListeners } from '../measure/measure_tape_listeners';
import { setupLiveTouched } from '../live_touched/live_touched';
import { applyInterfacePrefs } from './sections/interface';
import { setupReadOnlyFeatures } from '../renderer/readonly_features';
import { uiIntro } from './intro';
import { uiIssuesInfo } from './issues_info';
import { uiLoading } from './loading';
import { uiMapInMap } from './map_in_map';
import { uiNotice } from './notice';
import { uiPhotoviewer } from './photoviewer';
import { uiRestore } from './restore';
import { uiScale } from './scale';
import { uiShortcuts } from './shortcuts';
import { uiSidebar } from './sidebar';
import { uiSpinner } from './spinner';
import { uiSplash } from './splash';
import { uiStatus } from './status';
import { uiTopToolbar } from './top_toolbar';
import { uiZoom } from './zoom';
import { uiZoomToSelection } from './zoom_to_selection';
import { uiCmd } from './cmd';

import { initMapillaryAutoShow } from '../mapillary/auto_show';
import { initMapillarySignBar } from './mapillary_sign_bar';
import { uiPaneBackground } from './panes/background';
import { uiPaneHelp } from './panes/help';
import { uiPaneIssues } from './panes/issues';
import { uiPaneMapData } from './panes/map_data';
import { uiPaneMapDisplay } from './panes/map_display';
import { uiPanePhotos } from './panes/photos';
import { uiPanePreferences } from './panes/preferences';

export function uiInit(context) {
    var _initCounter = 0;
    var _needWidth = {};

    var _lastPointerType;

    var overMap;

    function render(container) {

        applyInterfacePrefs(context);

        container
            .on('click.ui', function(d3_event) {
                // we're only concerned with the primary mouse button
                if (d3_event.button !== 0) return;

                if (!d3_event.composedPath) return;

                // some targets have default click events we don't want to override
                var isOkayTarget = d3_event.composedPath().some(function(node) {
                    // we only care about element nodes
                    return node.nodeType === 1 &&
                        // clicking <input> focuses it and/or changes a value
                        (node.nodeName === 'INPUT' ||
                        // clicking <label> affects its <input> by default
                        node.nodeName === 'LABEL' ||
                        // clicking <a> opens a hyperlink by default
                        node.nodeName === 'A');
                });
                if (isOkayTarget) return;

                // disable double-tap-to-zoom on touchscreens
                d3_event.preventDefault();
            });

        var detected = utilDetect();

        // only WebKit supports gesture events
        if ('GestureEvent' in window &&
            // Listening for gesture events on iOS 13.4+ breaks double-tapping,
            // but we only need to do this on desktop Safari anyway. – #7694
            !detected.isMobileWebKit) {

            // On iOS we disable pinch-to-zoom of the UI via the `touch-action`
            // CSS property, but on desktop Safari we need to manually cancel the
            // default gesture events.
            container.on('gesturestart.ui gesturechange.ui gestureend.ui', function(d3_event) {
                // disable pinch-to-zoom of the UI via multitouch trackpads on macOS Safari
                d3_event.preventDefault();
            });
        }

        if ('PointerEvent' in window) {
            d3_select(window)
                .on('pointerdown.ui pointerup.ui', function(d3_event) {
                    var pointerType = d3_event.pointerType || 'mouse';
                    if (_lastPointerType !== pointerType) {
                        _lastPointerType = pointerType;
                        container
                            .attr('pointer', pointerType);
                    }
                }, true);
        } else {
            _lastPointerType = 'mouse';
            container
                .attr('pointer', 'mouse');
        }

        container
            .attr('lang', localizer.localeCode())
            .attr('dir', localizer.textDirection());

        // setup fullscreen keybindings (no button shown at this time)
        container
            .call(uiFullScreen(context));

        var map = context.map();
        map.redrawEnable(false);  // don't draw until we've set zoom/lat/long

        map
            .on('hitMinZoom.ui', function() {
                ui.flash
                    .iconName('#iD-icon-no')
                    .label(t.append('cannot_zoom'))();
            });

        container
            .append('svg')
            .attr('id', 'ideditor-defs')
            .call(ui.svgDefs);

        container
            .append('div')
            .attr('class', 'sidebar')
            .call(ui.sidebar);

        var content = container
            .append('div')
            .attr('class', 'main-content active');

        // Top toolbar
        content
            .append('div')
            .attr('class', 'top-toolbar-wrap')
            .append('div')
            .attr('class', 'top-toolbar fillD')
            .call(uiTopToolbar(context));

        content
            .append('div')
            .attr('class', 'main-map')
            .attr('dir', 'ltr')
            .call(map);

        overMap = content
            .append('div')
            .attr('class', 'over-map');

        // HACK: Mobile Safari 14 likes to select anything selectable when long-
        // pressing, even if it's not targeted. This conflicts with long-pressing
        // to show the edit menu. We add a selectable offscreen element as the first
        // child to trick Safari into not showing the selection UI.
        overMap
            .append('div')
            .attr('class', 'select-trap')
            .text('t');

        overMap
            .call(uiMapInMap(context))
            .call(uiNotice(context));

        overMap
            .append('div')
            .attr('class', 'spinner')
            .call(uiSpinner(context));

        // Map controls
        var controlsWrap = overMap
            .append('div')
            .attr('class', 'map-controls-wrap');

        var controls = controlsWrap
            .append('div')
            .attr('class', 'map-controls');

        // zoom, zoom-to-selection and locate are optional (Preferences ▸ Interface);
        // `applyInterfacePrefs` hides them, their shortcuts keep working
        controls
            .append('div')
            .attr('class', 'map-control zoombuttons')
            .call(uiZoom(context));

        controls
            .append('div')
            .attr('class', 'map-control zoom-to-selection-control')
            .call(uiZoomToSelection(context));

        controls
            .append('div')
            .attr('class', 'map-control geolocate-control')
            .call(uiGeolocate(context));

        controlsWrap.on('wheel.mapControls', function(d3_event) {
            if (!d3_event.deltaX) {
                controlsWrap.node().scrollTop += d3_event.deltaY;
            }
        });

        // Add panes
        // This should happen after map is initialized, as some require surface()
        var panes = overMap
            .append('div')
            .attr('class', 'map-panes');

        // before the panes, so the Map Data section can subscribe to it
        ui.liveTouched = setupLiveTouched(context);

        var uiPanes = [
            ['background', uiPaneBackground],
            ['map-data', uiPaneMapData],
            ['map-display', uiPaneMapDisplay],
            ['photos', uiPanePhotos],
            ['issues', uiPaneIssues],
            ['preferences', uiPanePreferences],
            ['help', uiPaneHelp]
        ].map(function(d) { return d[1](context); });

        uiPanes.forEach(function(pane) {
            controls
                .append('div')
                .attr('class', 'map-control map-pane-control ' + pane.id + '-control')
                .call(pane.renderToggleButton);

            panes
                .call(pane.renderPane);
        });

        ui.info = uiInfo(context);

        overMap
            .call(ui.info);

        // The way table: a dock below the map, and its button in the bottom corner of the map
        ui.wayTable = uiWayTablePanel(context);
        content
            .call(ui.wayTable);

        controls
            .append('div')
            .attr('class', 'way-table-control')
            .call(ui.wayTable.renderToggleButton);

        installWidthIndicatorListeners(context);
        installMeasureTapeListeners(context);
        setupReadOnlyFeatures(context);

        overMap
            .append('div')
            .attr('class', 'photoviewer')
            .classed('al', true)       // 'al'=left,  'ar'=right
            .classed('hide', true)
            .call(ui.photoviewer);

        // What was in the footer bar now floats above the attribution:
        // the scale (optional, Preferences ▸ Interface) and the issue / hidden feature chips
        var mapStatus = overMap
            .append('div')
            .attr('class', 'map-status');

        mapStatus
            .append('div')
            .attr('class', 'scale-block')
            .call(uiScale(context));

        mapStatus
            .append('div')
            .attr('class', 'issues-info')
            .call(uiIssuesInfo(context));

        mapStatus
            .append('div')
            .attr('class', 'feature-warning')
            .call(uiFeatureInfo(context));

        // flash messages are a toast at the bottom of the map
        overMap
            .append('div')
            .attr('class', 'flash-wrap footer-hide');

        overMap
            .append('div')
            .attr('class', 'attribution-wrap')
            .attr('dir', 'ltr')
            .call(uiAttribution(context));


        // The footer only holds the API status message (empty and without height when all is well)
        content
            .append('div')
            .attr('class', 'map-footer')
            .append('div')
            .attr('class', 'api-status')
            .call(uiStatus(context));

        // now that the optional buttons and the scale exist
        applyInterfacePrefs(context);


        // Setup map dimensions and move map to initial center/zoom.
        // This should happen after .main-content and toolbars exist.
        ui.onResize();
        map.redrawEnable(true);

        ui.hash();
        if (!ui.hash.hadLocation) {
            map.centerZoom([0, 0], 2);
        }

        // Setup preset favorites behavior
        ui.presetFavorites = behaviorPresetFavorites(context);
        d3_select(document).call(ui.presetFavorites);

        // Setup lens shortcuts behavior (⌥+letter activates an imported lens)
        ui.lensShortcuts = behaviorLensShortcuts(context);
        d3_select(document).call(ui.lensShortcuts);

        // Bind events
        window.onbeforeunload = function() {
            return context.save();
        };
        // Radnetz Berlin: `pagehide`, not `unload`. Chrome is turning `unload` off ("Permissions policy
        // violation: unload is not allowed"); then the lock stayed and the next visit could not
        // save or restore the edits.
        window.addEventListener('pagehide', function() {
            context.history().unlock();
        });

        d3_select(window)
            .on('resize.editor', function() {
                ui.onResize();
            });


        var panPixels = 80;
        context.keybinding()
            .on([t('sidebar.key'), '`', '²', '@'], (d3_event) => {
                d3_event.preventDefault();
                ui.sidebar.toggle();
            })   // #5663, #6864 - common QWERTY, AZERTY
            .on('←', pan([panPixels, 0]))
            .on('↑', pan([0, panPixels]))
            .on('→', pan([-panPixels, 0]))
            .on('↓', pan([0, -panPixels]))
            .on(uiCmd('⌥←'), pan([map.dimensions()[0], 0]))
            .on(uiCmd('⌥↑'), pan([0, map.dimensions()[1]]))
            .on(uiCmd('⌥→'), pan([-map.dimensions()[0], 0]))
            .on(uiCmd('⌥↓'), pan([0, -map.dimensions()[1]]))
            .on(uiCmd('⌘' + t('background.key')), function quickSwitch(d3_event) {
                if (d3_event) {
                    d3_event.stopImmediatePropagation();
                    d3_event.preventDefault();
                }
                var previousBackground = context.background().findSource(prefs('background-last-used-toggle'));
                if (previousBackground) {
                    var currentBackground = context.background().baseLayerSource();
                    prefs('background-last-used-toggle', currentBackground.id);
                    prefs('background-last-used', previousBackground.id);
                    context.background().baseLayerSource(previousBackground);
                }
            })
            .on(t('area_fill.wireframe.key'), function toggleWireframe(d3_event) {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                context.map().toggleWireframe();
            })
            .on(uiCmd('⌥' + t('area_fill.wireframe.key')), function toggleOsmData(d3_event) {
                d3_event.preventDefault();
                d3_event.stopPropagation();

                // Don't allow layer changes while drawing - #6584
                var mode = context.mode();
                if (mode && /^draw/.test(mode.id)) return;

                var layer = context.layers().layer('osm');
                if (layer) {
                    layer.enabled(!layer.enabled());
                    if (!layer.enabled()) {
                        context.enter(modeBrowse(context));
                    }
                }
            })
            .on(t('map_data.highlight_edits.key'), function toggleHighlightEdited(d3_event) {
                d3_event.preventDefault();
                context.map().toggleHighlightEdited();
            });

        context
            .on('enter.editor', function(entered) {
                container
                    .classed('mode-' + entered.id, true);
            })
            .on('exit.editor', function(exited) {
                container
                    .classed('mode-' + exited.id, false);
            });

        initMapillaryAutoShow(context);
        initMapillarySignBar(context);

        context.enter(modeBrowse(context));

        if (!_initCounter++) {
            if (!ui.hash.startWalkthrough) {
                context.container()
                    .call(uiSplash(context))
                    .call(uiRestore(context));
            }

            context.container()
                .call(ui.shortcuts);
        }

        var osm = context.connection();
        var auth = uiLoading(context).message(t.addOrUpdate('loading_auth')).blocking(true);

        if (osm && auth) {
            osm
                .on('authLoading.ui', function() {
                    context.container()
                        .call(auth);
                })
                .on('authDone.ui', function() {
                    auth.close();
                });
        }

        _initCounter++;

        if (ui.hash.startWalkthrough) {
            ui.hash.startWalkthrough = false;
            context.container().call(uiIntro(context));
        }


        function pan(d) {
            return function(d3_event) {
                if (d3_event.shiftKey) return;
                if (context.container().select('.combobox').size()) return;
                d3_event.preventDefault();
                context.map().pan(d, 100);
            };
        }

    }


    let ui = {};

    let _loadPromise;
    // renders the iD interface into the container node
    ui.ensureLoaded = () => {

        if (_loadPromise) return _loadPromise;

        return _loadPromise = Promise.all([
                // must have strings and presets before loading the UI
                localizer.ensureLoaded(),
                presetManager.ensureLoaded()
            ])
            .then(() => {
                if (!context.container().empty()) render(context.container());
            })
            .catch(err => console.error(err));  // eslint-disable-line
    };


    // `ui.restart()` will destroy and rebuild the entire iD interface,
    // for example to switch the locale while iD is running.
    ui.restart = function() {
        context.keybinding().clear();

        _loadPromise = null;

        context.container().selectAll('*').remove();

        ui.ensureLoaded();
    };

    ui.lastPointerType = function() {
        return _lastPointerType;
    };

    ui.svgDefs = svgDefs(context);

    ui.flash = uiFlash(context);

    ui.sidebar = uiSidebar(context);

    ui.photoviewer = uiPhotoviewer(context);

    ui.shortcuts = uiShortcuts(context);

    ui.hash = behaviorHash(context);

    ui.onResize = function(withPan) {
        var map = context.map();

        // Recalc dimensions of map and sidebar.. (`true` = force recalc)
        // This will call `getBoundingClientRect` and trigger reflow,
        //  but the values will be cached for later use.
        var mapDimensions = utilGetDimensions(context.container().select('.main-content'), true);
        // the way table dock below the map takes its share of the height
        var dock = context.container().select('.main-content > .way-table-panel:not(.hide)');
        if (!dock.empty()) {
            mapDimensions = [mapDimensions[0], Math.max(mapDimensions[1] - dock.node().offsetHeight, 0)];
        }
        utilGetDimensions(context.container().select('.sidebar'), true);

        if (withPan !== undefined) {
            map.redrawEnable(false);
            map.pan(withPan);
            map.redrawEnable(true);
        }
        map.dimensions(mapDimensions);

        ui.photoviewer.onMapResize();

        // check if header or footer have overflowed
        ui.checkOverflow('.top-toolbar');

        const event = new Event('resizeWindow', {
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    };


    // Call checkOverflow when resizing or whenever the contents change.
    ui.checkOverflow = function(selector, reset) {
        if (reset) {
            delete _needWidth[selector];
        }

        var selection = context.container().select(selector);
        if (selection.empty()) return;

        var scrollWidth = selection.property('scrollWidth');
        var clientWidth = selection.property('clientWidth');
        var needed = _needWidth[selector] || scrollWidth;

        if (scrollWidth > clientWidth) {    // overflow happening
            selection.classed('narrow', true);
            if (!_needWidth[selector]) {
                _needWidth[selector] = scrollWidth;
            }

        } else if (scrollWidth >= needed) {
            selection.classed('narrow', false);
        }
    };

    ui.togglePanes = function(showPane) {
        var hidePanes = context.container().selectAll('.map-pane.shown');

        var side = localizer.textDirection() === 'ltr' ? 'right' : 'left';

        hidePanes
            .classed('shown', false)
            .classed('hide', true);

        context.container().selectAll('.map-pane-control button')
            .classed('active', false);

        if (showPane) {
            hidePanes
                .classed('shown', false)
                .classed('hide', true)
                .style(side, '-500px');

            context.container().selectAll('.' + showPane.attr('pane') + '-control button')
                .classed('active', true);

            showPane
                .classed('shown', true)
                .classed('hide', false);
            if (hidePanes.empty()) {
                showPane
                    .style(side, '-500px')
                    .transition()
                    .duration(200)
                    .style(side, '0px');
            } else {
                showPane
                    .style(side, '0px');
            }
        } else {
            hidePanes
                .classed('shown', true)
                .classed('hide', false)
                .style(side, '0px')
                .transition()
                .duration(200)
                .style(side, '-500px')
                .on('end', function() {
                    d3_select(this)
                        .classed('shown', false)
                        .classed('hide', true);
                });
        }
    };


    var _editMenu = uiEditMenu(context);

    ui.editMenu = function() {
        return _editMenu;
    };

    ui.showEditMenu = function(anchorPoint, triggerType, operations) {

        // remove any displayed menu
        ui.closeEditMenu();

        if (!operations && context.mode().operations) operations = context.mode().operations();
        if (!operations || !operations.length) return;

        // disable menu if in wide selection, for example
        if (!context.map().editableDataEnabled()) return;

        var surfaceNode = context.surface().node();
        if (surfaceNode.focus) {   // FF doesn't support it
            // focus the surface or else clicking off the menu may not trigger modeBrowse
            surfaceNode.focus();
        }

        operations.forEach(function(operation) {
            if (operation.point) operation.point(anchorPoint);
        });

        _editMenu
            .anchorLoc(anchorPoint)
            .triggerType(triggerType)
            .operations(operations);

        // render the menu onto the overmap
        overMap
            .call(_editMenu);
    };

    ui.closeEditMenu = function() {
        // try to regularly close the edit menu
        _editMenu.close();
        // remove any existing menu no matter how it was added
        if (overMap !== undefined) {
            overMap.select('.edit-menu').remove();
        }
    };


    var _saveLoading = d3_select(null);

    context.uploader()
        .on('saveStarted.ui', function() {
            _saveLoading = uiLoading(context)
                .message(t.addOrUpdate('save.uploading'))
                .blocking(true);
            context.container().call(_saveLoading);  // block input during upload
        })
        .on('saveEnded.ui', function() {
            _saveLoading.close();
            _saveLoading = d3_select(null);
        });

    marked.use({
        mangle: false,
        headerIds: false,
    });

    return ui;
}
