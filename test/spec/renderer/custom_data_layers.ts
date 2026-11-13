import { prefs } from '../../../modules/core/preferences';
import {
    customDataFilterLabel,
    customDataFormat,
    customDataLabel,
    customDataLayers,
    decodeCustomDataLayers,
    encodeCustomDataLayers,
    matchesCustomDataFilter
} from '../../../modules/renderer/custom_data_layers';


describe('customDataLayers', () => {
    beforeEach(() => {
        prefs('custom-data-layers', null);
        prefs('custom-data-layers-next-id', null);
        window.location.hash = '';
        customDataLayers.reset();
    });

    describe('customDataFormat', () => {
        it('detects GeoJSON files', () => {
            expect(customDataFormat('https://example.com/a.geojson')).toBe('geojson');
            expect(customDataFormat('https://example.com/a.json?token=x')).toBe('geojson');
        });

        it('treats everything else as vector tiles', () => {
            expect(customDataFormat('https://example.com/a.pmtiles')).toBe('vectortile');
            expect(customDataFormat('https://example.com/{z}/{x}/{y}.pbf')).toBe('vectortile');
        });
    });

    describe('customDataLabel', () => {
        it('uses the file name', () => {
            expect(customDataLabel('https://tilda-geo.de/api/uploads/radverkehrsnetz.pmtiles?x=1'))
                .toBe('radverkehrsnetz.pmtiles');
        });

        it('uses host and path for tile templates', () => {
            expect(customDataLabel('https://www.example.com/tiles/{z}/{x}/{y}.pbf'))
                .toBe('example.com/tiles');
        });
    });

    it('adds layers with stable, never reused ids', () => {
        const a = customDataLayers.add('https://example.com/a.geojson');
        const b = customDataLayers.add('https://example.com/b.pmtiles', 'B');
        expect([a.id, b.id]).toEqual(['data-1', 'data-2']);
        expect(b.name).toBe('B');

        customDataLayers.remove(b.id);
        expect(customDataLayers.add('https://example.com/c.pmtiles').id).toBe('data-3');
    });

    it('enables the existing layer when the same url is added again', () => {
        const a = customDataLayers.add('https://example.com/a.geojson');
        customDataLayers.toggle(a.id);
        expect(customDataLayers.enabled()).toHaveLength(0);

        customDataLayers.add(' https://example.com/a.geojson ');
        expect(customDataLayers.all()).toHaveLength(1);
        expect(customDataLayers.enabled()).toHaveLength(1);
    });

    it('persists edits', () => {
        const a = customDataLayers.add('https://example.com/a.geojson');
        customDataLayers.update(a.id, { name: ' New ', color: '#000000' });
        customDataLayers.reset();
        expect(customDataLayers.get(a.id)).toMatchObject({ name: 'New', color: '#000000' });
    });

    describe('filter', () => {
        it('shows every feature without a filter key', () => {
            expect(matchesCustomDataFilter({}, { a: 1 })).toBe(true);
            expect(matchesCustomDataFilter({ filterKey: ' ', filterValue: 'x' }, null)).toBe(true);
        });

        it('matches the value, also for numbers', () => {
            const layer = { filterKey: 'category', filterValue: ' vorrang ' };
            expect(matchesCustomDataFilter(layer, { category: 'vorrang' })).toBe(true);
            expect(matchesCustomDataFilter(layer, { category: 'netz' })).toBe(false);
            expect(matchesCustomDataFilter(layer, {})).toBe(false);
            expect(matchesCustomDataFilter({ filterKey: 'level', filterValue: '2' }, { level: 2 })).toBe(true);
        });

        it('matches any set value when the value is empty', () => {
            const layer = { filterKey: 'category' };
            expect(matchesCustomDataFilter(layer, { category: 'netz' })).toBe(true);
            expect(matchesCustomDataFilter(layer, { category: '' })).toBe(false);
            expect(matchesCustomDataFilter(layer, { other: 'x' })).toBe(false);
        });

        it('labels the filter', () => {
            expect(customDataFilterLabel({})).toBe('');
            expect(customDataFilterLabel({ filterKey: 'category', filterValue: 'vorrang' })).toBe('category=vorrang');
            expect(customDataFilterLabel({ filterKey: 'category' })).toBe('category=*');
        });

        it('adds the same url again with another filter', () => {
            const a = customDataLayers.add('https://example.com/a.pmtiles');
            const b = customDataLayers.add('https://example.com/a.pmtiles', '', { filterKey: 'category', filterValue: 'vorrang' });
            expect(b.id).not.toBe(a.id);
            expect(customDataLayers.add('https://example.com/a.pmtiles', '', { filterKey: ' category', filterValue: 'vorrang ' }).id)
                .toBe(b.id);
        });

        it('stores trimmed filters and drops empty ones', () => {
            const a = customDataLayers.add('https://example.com/a.pmtiles', '', { filterKey: ' category ', filterValue: ' x ' });
            expect(customDataLayers.get(a.id)).toMatchObject({ filterKey: 'category', filterValue: 'x' });
            customDataLayers.update(a.id, { filterKey: '', filterValue: 'x' });
            expect(customDataLayers.get(a.id)?.filterKey).toBeUndefined();
            expect(customDataLayers.get(a.id)?.filterValue).toBeUndefined();
        });
    });

    describe('URL hash `data_layers`', () => {
        const pmtiles = 'https://example.com/tiles/a.pmtiles';

        it('writes the enabled layers: url, name, color, filter, overlay flag', () => {
            customDataLayers.add(pmtiles, 'Radnetz', { filterKey: 'kind', filterValue: 'a|b' });
            const plain = customDataLayers.add('https://example.com/b.geojson');
            customDataLayers.update(plain.id, { selectable: false, name: '' });
            const off = customDataLayers.add('https://example.com/off.geojson');
            customDataLayers.toggle(off.id);

            const value = encodeCustomDataLayers(customDataLayers.all());
            expect(value).toBe(`${pmtiles}|Radnetz|ff26d4|kind=a%7Cb;https://example.com/b.geojson||00c8ff||o`);
            expect(new URLSearchParams(window.location.hash.slice(1)).get('data_layers')).toBe(value);
        });

        it('reads them back', () => {
            expect(decodeCustomDataLayers(`${pmtiles}|Radnetz|ff26d4|kind=a%7Cb;https://example.com/b.geojson||00c8ff||o;;`)).toEqual([
                { url: pmtiles, name: 'Radnetz', color: '#ff26d4', selectable: true, filterKey: 'kind', filterValue: 'a|b' },
                { url: 'https://example.com/b.geojson', name: '', color: '#00c8ff', selectable: false, filterKey: undefined, filterValue: undefined }
            ]);
            expect(decodeCustomDataLayers('https://example.com/c.geojson')).toMatchObject([{ url: 'https://example.com/c.geojson', color: undefined, selectable: true }]);
        });

        it('carries the progress tracker of a layer', () => {
            const layer = customDataLayers.add(pmtiles, 'Netz');
            customDataLayers.update(layer.id, { tracker: 'mapping' });
            const value = encodeCustomDataLayers(customDataLayers.all());
            expect(value).toBe(`${pmtiles}|Netz|ff26d4|||mapping`);
            expect(decodeCustomDataLayers(value)).toMatchObject([{ url: pmtiles, tracker: 'mapping', selectable: true }]);
            expect(decodeCustomDataLayers(`${pmtiles}|Netz|ff26d4|||nonsense`)[0].tracker).toBeUndefined();
        });

        it('a link enables exactly its layers: known ones by URL and filter, new ones are added', () => {
            const known = customDataLayers.add(pmtiles, 'Mine');
            const other = customDataLayers.add('https://example.com/other.geojson');
            window.location.hash = '#' + new URLSearchParams({ map: '16/52.5/13.4', data_layers: `${pmtiles};https://example.com/new.geojson|New|6cff3d` }).toString();
            customDataLayers.reset();

            const layers = customDataLayers.all();
            expect(layers.map(layer => [layer.url, layer.name, layer.enabled])).toEqual([
                [pmtiles, 'Mine', true],
                ['https://example.com/other.geojson', '', false],
                ['https://example.com/new.geojson', 'New', true]
            ]);
            expect(layers[0].id).toBe(known.id);
            expect(layers[1].id).toBe(other.id);
            expect(layers[2]).toMatchObject({ id: 'data-3', color: '#6cff3d' });
        });

        it('without the parameter the stored layers stay, and the enabled ones go into the URL', () => {
            customDataLayers.add(pmtiles);
            window.location.hash = '#map=16/52.5/13.4';
            customDataLayers.reset();

            expect(customDataLayers.enabled()).toHaveLength(1);
            expect(new URLSearchParams(window.location.hash.slice(1)).get('data_layers')).toBe(`${pmtiles}||ff26d4`);
        });
    });
});
