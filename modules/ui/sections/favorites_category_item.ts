import { select as d3_select } from 'd3-selection';
import { t, localizer } from '../../core/localizer';
import { presetManager } from '../../presets';
import { presetFavorites } from '../../core/preset_favorites';
import { svgIcon } from '../../svg';
import { utilKeybinding } from '../../util';

/**
 * Creates a favorites category item for the preset list
 */
export function favoritesCategoryItem(drawList: any, entityGeometries: any, itemKeydown: any) {
  let box: any;
  let sublist: any;
  let shown = false; // Start expanded (will be toggled to true on first choose)

  function item(selection: any) {
    const wrap = selection.append('div')
      .attr('class', 'preset-list-button-wrap category');

    function click(this: any) {
      const isExpanded = d3_select(this).classed('expanded');
      const iconName = isExpanded ?
        (localizer.textDirection() === 'rtl' ? '#iD-icon-backward' : '#iD-icon-forward') : '#iD-icon-down';
      d3_select(this)
        .classed('expanded', !isExpanded)
        .attr('title', !isExpanded ? t('icons.collapse') : t('icons.expand'));
      d3_select(this).selectAll('div.label-inner svg.icon use')
        .attr('href', iconName);
      item.choose();
    }

    const button = wrap
      .append('button')
      .attr('class', 'preset-list-button')
      .attr('title', t('icons.collapse'))
      .classed('expanded', true)
      .on('click', click)
      .on('keydown', function(this: any, d3_event: any) {
        if (d3_event.keyCode === utilKeybinding.keyCodes[(localizer.textDirection() === 'rtl') ? '←' : '→']) {
          d3_event.preventDefault();
          d3_event.stopPropagation();
          if (!d3_select(this).classed('expanded')) {
            click.call(this);
          }
        } else if (d3_event.keyCode === utilKeybinding.keyCodes[(localizer.textDirection() === 'rtl') ? '→' : '←']) {
          d3_event.preventDefault();
          d3_event.stopPropagation();
          if (d3_select(this).classed('expanded')) {
            click.call(this);
          }
        } else {
          itemKeydown.call(this, d3_event);
        }
      });

    // Create icon container with folder + star overlay
    const iconContainer = button
      .append('div')
      .attr('class', 'preset-icon-container');

    // Add the folder category border
    const categoryBorder = iconContainer
      .append('svg')
      .attr('class', 'preset-icon-fill preset-icon-category-border')
      .attr('width', 60)
      .attr('height', 60)
      .attr('viewBox', '0 0 60 60');

    categoryBorder
      .append('path')
      .attr('class', 'area')
      .attr('d', 'M9.5,7.5 L25.5,7.5 L28.5,12.5 L49.5,12.5 C51.709139,12.5 53.5,14.290861 53.5,16.5 L53.5,43.5 C53.5,45.709139 51.709139,47.5 49.5,47.5 L10.5,47.5 C8.290861,47.5 6.5,45.709139 6.5,43.5 L6.5,12.5 L9.5,7.5 Z');

    // Add main preset icon with star
    iconContainer
      .append('div')
      .attr('class', 'preset-icon category framed')
      .call(svgIcon('#iD-icon-favorite', 'icon'));

    const label = button
      .append('div')
      .attr('class', 'label')
      .append('div')
      .attr('class', 'label-inner');

    label
      .append('div')
      .attr('class', 'namepart')
      .call(svgIcon((localizer.textDirection() === 'rtl' ? '#iD-icon-backward' : '#iD-icon-forward'), 'inline'))
      .append('span')
      .call(t.append('presets.favorites'))
      .append('span').text('…');

    box = selection.append('div')
      .attr('class', 'subgrid');

    box.append('div')
      .attr('class', 'arrow');

    sublist = box.append('div')
      .attr('class', 'preset-list fillL3');

    // Start expanded - initialize with expanded state
    shown = false; // Set to false so choose() will expand it
    const geometries = entityGeometries();
    const favoriteIds = presetFavorites.getFavoritesInOrder();
    const favoritePresets = favoriteIds
      .map((id: string) => presetManager.item(id))
      .filter((preset: any) => preset && preset.addable() && preset.matchAllGeometry(geometries));

    // Create a collection-like object for drawList, pass skipFavorites=true to prevent recursive favorites
    const fakeCollection = { collection: favoritePresets, matchAllGeometry: () => fakeCollection };
    sublist.call(drawList, fakeCollection, false, true);

    // Set expanded styles immediately
    shown = true;
    box
      .style('opacity', '1')
      .style('max-height', 200 + favoritePresets.length * 190 + 'px')
      .style('padding-bottom', '10px');
  }

  item.choose = function() {
    if (!box || !sublist) return;

    if (shown) {
      shown = false;
      box.transition()
        .duration(200)
        .style('opacity', '0')
        .style('max-height', '0px')
        .style('padding-bottom', '0px');
    } else {
      shown = true;
      const geometries = entityGeometries();
      const favoriteIds = presetFavorites.getFavoritesInOrder();
      const favoritePresets = favoriteIds
        .map((id: string) => presetManager.item(id))
        .filter((preset: any) => preset && preset.addable() && preset.matchAllGeometry(geometries));

      // Create a collection-like object for drawList, pass skipFavorites=true to prevent recursive favorites
      const fakeCollection = { collection: favoritePresets, matchAllGeometry: () => fakeCollection };
      sublist.call(drawList, fakeCollection, false, true);
      box.transition()
        .duration(200)
        .style('opacity', '1')
        .style('max-height', 200 + favoritePresets.length * 190 + 'px')
        .style('padding-bottom', '10px');
    }
  };

  // Fake preset property for compatibility
  item.preset = { id: 'favorites' };

  return item;
}
