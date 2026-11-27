import type { coreGraph } from '../core';
import type { Action } from '../core/history';
import type { EntityId, OsmEntity, osmWay } from '../osm';
import { presetManager } from '../presets';

export interface ActionReverse extends Action {
    entityID(): EntityId;
}

export interface ReverseOptions {
    reverseOneway?: boolean;
}

/**
Order the nodes of a way in reverse order and reverse any direction dependent tags
other than `oneway`. (We assume that correcting a backwards oneway is the primary
reason for reversing a way.)

In addition, numeric-valued `incline` tags are negated.

The JOSM implementation was used as a guide, but transformations that were of unclear benefit
or adjusted tags that don't seem to be used in practice were omitted.

References:
    http://wiki.openstreetmap.org/wiki/Forward_%26_backward,_left_%26_right
    http://wiki.openstreetmap.org/wiki/Key:direction#Steps
    http://wiki.openstreetmap.org/wiki/Key:incline
    http://wiki.openstreetmap.org/wiki/Route#Members
    http://josm.openstreetmap.de/browser/josm/trunk/src/org/openstreetmap/josm/corrector/ReverseWayTagCorrector.java
    http://wiki.openstreetmap.org/wiki/Tag:highway%3Dstop
    http://wiki.openstreetmap.org/wiki/Key:traffic_sign#On_a_way_or_area
*/
export function actionReverse(entityID: EntityId, options?: ReverseOptions): ActionReverse {
    var numeric = /^([+\-]?)(?=[\d.])/;
    var directionKey = /direction$/;
    var keyReplacements: [RegExp, string][] = [
        [/:right$/, ':left'],
        [/:left$/, ':right'],
        [/:forward$/, ':backward'],
        [/:backward$/, ':forward'],
        [/:right:/, ':left:'],
        [/:left:/, ':right:'],
        [/:forward:/, ':backward:'],
        [/:backward:/, ':forward:']
    ];
    var valueReplacements: Record<TagValue, TagValue> = {
        left: 'right',
        right: 'left',
        up: 'down',
        down: 'up',
        forward: 'backward',
        backward: 'forward',
        forwards: 'backward',
        backwards: 'forward',
    };
    // For some tags, keys or values like left/right/… don't refer to
    // way direction and thus should not be reversed.
    const keysToKeepUnchanged = [
        // https://github.com/openstreetmap/iD/issues/10736
        /^red_turn:(right|left):?/
    ];
    // If a key matches the key regex and any of the provided context
    // tag sets, it will not be reversed.
    const keyValuesToKeepUnchanged = [{
            keyRegex: /^.*(_|:)?(description|name|note|website|ref|source|comment|watch|attribution)(_|:)?/,
            prerequisiteTags: [{}]
        }, {
            // Turn lanes are left/right to key (not way) direction - #5674
            keyRegex: /^turn:lanes:?/,
            prerequisiteTags: [{}]
        }, {
            // https://github.com/openstreetmap/iD/issues/10128
            keyRegex: /^side$/,
            prerequisiteTags: [{highway: 'cyclist_waiting_aid'}]
        }, {
            keyRegex: /^railway:turnout_side$/,
            prerequisiteTags: [{}]
        }
    ];
    var roleReplacements: Record<string, string> = {
        forward: 'backward',
        backward: 'forward',
        forwards: 'backward',
        backwards: 'forward'
    };
    var onewayReplacements: Record<TagValue, TagValue> = {
        yes: '-1',
        '1': '-1',
        '-1': 'yes'
    };

    var compassReplacements: Record<TagValue, TagValue> = {
        N: 'S',
        NNE: 'SSW',
        NE: 'SW',
        ENE: 'WSW',
        E: 'W',
        ESE: 'WNW',
        SE: 'NW',
        SSE: 'NNW',
        S: 'N',
        SSW: 'NNE',
        SW: 'NE',
        WSW: 'ENE',
        W: 'E',
        WNW: 'ESE',
        NW: 'SE',
        NNW: 'SSE'
    };


    function reverseKey(key: TagKey) {
        if (keysToKeepUnchanged.some(keyRegex => keyRegex.test(key))) {
            return key;
        }
        for (var i = 0; i < keyReplacements.length; ++i) {
            var replacement = keyReplacements[i];
            if (replacement[0].test(key)) {
                return key.replace(replacement[0], replacement[1]);
            }
        }
        return key;
    }


    function reverseValue(key: TagKey, value: TagValue, includeAbsolute: boolean, allTags: Tags) {
        for (let { keyRegex, prerequisiteTags } of keyValuesToKeepUnchanged) {
            if (keyRegex.test(key) && prerequisiteTags.some(expectedTags =>
                Object.entries(expectedTags).every(([k, v]) => {
                    return allTags[k] && (v === '*' || allTags[k] === v);
                })
            )) {
                return value;
            }
        }

        if (key === 'incline' && numeric.test(value)) {
            return value.replace(numeric, function(_, sign) { return sign === '-' ? '' : '-'; });

        } else if (options && options.reverseOneway && key === 'oneway') {
            return onewayReplacements[value] || value;

        } else if (includeAbsolute && directionKey.test(key)) {
            return value.split(';').map(value => {
                if (compassReplacements[value]) return compassReplacements[value];

                var degrees = Number(value);
                if (isFinite(degrees)) {
                    if (degrees < 180) {
                        degrees += 180;
                    } else {
                        degrees -= 180;
                    }
                    return degrees.toString();
                } else {
                    return valueReplacements[value] || value;
                }
            }).join(';');
        }
        return valueReplacements[value] || value;
    }

    /** @returns false or the name of the direction key */
    function supportsDirectionField(node: OsmEntity, graph: coreGraph): false | TagKey {
        const preset = presetManager.match(node, graph);
        const loc = node.extent(graph).center();
        const geometry = node.geometry(graph);

        const fields = [...preset.fields(loc), ...preset.moreFields(loc)];

        const maybeDirectionField = fields.find(field => {
            const isDirectionField = field.key && (field.key === 'direction' || field.key.endsWith(':direction'));
            // some direction fields are for angles, so ensure that the
            // direction field on this preset is not a numeric field.
            const isRelativeDirection = field.type !== 'number';

            // the field's geometry might be restricted to a subset of the preset's geometry
            const isGeometryValid = !field.geometry || field.geometry.includes(geometry);

            return isDirectionField && isRelativeDirection && isGeometryValid;
        });

        return maybeDirectionField?.key || false;
    }


    // Reverse the direction of tags attached to the nodes - #3076
    function reverseNodeTags(graph: coreGraph, nodeIDs: EntityId[]) {
        for (var i = 0; i < nodeIDs.length; i++) {
            var node = graph.hasEntity(nodeIDs[i]);
            if (!node || !Object.keys(node.tags).length) continue;

            let anyChanges = false;
            var tags: Tags = {};
            for (var key in node.tags) {
                const value = node.tags[key];

                const newKey = reverseKey(key);
                const newValue = reverseValue(key, value, node.id === entityID, node.tags);
                tags[newKey] = newValue;
                if (key !== newKey || value !== newValue) {
                    anyChanges = true;
                }
            }

            // for features whose presets have a direction field,
            // the first flip just adds the direction tag.
            const directionKey = supportsDirectionField(node, graph);
            if (node.id === entityID && !anyChanges && directionKey) {
                tags[directionKey] = 'forward';
            }

            graph = graph.replace(node.update({tags: tags}));
        }
        return graph;
    }


    /*
    Radnetz: differs from iD here. The research and the rule:
    https://github.com/osm-editor-kit/maid/blob/main/docs/research/reverse-side-keys.md
    A reverse keeps the street as it is. On a road side (`cycleway:right:separation:left`) the road side swaps (iD
    swaps only the first `:left`/`:right` it finds); a second left/right under it is read in the lane's riding
    direction (Proposal:Separation, TILDA) and swaps only when the reverse turns the traffic of a one-way road round;
    an explicit `<prefix>:<side>:oneway` turns yes/-1 when the traffic stays, so the lanes of a two-way road keep
    riding with the traffic next to them.
    */
    var sidePrefixes = new Set(['cycleway', 'sidewalk', 'parking', 'shoulder']);
    var sides = new Set(['left', 'right', 'both']);
    var ridingKeys = new Set(['separation', 'marking', 'buffer', 'traffic_mode']);
    var oneWayValues = new Set(['yes', '1', 'true', '-1']);
    var sideOnewayReplacements: Record<string, string> = { yes: '-1', '1': '-1', '-1': 'yes' };
    var leftRight: Record<string, string> = { left: 'right', right: 'left' };
    var along: Record<string, string> = { forward: 'backward', backward: 'forward' };

    function keepsKey(key: TagKey) {
        return keysToKeepUnchanged.some(keyRegex => keyRegex.test(key));
    }

    /** Whether the reverse turns the traffic round: a one-way way whose `oneway` is kept (iD's V) */
    function trafficTurns(tags: Tags) {
        return !(options && options.reverseOneway) && oneWayValues.has(tags.oneway);
    }

    /** The reversed key of a road side, or undefined for any other key */
    function reverseSideKey(key: TagKey, turns: boolean): TagKey | undefined {
        var parts = key.split(':');
        if (parts.length < 2 || !sidePrefixes.has(parts[0]) || !sides.has(parts[1])) return undefined;
        return parts.map(function(part, index) {
            if (index === 0) return part;
            if (index === 1) return leftRight[part] || part;
            if (along[part]) return along[part];
            return turns ? (leftRight[part] || part) : part;
        }).join(':');
    }

    function reverseWay(graph: coreGraph, way: osmWay) {
        var nodes = way.nodes.slice().reverse();
        var tags: Tags = {};
        var role;

        // Radnetz: the sides of a road follow TILDA (reverseSideKey below)
        var turns = trafficTurns(way.tags);
        var ownRidingStays = !!(options && options.reverseOneway) &&
            (oneWayValues.has(way.tags.oneway) || oneWayValues.has(way.tags['oneway:bicycle']));
        for (var key in way.tags) {
            var value = way.tags[key];
            if (keepsKey(key)) {
                tags[key] = value;
                continue;
            }
            var sideKey = reverseSideKey(key, turns);
            if (sideKey !== undefined) {
                var sideParts = key.split(':');
                var isSideOneway = sideParts.length === 3 && sideParts[2] === 'oneway';
                tags[sideKey] = isSideOneway
                    ? (turns ? value : (sideOnewayReplacements[value] || value))
                    : reverseValue(key, value, false, way.tags);
                continue;
            }
            var parts = key.split(':');
            if (ownRidingStays && ridingKeys.has(parts[0]) && parts.length === 2 && leftRight[parts[1]]) {
                tags[key] = reverseValue(key, value, false, way.tags);
                continue;
            }
            tags[reverseKey(key)] = reverseValue(key, value, false, way.tags);
        }

        graph.parentRelations(way).forEach(function(relation) {
            relation.members.forEach(function(member, index) {
                if (member.id === way.id && (role = roleReplacements[member.role])) {
                    relation = relation.updateMember({role: role}, index);
                    graph = graph.replace(relation);
                }
            });
        });

        // Reverse any associated directions on nodes on the way and then replace
        // the way itself with the reversed node ids and updated way tags
        return reverseNodeTags(graph, nodes)
            .replace(way.update({nodes: nodes, tags: tags}));
    }


    const action: ActionReverse = function(graph) {
        var entity = graph.entity(entityID);
        if (entity.type === 'way') {
            return reverseWay(graph, entity);
        }
        return reverseNodeTags(graph, [entityID]);
    };

    action.disabled = function(graph) {
        var entity = graph.hasEntity(entityID);
        if (!entity || entity.type === 'way') return false;

        for (var key in entity.tags) {
            var value = entity.tags[key];
            if (reverseKey(key) !== key || reverseValue(key, value, true, entity.tags) !== value) {
                return false;
            }
        }


        // exception for features whose presets have a direction
        // field - they're flipable even if they don't have a
        // direction tag.
        if (supportsDirectionField(entity, graph)) return false;

        return 'nondirectional_node';
    };

    action.entityID = function() {
        return entityID;
    };

    return action;
}
