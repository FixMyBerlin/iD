import { debounce, throttle } from 'es-toolkit';
import type { Dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { svgPath, svgPointTransform } from './helpers';
import { services } from '../services';
import { accessToken } from '../services/mapillary';
import { AGE_BANDS, ageBand, ageBandClass } from '../mapillary/age_bands';
import { createHighlightResolver } from '../mapillary/highlight';
import { selectedFeatureImages } from '../mapillary/selected_images';
import type { Projection } from '../geo/raw_mercator';
import type { MlyImage, MlySequence } from '../services/mapillary';
import type { coreContext } from '../core';


export function svgMapillaryImages(projection: Projection, context: coreContext, dispatch: Dispatch<object>) {
    const throttledRedraw = throttle(function () { dispatch.call('change'); }, 1000);
    const minZoom = 12;
    const minMarkerZoom = 16;
    const minViewfieldZoom = 18;
    let layer: d3.Selection<SVGGElement> = d3_select(null!);
    let _mapillary: typeof services.mapillary | null;
    const highlightResolver = createHighlightResolver(
        url => fetch(url, { headers: { 'Authorization': `OAuth ${accessToken}` } }).then(response => response.json()),
        throttledRedraw
    );
    const debouncedUpdate = debounce(function() { if (svgMapillaryImages.enabled) update(); }, 200);


    function init() {
        if (svgMapillaryImages.initialized) return;  // run once
        svgMapillaryImages.enabled = false;
        svgMapillaryImages.initialized = true;
    }


    function getService() {
        if (services.mapillary && !_mapillary) {
            _mapillary = services.mapillary;
            _mapillary.event.on('loadedImages', throttledRedraw);
        } else if (!services.mapillary && _mapillary) {
            _mapillary = null;
        }

        return _mapillary;
    }


    function showLayer() {
        const service = getService();
        if (!service) return;

        editOn();

        layer
            .style('opacity', 0)
            .transition()
            .duration(250)
            .style('opacity', 1)
            .on('end', function () { dispatch.call('change'); });
    }


    function hideLayer() {
        throttledRedraw.cancel();

        layer
            .transition()
            .duration(250)
            .style('opacity', 0)
            .on('end', editOff);
    }


    function editOn() {
        layer.style('display', 'block');
    }


    function editOff() {
        layer.selectAll('.viewfield-group').remove();
        layer.style('display', 'none');
    }


    function click(d3_event: MouseEvent, image: MlyImage) {
        const service = getService();
        if (!service) return;

        service
            .ensureViewerLoaded(context)
            .then(function() {
                service
                    .selectImage(image)
                    .showViewer(context);
            });

        context.map().centerEase(image.loc);
    }


    function mouseover(d3_event: MouseEvent, image: MlyImage) {
        const service = getService();

        if (service) service.setStyles(context, image);
    }


    function mouseout() {
        const service = getService();
        if (service) service.setStyles(context, null);
    }


    function transform(d: MlyImage) {
        let t = svgPointTransform(projection)(d);
        if (d.ca) {
            t += ' rotate(' + Math.floor(d.ca) + ',0,0)';
        }
        return t;
    }


    function filterImages(images: MlyImage[], skipDateFilter = false) {
        const showsPano = context.photos().showsPanoramic();
        const showsFlat = context.photos().showsFlat();
        const fromDate = context.photos().fromDate();
        const toDate = context.photos().toDate();

        if (!showsPano || !showsFlat) {
            images = images.filter(function(image) {
                if (image.is_pano) return showsPano;
                return showsFlat;
            });
        }
        if (fromDate && !skipDateFilter) {
            images = images.filter(function(image) {
                return new Date(image.captured_at!).getTime() >= new Date(fromDate).getTime();
            });
        }
        if (toDate && !skipDateFilter) {
            images = images.filter(function(image) {
                return new Date(image.captured_at!).getTime() <= new Date(toDate).getTime();
            });
        }

        return images;
    }

    function filterSequences(sequences: MlySequence[], skipDateFilter = false) {
        const showsPano = context.photos().showsPanoramic();
        const showsFlat = context.photos().showsFlat();
        const fromDate = context.photos().fromDate();
        const toDate = context.photos().toDate();

        if (!showsPano || !showsFlat) {
            sequences = sequences.filter(function(sequence) {
                if (Object.hasOwnProperty.call(sequence.properties, 'is_pano')) {
                    if (sequence.properties.is_pano) return showsPano;
                    return showsFlat;
                }
                return false;
            });
        }
        if (fromDate && !skipDateFilter) {
            sequences = sequences.filter(function(sequence) {
                return new Date(sequence.properties.captured_at).getTime() >= new Date(fromDate).getTime();
            });
        }
        if (toDate && !skipDateFilter) {
            sequences = sequences.filter(function(sequence) {
                return new Date(sequence.properties.captured_at).getTime() <= new Date(toDate).getTime();
            });
        }

        return sequences;
    }

    function update(this: any) {
        const z = ~~context.map().zoom();
        const showMarkers = (z >= minMarkerZoom);
        const showViewfields = (z >= minViewfieldZoom);

        const service = getService()!;
        let sequences = (service ? service.sequences(projection) : []);
        let images = (service && showMarkers ? service.images(projection) : []);
        // images[0]
        // {
        //    "loc":[13.235349655151367,52.50694232952122],
        //    "captured_at":1619457514500,
        //    "ca":0,
        //    "id":505488307476058,
        //    "is_pano":false,
        //    "sequence_id":"zcyumxorbza3dq3twjybam"
        //    }
        dispatch.call('photoDatesChanged', this, 'mapillary', [
            ...filterImages(images, true).map(p => p.captured_at),
            ...filterSequences(sequences, true).map(s => s.properties.captured_at)]);

        images = filterImages(images);
        sequences = filterSequences(sequences);

        // images of the selected features are shown regardless of the filters
        const selectedTags = context.selectedIDs()
            .map(id => context.hasEntity(id))
            .filter(entity => !!entity)
            .map(entity => entity!.tags);
        const selectedImages = service ? selectedFeatureImages(selectedTags, id => service.cachedImage(id) as MlyImage | undefined) : [];
        const selectedImageIds = new Set(selectedImages.map(image => String(image.id)));
        if (selectedImages.length) {
            const shown = new Set(images.map(image => String(image.id)));
            images = images.concat(selectedImages.filter(image => !shown.has(String(image.id))));
        }

        const cutoff = context.photos().ageCutoff();
        const now = Date.now();
        const users = context.photos().highlightUsers();
        const orgs = context.photos().highlightOrgs();
        highlightResolver.prefetchUsers(users);
        const highlightedSequenceIds = new Set<string>();
        images.forEach(image => {
            if (image.sequence_id && highlightResolver.isHighlighted(image, users, orgs)) {
                highlightedSequenceIds.add(image.sequence_id);
            }
        });
        const isHighlightedImage = (image: MlyImage) => highlightResolver.isHighlighted(image, users, orgs);
        const isHighlightedSequence = (sequence: MlySequence) =>
            highlightedSequenceIds.has(sequence.properties.id) || highlightResolver.isHighlighted(sequence.properties, users, orgs);
        function setAgeClasses(selection: d3.Selection<any>, capturedAt: (d: any) => string | undefined) {
            selection.each(function(this: any, d: any) {
                const band = cutoff ? ageBand(capturedAt(d), cutoff, now) : 'new';
                const element = d3_select(this);
                AGE_BANDS.forEach(b => element.classed(ageBandClass(b), b === band));
            });
        }

        service.filterViewer(context);

        let traces = layer.selectAll('.sequences').selectAll<SVGPathElement, MlySequence>('.sequence')
            .data(sequences, function(d) { return d.properties.id; });

        // exit
        traces.exit()
            .remove();

        // enter/update
        traces.enter()
            .append('path')
            .attr('class', 'sequence')
            .merge(traces)
            .attr('d', svgPath(projection).geojson)
            .classed('mly-highlighted', isHighlightedSequence)
            .call(setAgeClasses, d => d.properties.captured_at);


        const groups = layer.selectAll('.markers').selectAll<SVGGElement, MlyImage>('.viewfield-group')
            .data(images, function(d) { return d.id; });

        // exit
        groups.exit()
            .remove();

        // enter
        const groupsEnter = groups.enter()
            .append('g')
            .attr('class', 'viewfield-group')
            .on('mouseenter', mouseover)
            .on('mouseleave', mouseout)
            .on('click', click);

        groupsEnter
            .append('g')
            .attr('class', 'viewfield-scale');

        // update
        const markers = groups
            .merge(groupsEnter)
            .sort(function(a, b) {
                // selected features' images on top, then sort Y
                const selected = +selectedImageIds.has(String(a.id)) - +selectedImageIds.has(String(b.id));
                return selected || (b.loc[1] - a.loc[1]);
            })
            .attr('transform', transform)
            .classed('mly-selected-feature-image', d => selectedImageIds.has(String(d.id)))
            .call(setAgeClasses, d => d.captured_at)
            .select('.viewfield-scale');


        markers.selectAll('circle:not(.mly-extra)')
            .data([0])
            .enter()
            .append('circle')
            .attr('dx', '0')
            .attr('dy', '0')
            .attr('r', '6');

        // extra rings/dots: the selected feature's images and highlighted users/organizations
        const rings = markers.selectAll('.mly-selected-ring')
            .data(function(d: any) { return selectedImageIds.has(String(d.id)) ? [0] : []; });
        rings.exit().remove();
        rings.enter()
            .append('circle')
            .attr('class', 'mly-extra mly-selected-ring')
            .attr('r', '10');

        const dots = markers.selectAll('.mly-highlight-dot')
            .data(function(d: any) { return isHighlightedImage(d) ? [0] : []; });
        dots.exit().remove();
        dots.enter()
            .append('circle')
            .attr('class', 'mly-extra mly-highlight-dot')
            .attr('r', '3');

        const viewfields = markers.selectAll('.viewfield')
            .data(showViewfields ? [0] : []);

        viewfields.exit()
            .remove();

        viewfields.enter()               // viewfields may or may not be drawn...
            .insert('path', 'circle')    // but if they are, draw below the circles
            .attr('class', 'viewfield')
            .classed('pano', function() { return this.parentNode!.__data__.is_pano; })
            .attr('transform', 'scale(1.5,1.5),translate(-8, -13)')
            .attr('d', viewfieldPath);

        function viewfieldPath(this: SVGPathElement) {
            if (this.parentNode!.__data__.is_pano) {
                return 'M 8,13 m -10,0 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0';
            } else {
                return 'M 6,9 C 8,8.4 8,8.4 10,9 L 16,-2 C 12,-5 4,-5 0,-2 z';
            }
        }
    }


    function drawImages(this: any, selection: d3.Selection<SVGGElement>) {
        const enabled = svgMapillaryImages.enabled;
        const service = getService();

        layer = selection.selectAll<SVGGElement, 0>('.layer-mapillary')
            .data(service ? [0] : []);

        layer.exit()
            .remove();

        const layerEnter = layer.enter()
            .append('g')
            .attr('class', 'layer-mapillary')
            .style('display', enabled ? 'block' : 'none');

        layerEnter
            .append('g')
            .attr('class', 'sequences');

        layerEnter
            .append('g')
            .attr('class', 'markers');

        layer = layerEnter
            .merge(layer);

        if (enabled) {
            if (service && ~~context.map().zoom() >= minZoom) {
                editOn();
                update();
                service.loadImages(projection);
            } else {
                dispatch.call('photoDatesChanged', this, 'mapillary', []);
                editOff();
            }
        } else {
            dispatch.call('photoDatesChanged', this, 'mapillary', []);
        }
    }


    drawImages.enabled = function(_: boolean) {
        if (!arguments.length) return svgMapillaryImages.enabled;
        svgMapillaryImages.enabled = _;
        if (svgMapillaryImages.enabled) {
            showLayer();
            context.photos().on('change.mapillary_images', update);
            // the selected feature's images are drawn specially
            context.on('enter.mapillary_images', debouncedUpdate);
            context.history().on('change.mapillary_images', debouncedUpdate);
        } else {
            hideLayer();
            context.photos().on('change.mapillary_images', null);
            context.on('enter.mapillary_images', null);
            context.history().on('change.mapillary_images', null);
        }
        dispatch.call('change');
        return this;
    };


    drawImages.supported = function() {
        return !!getService();
    };

    drawImages.rendered = function(zoom: number) {
      return zoom >= minZoom;
    };


    init();
    return drawImages;
}
svgMapillaryImages.enabled = false;
svgMapillaryImages.initialized = false;
